-- Capsule V1: removing a component from a capsule, with Undo (step 5b).
--
-- Only the capsule owner can remove a component. Its work items either move
-- to another component in the same capsule or are removed with it. The
-- function returns a snapshot of everything it changed, and
-- restore_component puts it all back exactly (same ids), which is how Undo
-- works.

-- Keeps "assignees join the component they have work in" true after items
-- move: adds assignment rows where needed, and drops assignment rows for
-- people with no items left in a component.
create function private.resync_assignment_membership(p_capsule uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.component_people (org_id, capsule_id, component_id, user_id, source)
  select distinct w.org_id, w.capsule_id, w.component_id, w.assignee_id, 'assignment'::public.collaborator_source
  from public.work_items w
  join public.components c on c.id = w.component_id
  where w.capsule_id = p_capsule
    and w.assignee_id is not null
    and c.owner_id is distinct from w.assignee_id
  on conflict (component_id, user_id) do nothing;

  delete from public.component_people p
  where p.capsule_id = p_capsule
    and p.source = 'assignment'
    and not exists (
      select 1 from public.work_items w
      where w.component_id = p.component_id and w.assignee_id = p.user_id
    );
$$;

create function public.remove_component(p_component uuid, p_move_to uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_comp public.components;
  v_snapshot jsonb;
begin
  select * into v_comp from public.components where id = p_component;
  if not found or not private.can('edit_capsule', v_comp.capsule_id) then
    raise exception 'Only the capsule owner can remove components' using errcode = '42501';
  end if;
  if p_move_to is not null and not exists (
    select 1 from public.components c
    where c.id = p_move_to and c.capsule_id = v_comp.capsule_id and c.id <> p_component
  ) then
    raise exception 'Move the work items to another component in this capsule' using errcode = '22023';
  end if;

  v_snapshot := jsonb_build_object(
    'component', to_jsonb(v_comp),
    'collaborators', coalesce((
      select jsonb_agg(to_jsonb(p)) from public.component_people p
      where p.component_id = p_component and p.source = 'added'
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.position, w.created_at) from public.work_items w
      where w.component_id = p_component
    ), '[]'::jsonb),
    'moved_to', p_move_to
  );

  if p_move_to is not null then
    update public.work_items
      set component_id = p_move_to
      where component_id = p_component;
  end if;

  delete from public.components where id = p_component;
  perform private.resync_assignment_membership(v_comp.capsule_id);

  return v_snapshot;
end;
$$;

create function public.restore_component(p_snapshot jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_comp public.components;
  v_moved_to uuid := nullif(p_snapshot ->> 'moved_to', '')::uuid;
begin
  v_comp := jsonb_populate_record(null::public.components, p_snapshot -> 'component');
  if v_comp.id is null or not private.can('edit_capsule', v_comp.capsule_id) then
    raise exception 'Only the capsule owner can put a component back' using errcode = '42501';
  end if;

  insert into public.components
  select * from jsonb_populate_record(null::public.components, p_snapshot -> 'component');

  insert into public.component_people
  select * from jsonb_populate_recordset(null::public.component_people, p_snapshot -> 'collaborators')
  on conflict do nothing;

  if v_moved_to is not null then
    -- The items were moved: move those same items back.
    update public.work_items w
      set component_id = v_comp.id
      where w.id in (
        select (i ->> 'id')::uuid from jsonb_array_elements(p_snapshot -> 'items') i
      )
      and w.capsule_id = v_comp.capsule_id;
  else
    -- The items were removed with the component: put them back as they were.
    insert into public.work_items
    select * from jsonb_populate_recordset(null::public.work_items, p_snapshot -> 'items')
    on conflict (id) do nothing;
  end if;

  perform private.resync_assignment_membership(v_comp.capsule_id);
  return v_comp.id;
end;
$$;

revoke execute on function public.remove_component(uuid, uuid) from public, anon;
revoke execute on function public.restore_component(jsonb) from public, anon;
grant execute on function public.remove_component(uuid, uuid) to authenticated;
grant execute on function public.restore_component(jsonb) to authenticated;
