-- Capsule V1: AI shaping requests, with a per-org daily cap (step 9).
--
-- Every time someone asks Claude to shape a capsule, one row records who
-- asked, which model answered, the tokens used, how long it took, and what
-- happened next (created as suggested, edited then created, discarded, or
-- failed). Each org can shape up to 30 capsules a day.

create table public.shaping_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  -- running, ok (Claude answered), failed (error or unusable answer)
  status text not null default 'running' check (status in ('running', 'ok', 'failed')),
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error text check (error is null or length(error) <= 500),
  -- What the person did with the suggestion.
  outcome text check (outcome is null or outcome in ('created', 'edited', 'discarded')),
  capsule_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade,
  foreign key (org_id, capsule_id) references public.capsules (org_id, id) on delete set null (capsule_id)
);

create index shaping_requests_org_day_idx on public.shaping_requests (org_id, created_at);

create trigger set_updated_at before update on public.shaping_requests
  for each row execute function private.set_updated_at();

alter table public.shaping_requests enable row level security;

revoke all on public.shaping_requests from anon;
revoke insert, delete, truncate, references, trigger on public.shaping_requests from authenticated;
revoke update on public.shaping_requests from authenticated;
grant update (status, model, input_tokens, output_tokens, latency_ms, error, outcome, capsule_id)
  on public.shaping_requests to authenticated;

create policy "See your own shaping requests" on public.shaping_requests
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Record what happened to your own shaping requests" on public.shaping_requests
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (capsule_id is null or private.can('view_capsule', capsule_id))
  );

-- The daily cap per org.
create function private.shaping_daily_cap()
returns integer
language sql
immutable
set search_path = ''
as $$ select 30 $$;

-- Starts a shaping request: checks the person is in an org and the org is
-- under today's cap (UTC day), then records it. Returns the new request's id.
create function public.start_shaping()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_used integer;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select m.org_id into v_org from public.org_members m where m.user_id = v_user limit 1;
  if v_org is null then
    raise exception 'Join an organization first' using errcode = '42501';
  end if;
  -- One at a time per org, so two people can't both squeeze past the cap.
  perform pg_advisory_xact_lock(hashtext('shaping:' || v_org::text));
  select count(*) into v_used from public.shaping_requests r
  where r.org_id = v_org and r.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if v_used >= private.shaping_daily_cap() then
    raise exception 'Daily shaping limit reached' using errcode = 'P0001', hint = 'shaping_limit';
  end if;
  insert into public.shaping_requests (org_id, user_id) values (v_org, v_user) returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.start_shaping() from public, anon;
grant execute on function public.start_shaping() to authenticated;
