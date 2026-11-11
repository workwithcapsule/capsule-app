-- Local test database only: removes everything the migrations created, so
-- they can be applied again from scratch. Never run against a real project.
do $$
declare r record;
begin
  if current_setting('capsule.allow_reset', true) is distinct from 'on' then
    raise exception 'Refusing to reset: set capsule.allow_reset = on (local only)';
  end if;
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'capsule:%' loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
  delete from storage.objects where bucket_id = 'attachments';
  delete from storage.buckets where id = 'attachments';
  drop trigger if exists on_auth_user_created on auth.users;
  drop trigger if exists on_auth_user_email_changed on auth.users;
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
  for r in select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('drop function if exists %s cascade', r.fn);
  end loop;
  for r in select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e' loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
  drop schema if exists private cascade;
  delete from auth.users;
end $$;
