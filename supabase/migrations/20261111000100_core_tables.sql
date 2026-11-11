-- Capsule V1: core tables.
--
-- Hierarchy: org → space → capsule → component → work item.
-- Every row carries its org_id (users are the one exception: a person is a
-- global identity, and joins orgs through org_members).
--
-- Composite foreign keys such as (org_id, capsule_id) make it impossible
-- for a row to point at something in another org, and (org_id, user_id)
-- references to org_members make sure every person mentioned on a row is
-- a member of that org.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.org_role as enum ('admin', 'member');
create type public.space_role as enum ('admin', 'member');

-- Shared by capsules and components (design-decisions.md section 11).
create type public.work_status as enum ('not_started', 'in_progress', 'in_review', 'done', 'blocked');

-- Who can see a capsule beyond its team. Always 'org' in V1.
create type public.capsule_visibility as enum ('org', 'space', 'team');

-- Whether the capsule's date is when it launches or when it is due.
create type public.date_type as enum ('launch', 'due');

-- The fixed set of 10 component colors.
create type public.component_color as enum (
  'blue', 'teal', 'green', 'olive', 'amber', 'orange', 'red', 'pink', 'purple', 'gray'
);

-- How a collaborator joined a component. People who joined only because a
-- work item was assigned to them leave again when they have none left.
create type public.collaborator_source as enum ('added', 'assignment');

-- Where a work item comes from. Always 'none' in V1 (Jira and monday are Later).
create type public.work_item_source as enum ('none', 'jira', 'monday');

create type public.attachment_kind as enum ('file', 'link');

create type public.link_type as enum (
  'figma', 'google_docs', 'google_sheets', 'google_slides', 'notion', 'confluence', 'loom', 'link'
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Orgs and people
-- ---------------------------------------------------------------------------

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  email_domain text check (email_domain is null or email_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per signed-in person, created automatically from auth.users.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text check (name is null or length(trim(name)) between 1 and 120),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.org_role not null default 'member',
  -- The component types this person usually works in (invited-person onboarding).
  usual_component_type_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_idx on public.org_members (user_id);

-- ---------------------------------------------------------------------------
-- Org components (component types)
-- ---------------------------------------------------------------------------

create table public.component_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  description text,
  color public.component_color not null,
  icon text,
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);

create unique index component_types_name_idx on public.component_types (org_id, lower(name));

-- ---------------------------------------------------------------------------
-- Spaces
-- ---------------------------------------------------------------------------

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  description text,
  -- 2 to 4 capital letters, unique in the org (EN, PP, RC…).
  key_prefix text not null check (key_prefix ~ '^[A-Z]{2,4}$'),
  -- Private spaces are Later. Kept so they can be added without a rewrite.
  is_private boolean not null default false check (is_private = false),
  -- The person who created the space can manage it, as can org admins.
  created_by uuid,
  -- The number the next capsule in this space will get (EN-1, EN-2…).
  next_capsule_number integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, key_prefix),
  foreign key (org_id, created_by) references public.org_members (org_id, user_id)
    on delete set null (created_by)
);

create table public.space_members (
  org_id uuid not null,
  space_id uuid not null,
  user_id uuid not null,
  role public.space_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (space_id, user_id),
  foreign key (org_id, space_id) references public.spaces (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade
);

create index space_members_user_idx on public.space_members (user_id);

-- ---------------------------------------------------------------------------
-- Capsules
-- ---------------------------------------------------------------------------

create table public.capsules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  space_id uuid not null,
  -- Assigned automatically from the space. The key is the space prefix plus
  -- this number (see public.capsule_key).
  number integer not null,
  name text not null check (length(trim(name)) between 1 and 200),
  outcome text,
  status public.work_status not null default 'not_started',
  launch_date date,
  date_type public.date_type not null default 'launch',
  owner_id uuid,
  -- Per-capsule visibility is Later; always 'org' in V1.
  visibility public.capsule_visibility not null default 'org' check (visibility = 'org'),
  created_by uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (space_id, number),
  foreign key (org_id, space_id) references public.spaces (org_id, id) on delete cascade,
  foreign key (org_id, owner_id) references public.org_members (org_id, user_id)
    on delete set null (owner_id),
  foreign key (org_id, created_by) references public.org_members (org_id, user_id)
    on delete set null (created_by)
);

create index capsules_org_idx on public.capsules (org_id);
create index capsules_owner_idx on public.capsules (owner_id);

-- ---------------------------------------------------------------------------
-- Components
-- ---------------------------------------------------------------------------

create table public.components (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  capsule_id uuid not null,
  component_type_id uuid not null,
  owner_id uuid,
  due_date date,
  status public.work_status not null default 'not_started',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, capsule_id, id),
  unique (capsule_id, component_type_id),
  foreign key (org_id, capsule_id) references public.capsules (org_id, id) on delete cascade,
  foreign key (org_id, component_type_id) references public.component_types (org_id, id),
  foreign key (org_id, owner_id) references public.org_members (org_id, user_id)
    on delete set null (owner_id)
);

create index components_capsule_idx on public.components (capsule_id);
create index components_owner_idx on public.components (owner_id);

-- Collaborators on a component. The owner lives on components.owner_id.
create table public.component_people (
  org_id uuid not null,
  capsule_id uuid not null,
  component_id uuid not null,
  user_id uuid not null,
  source public.collaborator_source not null default 'added',
  created_at timestamptz not null default now(),
  primary key (component_id, user_id),
  foreign key (org_id, capsule_id, component_id)
    references public.components (org_id, capsule_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade
);

create index component_people_capsule_user_idx on public.component_people (capsule_id, user_id);
create index component_people_user_idx on public.component_people (user_id);

-- ---------------------------------------------------------------------------
-- Work items
-- ---------------------------------------------------------------------------

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  capsule_id uuid not null,
  component_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 500),
  note text,
  assignee_id uuid,
  done boolean not null default false,
  done_at timestamptz,
  position integer not null default 0,
  -- Synced items (Jira, monday) are Later. Always 'none' in V1.
  source public.work_item_source not null default 'none',
  source_key text,
  source_url text,
  synced_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, capsule_id, component_id)
    references public.components (org_id, capsule_id, id) on delete cascade,
  foreign key (org_id, assignee_id) references public.org_members (org_id, user_id)
    on delete set null (assignee_id),
  foreign key (org_id, created_by) references public.org_members (org_id, user_id)
    on delete set null (created_by)
);

create index work_items_component_idx on public.work_items (component_id);
create index work_items_capsule_idx on public.work_items (capsule_id);
create index work_items_assignee_idx on public.work_items (assignee_id) where not done;

-- ---------------------------------------------------------------------------
-- Followers
-- ---------------------------------------------------------------------------

create table public.followers (
  org_id uuid not null,
  capsule_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (capsule_id, user_id),
  foreign key (org_id, capsule_id) references public.capsules (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade
);

create index followers_user_idx on public.followers (user_id);

-- ---------------------------------------------------------------------------
-- Events: the append-only activity log
-- ---------------------------------------------------------------------------
-- One stream drives Activity, comments, @mentions, email notifications and
-- Undo. Rows are never changed or deleted by the app; an Undo is a new event.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  capsule_id uuid not null,
  -- Who acted. Kept (as a plain user reference) even if they leave the org.
  actor_user_id uuid references public.users (id) on delete set null,
  -- Agents are Later. Kept so "done by Claude, on behalf of Christina" fits.
  actor_agent_id uuid,
  on_behalf_of uuid references public.users (id) on delete set null,
  -- For example: comment, capsule_updated, component_status_changed.
  kind text not null check (kind ~ '^[a-z_]+$'),
  data jsonb not null default '{}',
  -- Comment threads: a reply points at the comment it answers.
  parent_event_id uuid,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, capsule_id) references public.capsules (org_id, id) on delete cascade,
  foreign key (org_id, parent_event_id) references public.events (org_id, id) on delete cascade
);

create index events_capsule_idx on public.events (capsule_id, created_at desc);
create index events_org_created_idx on public.events (org_id, created_at desc);

create table public.mentions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  event_id uuid not null,
  user_id uuid not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id),
  foreign key (org_id, event_id) references public.events (org_id, id) on delete cascade,
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade
);

create index mentions_user_idx on public.mentions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Attachments: files (in Supabase Storage) and links
-- ---------------------------------------------------------------------------

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  capsule_id uuid not null,
  -- Optional component tag.
  component_id uuid,
  kind public.attachment_kind not null,
  name text not null check (length(trim(name)) between 1 and 300),
  url text,
  storage_path text,
  link_type public.link_type,
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 26214400),
  mime_type text,
  added_by uuid,
  -- Removing sets this, so Undo can bring the item back.
  removed_at timestamptz,
  removed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'file' and storage_path is not null and url is null and link_type is null and size_bytes is not null)
    or (kind = 'link' and url is not null and storage_path is null and link_type is not null)
  ),
  foreign key (org_id, capsule_id) references public.capsules (org_id, id) on delete cascade,
  foreign key (org_id, capsule_id, component_id)
    references public.components (org_id, capsule_id, id) on delete set null (component_id),
  foreign key (org_id, added_by) references public.org_members (org_id, user_id)
    on delete set null (added_by),
  foreign key (org_id, removed_by) references public.org_members (org_id, user_id)
    on delete set null (removed_by)
);

create index attachments_capsule_idx on public.attachments (capsule_id) where removed_at is null;
-- The same link can't be added to a capsule twice (the app flags it first).
create unique index attachments_link_unique_idx on public.attachments (capsule_id, url)
  where kind = 'link' and removed_at is null;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger set_updated_at before update on public.orgs
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.users
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.org_members
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.component_types
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.spaces
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.capsules
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.components
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.work_items
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.attachments
  for each row execute function private.set_updated_at();
