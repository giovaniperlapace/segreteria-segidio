-- Harden profiles for email-based magic-link access.

alter table public.profiles
  alter column email set not null;

create unique index profiles_email_unique_idx
  on public.profiles (email);

comment on table public.profiles is
  'Pre-authorized application users. Provision an Auth user and matching profile before magic-link login.';
