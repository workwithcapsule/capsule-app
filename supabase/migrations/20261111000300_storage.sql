-- Capsule V1: file storage for attachments.
--
-- Files live in a private bucket, at <capsule_id>/<random id>/<file name>.
-- Who can see a file follows who can see its capsule, and only team members
-- can upload. Files are never changed in place; removing an attachment is a
-- soft delete in public.attachments (so Undo works), and the server cleans up
-- stored files later.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400) -- 25 MB
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- Reads the capsule id from the first folder of a storage path. Returns null
-- (and so denies access) for anything that isn't a valid id.
create function private.capsule_id_from_path(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first text := split_part(p_name, '/', 1);
begin
  if v_first ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_first::uuid;
  end if;
  return null;
end;
$$;

grant execute on function private.capsule_id_from_path(text) to authenticated, service_role;

create policy "capsule: see attachment files on capsules you can see" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and private.can('view_capsule', private.capsule_id_from_path(name))
  );

create policy "capsule: team members upload attachment files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and private.can('contribute', private.capsule_id_from_path(name))
  );
