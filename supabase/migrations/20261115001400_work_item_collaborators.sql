-- Step 12: work item statuses, and more than one person on a work item.
--
-- * Work items get the four work statuses (no Blocked). The checkbox and
--   Done stay in step: checking one off sets it to Done, and Done checks it.
-- * Collaborators: people who each own a piece of a work item, with their
--   own status. One of them can be the lead. While nobody has set the
--   item's status by hand, it follows the pieces (all done → Done, any in
--   review → In review, any started → In progress). Setting it by hand
--   overrides that until someone picks "Use suggestion".
-- * Collaborators join the component's team, like assignees do.
-- * Their pieces show in Needs your attention, and changes are logged.

-- ---------------------------------------------------------------------------
-- Statuses on work items
-- ---------------------------------------------------------------------------

alter table public.work_items
  add column status public.work_status not null default 'not_started'
    check (status <> 'blocked'),
  -- True once someone set the status by hand on an item with collaborators.
  add column status_manual boolean not null default false,
  add constraint work_items_org_capsule_id_key unique (org_id, capsule_id, id);

update public.work_items set status = 'done' where done;

grant update (status, status_manual) on public.work_items to authenticated;

-- ---------------------------------------------------------------------------
-- Collaborators
-- ---------------------------------------------------------------------------

create table public.work_item_collaborators (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  capsule_id uuid not null,
  work_item_id uuid not null,
  user_id uuid not null,
  -- Their part of the item, in a few words ("UI", "Copy review").
  piece text not null default '' check (length(piece) <= 80),
  status public.work_status not null default 'not_started' check (status <> 'blocked'),
  is_lead boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_item_id, user_id),
  foreign key (org_id, capsule_id, work_item_id)
    references public.work_items (org_id, capsule_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade,
  foreign key (org_id, created_by) references public.org_members (org_id, user_id)
    on delete set null (created_by)
);

create unique index work_item_collaborators_one_lead_idx
  on public.work_item_collaborators (work_item_id) where is_lead;
create index work_item_collaborators_user_idx on public.work_item_collaborators (user_id);
create index work_item_collaborators_capsule_idx on public.work_item_collaborators (capsule_id);

alter table public.work_item_collaborators enable row level security;

revoke all on public.work_item_collaborators from anon;
revoke truncate, references, trigger on public.work_item_collaborators from authenticated;
revoke update on public.work_item_collaborators from authenticated;
grant update (piece, status, is_lead) on public.work_item_collaborators to authenticated;

create or replace function private.can(p_action text, p_target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_ok boolean;
  v_org uuid;
  v_owner uuid;
  v_comp_owner uuid;
  v_created_by uuid;
  v_assignee uuid;
  v_lead boolean := false;
  v_capsule uuid;
  v_space public.spaces;
begin
  if v_user is null or p_target is null then
    return false;
  end if;

  case p_action
    -- Org ------------------------------------------------------------------
    when 'member_of_org' then
      v_ok := private.is_org_member(p_target, v_user);

    when 'admin_org' then
      v_ok := private.is_org_admin(p_target, v_user);

    -- Space ----------------------------------------------------------------
    when 'view_space' then
      select * into v_space from public.spaces s where s.id = p_target;
      v_ok := found and private.space_row_visible(v_space, v_user);

    when 'join_space' then
      select * into v_space from public.spaces s where s.id = p_target;
      v_ok := found and not v_space.is_private and private.is_org_member(v_space.org_id, v_user);

    when 'manage_space' then
      select * into v_space from public.spaces s where s.id = p_target;
      v_ok := found
        and private.is_org_member(v_space.org_id, v_user)
        and (
          v_space.created_by is not distinct from v_user
          or private.is_org_admin(v_space.org_id, v_user)
          or exists (
            select 1 from public.space_members m
            where m.space_id = p_target and m.user_id = v_user and m.role = 'admin'
          )
        );

    -- Capsule --------------------------------------------------------------
    when 'view_capsule', 'follow' then
      v_ok := private.can_view_capsule(p_target, v_user);

    when 'comment', 'contribute' then
      -- Team members only. Followers and org admins off the team are read-only.
      v_ok := private.is_on_team(p_target, v_user) and private.can_view_capsule(p_target, v_user);

    when 'edit_capsule' then
      v_ok := exists (select 1 from public.capsules c where c.id = p_target and c.owner_id = v_user);

    -- Component ------------------------------------------------------------
    when 'edit_component' then
      select cap.owner_id, comp.owner_id into v_owner, v_comp_owner
      from public.components comp
      join public.capsules cap on cap.id = comp.capsule_id
      where comp.id = p_target;
      v_ok := found and (v_owner is not distinct from v_user or v_comp_owner is not distinct from v_user);

    -- Work item ------------------------------------------------------------
    -- complete: check off or set its status. edit: title and notes.
    -- manage: add and remove collaborators, pick the lead.
    when 'complete_work_item', 'edit_work_item', 'delete_work_item', 'manage_work_item' then
      select cap.owner_id, comp.owner_id, w.created_by, w.assignee_id
        into v_owner, v_comp_owner, v_created_by, v_assignee
      from public.work_items w
      join public.components comp on comp.id = w.component_id
      join public.capsules cap on cap.id = w.capsule_id
      where w.id = p_target;
      if found then
        v_lead := exists (
          select 1 from public.work_item_collaborators wc
          where wc.work_item_id = p_target and wc.user_id = v_user and wc.is_lead
        );
      end if;
      v_ok := found and (
        v_owner is not distinct from v_user
        or v_comp_owner is not distinct from v_user
        or case p_action
          when 'complete_work_item' then v_assignee is not distinct from v_user or v_lead
          when 'edit_work_item' then
            v_assignee is not distinct from v_user or v_created_by is not distinct from v_user or v_lead
          when 'manage_work_item' then
            v_assignee is not distinct from v_user or v_created_by is not distinct from v_user or v_lead
          else v_created_by is not distinct from v_user
        end
      );

    -- Collaborator's piece of a work item: the collaborator themselves, or
    -- whoever manages the item.
    when 'edit_piece' then
      select wc.user_id, wc.work_item_id into v_assignee, v_capsule
      from public.work_item_collaborators wc
      where wc.id = p_target;
      v_ok := found and (
        v_assignee is not distinct from v_user or private.can('manage_work_item', v_capsule)
      );

    -- Attachment -----------------------------------------------------------
    when 'remove_attachment' then
      select a.added_by, cap.owner_id, a.capsule_id into v_created_by, v_owner, v_capsule
      from public.attachments a
      join public.capsules cap on cap.id = a.capsule_id
      where a.id = p_target;
      v_ok := found
        and (v_created_by is not distinct from v_user or v_owner is not distinct from v_user)
        and private.can_view_capsule(v_capsule, v_user);

    else
      raise exception 'Unknown permission action: %', p_action;
  end case;

  return coalesce(v_ok, false);
end;
$$;

create policy "See collaborators on capsules you can see" on public.work_item_collaborators
  for select to authenticated using (private.can('view_capsule', capsule_id));
create policy "Item managers add collaborators" on public.work_item_collaborators
  for insert to authenticated
  with check (
    private.can('manage_work_item', work_item_id)
    and created_by = (select auth.uid())
  );
-- Which columns each person may change is checked by check_piece_update.
create policy "Collaborators and item managers update pieces" on public.work_item_collaborators
  for update to authenticated using (private.can('edit_piece', id));
create policy "Collaborators and item managers remove pieces" on public.work_item_collaborators
  for delete to authenticated using (private.can('edit_piece', id));

create function private.check_piece_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if private.is_end_user()
     and new.is_lead is distinct from old.is_lead
     and not private.can('manage_work_item', old.work_item_id) then
    raise exception 'Only the work item''s owners or lead can choose the lead' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger check_piece_update before update on public.work_item_collaborators
  for each row execute function private.check_piece_update();

-- One lead per item: making someone the lead takes it from whoever had it.
create function private.one_lead_per_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_lead and (tg_op = 'INSERT' or not old.is_lead) then
    update public.work_item_collaborators
      set is_lead = false
      where work_item_id = new.work_item_id and id <> new.id and is_lead;
  end if;
  return new;
end;
$$;

create trigger one_lead_per_item before insert or update of is_lead on public.work_item_collaborators
  for each row execute function private.one_lead_per_item();

-- ---------------------------------------------------------------------------
-- The item's status follows its pieces
-- ---------------------------------------------------------------------------

-- What the pieces add up to, or null when the item has none.
create function private.suggested_item_status(p_item uuid)
returns public.work_status
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when count(*) = 0 then null
    when bool_and(wc.status = 'done') then 'done'
    when bool_or(wc.status = 'in_review') then 'in_review'
    when bool_or(wc.status <> 'not_started') then 'in_progress'
    else 'not_started'
  end::public.work_status
  from public.work_item_collaborators wc
  where wc.work_item_id = p_item;
$$;

grant execute on function private.suggested_item_status(uuid) to authenticated, service_role;

-- Keeps done and status in step, and applies the suggestion. Named to run
-- before check_work_item_update, which then checks the final values.
create function private.apply_work_item_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suggested public.work_status;
  v_by_hand boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.done then
      new.status := 'done';
    elsif new.status = 'done' then
      new.done := true;
    end if;
    return new;
  end if;

  -- Someone checked it off or reopened it, or picked a status.
  if new.status is distinct from old.status then
    v_by_hand := true;
  elsif new.done is distinct from old.done then
    new.status := case when new.done then 'done' else 'not_started' end;
    v_by_hand := true;
  end if;

  v_suggested := private.suggested_item_status(new.id);
  if v_suggested is not null then
    if v_by_hand and new.status_manual is not distinct from old.status_manual then
      new.status_manual := true;
    end if;
    if not new.status_manual then
      new.status := v_suggested;
    end if;
  end if;

  new.done := new.status = 'done';
  return new;
end;
$$;

create trigger apply_work_item_status before insert or update on public.work_items
  for each row execute function private.apply_work_item_status();

-- True when this update only followed the pieces (nobody set it by hand).
create function private.status_followed_pieces(p_old public.work_items, p_new public.work_items)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not p_old.status_manual and not p_new.status_manual
    and exists (select 1 from public.work_item_collaborators wc where wc.work_item_id = p_new.id);
$$;

create or replace function private.check_work_item_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_followed boolean;
begin
  if new.done is distinct from old.done then
    new.done_at := case when new.done then now() else null end;
  end if;

  if not private.is_end_user() then
    return new;
  end if;

  v_followed := private.status_followed_pieces(old, new);

  if (new.done is distinct from old.done
      or new.status is distinct from old.status
      or new.status_manual is distinct from old.status_manual)
     and not v_followed
     and not private.can('complete_work_item', old.id) then
    raise exception 'Only the assignee, the lead, the component owner or the capsule owner can change this item''s status'
      using errcode = '42501';
  end if;

  if (new.title is distinct from old.title or new.note is distinct from old.note)
     and not private.can('edit_work_item', old.id) then
    raise exception 'You can''t edit this work item' using errcode = '42501';
  end if;

  if new.assignee_id is distinct from old.assignee_id
     and not private.can('edit_component', old.component_id)
     -- Team members may take an unassigned item, or let go of their own.
     and not (new.assignee_id is not distinct from v_user and old.assignee_id is null)
     and not (new.assignee_id is null and old.assignee_id is not distinct from v_user) then
    raise exception 'You can only assign work items to yourself' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- When pieces change, the item takes another look at its status.
create function private.rollup_item_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.work_items
    set updated_at = now()
    where id = case when tg_op = 'DELETE' then old.work_item_id else new.work_item_id end;
  return null;
end;
$$;

create trigger rollup_item_status
  after insert or update of status or delete on public.work_item_collaborators
  for each row execute function private.rollup_item_status();

-- ---------------------------------------------------------------------------
-- Collaborators join the component's team, like assignees
-- ---------------------------------------------------------------------------

-- Does this person have work in this component (assigned, or a piece)?
create function private.has_work_in(p_component uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.work_items w
    where w.component_id = p_component and w.assignee_id = p_user
  ) or exists (
    select 1 from public.work_item_collaborators wc
    join public.work_items w on w.id = wc.work_item_id
    where w.component_id = p_component and wc.user_id = p_user
  );
$$;

create or replace function private.sync_assignee_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.assignee_id is not null then
    insert into public.component_people (org_id, capsule_id, component_id, user_id, source)
    select new.org_id, new.capsule_id, new.component_id, new.assignee_id, 'assignment'
    where not exists (
      select 1 from public.components c where c.id = new.component_id and c.owner_id = new.assignee_id
    )
    on conflict (component_id, user_id) do nothing;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.assignee_id is not null
     and (tg_op = 'DELETE' or new.assignee_id is distinct from old.assignee_id) then
    delete from public.component_people p
    where p.component_id = old.component_id
      and p.user_id = old.assignee_id
      and p.source = 'assignment'
      and not private.has_work_in(old.component_id, old.assignee_id);
  end if;

  return null;
end;
$$;

create function private.sync_piece_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.component_people (org_id, capsule_id, component_id, user_id, source)
    select w.org_id, w.capsule_id, w.component_id, new.user_id, 'assignment'
    from public.work_items w
    join public.components c on c.id = w.component_id
    where w.id = new.work_item_id and c.owner_id is distinct from new.user_id
    on conflict (component_id, user_id) do nothing;
  else
    select w.component_id into v_comp from public.work_items w where w.id = old.work_item_id;
    -- The item itself is being deleted: its own trigger tidies up.
    if v_comp is null then
      return null;
    end if;
    delete from public.component_people p
    where p.component_id = v_comp
      and p.user_id = old.user_id
      and p.source = 'assignment'
      and not private.has_work_in(v_comp, old.user_id);
  end if;
  return null;
end;
$$;

create trigger sync_piece_membership
  after insert or delete on public.work_item_collaborators
  for each row execute function private.sync_piece_membership();

-- Deleting an item takes its pieces with it; tidy up their team places.
create function private.tidy_piece_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.component_people p
  where p.component_id = old.component_id
    and p.source = 'assignment'
    and p.user_id <> coalesce(old.assignee_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and not private.has_work_in(old.component_id, p.user_id);
  return null;
end;
$$;

create trigger tidy_piece_membership after delete on public.work_items
  for each row execute function private.tidy_piece_membership();

create or replace function private.resync_assignment_membership(p_capsule uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.component_people (org_id, capsule_id, component_id, user_id, source)
  select distinct w.org_id, w.capsule_id, w.component_id, x.user_id, 'assignment'::public.collaborator_source
  from public.work_items w
  join public.components c on c.id = w.component_id
  cross join lateral (
    select w.assignee_id as user_id
    union
    select wc.user_id from public.work_item_collaborators wc where wc.work_item_id = w.id
  ) x
  where w.capsule_id = p_capsule
    and x.user_id is not null
    and c.owner_id is distinct from x.user_id
  on conflict (component_id, user_id) do nothing;

  delete from public.component_people p
  where p.capsule_id = p_capsule
    and p.source = 'assignment'
    and not private.has_work_in(p.component_id, p.user_id);
$$;

-- Removing a component keeps its items' pieces, so Undo puts them back.
create or replace function public.remove_component(p_component uuid, p_move_to uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_comp public.components;
  v_snapshot jsonb;
  v_items integer;
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
    'pieces', coalesce((
      select jsonb_agg(to_jsonb(wc)) from public.work_item_collaborators wc
      join public.work_items w on w.id = wc.work_item_id
      where w.component_id = p_component
    ), '[]'::jsonb),
    'moved_to', p_move_to
  );
  v_items := jsonb_array_length(v_snapshot -> 'items');

  perform set_config('capsule.quiet', 'on', true);
  if p_move_to is not null then
    update public.work_items
      set component_id = p_move_to
      where component_id = p_component;
  end if;
  delete from public.components where id = p_component;
  perform private.resync_assignment_membership(v_comp.capsule_id);
  perform set_config('capsule.quiet', 'off', true);

  perform private.log_event(v_comp.org_id, v_comp.capsule_id, 'component_removed', jsonb_build_object(
    'component_id', v_comp.id,
    'component', private.component_name(v_comp.component_type_id),
    'items', v_items,
    'moved_to', (
      select private.component_name(c.component_type_id) from public.components c where c.id = p_move_to
    )
  ));

  return v_snapshot;
end;
$$;

create or replace function public.restore_component(p_snapshot jsonb)
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

  perform set_config('capsule.quiet', 'on', true);

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
    insert into public.work_item_collaborators
    select * from jsonb_populate_recordset(
      null::public.work_item_collaborators, coalesce(p_snapshot -> 'pieces', '[]'::jsonb))
    on conflict do nothing;
  end if;

  perform private.resync_assignment_membership(v_comp.capsule_id);
  perform set_config('capsule.quiet', 'off', true);

  perform private.log_event(v_comp.org_id, v_comp.capsule_id, 'component_restored', jsonb_build_object(
    'component_id', v_comp.id,
    'component', private.component_name(v_comp.component_type_id)
  ));
  return v_comp.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity
-- ---------------------------------------------------------------------------

create or replace function private.log_work_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.work_items;
  v_comp public.components;
  v_base jsonb;
  v_old jsonb;
  v_new jsonb;
  v_field text;
  v_followed boolean;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select * into v_comp from public.components c where c.id = v_row.component_id;
  -- Items deleted along with their component are covered by "removed X".
  if v_comp.id is null then
    return null;
  end if;
  v_base := jsonb_build_object(
    'item_id', v_row.id,
    'title', v_row.title,
    'component_id', v_comp.id,
    'component', private.component_name(v_comp.component_type_id)
  );
  if tg_op = 'INSERT' then
    if not private.capsule_is_new(new.capsule_id) then
      perform private.log_event(new.org_id, new.capsule_id, 'item_added', v_base);
    end if;
  elsif tg_op = 'DELETE' then
    perform private.log_event(old.org_id, old.capsule_id, 'item_deleted', v_base);
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    -- A status that only followed the pieces is told by the pieces' entries.
    v_followed := private.status_followed_pieces(old, new);
    foreach v_field in array array['title', 'done', 'assignee_id', 'status'] loop
      continue when v_field in ('done', 'status') and v_followed;
      -- Checked off or reopened says it already.
      continue when v_field = 'status' and new.done is distinct from old.done;
      if v_old -> v_field is distinct from v_new -> v_field then
        perform private.log_event(new.org_id, new.capsule_id, 'item_changed', v_base || jsonb_build_object(
          'field', replace(v_field, '_id', ''),
          'from', v_old -> v_field,
          'to', v_new -> v_field
        ));
      end if;
    end loop;
  end if;
  return null;
end;
$$;

-- Pieces: someone added or removed, and changes to a piece, its status or
-- the lead.
create function private.log_piece_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.work_item_collaborators;
  v_item public.work_items;
  v_base jsonb;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select * into v_item from public.work_items w where w.id = v_row.work_item_id;
  -- Pieces removed along with their item are covered by "deleted X".
  if v_item.id is null or private.capsule_is_new(v_row.capsule_id) then
    return null;
  end if;
  v_base := jsonb_build_object(
    'piece_id', v_row.id,
    'item_id', v_item.id,
    'title', v_item.title,
    'component_id', v_item.component_id,
    'component', (
      select private.component_name(c.component_type_id) from public.components c
      where c.id = v_item.component_id
    ),
    'user', v_row.user_id,
    'piece', v_row.piece
  );
  if tg_op = 'INSERT' then
    perform private.log_event(new.org_id, new.capsule_id, 'piece_added', v_base);
  elsif tg_op = 'DELETE' then
    perform private.log_event(old.org_id, old.capsule_id, 'piece_removed', v_base);
  else
    if new.piece is distinct from old.piece then
      perform private.log_event(new.org_id, new.capsule_id, 'piece_changed', v_base || jsonb_build_object(
        'field', 'piece', 'from', old.piece, 'to', new.piece));
    end if;
    if new.status is distinct from old.status then
      perform private.log_event(new.org_id, new.capsule_id, 'piece_changed', v_base || jsonb_build_object(
        'field', 'status', 'from', old.status, 'to', new.status));
    end if;
    -- Only the new lead is told; losing it is part of that.
    if new.is_lead and not old.is_lead then
      perform private.log_event(new.org_id, new.capsule_id, 'piece_changed', v_base || jsonb_build_object(
        'field', 'lead', 'from', false, 'to', true));
    elsif not new.is_lead and old.is_lead and not exists (
      select 1 from public.work_item_collaborators wc
      where wc.work_item_id = new.work_item_id and wc.is_lead and wc.id <> new.id
    ) then
      perform private.log_event(new.org_id, new.capsule_id, 'piece_changed', v_base || jsonb_build_object(
        'field', 'lead', 'from', true, 'to', false));
    end if;
  end if;
  return null;
end;
$$;

create trigger log_piece_change after insert or update or delete on public.work_item_collaborators
  for each row execute function private.log_piece_change();

-- ---------------------------------------------------------------------------
-- Needs your attention: your pieces
-- ---------------------------------------------------------------------------

alter table public.dismissals drop constraint dismissals_kind_check;
alter table public.dismissals add constraint dismissals_kind_check
  check (kind in ('item', 'component', 'no_owner', 'mention', 'piece'));

create or replace function public.needs_attention()
returns table (
  kind text,
  target_id uuid,
  capsule_id uuid,
  capsule_key text,
  capsule_name text,
  component_id uuid,
  component_name text,
  component_color text,
  component_icon text,
  title text,
  due_date date,
  since timestamptz,
  actor_id uuid,
  body text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  caps as (
    select c.id, c.org_id, c.name, c.owner_id, s.key_prefix || '-' || c.number as key
    from public.capsules c
    join public.spaces s on s.id = c.space_id
    where c.archived_at is null
  ),
  comps as (
    select k.*, t.name as type_name, t.color::text as type_color, t.icon as type_icon
    from public.components k
    join public.component_types t on t.id = k.component_type_id
  ),
  -- The latest time something was handed to someone, from the activity log.
  handed as (
    select e.kind, e.data ->> 'field' as field, e.data ->> 'to' as to_user,
           coalesce(e.data ->> 'item_id', e.data ->> 'component_id') as target,
           max(e.created_at) as at
    from public.events e
    where e.kind in ('item_changed', 'component_changed')
      and e.data ->> 'field' in ('assignee', 'owner')
    group by 1, 2, 3, 4
  ),
  rows as (
    -- Work items assigned to you
    select 'item'::text as kind, w.id as target_id, c.id as capsule_id, c.key, c.name,
           k.id as component_id, k.type_name, k.type_color, k.type_icon,
           w.title, k.due_date,
           coalesce((select h.at from handed h
                     where h.kind = 'item_changed' and h.target = w.id::text
                       and h.to_user = (select id from me)::text), w.created_at) as since,
           null::uuid as actor_id, null::text as body
    from public.work_items w
    join comps k on k.id = w.component_id
    join caps c on c.id = w.capsule_id
    where w.assignee_id = (select id from me) and not w.done

    union all
    -- Components you own
    select 'component', k.id, c.id, c.key, c.name, k.id, k.type_name, k.type_color, k.type_icon,
           k.type_name, k.due_date,
           coalesce((select h.at from handed h
                     where h.kind = 'component_changed' and h.target = k.id::text
                       and h.to_user = (select id from me)::text), k.created_at),
           null, null
    from comps k
    join caps c on c.id = k.capsule_id
    where k.owner_id = (select id from me) and k.status <> 'done'

    union all
    -- Components with no owner, on capsules you own
    select 'no_owner', k.id, c.id, c.key, c.name, k.id, k.type_name, k.type_color, k.type_icon,
           k.type_name, k.due_date,
           greatest(k.created_at, coalesce((select max(e.created_at) from public.events e
                     where e.kind = 'component_changed' and e.data ->> 'field' = 'owner'
                       and e.data ->> 'component_id' = k.id::text), k.created_at)),
           null, null
    from comps k
    join caps c on c.id = k.capsule_id
    where c.owner_id = (select id from me) and k.owner_id is null and k.status <> 'done'

    union all
    -- Your piece of someone's work item
    select 'piece', wc.id, c.id, c.key, c.name, k.id, k.type_name, k.type_color, k.type_icon,
           w.title, k.due_date, wc.created_at, wc.created_by, wc.piece
    from public.work_item_collaborators wc
    join public.work_items w on w.id = wc.work_item_id
    join comps k on k.id = w.component_id
    join caps c on c.id = w.capsule_id
    where wc.user_id = (select id from me) and wc.status <> 'done' and not w.done
      -- assigned to you as well: the item row covers it
      and w.assignee_id is distinct from (select id from me)

    union all
    -- @mentions of you
    select 'mention', m.id, c.id, c.key, c.name, null, null, null, null,
           c.name, null, m.created_at, e.actor_user_id, e.data ->> 'body'
    from public.mentions m
    join public.events e on e.id = m.event_id
    join caps c on c.id = e.capsule_id
    where m.user_id = (select id from me)
      and m.read_at is null
      -- you haven't commented on that capsule since
      and not exists (
        select 1 from public.events r
        where r.capsule_id = e.capsule_id and r.kind = 'comment'
          and r.actor_user_id = (select id from me) and r.created_at > e.created_at
      )
      -- the comment hasn't been deleted
      and (select count(*) filter (where d.kind = 'comment_deleted')
                - count(*) filter (where d.kind = 'comment_restored')
           from public.events d
           where d.capsule_id = e.capsule_id and d.data ->> 'comment_id' = e.id::text) <= 0
  )
  select r.* from rows r
  where not exists (
    select 1 from public.dismissals d
    where d.user_id = (select id from me) and d.kind = r.kind
      and d.target_id = r.target_id
      -- to the millisecond: browsers and the app keep times at that precision
      and date_trunc('milliseconds', d.since) = date_trunc('milliseconds', r.since)
  );
$$;

revoke execute on function public.needs_attention() from public, anon;
grant execute on function public.needs_attention() to authenticated;
