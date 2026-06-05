alter table public.contacts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_profile_id uuid references public.profiles (id) on delete set null;

alter table public.internal_references
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_profile_id uuid references public.profiles (id) on delete set null;

create index if not exists contacts_deleted_at_idx
  on public.contacts (deleted_at)
  where deleted_at is null;

create index if not exists internal_references_deleted_at_idx
  on public.internal_references (deleted_at)
  where deleted_at is null;

create index if not exists contacts_deleted_by_profile_id_idx
  on public.contacts (deleted_by_profile_id)
  where deleted_by_profile_id is not null;

create index if not exists internal_references_deleted_by_profile_id_idx
  on public.internal_references (deleted_by_profile_id)
  where deleted_by_profile_id is not null;

create or replace function public.current_internal_reference_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select ir.id
  from public.internal_references ir
  where ir.profile_id = (select auth.uid())
    and ir.active
    and ir.deleted_at is null
  limit 1;
$$;

grant execute on function public.current_internal_reference_id() to authenticated;

comment on column public.contacts.deleted_at is
  'Soft-delete marker: deleted contacts are hidden from operational archive screens but kept for history and audit.';
comment on column public.internal_references.deleted_at is
  'Soft-delete marker: deleted references are hidden from operational screens and no longer grant reference access.';
