alter table public.email_templates
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_profile_id uuid
    references public.profiles (id) on delete set null;

create index if not exists email_templates_not_deleted_active_name_idx
  on public.email_templates (active, lower(name))
  where deleted_at is null;

comment on column public.email_templates.deleted_at is
  'Soft-delete timestamp. Deleted templates remain available to historical email batches and logs.';

comment on column public.email_templates.deleted_by_profile_id is
  'Manager profile that soft-deleted the template.';
