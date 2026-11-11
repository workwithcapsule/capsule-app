-- Capsule V1: one-click invite links.
--
-- Each sent invitation carries a private, single-use link that signs the
-- person straight in (docs/build-decisions.md, answers 20 and 21). The link's
-- code is never stored, only its SHA-256 fingerprint, so a database reader
-- can't rebuild a link. Links expire after 7 days, stop working once used,
-- once the invite is withdrawn, or when the invite is resent (new link).

alter table public.invitations
  add column token_hash text,
  add column token_expires_at timestamptz,
  add column token_used_at timestamptz;

create unique index invitations_token_hash_idx on public.invitations (token_hash)
  where token_hash is not null;

-- Called by the server right after it emails an invitation: records the send
-- and the new link's fingerprint (replacing any older link). Admins only.
create function public.record_invitation_sent(p_id uuid, p_token_hash text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_token_hash is not null and p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid link fingerprint' using errcode = '22023';
  end if;
  update public.invitations i
    set sent_at = now(),
        token_hash = p_token_hash,
        token_expires_at = case when p_token_hash is null then null else now() + interval '7 days' end,
        token_used_at = null
  where i.id = p_id
    and i.accepted_at is null
    and i.revoked_at is null
    and private.can('admin_org', i.org_id);
  return found;
end;
$$;

revoke execute on function public.record_invitation_sent(uuid, text) from public, anon;
grant execute on function public.record_invitation_sent(uuid, text) to authenticated;

-- Used by the server (with its secret key, never by people directly) when
-- someone opens an invite link. If the link is valid it is used up and the
-- invited email is returned; otherwise nothing is returned.
create function public.redeem_invitation_link(p_token_hash text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  update public.invitations i
    set token_used_at = now()
  from public.orgs o
  where o.id = i.org_id
    and i.token_hash = p_token_hash
    and i.token_used_at is null
    and i.token_expires_at > now()
    and i.accepted_at is null
    and i.revoked_at is null
    and o.onboarded_at is not null
  returning i.email into v_email;
  return v_email;
end;
$$;

-- For the "this link has expired" page: the email the link was for, so the
-- sign-in form can be filled in. Server only.
create function public.invitation_link_email(p_token_hash text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select i.email from public.invitations i where i.token_hash = p_token_hash;
$$;

revoke execute on function public.redeem_invitation_link(text) from public, anon, authenticated;
revoke execute on function public.invitation_link_email(text) from public, anon, authenticated;
grant execute on function public.redeem_invitation_link(text) to service_role;
grant execute on function public.invitation_link_email(text) to service_role;
