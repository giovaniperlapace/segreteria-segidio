-- Prepare events and event invitations for legacy Access history import.
-- This migration is additive and keeps legacy flags out of the import scope.

alter table public.events
  add column if not exists legacy_access_id integer,
  add column if not exists legacy_event_type_id integer,
  add column if not exists legacy_event_type_name text;

alter table public.event_invitations
  add column if not exists attention_flag boolean not null default false,
  add column if not exists attention_note text,
  add column if not exists legacy_invited_raw text,
  add column if not exists legacy_viene_raw text,
  add column if not exists legacy_presence_raw text;

create unique index if not exists events_legacy_access_id_unique_idx
  on public.events (legacy_access_id);

create index if not exists events_legacy_event_type_id_idx
  on public.events (legacy_event_type_id)
  where legacy_event_type_id is not null;

create index if not exists event_invitations_contact_event_idx
  on public.event_invitations (contact_id, event_id);

create index if not exists event_invitations_attendance_status_idx
  on public.event_invitations (attendance_status);

create index if not exists event_invitations_attention_flag_idx
  on public.event_invitations (event_id, attention_flag)
  where attention_flag;

alter table public.events
  add constraint events_legacy_access_id_positive check (
    legacy_access_id is null or legacy_access_id > 0
  ),
  add constraint events_legacy_event_type_id_non_negative check (
    legacy_event_type_id is null or legacy_event_type_id >= 0
  ),
  add constraint events_legacy_event_type_name_not_blank check (
    legacy_event_type_name is null or length(trim(legacy_event_type_name)) > 0
  );

alter table public.event_invitations
  add constraint event_invitations_attention_note_not_blank check (
    attention_note is null or length(trim(attention_note)) > 0
  ),
  add constraint event_invitations_legacy_invited_raw_not_blank check (
    legacy_invited_raw is null or length(trim(legacy_invited_raw)) > 0
  ),
  add constraint event_invitations_legacy_viene_raw_not_blank check (
    legacy_viene_raw is null or length(trim(legacy_viene_raw)) > 0
  ),
  add constraint event_invitations_legacy_presence_raw_not_blank check (
    legacy_presence_raw is null or length(trim(legacy_presence_raw)) > 0
  );

comment on column public.events.legacy_access_id is
  'Original Eventi.IdInvito from old_software/DbSegreteria2.mdb; used for idempotent legacy event imports.';
comment on column public.events.legacy_event_type_id is
  'Original Eventi.IdTipoEvento from Access, kept for historical context.';
comment on column public.events.legacy_event_type_name is
  'Original EventiTipo.TipoEvento from Access when available.';
comment on column public.event_invitations.attention_flag is
  'Operational flag for an invitee within one specific event. It is not imported from old Access flags and is not a permanent contact priority.';
comment on column public.event_invitations.attention_note is
  'Optional note explaining why this invitee needs attention for this specific event.';
comment on column public.event_invitations.legacy_invited_raw is
  'Raw PersoneInviti.Invitato value used only to audit or redo the historical invitation mapping.';
comment on column public.event_invitations.legacy_viene_raw is
  'Raw PersoneInviti.Viene value used only to audit or redo the historical response mapping.';
comment on column public.event_invitations.legacy_presence_raw is
  'Raw PersoneInviti.Presenza value used only to audit or redo the historical attendance mapping.';
