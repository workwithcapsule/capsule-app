-- Capsule V1: accepting invitations (step 3b).
--
-- An invited person signs in with the invited email, confirms their profile
-- and usual areas (which accepts the invitation and makes them a member),
-- sees their spaces, then lands on Home.

-- ---------------------------------------------------------------------------
-- Each member's own setup
-- ---------------------------------------------------------------------------

-- Set when a member finishes their own first-run flow. The org's creator
-- finishes it with org onboarding; invited people with the join flow.
alter table public.org_members add column onboarded_at timestamptz;

-- Everyone already in an org has been through setup.
update public.org_members set onboarded_at = coalesce(onboarded_at, created_at);

grant update (onboarded_at) on public.org_members to authenticated;

-- Only the member themselves can mark their own setup finished (admins
-- editing someone's membership can't flip it for them).
create function private.check_member_onboarded()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_end_user()
     and new.onboarded_at is distinct from old.onboarded_at
     and old.user_id is distinct from auth.uid() then
    raise exception 'Only the person themselves can finish their setup' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger check_member_onboarded before update on public.org_members
  for each row execute function private.check_member_onboarded();

-- ---------------------------------------------------------------------------
-- Where each person stands, now including people partway through joining
-- ---------------------------------------------------------------------------
--   'member'        in an org that has finished setting up, setup done
--   'joining'       accepted an invitation, finishing their first-run flow
--   'setting_up'    created an org that is still in onboarding
--   'invited'       has an open invitation they haven't accepted yet
--   'approved'      may create an org
--   'not_approved'  none of the above

create or replace function public.signup_status()
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
    where m.user_id = v_user and o.onboarded_at is not null and m.onboarded_at is not null
  ) then
    return 'member';
  end if;
  if exists (
    select 1 from public.org_members m join public.orgs o on o.id = m.org_id
    where m.user_id = v_user and o.onboarded_at is not null
  ) then
    return 'joining';
  end if;
  if exists (select 1 from public.org_members m where m.user_id = v_user) then
    return 'setting_up';
  end if;
  if exists (
    select 1 from public.invitations i
    join public.orgs o on o.id = i.org_id
    where i.email = v_email and i.accepted_at is null and i.revoked_at is null
      and o.onboarded_at is not null
  ) then
    return 'invited';
  end if;
  if exists (select 1 from public.signup_approvals a where a.email = v_email) then
    return 'approved';
  end if;
  return 'not_approved';
end;
$$;

-- The org's creator has finished their own setup once the org is set up.
create or replace function public.create_org(p_org_name text, p_your_name text)
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

  insert into public.org_members (org_id, user_id, role, onboarded_at)
  values (v_org, v_user, 'admin', now());

  insert into public.component_types (org_id, name, description, color, icon, position) values
    (v_org, 'Tech', 'Engineering, QA and release work.', 'blue', 'code', 0),
    (v_org, 'Operations', 'Readiness, process and support handoff.', 'teal', 'cycle', 1),
    (v_org, 'Sales', 'Enablement, training and customer comms.', 'green', 'chart', 2),
    (v_org, 'Marketing', 'Messaging, launch content and campaigns.', 'orange', 'megaphone', 3);

  update public.signup_approvals set used_at = coalesce(used_at, now()) where email = v_email;

  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading and accepting your invitation
-- ---------------------------------------------------------------------------

-- The newest open invitation for the signed-in person's email, with what the
-- join screens need: the org, who invited them, and the org's components
-- (which they can't read yet, because they aren't a member).
create function public.my_invitation()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id,
    'org_id', o.id,
    'org_name', o.name,
    'invited_by', coalesce(nullif(u.name, ''), u.email),
    'components', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'icon', t.icon)
                       order by t.position)
      from public.component_types t
      where t.org_id = o.id and t.archived_at is null
    ), '[]'::jsonb)
  )
  from public.invitations i
  join public.orgs o on o.id = i.org_id
  left join public.users u on u.id = i.invited_by
  where i.email = private.my_email()
    and i.accepted_at is null
    and i.revoked_at is null
    and o.onboarded_at is not null
    and auth.uid() is not null
  order by i.created_at desc
  limit 1;
$$;

revoke execute on function public.my_invitation() from public, anon;
grant execute on function public.my_invitation() to authenticated;

-- Accepts the signed-in person's newest open invitation: they join the org
-- with the invited role, and their name and usual areas are saved.
create function public.accept_invitation(p_your_name text, p_component_type_ids uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_inv public.invitations;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_your_name, ''))) = 0 then
    raise exception 'Enter your name' using errcode = '22023';
  end if;
  if exists (select 1 from public.org_members m where m.user_id = v_user) then
    raise exception 'You''re already in an organization' using errcode = '42501';
  end if;

  select i.* into v_inv
  from public.invitations i
  join public.orgs o on o.id = i.org_id
  where i.email = private.my_email()
    and i.accepted_at is null
    and i.revoked_at is null
    and o.onboarded_at is not null
  order by i.created_at desc
  limit 1
  for update of i;

  if not found then
    raise exception 'There''s no open invitation for this email' using errcode = '42501';
  end if;

  update public.users set name = trim(p_your_name) where id = v_user;

  insert into public.org_members (org_id, user_id, role, usual_component_type_ids)
  values (
    v_inv.org_id,
    v_user,
    v_inv.role,
    coalesce(array(
      select t.id from public.component_types t
      where t.org_id = v_inv.org_id and t.id = any (coalesce(p_component_type_ids, '{}'))
    ), '{}')
  );

  update public.invitations set accepted_at = now() where id = v_inv.id;

  return v_inv.org_id;
end;
$$;

revoke execute on function public.accept_invitation(text, uuid[]) from public, anon;
grant execute on function public.accept_invitation(text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Recording that invitation emails went out
-- ---------------------------------------------------------------------------

-- The server calls this after an invite email is sent. Admins only, and
-- only for open invitations in their own org.
create function public.mark_invitations_sent(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.invitations i
    set sent_at = now()
  where i.id = any (p_ids)
    and i.accepted_at is null
    and i.revoked_at is null
    and private.can('admin_org', i.org_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_invitations_sent(uuid[]) from public, anon;
grant execute on function public.mark_invitations_sent(uuid[]) to authenticated;
