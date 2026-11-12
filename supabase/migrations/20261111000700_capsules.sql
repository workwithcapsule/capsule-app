-- Capsule V1: creating capsules (step 5a).
--
-- A capsule is created together with its components, collaborators and first
-- work items, all in one transaction: either everything is saved or nothing
-- is. The person creating it may make someone else the owner.

-- Optional goal per component: "What does done look like for Tech?"
alter table public.components
  add column goal text check (goal is null or length(goal) <= 200);

grant update (goal) on public.components to authenticated;

-- Input (jsonb):
-- {
--   "space_id": uuid, "name": text, "outcome": text?, "launch_date": "YYYY-MM-DD"?,
--   "date_type": "launch" | "due", "owner_id": uuid?,
--   "components": [{
--     "component_type_id": uuid, "owner_id": uuid?, "due_date": "YYYY-MM-DD"?,
--     "goal": text?, "collaborators": [uuid], "items": [{ "title": text, "assignee_id": uuid? }]
--   }]
-- }
-- Returns the new capsule's id and key, e.g. {"id": "…", "key": "EN-3"}.
create function public.create_capsule(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_space uuid := nullif(p_input ->> 'space_id', '')::uuid;
  v_capsule public.capsules;
  v_component uuid;
  v_comp jsonb;
  v_item jsonb;
  v_person text;
  v_position integer := 0;
  v_item_position integer;
  v_prefix text;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select s.org_id, s.key_prefix into v_org, v_prefix from public.spaces s where s.id = v_space;
  if v_org is null or not private.can('view_space', v_space) then
    raise exception 'Choose a space you can see' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_input ->> 'name', ''))) = 0 then
    raise exception 'Give the capsule a name' using errcode = '22023';
  end if;

  -- People named on the capsule must be in the org (the foreign keys also
  -- enforce this; checking first gives a clearer message).
  if exists (
    select 1
    from (
      select nullif(p_input ->> 'owner_id', '')::uuid as person
      union all
      select nullif(c ->> 'owner_id', '')::uuid from jsonb_array_elements(coalesce(p_input -> 'components', '[]')) c
      union all
      select nullif(x, '')::uuid
        from jsonb_array_elements(coalesce(p_input -> 'components', '[]')) c,
             jsonb_array_elements_text(coalesce(c -> 'collaborators', '[]')) x
      union all
      select nullif(i ->> 'assignee_id', '')::uuid
        from jsonb_array_elements(coalesce(p_input -> 'components', '[]')) c,
             jsonb_array_elements(coalesce(c -> 'items', '[]')) i
    ) people
    where people.person is not null and not private.is_org_member(v_org, people.person)
  ) then
    raise exception 'Everyone on a capsule must be in your organization' using errcode = '42501';
  end if;

  insert into public.capsules (org_id, space_id, name, outcome, launch_date, date_type, owner_id, created_by)
  values (
    v_org,
    v_space,
    trim(p_input ->> 'name'),
    nullif(trim(coalesce(p_input ->> 'outcome', '')), ''),
    nullif(p_input ->> 'launch_date', '')::date,
    coalesce(nullif(p_input ->> 'date_type', ''), 'launch')::public.date_type,
    coalesce(nullif(p_input ->> 'owner_id', '')::uuid, v_user),
    v_user
  )
  returning * into v_capsule;

  for v_comp in select * from jsonb_array_elements(coalesce(p_input -> 'components', '[]')) loop
    insert into public.components (org_id, capsule_id, component_type_id, owner_id, due_date, goal, position)
    values (
      v_org,
      v_capsule.id,
      (v_comp ->> 'component_type_id')::uuid,
      nullif(v_comp ->> 'owner_id', '')::uuid,
      nullif(v_comp ->> 'due_date', '')::date,
      nullif(trim(coalesce(v_comp ->> 'goal', '')), ''),
      v_position
    )
    returning id into v_component;
    v_position := v_position + 1;

    for v_person in select * from jsonb_array_elements_text(coalesce(v_comp -> 'collaborators', '[]')) loop
      if nullif(v_person, '')::uuid is distinct from nullif(v_comp ->> 'owner_id', '')::uuid then
        insert into public.component_people (org_id, capsule_id, component_id, user_id, source)
        values (v_org, v_capsule.id, v_component, v_person::uuid, 'added')
        on conflict do nothing;
      end if;
    end loop;

    v_item_position := 0;
    for v_item in select * from jsonb_array_elements(coalesce(v_comp -> 'items', '[]')) loop
      if length(trim(coalesce(v_item ->> 'title', ''))) > 0 then
        insert into public.work_items (org_id, capsule_id, component_id, title, assignee_id, created_by, position)
        values (
          v_org,
          v_capsule.id,
          v_component,
          trim(v_item ->> 'title'),
          nullif(v_item ->> 'assignee_id', '')::uuid,
          v_user,
          v_item_position
        );
        v_item_position := v_item_position + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('id', v_capsule.id, 'key', v_prefix || '-' || v_capsule.number);
end;
$$;

revoke execute on function public.create_capsule(jsonb) from public, anon;
grant execute on function public.create_capsule(jsonb) to authenticated;
