-- Capsule V1: permissions.
--
-- One function, private.can(action, target), answers "can the signed-in
-- person do this?". Every row-level security policy, every per-column check
-- and the file storage rules call it, so the rules live in one place.
--
-- V1 roles (design-decisions.md section 12, simplified; docs/build-decisions.md):
--   org admin        sees every capsule; edits or comments only where on the team
--   capsule owner    edits the whole capsule
--   component owner  edits their own component and its work items
--   member           on the team (collaborator or assignee): adds work items,
--                    assigns them to themselves, completes their own, comments
--   follower         read-only, can't comment
-- The capsule team is: the capsule owner, component owners and collaborators.
-- People assigned a work item join that component as collaborators.

-- Functions in private are not reachable through the API. Grant only what
-- the policies need.
alter default privileges in schema private revoke execute on functions from public;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Building blocks (security definer so they can look past RLS)
-- ---------------------------------------------------------------------------

create function private.is_org_member(p_org uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members m where m.org_id = p_org and m.user_id = p_user
  );
$$;

create function private.is_org_admin(p_org uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = p_user and m.role = 'admin'
  );
$$;

create function private.shares_org(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members a
    join public.org_members b on b.org_id = a.org_id
    where a.user_id = p_a and b.user_id = p_b
  );
$$;

create function private.is_on_team(p_capsule uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and (
    exists (select 1 from public.capsules c where c.id = p_capsule and c.owner_id = p_user)
    or exists (select 1 from public.components c where c.capsule_id = p_capsule and c.owner_id = p_user)
    or exists (
      select 1 from public.component_people p where p.capsule_id = p_capsule and p.user_id = p_user
    )
  );
$$;

-- The visibility rule, in one sentence (tech-stack.md): a person can see a
-- capsule if they're on its team; otherwise, in a private space only its
-- members can, and in a public space it depends on the capsule's visibility.
-- Org admins see every capsule in public spaces. In V1 every space is public
-- and every capsule is visible to the whole org.
--
-- It takes the capsule row itself, so the check also works on a capsule
-- that is being created in the same statement.
create function private.capsule_row_visible(c public.capsules, p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_private boolean;
begin
  if c.id is null or p_user is null or not private.is_org_member(c.org_id, p_user) then
    return false;
  end if;

  if c.owner_id = p_user or private.is_on_team(c.id, p_user) then
    return true;
  end if;

  select s.is_private into v_private from public.spaces s where s.id = c.space_id;

  if coalesce(v_private, true) then
    return exists (
      select 1 from public.space_members m where m.space_id = c.space_id and m.user_id = p_user
    );
  end if;

  if private.is_org_admin(c.org_id, p_user) then
    return true;
  end if;

  return case c.visibility
    when 'org' then true
    when 'space' then exists (
      select 1 from public.space_members m where m.space_id = c.space_id and m.user_id = p_user
    )
    else false
  end;
end;
$$;

create function private.can_view_capsule(p_capsule uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.capsule_row_visible(c, p_user) from public.capsules c where c.id = p_capsule),
    false
  );
$$;

-- Whether a space shows up for someone: every public space in their org,
-- and private spaces they belong to. Takes the row, like capsule_row_visible.
create function private.space_row_visible(s public.spaces, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.is_org_member(s.org_id, p_user)
    and (
      not s.is_private
      or s.created_by = p_user
      or exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = p_user)
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- The permission function
-- ---------------------------------------------------------------------------
-- Actions and what `p_target` is:
--   org:        member_of_org, admin_org
--   space:      view_space, join_space, manage_space
--   capsule:    view_capsule, follow, comment, contribute, edit_capsule
--               (contribute = add work items and attachments)
--   component:  edit_component (owner, due date, status, collaborators,
--               assigning its work items to anyone)
--   work item:  complete_work_item, edit_work_item, delete_work_item
--   attachment: remove_attachment
-- Always answers for the signed-in person (auth.uid()), and always answers
-- true or false: anything unknown or missing counts as "no".

create function private.can(p_action text, p_target uuid)
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
    when 'complete_work_item', 'edit_work_item', 'delete_work_item' then
      select cap.owner_id, comp.owner_id, w.created_by, w.assignee_id
        into v_owner, v_comp_owner, v_created_by, v_assignee
      from public.work_items w
      join public.components comp on comp.id = w.component_id
      join public.capsules cap on cap.id = w.capsule_id
      where w.id = p_target;
      v_ok := found and (
        v_owner is not distinct from v_user
        or v_comp_owner is not distinct from v_user
        or case p_action
          when 'complete_work_item' then v_assignee is not distinct from v_user
          when 'edit_work_item' then
            v_assignee is not distinct from v_user or v_created_by is not distinct from v_user
          else v_created_by is not distinct from v_user
        end
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

grant execute on function private.can(text, uuid) to authenticated, service_role;
grant execute on function private.capsule_row_visible(public.capsules, uuid) to authenticated, service_role;
grant execute on function private.space_row_visible(public.spaces, uuid) to authenticated, service_role;
grant execute on function private.is_on_team(uuid, uuid) to authenticated, service_role;
grant execute on function private.shares_org(uuid, uuid) to authenticated, service_role;

-- The app can ask the same question to decide which buttons to show.
create function public.can(action text, target uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.can(action, target);
$$;

revoke execute on function public.can(text, uuid) from public, anon;
grant execute on function public.can(text, uuid) to authenticated;

-- Is this request from a signed-in person (rather than the server's own
-- service role or a migration)? Per-column checks only apply to people.
create function private.is_end_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'authenticated';
$$;

grant execute on function private.is_end_user() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Capsule keys (EN-1, EN-2…)
-- ---------------------------------------------------------------------------

-- Gives a new capsule the next number in its space.
create function private.assign_capsule_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.spaces
    set next_capsule_number = next_capsule_number + 1
    where id = new.space_id
    returning next_capsule_number - 1 into new.number;
  return new;
end;
$$;

create trigger assign_capsule_number before insert on public.capsules
  for each row execute function private.assign_capsule_number();

-- The capsule's key. Usable from the API as a computed field:
-- select=*,key:capsule_key
create function public.capsule_key(c public.capsules)
returns text
language sql
stable
set search_path = ''
as $$
  select s.key_prefix || '-' || c.number from public.spaces s where s.id = c.space_id;
$$;

-- ---------------------------------------------------------------------------
-- New sign-ins get a users row
-- ---------------------------------------------------------------------------

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, nullif(trim(new.raw_user_meta_data ->> 'name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create function private.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_auth_user_email_change();

-- ---------------------------------------------------------------------------
-- Spaces: the creator joins as a space admin
-- ---------------------------------------------------------------------------

create function private.add_space_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.space_members (org_id, space_id, user_id, role)
    values (new.org_id, new.id, new.created_by, 'admin')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger add_space_creator after insert on public.spaces
  for each row execute function private.add_space_creator();

-- ---------------------------------------------------------------------------
-- Org members: only admins change roles
-- ---------------------------------------------------------------------------

create function private.check_org_member_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_end_user()
     and new.role is distinct from old.role
     and not private.can('admin_org', old.org_id) then
    raise exception 'Only org admins can change roles' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger check_org_member_update before update on public.org_members
  for each row execute function private.check_org_member_update();

-- ---------------------------------------------------------------------------
-- Work items: per-column rules, and assignees joining the component
-- ---------------------------------------------------------------------------

create function private.check_work_item_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if new.done is distinct from old.done then
    new.done_at := case when new.done then now() else null end;
  end if;

  if not private.is_end_user() then
    return new;
  end if;

  if new.done is distinct from old.done and not private.can('complete_work_item', old.id) then
    raise exception 'Only the assignee, the component owner or the capsule owner can check this off'
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

create trigger check_work_item_update before update on public.work_items
  for each row execute function private.check_work_item_update();

create function private.set_work_item_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.done_at := case when new.done then coalesce(new.done_at, now()) else null end;
  return new;
end;
$$;

create trigger set_work_item_done_at before insert on public.work_items
  for each row execute function private.set_work_item_done_at();

-- An assignee joins that component (and so the capsule team), and leaves
-- again once they have no work items left there, unless they were added
-- as a collaborator on purpose or own the component.
create function private.sync_assignee_membership()
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
      and not exists (
        select 1 from public.work_items w
        where w.component_id = old.component_id and w.assignee_id = old.assignee_id
      );
  end if;

  return null;
end;
$$;

create trigger sync_assignee_membership
  after insert or update of assignee_id or delete on public.work_items
  for each row execute function private.sync_assignee_membership();

-- ---------------------------------------------------------------------------
-- Events are append-only
-- ---------------------------------------------------------------------------

create function private.prevent_event_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The one allowed change: when a person's account is deleted, their name
  -- is cleared from past entries (the entries themselves stay).
  if (new.actor_user_id is null or new.actor_user_id = old.actor_user_id)
     and (new.on_behalf_of is null or new.on_behalf_of = old.on_behalf_of)
     and (new.actor_user_id, new.on_behalf_of) is distinct from (old.actor_user_id, old.on_behalf_of)
     and (to_jsonb(new) - 'actor_user_id' - 'on_behalf_of') = (to_jsonb(old) - 'actor_user_id' - 'on_behalf_of')
     and not private.is_end_user() then
    return new;
  end if;
  raise exception 'The activity log is append-only' using errcode = '42501';
end;
$$;

create trigger prevent_event_update before update on public.events
  for each row execute function private.prevent_event_update();

-- A reply must belong to the same capsule as the comment it answers.
create function private.check_event_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_event_id is not null and not exists (
    select 1 from public.events e where e.id = new.parent_event_id and e.capsule_id = new.capsule_id
  ) then
    raise exception 'A reply must be in the same capsule as its comment' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_event_parent before insert on public.events
  for each row execute function private.check_event_parent();

create function private.event_actor(p_event uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.actor_user_id from public.events e where e.id = p_event and e.kind = 'comment';
$$;

create function private.event_capsule(p_event uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.capsule_id from public.events e where e.id = p_event;
$$;

grant execute on function private.event_actor(uuid) to authenticated, service_role;
grant execute on function private.event_capsule(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Attachments: record who removed an item
-- ---------------------------------------------------------------------------

create function private.check_attachment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.removed_at is distinct from old.removed_at then
    new.removed_by := case when new.removed_at is null then null else auth.uid() end;
  end if;
  return new;
end;
$$;

create trigger check_attachment_update before update on public.attachments
  for each row execute function private.check_attachment_update();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.orgs enable row level security;
alter table public.users enable row level security;
alter table public.org_members enable row level security;
alter table public.component_types enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.capsules enable row level security;
alter table public.components enable row level security;
alter table public.component_people enable row level security;
alter table public.work_items enable row level security;
alter table public.followers enable row level security;
alter table public.events enable row level security;
alter table public.mentions enable row level security;
alter table public.attachments enable row level security;

-- Orgs. Creating an org happens through a function in step 3 (onboarding).
create policy "Members see their org" on public.orgs
  for select to authenticated using (private.can('member_of_org', id));
create policy "Admins edit their org" on public.orgs
  for update to authenticated using (private.can('admin_org', id));

-- Users
create policy "See yourself and people in your orgs" on public.users
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_org((select auth.uid()), id));
create policy "Edit your own profile" on public.users
  for update to authenticated using (id = (select auth.uid()));

-- Org members
create policy "Members see their org's members" on public.org_members
  for select to authenticated using (private.can('member_of_org', org_id));
create policy "Admins add members" on public.org_members
  for insert to authenticated with check (private.can('admin_org', org_id));
create policy "Admins and the person themselves edit membership" on public.org_members
  for update to authenticated
  using (private.can('admin_org', org_id) or user_id = (select auth.uid()));
create policy "Admins remove members" on public.org_members
  for delete to authenticated using (private.can('admin_org', org_id));

-- Component types (Org components)
create policy "Members see org components" on public.component_types
  for select to authenticated using (private.can('member_of_org', org_id));
create policy "Admins add org components" on public.component_types
  for insert to authenticated with check (private.can('admin_org', org_id));
create policy "Admins edit org components" on public.component_types
  for update to authenticated using (private.can('admin_org', org_id));
create policy "Admins remove org components" on public.component_types
  for delete to authenticated using (private.can('admin_org', org_id));

-- Spaces
create policy "See spaces you can browse" on public.spaces
  for select to authenticated using (private.space_row_visible(spaces, (select auth.uid())));
create policy "Members create public spaces" on public.spaces
  for insert to authenticated
  with check (
    private.can('member_of_org', org_id)
    and created_by = (select auth.uid())
    and not is_private
  );
create policy "Space managers edit the space" on public.spaces
  for update to authenticated using (private.can('manage_space', id));

-- Space members
create policy "See members of spaces you can browse" on public.space_members
  for select to authenticated using (private.can('view_space', space_id));
create policy "Join public spaces, or add people to a space you manage" on public.space_members
  for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and role = 'member' and private.can('join_space', space_id))
    or private.can('manage_space', space_id)
  );
create policy "Space managers change roles" on public.space_members
  for update to authenticated using (private.can('manage_space', space_id));
create policy "Leave a space, or remove people from a space you manage" on public.space_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or private.can('manage_space', space_id));

-- Capsules
create policy "See capsules you have access to" on public.capsules
  for select to authenticated using (private.capsule_row_visible(capsules, (select auth.uid())));
create policy "Members create capsules in spaces they can see" on public.capsules
  for insert to authenticated
  with check (
    private.can('member_of_org', org_id)
    and private.can('view_space', space_id)
    and created_by = (select auth.uid())
  );
create policy "Capsule owners edit the capsule" on public.capsules
  for update to authenticated using (private.can('edit_capsule', id));

-- Components
create policy "See components of capsules you can see" on public.components
  for select to authenticated using (private.can('view_capsule', capsule_id));
create policy "Capsule owners add components" on public.components
  for insert to authenticated with check (private.can('edit_capsule', capsule_id));
create policy "Capsule and component owners edit the component" on public.components
  for update to authenticated using (private.can('edit_component', id));
create policy "Capsule owners remove components" on public.components
  for delete to authenticated using (private.can('edit_capsule', capsule_id));

-- Collaborators
create policy "See collaborators on capsules you can see" on public.component_people
  for select to authenticated using (private.can('view_capsule', capsule_id));
create policy "Capsule and component owners add collaborators" on public.component_people
  for insert to authenticated
  with check (source = 'added' and private.can('edit_component', component_id));
create policy "Capsule and component owners remove collaborators" on public.component_people
  for delete to authenticated using (private.can('edit_component', component_id));

-- Work items
create policy "See work items on capsules you can see" on public.work_items
  for select to authenticated using (private.can('view_capsule', capsule_id));
create policy "Team members add work items" on public.work_items
  for insert to authenticated
  with check (
    private.can('contribute', capsule_id)
    and created_by = (select auth.uid())
    and source = 'none'
    and (
      assignee_id is null
      or assignee_id = (select auth.uid())
      or private.can('edit_component', component_id)
    )
    and (
      not done
      or assignee_id = (select auth.uid())
      or private.can('edit_component', component_id)
    )
  );
-- Which columns each person may change is checked by check_work_item_update.
create policy "Team members update work items" on public.work_items
  for update to authenticated using (private.can('contribute', capsule_id));
create policy "Owners and creators delete work items" on public.work_items
  for delete to authenticated using (private.can('delete_work_item', id));

-- Followers
create policy "See followers of capsules you can see" on public.followers
  for select to authenticated using (private.can('view_capsule', capsule_id));
create policy "Follow capsules you can see" on public.followers
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can('follow', capsule_id));
create policy "Unfollow" on public.followers
  for delete to authenticated using (user_id = (select auth.uid()));

-- Events (activity and comments). Other kinds of events are written by the
-- database itself in step 6.
create policy "See activity on capsules you can see" on public.events
  for select to authenticated using (private.can('view_capsule', capsule_id));
create policy "Team members comment" on public.events
  for insert to authenticated
  with check (
    kind = 'comment'
    and actor_user_id = (select auth.uid())
    and actor_agent_id is null
    and on_behalf_of is null
    and jsonb_typeof(data -> 'body') = 'string'
    and length(trim(data ->> 'body')) > 0
    and private.can('comment', capsule_id)
  );

-- Mentions
create policy "See your mentions, and the ones you made" on public.mentions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.event_actor(event_id) = (select auth.uid())
  );
create policy "Mention team members in your own comments" on public.mentions
  for insert to authenticated
  with check (
    private.event_actor(event_id) = (select auth.uid())
    and private.is_on_team(private.event_capsule(event_id), user_id)
  );
create policy "Mark your mentions read" on public.mentions
  for update to authenticated using (user_id = (select auth.uid()));

-- Attachments
create policy "See attachments on capsules you can see" on public.attachments
  for select to authenticated using (private.can('view_capsule', capsule_id));
create policy "Team members add attachments" on public.attachments
  for insert to authenticated
  with check (
    private.can('contribute', capsule_id)
    and added_by = (select auth.uid())
    and removed_at is null
  );
create policy "The person who added it, or the capsule owner, removes it" on public.attachments
  for update to authenticated using (private.can('remove_attachment', id));

-- ---------------------------------------------------------------------------
-- Table and column privileges
-- ---------------------------------------------------------------------------
-- RLS decides which rows; these grants decide which columns can ever be
-- changed through the API. Signed-out visitors get nothing.

-- Listed by name so tables that belong to other apps in this project (such
-- as the website's waitlist) are left alone.
revoke all on
  public.orgs, public.users, public.org_members, public.component_types, public.spaces,
  public.space_members, public.capsules, public.components, public.component_people,
  public.work_items, public.followers, public.events, public.mentions, public.attachments
from anon;
revoke truncate, references, trigger on
  public.orgs, public.users, public.org_members, public.component_types, public.spaces,
  public.space_members, public.capsules, public.components, public.component_people,
  public.work_items, public.followers, public.events, public.mentions, public.attachments
from authenticated;

revoke insert, update, delete on public.orgs from authenticated;
grant update (name, email_domain) on public.orgs to authenticated;

revoke insert, update, delete on public.users from authenticated;
grant update (name, avatar_url) on public.users to authenticated;

revoke update on public.org_members from authenticated;
grant update (role, usual_component_type_ids) on public.org_members to authenticated;

revoke update on public.component_types from authenticated;
grant update (name, description, color, icon, position, archived_at) on public.component_types to authenticated;

revoke update, delete on public.spaces from authenticated;
grant update (name, description) on public.spaces to authenticated;

revoke update on public.space_members from authenticated;
grant update (role) on public.space_members to authenticated;

revoke update, delete on public.capsules from authenticated;
grant update (name, outcome, status, launch_date, date_type, owner_id, archived_at)
  on public.capsules to authenticated;

revoke update on public.components from authenticated;
grant update (owner_id, due_date, status, position) on public.components to authenticated;

revoke update on public.component_people from authenticated;

revoke update on public.work_items from authenticated;
grant update (title, note, assignee_id, done, position) on public.work_items to authenticated;

revoke update on public.followers from authenticated;

revoke update, delete on public.events from authenticated;

revoke update, delete on public.mentions from authenticated;
grant update (read_at) on public.mentions to authenticated;

revoke update, delete on public.attachments from authenticated;
grant update (name, component_id, removed_at) on public.attachments to authenticated;
