-- Capsule V1: each person's email notification setting (step 11, decision 48).
--
-- One switch: "Email me when I'm made an owner, assigned work or
-- @mentioned". On by default. Only the person themselves can change it.

alter table public.users
  add column email_notifications boolean not null default true;

grant update (email_notifications) on public.users to authenticated;
