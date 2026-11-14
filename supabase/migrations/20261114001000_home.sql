-- Capsule V1: Home's Needs your attention, and agent attribution groundwork (step 8).

-- ---------------------------------------------------------------------------
-- Agent attribution groundwork (build-decisions.md 39)
-- ---------------------------------------------------------------------------
-- Where a change came from, and which AI client made it (self-reported, set
-- by the server for the API and MCP after V1). Everything in V1 is 'app'.

alter table public.events
  add column source text not null default 'app' check (source in ('app', 'api', 'mcp')),
  add column agent_client text check (agent_client is null or length(agent_client) <= 80);

-- People can't claim a change came from somewhere else.
drop policy "Team members comment" on public.events;
create policy "Team members comment" on public.events
  for insert to authenticated
  with check (
    kind = 'comment'
    and actor_user_id = (select auth.uid())
    and actor_agent_id is null
    and on_behalf_of is null
    and source = 'app'
    and agent_client is null
    and jsonb_typeof(data -> 'body') = 'string'
    and length(trim(data ->> 'body')) > 0
    and private.can('comment', capsule_id)
  );

drop policy "Delete or restore your own comments" on public.events;
create policy "Delete or restore your own comments" on public.events
  for insert to authenticated
  with check (
    kind in ('comment_deleted', 'comment_restored')
    and actor_user_id = (select auth.uid())
    and actor_agent_id is null
    and on_behalf_of is null
    and source = 'app'
    and agent_client is null
    and parent_event_id is null
    and jsonb_typeof(data -> 'comment_id') = 'string'
    and private.event_actor((data ->> 'comment_id')::uuid) = (select auth.uid())
    and private.event_capsule((data ->> 'comment_id')::uuid) = capsule_id
    and private.can('comment', capsule_id)
  );

-- ---------------------------------------------------------------------------
-- Dismissals: rows someone removed from their Needs your attention
-- ---------------------------------------------------------------------------
-- A removal is tied to when the row entered the list (`since`). If the same
-- thing comes back for a new reason (reassigned to you again, say), its
-- `since` changes and the row shows again.

create table public.dismissals (
  org_id uuid not null,
  user_id uuid not null,
  capsule_id uuid not null,
  -- 'item' (assigned to you), 'component' (you own it), 'no_owner' (on your
  -- capsule), 'mention' (someone @mentioned you)
  kind text not null check (kind in ('item', 'component', 'no_owner', 'mention')),
  target_id uuid not null,
  since timestamptz not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, kind, target_id),
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade,
  foreign key (org_id, capsule_id) references public.capsules (org_id, id) on delete cascade
);

alter table public.dismissals enable row level security;

revoke all on public.dismissals from anon;
revoke truncate, references, trigger on public.dismissals from authenticated;

create policy "See your own dismissals" on public.dismissals
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Dismiss rows on capsules you can see" on public.dismissals
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can('view_capsule', capsule_id));
create policy "Update your own dismissals" on public.dismissals
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.can('view_capsule', capsule_id));
create policy "Undo your own dismissals" on public.dismissals
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Needs your attention, worked out by query (CLAUDE.md data rules)
-- ---------------------------------------------------------------------------
-- Runs as the signed-in person, so it only sees what they can see.
--   item       work items assigned to you that aren't done
--   component  components you own that aren't done
--   no_owner   components with no owner on capsules you own
--   mention    comments that @mention you, until you comment on that
--              capsule after them (or the comment is deleted)
-- Rows you removed are left out until they change.

create function public.needs_attention()
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
