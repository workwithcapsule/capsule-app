-- Capsule V1: sign-up approvals, org setup (onboarding) and invitations.
--
-- During the beta only approved emails can create an org
-- (docs/build-decisions.md, answer 17). Everyone else joins by invitation.

-- ---------------------------------------------------------------------------
-- Org setup progress
-- ---------------------------------------------------------------------------

alter table public.orgs
  add column created_by uuid references public.users (id) on delete set null,
  -- Which onboarding step the admin reached (1–5), so a refresh resumes there.
  add column onboarding_step smallint not null default 2 check (onboarding_step between 1 and 5),
  -- Set when onboarding is finished; until then the app shows onboarding.
  add column onboarded_at timestamptz;

grant update (onboarding_step, onboarded_at) on public.orgs to authenticated;

-- ---------------------------------------------------------------------------
-- Approved sign-ups (beta)
-- ---------------------------------------------------------------------------
-- Christina adds emails here (Supabase dashboard → Table Editor). It isn't
-- tied to an org because the org doesn't exist yet. Nobody can read it
-- through the app; the setup function checks it on their behalf.

create table public.signup_approvals (
  email text primary key check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  note text,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.signup_approvals enable row level security;
revoke all on public.signup_approvals from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  role public.org_role not null default 'member',
  invited_by uuid,
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (org_id, invited_by) references public.org_members (org_id, user_id)
    on delete set null (invited_by)
);

-- One open invitation per person per org.
create unique index invitations_open_idx on public.invitations (org_id, email)
  where accepted_at is null and revoked_at is null;
create index invitations_email_idx on public.invitations (email) where accepted_at is null and revoked_at is null;
create index invitations_invited_by_idx on public.invitations (org_id, invited_by);

alter table public.invitations enable row level security;

-- The signed-in person's email, lowercased.
create function private.my_email()
returns text
language sql
stable
set search_path = ''
as $$
  select lower(nullif(auth.jwt() ->> 'email', ''));
$$;

grant execute on function private.my_email() to authenticated, service_role;

create policy "Admins see their org's invitations, and people see their own" on public.invitations
  for select to authenticated
  using (private.can('admin_org', org_id) or email = private.my_email());
create policy "Admins invite people" on public.invitations
  for insert to authenticated
  with check (
    private.can('admin_org', org_id)
    and invited_by = (select auth.uid())
    and accepted_at is null
    and revoked_at is null
    and sent_at is null
  );
create policy "Admins withdraw invitations" on public.invitations
  for update to authenticated using (private.can('admin_org', org_id));
create policy "Admins remove unsent invitations" on public.invitations
  for delete to authenticated using (private.can('admin_org', org_id) and sent_at is null);

revoke all on public.invitations from anon;
revoke update, truncate, references, trigger on public.invitations from authenticated;
grant update (revoked_at) on public.invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Setting up an org
-- ---------------------------------------------------------------------------

-- Where the signed-in person stands, so the app knows which page to show:
--   'member'        in an org that has finished setting up: the app
--   'setting_up'    in an org that is still in onboarding
--   'approved'      may create one
--   'invited'       has an open invitation (joins in step 3b)
--   'not_approved'  neither: the app shows "Capsule is invite-only for now"
create function public.signup_status()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := private.my_email();
begin
  if v_user is null then
    return 'not_approved';
  end if;
  if exists (
    select 1 from public.org_members m join public.orgs o on o.id = m.org_id
    where m.user_id = v_user and o.onboarded_at is not null
  ) then
    return 'member';
  end if;
  if exists (select 1 from public.org_members m where m.user_id = v_user) then
    return 'setting_up';
  end if;
  if exists (
    select 1 from public.invitations i
    where i.email = v_email and i.accepted_at is null and i.revoked_at is null
  ) then
    return 'invited';
  end if;
  if exists (select 1 from public.signup_approvals a where a.email = v_email) then
    return 'approved';
  end if;
  return 'not_approved';
end;
$$;

revoke execute on function public.signup_status() from public, anon;
grant execute on function public.signup_status() to authenticated;

-- Creates an org for the signed-in person: they become its admin, the four
-- default components are added, and their name is saved. Onboarding step 1.
create function public.create_org(p_org_name text, p_your_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := private.my_email();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_org_name, ''))) = 0 or length(trim(coalesce(p_your_name, ''))) = 0 then
    raise exception 'Enter your name and your organization''s name' using errcode = '22023';
  end if;
  if exists (select 1 from public.org_members m where m.user_id = v_user) then
    raise exception 'You''re already in an organization' using errcode = '42501';
  end if;
  if not exists (select 1 from public.signup_approvals a where a.email = v_email) then
    raise exception 'Capsule is invite-only for now' using errcode = '42501';
  end if;

  update public.users set name = trim(p_your_name) where id = v_user;

  insert into public.orgs (name, email_domain, created_by)
  values (trim(p_org_name), nullif(split_part(v_email, '@', 2), ''), v_user)
  returning id into v_org;

  insert into public.org_members (org_id, user_id, role) values (v_org, v_user, 'admin');

  insert into public.component_types (org_id, name, description, color, icon, position) values
    (v_org, 'Tech', 'Engineering, QA and release work.', 'blue', 'code', 0),
    (v_org, 'Operations', 'Readiness, process and support handoff.', 'teal', 'cycle', 1),
    (v_org, 'Sales', 'Enablement, training and customer comms.', 'green', 'chart', 2),
    (v_org, 'Marketing', 'Messaging, launch content and campaigns.', 'orange', 'megaphone', 3);

  update public.signup_approvals set used_at = coalesce(used_at, now()) where email = v_email;

  return v_org;
end;
$$;

revoke execute on function public.create_org(text, text) from public, anon;
grant execute on function public.create_org(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lookup indexes suggested by Supabase's performance advisor
-- ---------------------------------------------------------------------------

create index if not exists attachments_added_by_idx on public.attachments (org_id, added_by);
create index if not exists attachments_removed_by_idx on public.attachments (org_id, removed_by);
create index if not exists attachments_org_capsule_idx on public.attachments (org_id, capsule_id);
create index if not exists attachments_component_idx on public.attachments (org_id, capsule_id, component_id);
create index if not exists capsules_created_by_idx on public.capsules (org_id, created_by);
create index if not exists capsules_org_owner_idx on public.capsules (org_id, owner_id);
create index if not exists capsules_org_space_idx on public.capsules (org_id, space_id);
create index if not exists component_people_component_idx on public.component_people (org_id, capsule_id, component_id);
create index if not exists component_people_org_user_idx on public.component_people (org_id, user_id);
create index if not exists components_type_idx on public.components (org_id, component_type_id);
create index if not exists components_org_owner_idx on public.components (org_id, owner_id);
create index if not exists events_actor_idx on public.events (actor_user_id);
create index if not exists events_on_behalf_of_idx on public.events (on_behalf_of);
create index if not exists events_org_capsule_idx on public.events (org_id, capsule_id);
create index if not exists events_parent_idx on public.events (org_id, parent_event_id);
create index if not exists followers_org_capsule_idx on public.followers (org_id, capsule_id);
create index if not exists followers_org_user_idx on public.followers (org_id, user_id);
create index if not exists mentions_event_idx on public.mentions (org_id, event_id);
create index if not exists mentions_org_user_idx on public.mentions (org_id, user_id);
create index if not exists space_members_space_idx on public.space_members (org_id, space_id);
create index if not exists space_members_org_user_idx on public.space_members (org_id, user_id);
create index if not exists spaces_created_by_idx on public.spaces (org_id, created_by);
create index if not exists work_items_org_assignee_idx on public.work_items (org_id, assignee_id);
create index if not exists work_items_component_fk_idx on public.work_items (org_id, capsule_id, component_id);
create index if not exists work_items_created_by_idx on public.work_items (org_id, created_by);
create index if not exists orgs_created_by_idx on public.orgs (created_by);
