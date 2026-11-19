-- Capsule step 14: linking Jira issues to work items (one-way).
--
-- Each person connects their own Jira account (build-decisions.md 65). A
-- linked work item copies the issue's title, status and assignee, follows
-- Jira for status and assignee, and keeps a Jira tag. Capsule never writes to
-- Jira.
--
-- What this migration adds:
-- 1. integrations: one row per person per connected tool. The tokens are
--    encrypted by the app before they're stored, and the browser can't read
--    them at all (no column access); only the server's key can.
-- 2. Linked work items: Jira details on work_items, and link_work_item() to
--    add one.
-- 3. Locks: done, status and assignee on a linked item follow Jira; nobody
--    changes them in Capsule (the server's sync does).

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  tool text not null check (tool in ('jira')),
  -- The Jira site (an Atlassian "cloud"): its id, address and name.
  site_id text not null check (length(site_id) between 1 and 200),
  site_url text not null check (site_url ~ '^https://'),
  site_name text check (site_name is null or length(site_name) <= 200),
  -- The person's account on that site.
  account_id text check (account_id is null or length(account_id) <= 200),
  account_name text check (account_name is null or length(account_name) <= 200),
  -- Encrypted by the app (AES-256-GCM, INTEGRATIONS_ENCRYPTION_KEY).
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  -- 'needs_reconnect' when Jira stopped accepting the refresh token.
  status text not null default 'active' check (status in ('active', 'needs_reconnect')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id, tool),
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade
);

alter table public.integrations enable row level security;

revoke all on public.integrations from anon, authenticated;
-- Never the tokens.
grant select (id, org_id, user_id, tool, site_url, site_name, account_name, status, created_at, updated_at)
  on public.integrations to authenticated;
grant delete on public.integrations to authenticated;

create policy "See your own connections" on public.integrations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Disconnect your own connections" on public.integrations
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger set_updated_at before update on public.integrations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Linked work items
-- ---------------------------------------------------------------------------

alter table public.work_items
  -- Jira's own id for the issue (keys change when an issue moves project).
  add column source_id text check (source_id is null or length(source_id) <= 100),
  -- The title as Jira last had it: a rename in Capsule sticks; a rename in
  -- Jira comes through only if nobody renamed it in Capsule.
  add column source_title text check (source_title is null or length(source_title) <= 500),
  -- Jira's status name ("Code review") and category (new, indeterminate, done).
  add column source_status text check (source_status is null or length(source_status) <= 100),
  add column source_status_category text,
  -- The Jira assignee's name, shown when they aren't in Capsule.
  add column source_assignee text check (source_assignee is null or length(source_assignee) <= 200),
  -- Whose Jira account keeps this item up to date.
  add column source_linked_by uuid,
  add constraint work_items_source_linked_by_fkey
    foreign key (org_id, source_linked_by) references public.org_members (org_id, user_id)
    on delete set null (source_linked_by);

-- One link per issue per capsule ("Linked" in the picker).
create unique index work_items_linked_once on public.work_items (capsule_id, source, source_key)
  where source <> 'none';
create index work_items_linked_idx on public.work_items (source, synced_at) where source <> 'none';

-- Adds a linked Jira issue to a component. The server looks the issue up with
-- the person's own Jira account first and passes on what Jira said; anyone on
-- the capsule's team may link (like adding a work item). Linking an open issue
-- to a Done component moves the component back to In progress.
create function public.link_work_item(p_component uuid, p_issue jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_comp public.components;
  v_status public.work_status;
  v_assignee uuid := nullif(p_issue ->> 'assignee_id', '')::uuid;
  v_title text := left(trim(coalesce(p_issue ->> 'title', '')), 500);
  v_key text := upper(trim(coalesce(p_issue ->> 'key', '')));
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into v_comp from public.components c where c.id = p_component;
  if v_comp.id is null or not private.can('contribute', v_comp.capsule_id) then
    raise exception 'Only people on this capsule can link work items' using errcode = '42501';
  end if;
  if v_key !~ '^[A-Z][A-Z0-9_]{0,19}-[0-9]{1,10}$' then
    raise exception 'That isn''t a Jira issue key' using errcode = '22023';
  end if;
  if v_title = '' then
    v_title := v_key;
  end if;
  if coalesce(p_issue ->> 'url', '') !~ '^https://' then
    raise exception 'A linked issue needs its Jira address' using errcode = '22023';
  end if;
  v_status := coalesce(nullif(p_issue ->> 'status', ''), 'not_started')::public.work_status;
  if v_status = 'blocked' then
    v_status := 'in_progress';
  end if;
  if v_assignee is not null and not private.is_org_member(v_comp.org_id, v_assignee) then
    v_assignee := null;
  end if;

  insert into public.work_items (
    org_id, capsule_id, component_id, title, assignee_id, status, done, created_by, position,
    source, source_key, source_url, source_id, source_title, source_status,
    source_status_category, source_assignee, source_linked_by, synced_at
  )
  values (
    v_comp.org_id, v_comp.capsule_id, v_comp.id, v_title, v_assignee, v_status,
    v_status = 'done', v_user,
    coalesce((select max(w.position) + 1 from public.work_items w where w.component_id = v_comp.id), 0),
    'jira', v_key, p_issue ->> 'url', left(p_issue ->> 'id', 100), v_title,
    left(p_issue ->> 'status_name', 100), left(p_issue ->> 'status_category', 40),
    left(p_issue ->> 'assignee_name', 200), v_user, now()
  )
  returning id into v_id;

  if v_status <> 'done' and v_comp.status = 'done' then
    update public.components set status = 'in_progress' where id = v_comp.id;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.link_work_item(uuid, jsonb) from public, anon;
grant execute on function public.link_work_item(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Linked items follow Jira
-- ---------------------------------------------------------------------------

-- A linked item's status comes from Jira, not from its collaborators' pieces.
create or replace function private.apply_work_item_status()
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

  -- Linked items: the sync (the server) keeps done in step with Jira's status.
  -- People's changes are left as they are, for check_linked_item_update to refuse.
  if new.source <> 'none' then
    if not private.is_end_user() then
      new.done := new.status = 'done';
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

-- People can rename a linked item, add notes and collaborators, or unlink it,
-- but its done, status and assignee follow Jira (the sync runs as the server).
create function private.check_linked_item_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_end_user() and old.source <> 'none'
     and (new.done is distinct from old.done
          or new.status is distinct from old.status
          or new.status_manual is distinct from old.status_manual
          or new.assignee_id is distinct from old.assignee_id) then
    raise exception 'This item follows Jira: change its status or assignee there'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger check_linked_item_update before update on public.work_items
  for each row execute function private.check_linked_item_update();

-- Activity: linking and unlinking say which issue.
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
  if v_row.source <> 'none' then
    v_base := v_base || jsonb_build_object(
      'source', v_row.source, 'source_key', v_row.source_key, 'source_url', v_row.source_url
    );
  end if;
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
