-- Capsule V1: attachments in Activity, and two safety checks (step 10).
--
-- The attachments table, its access rules and the private file bucket came
-- in step 2. This adds:
-- - Activity entries when someone attaches, removes or puts back an item
-- - links must be web addresses (http or https), so nothing like a
--   "javascript:" link can be saved
-- - a file's stored path must sit in its own capsule's folder

alter table public.attachments
  add constraint attachments_url_is_web
    check (url is null or url ~* '^https?://[^[:space:]]+$'),
  add constraint attachments_file_in_own_folder
    check (storage_path is null or split_part(storage_path, '/', 1) = capsule_id::text);

create function private.log_attachment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data jsonb := jsonb_build_object(
    'attachment_id', new.id,
    'name', new.name,
    'kind', new.kind,
    'link_type', new.link_type
  );
begin
  if tg_op = 'INSERT' then
    if new.removed_at is null and not private.capsule_is_new(new.capsule_id) then
      perform private.log_event(new.org_id, new.capsule_id, 'attachment_added', v_data);
    end if;
  elsif old.removed_at is null and new.removed_at is not null then
    perform private.log_event(new.org_id, new.capsule_id, 'attachment_removed', v_data);
  elsif old.removed_at is not null and new.removed_at is null then
    perform private.log_event(new.org_id, new.capsule_id, 'attachment_restored', v_data);
  end if;
  return null;
end;
$$;

create trigger log_attachment_change after insert or update of removed_at on public.attachments
  for each row execute function private.log_attachment_change();
