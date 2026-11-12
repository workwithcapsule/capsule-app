-- Capsule V1: the activity log, comments and @mentions (step 6).
--
-- Every saved change to a capsule, its components, work items and
-- collaborators is written to public.events by the database itself, so the
-- app can't forget to log something. Each entry records who did it (the
-- signed-in person). Changes made by the system (no signed-in person) aren't
-- logged. The log stays append-only: deleting a comment, or undoing a
-- change, adds an entry rather than removing one, and the app works out
-- what to show from the whole stream.

-- Several entries can be written in one transaction; give each its own time
-- so they stay in order.
alter table public.events alter column created_at set default clock_timestamp();

-- ---------------------------------------------------------------------------
-- Writing entries
-- ---------------------------------------------------------------------------

-- Functions that change many rows at once (removing or restoring a
-- component) switch the row-by-row logging off for the rest of their work and
-- write one summary entry instead. The setting lasts only for the current
-- transaction, and only database functions can set it.
create function private.logging_paused()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('capsule.quiet', true), '') = 'on';
$$;

-- True while the capsule is being created: its components, work items and
-- collaborators are part of "created this capsule", not separate entries.
create function private.capsule_is_new(p_capsule uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.capsules c where c.id = p_capsule and c.created_at = now());
$$;

create function private.log_event(p_org uuid, p_capsule uuid, p_kind text, p_data jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or private.logging_paused() then
    return;
  end if;
  -- Nothing to log once the capsule itself is gone (for example, when an
  -- org is deleted and everything in it goes with it).
  if not exists (select 1 from public.capsules c where c.id = p_capsule) then
    return;
  end if;
  insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
  values (p_org, p_capsule, auth.uid(), p_kind, p_data);
end;
$$;

create function private.component_name(p_type uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.name from public.component_types t where t.id = p_type;
$$;

-- Capsules: created, and changes to the fields people edit.
create function private.log_capsule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_field text;
begin
  if tg_op = 'INSERT' then
    perform private.log_event(new.org_id, new.id, 'capsule_created', jsonb_build_object('name', new.name));
    return null;
  end if;
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  foreach v_field in array array['name', 'outcome', 'status', 'launch_date', 'date_type', 'owner_id'] loop
    if v_old -> v_field is distinct from v_new -> v_field then
      perform private.log_event(new.org_id, new.id, 'capsule_changed', jsonb_build_object(
        'field', replace(v_field, '_id', ''),
        'from', v_old -> v_field,
        'to', v_new -> v_field
      ));
    end if;
  end loop;
  return null;
end;
$$;

create trigger log_capsule_change after insert or update on public.capsules
  for each row execute function private.log_capsule_change();

-- Components: added, removed, and changes to status, owner, due date and goal.
create function private.log_component_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.components;
  v_name text;
  v_old jsonb;
  v_new jsonb;
  v_field text;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  v_name := private.component_name(v_row.component_type_id);
  if tg_op = 'INSERT' then
    if not private.capsule_is_new(new.capsule_id) then
      perform private.log_event(new.org_id, new.capsule_id, 'component_added',
        jsonb_build_object('component_id', new.id, 'component', v_name));
    end if;
  elsif tg_op = 'DELETE' then
    perform private.log_event(old.org_id, old.capsule_id, 'component_removed',
      jsonb_build_object('component_id', old.id, 'component', v_name));
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    foreach v_field in array array['status', 'owner_id', 'due_date', 'goal'] loop
      if v_old -> v_field is distinct from v_new -> v_field then
        perform private.log_event(new.org_id, new.capsule_id, 'component_changed', jsonb_build_object(
          'component_id', new.id,
          'component', v_name,
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

create trigger log_component_change after insert or update or delete on public.components
  for each row execute function private.log_component_change();

-- Work items: added, deleted, renamed, checked off or reopened, and assigned.
create function private.log_work_item_change()
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
    foreach v_field in array array['title', 'done', 'assignee_id'] loop
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

create trigger log_work_item_change after insert or update or delete on public.work_items
  for each row execute function private.log_work_item_change();

-- Collaborators someone added by hand. People who join a component because
-- they were assigned work there are covered by the assignment entry.
create function private.log_collaborator_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.component_people;
  v_type uuid;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if v_row.source <> 'added' then
    return null;
  end if;
  select c.component_type_id into v_type from public.components c where c.id = v_row.component_id;
  if v_type is null or (tg_op = 'INSERT' and private.capsule_is_new(v_row.capsule_id)) then
    return null;
  end if;
  perform private.log_event(v_row.org_id, v_row.capsule_id,
    case when tg_op = 'INSERT' then 'collaborator_added' else 'collaborator_removed' end,
    jsonb_build_object(
      'component_id', v_row.component_id,
      'component', private.component_name(v_type),
      'user_id', v_row.user_id
    ));
  return null;
end;
$$;

create trigger log_collaborator_change after insert or delete on public.component_people
  for each row execute function private.log_collaborator_change();

revoke execute on function private.log_event(uuid, uuid, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Removing and restoring a component: one entry each
-- ---------------------------------------------------------------------------

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
-- Comments
-- ---------------------------------------------------------------------------

-- Posts a comment and records who it @mentions, together. Runs with the
-- caller's own rights, so the row-level security policies apply as usual.
-- People who aren't on the capsule team (and the author) are left out of the
-- mentions rather than failing the comment.
create function public.post_comment(p_capsule uuid, p_body text, p_mentions uuid[] default '{}')
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_body text := trim(coalesce(p_body, ''));
  v_org uuid;
  v_id uuid;
begin
  if length(v_body) = 0 then
    raise exception 'Write a comment first' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    raise exception 'Comments can be up to 2,000 characters' using errcode = '22023';
  end if;
  select c.org_id into v_org from public.capsules c where c.id = p_capsule;
  if v_org is null or not private.can('comment', p_capsule) then
    raise exception 'Only people on the capsule team can comment' using errcode = '42501';
  end if;

  insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
  values (v_org, p_capsule, auth.uid(), 'comment', jsonb_build_object('body', v_body))
  returning id into v_id;

  insert into public.mentions (org_id, event_id, user_id)
  select distinct v_org, v_id, m
  from unnest(coalesce(p_mentions, '{}')) m
  where m is distinct from auth.uid() and private.is_on_team(p_capsule, m);

  return v_id;
end;
$$;

revoke execute on function public.post_comment(uuid, text, uuid[]) from public, anon;
grant execute on function public.post_comment(uuid, text, uuid[]) to authenticated;

-- Deleting your own comment (and Undo) adds an entry that hides (or shows
-- again) the comment. The comment itself stays in the log.
create policy "Delete or restore your own comments" on public.events
  for insert to authenticated
  with check (
    kind in ('comment_deleted', 'comment_restored')
    and actor_user_id = (select auth.uid())
    and actor_agent_id is null
    and on_behalf_of is null
    and parent_event_id is null
    and jsonb_typeof(data -> 'comment_id') = 'string'
    and private.event_actor((data ->> 'comment_id')::uuid) = (select auth.uid())
    and private.event_capsule((data ->> 'comment_id')::uuid) = capsule_id
    and private.can('comment', capsule_id)
  );
