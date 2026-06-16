create type public.email_batch_status as enum (
  'draft',
  'queued',
  'sending',
  'completed',
  'completed_with_errors'
);

create type public.email_delivery_status as enum (
  'queued',
  'sending',
  'sent',
  'failed',
  'skipped'
);

create table public.email_templates (
  id bigint generated always as identity primary key,
  name text not null,
  subject text not null,
  body_text text not null,
  active boolean not null default true,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_templates_name_not_blank check (length(trim(name)) > 0),
  constraint email_templates_subject_not_blank check (length(trim(subject)) > 0),
  constraint email_templates_body_not_blank check (length(trim(body_text)) > 0)
);

create table public.email_batches (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events (id) on delete cascade,
  template_id bigint not null references public.email_templates (id) on delete restrict,
  target_kind text not null default 'selected',
  status public.email_batch_status not null default 'queued',
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  last_error text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_batches_target_kind_valid check (
    target_kind in ('selected', 'selected_rows', 'invited_no_response')
  ),
  constraint email_batches_counts_non_negative check (
    recipient_count >= 0 and sent_count >= 0 and failed_count >= 0 and skipped_count >= 0
  )
);

create table public.email_attachments (
  id bigint generated always as identity primary key,
  event_id bigint references public.events (id) on delete cascade,
  file_name text not null,
  content_type text not null default 'application/octet-stream',
  file_size_bytes integer not null,
  content_base64 text not null,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint email_attachments_file_name_not_blank check (length(trim(file_name)) > 0),
  constraint email_attachments_file_size_valid check (file_size_bytes > 0 and file_size_bytes <= 8388608)
);

create table public.email_batch_attachments (
  batch_id bigint not null references public.email_batches (id) on delete cascade,
  attachment_id bigint not null references public.email_attachments (id) on delete restrict,
  primary key (batch_id, attachment_id)
);

create table public.email_logs (
  id bigint generated always as identity primary key,
  batch_id bigint not null references public.email_batches (id) on delete cascade,
  event_id bigint not null references public.events (id) on delete cascade,
  invitation_id bigint not null references public.event_invitations (id) on delete cascade,
  contact_id bigint not null references public.contacts (id) on delete restrict,
  template_id bigint not null references public.email_templates (id) on delete restrict,
  to_email text not null,
  subject text not null,
  rendered_text text not null,
  rendered_html text,
  status public.email_delivery_status not null default 'queued',
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_logs_to_email_not_blank check (length(trim(to_email)) > 0),
  constraint email_logs_subject_not_blank check (length(trim(subject)) > 0),
  constraint email_logs_rendered_text_not_blank check (length(trim(rendered_text)) > 0),
  constraint email_logs_attempt_count_non_negative check (attempt_count >= 0)
);

create index email_templates_active_name_idx on public.email_templates (active, lower(name));
create index email_batches_event_created_idx on public.email_batches (event_id, created_at desc);
create index email_batches_template_id_idx on public.email_batches (template_id);
create index email_attachments_event_created_idx on public.email_attachments (event_id, created_at desc);
create index email_batch_attachments_attachment_id_idx on public.email_batch_attachments (attachment_id);
create index email_logs_batch_status_idx on public.email_logs (batch_id, status, id);
create index email_logs_event_invitation_idx on public.email_logs (event_id, invitation_id, created_at desc);
create index email_logs_contact_id_idx on public.email_logs (contact_id);

create trigger email_templates_set_updated_at
before update on public.email_templates
for each row execute function public.set_updated_at();

create trigger email_batches_set_updated_at
before update on public.email_batches
for each row execute function public.set_updated_at();

create trigger email_logs_set_updated_at
before update on public.email_logs
for each row execute function public.set_updated_at();

create trigger email_templates_audit
after insert or update or delete on public.email_templates
for each row execute function public.record_audit_log();

create trigger email_batches_audit
after insert or update or delete on public.email_batches
for each row execute function public.record_audit_log();

alter table public.email_templates enable row level security;
alter table public.email_batches enable row level security;
alter table public.email_attachments enable row level security;
alter table public.email_batch_attachments enable row level security;
alter table public.email_logs enable row level security;

create policy email_templates_manager_all on public.email_templates
for all to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy email_batches_manager_all on public.email_batches
for all to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy email_attachments_manager_all on public.email_attachments
for all to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy email_batch_attachments_manager_all on public.email_batch_attachments
for all to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy email_logs_manager_all on public.email_logs
for all to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

insert into public.email_templates (name, subject, body_text, active)
select
  'Invito evento base',
  'Invito - {{titolo_evento}}',
  'Gentile {{nome_completo}},

la Comunità di Sant''Egidio ha il piacere di invitarLa a {{titolo_evento}}.

Data: {{data_evento}}
Luogo: {{luogo_evento}}

Cordiali saluti
Segreteria Generale',
  true
where not exists (
  select 1 from public.email_templates where lower(name) = lower('Invito evento base')
);
