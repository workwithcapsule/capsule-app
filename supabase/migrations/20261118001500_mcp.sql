-- Capsule step 13: using Capsule from AI apps (MCP).
--
-- An AI app (Claude, ChatGPT, ...) connects through Supabase's OAuth 2.1
-- server. The person approves it on Capsule's consent page, and the app gets
-- an ordinary Supabase token for that person, with one extra claim:
-- `client_id`, the app's registration. So every permission rule, and
-- private.can(), applies unchanged: the app can do exactly what the person
-- can, and nothing more.
--
-- What this migration adds:
-- 1. Attribution from the token itself. Every activity entry written with an
--    app's token is marked source 'mcp' with the app's name ("Claude"), so
--    Activity and emails can say "Christina via Claude". The app can't
--    choose or fake this, and the Capsule app can't claim it either.
-- 2. The list of apps a person has connected, for Settings → Connected apps.

-- ---------------------------------------------------------------------------
-- Which app is acting
-- ---------------------------------------------------------------------------

-- The name of the AI app whose token made this request, or null when it's
-- the Capsule app itself (or the system).
create function private.request_app()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce(nullif(trim(c.client_name), ''), 'An AI app'), 80)
  from auth.oauth_clients c
  where c.id = nullif(auth.jwt() ->> 'client_id', '')::uuid;
$$;

revoke execute on function private.request_app() from public;

-- Stamps every new activity entry with where it came from. Requests from a
-- signed-in person always get the value worked out from their token. Writes
-- with no signed-in person (the server's own key, used by Example data)
-- keep what they were given.
create function private.stamp_event_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app text;
begin
  if auth.uid() is null then
    return new;
  end if;
  if nullif(auth.jwt() ->> 'client_id', '') is null then
    new.source := 'app';
    new.agent_client := null;
  else
    v_app := private.request_app();
    new.source := 'mcp';
    new.agent_client := coalesce(v_app, 'An AI app');
  end if;
  return new;
end;
$$;

create trigger stamp_event_source before insert on public.events
  for each row execute function private.stamp_event_source();

-- Comments, and deleting or restoring your own, are written by the person
-- directly. The stamp above now decides source and agent_client, so these
-- policies no longer pin them to 'app' (an app's comment is marked 'mcp').
drop policy "Team members comment" on public.events;
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

drop policy "Delete or restore your own comments" on public.events;
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

-- ---------------------------------------------------------------------------
-- Connected apps (Settings)
-- ---------------------------------------------------------------------------

-- The AI apps you've allowed, newest first, with when each last used Capsule.
-- Only ever your own. Disconnecting goes through Supabase Auth, which ends
-- the app's sessions.
create function public.my_connected_apps()
returns table (
  client_id uuid,
  name text,
  website text,
  connected_at timestamptz,
  last_used_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    left(coalesce(nullif(trim(c.client_name), ''), 'An AI app'), 80),
    c.client_uri,
    g.granted_at,
    (select max(coalesce(s.refreshed_at, s.updated_at, s.created_at))
       from auth.sessions s
       where s.user_id = g.user_id and s.oauth_client_id = c.id)
  from auth.oauth_consents g
  join auth.oauth_clients c on c.id = g.client_id and c.deleted_at is null
  where g.user_id = (select auth.uid())
    and g.revoked_at is null
  order by g.granted_at desc;
$$;

revoke execute on function public.my_connected_apps() from public, anon;
grant execute on function public.my_connected_apps() to authenticated;

-- ---------------------------------------------------------------------------
-- Checking an AI app's token (the MCP route)
-- ---------------------------------------------------------------------------

-- Called by the MCP route with the app's token. The database has already
-- checked the token's signature and expiry; this also checks that it was
-- issued to an AI app, that its session hasn't ended (Disconnect ends it)
-- and that the person still has the app connected. Returns one row, or none.
create function public.current_app_session()
returns table (user_id uuid, client_id uuid, app text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()),
    c.id,
    left(coalesce(nullif(trim(c.client_name), ''), 'An AI app'), 80)
  from auth.oauth_clients c
  where c.id = nullif(auth.jwt() ->> 'client_id', '')::uuid
    and c.deleted_at is null
    and exists (
      select 1 from auth.sessions s
      where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and s.user_id = (select auth.uid())
        and s.oauth_client_id = c.id
        and (s.not_after is null or s.not_after > now())
    )
    and exists (
      select 1 from auth.oauth_consents g
      where g.user_id = (select auth.uid()) and g.client_id = c.id and g.revoked_at is null
    );
$$;

revoke execute on function public.current_app_session() from public, anon;
grant execute on function public.current_app_session() to authenticated;
