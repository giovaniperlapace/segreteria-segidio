-- Add configurable contact language options for the contacts UI.
-- contacts.spoken_language intentionally remains text so legacy Access imports
-- can preserve unrecognized values without failing.

create table if not exists public.contact_languages (
  id bigint generated always as identity primary key,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_languages_name_not_blank check (length(trim(name)) > 0)
);

create unique index if not exists contact_languages_name_unique_idx
  on public.contact_languages (lower(name));

create index if not exists contact_languages_active_sort_idx
  on public.contact_languages (active, sort_order, lower(name));

create index if not exists contact_languages_created_by_profile_id_idx
  on public.contact_languages (created_by_profile_id);

drop trigger if exists contact_languages_set_updated_at on public.contact_languages;
create trigger contact_languages_set_updated_at
before update on public.contact_languages
for each row execute function public.set_updated_at();

drop trigger if exists contact_languages_audit on public.contact_languages;
create trigger contact_languages_audit
after insert or update or delete on public.contact_languages
for each row execute function public.record_audit_log();

insert into public.contact_languages (name, sort_order)
select seed.name, seed.sort_order
from (
  values
    ('Italiano', 10),
    ('Inglese', 20),
    ('Francese', 30),
    ('Spagnolo', 40),
    ('Portoghese', 50),
    ('Tedesco', 60),
    ('Arabo', 70),
    ('Cinese', 80),
    ('Russo', 90),
    ('Ucraino', 100),
    ('Polacco', 110),
    ('Rumeno', 120)
) as seed(name, sort_order)
where not exists (
  select 1
  from public.contact_languages existing
  where lower(existing.name) = lower(seed.name)
);

alter table public.contact_languages enable row level security;

drop policy if exists contact_languages_select_active_or_manager on public.contact_languages;
create policy contact_languages_select_active_or_manager on public.contact_languages
for select to authenticated
using (active or (select public.is_manager()));

drop policy if exists contact_languages_manager_insert on public.contact_languages;
create policy contact_languages_manager_insert on public.contact_languages
for insert to authenticated
with check ((select public.is_manager()));

drop policy if exists contact_languages_manager_update on public.contact_languages;
create policy contact_languages_manager_update on public.contact_languages
for update to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

grant select, insert, update on public.contact_languages to authenticated;
grant usage, select on sequence public.contact_languages_id_seq to authenticated;
