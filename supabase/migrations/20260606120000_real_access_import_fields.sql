-- Preserve the richer contact data found in old_software/DbSegreteria2.mdb.
-- These fields keep the real Access archive information available without
-- forcing the MVP into a full person/position/organization model yet.

alter table public.contacts
  add column if not exists legacy_access_old_archive_id integer,
  add column if not exists legacy_description text,
  add column if not exists honorific_title_english text,
  add column if not exists honorific_title_invitation text,
  add column if not exists institutional_role_english text,
  add column if not exists institutional_role_invitation text,
  add column if not exists legacy_salutation text,
  add column if not exists email_2 citext,
  add column if not exists phone_home text,
  add column if not exists phone_office_2 text,
  add column if not exists fax_home text,
  add column if not exists telex_office text,
  add column if not exists website_2 text,
  add column if not exists home_address_line text,
  add column if not exists home_postal_code text,
  add column if not exists home_city text,
  add column if not exists home_province text,
  add column if not exists home_country text,
  add column if not exists office_name text,
  add column if not exists office_address_line text,
  add column if not exists office_postal_code text,
  add column if not exists office_city text,
  add column if not exists office_province text,
  add column if not exists office_country text,
  add column if not exists spoken_language_2 text,
  add column if not exists invitation_language text,
  add column if not exists translation_language text,
  add column if not exists religion text,
  add column if not exists legacy_organization_id integer,
  add column if not exists legacy_organization_name text,
  add column if not exists legacy_office_site text,
  add column if not exists mail_address_preference integer,
  add column if not exists legacy_contacts_raw text,
  add column if not exists accompanist text,
  add column if not exists legacy_archive_type text,
  add column if not exists legacy_created_at date,
  add column if not exists legacy_updated_at date,
  add column if not exists legacy_invitation_group text;

create index if not exists contacts_legacy_access_old_archive_id_idx
  on public.contacts (legacy_access_old_archive_id)
  where legacy_access_old_archive_id is not null;

create index if not exists contacts_legacy_updated_at_idx
  on public.contacts (legacy_updated_at)
  where legacy_updated_at is not null;

create index if not exists contacts_email_2_idx
  on public.contacts (email_2)
  where email_2 is not null;

alter table public.contacts
  add constraint contacts_email_2_not_blank check (
    email_2 is null or length(trim(email_2::text)) > 0
  ),
  add constraint contacts_legacy_access_old_archive_id_positive check (
    legacy_access_old_archive_id is null or legacy_access_old_archive_id > 0
  ),
  add constraint contacts_legacy_organization_id_positive check (
    legacy_organization_id is null or legacy_organization_id > 0
  ),
  add constraint contacts_mail_address_preference_valid check (
    mail_address_preference is null or mail_address_preference in (1, 2)
  );

comment on column public.contacts.legacy_access_id is
  'Original Persone.IdPersona from old_software/DbSegreteria2.mdb; used for idempotent imports and relationship mapping.';
comment on column public.contacts.legacy_access_old_archive_id is
  'Legacy Persone.IdOldArchivio from the real Access data archive.';
comment on column public.contacts.legacy_description is
  'Legacy Persone.Descrizione.';
comment on column public.contacts.legacy_contacts_raw is
  'Raw legacy Persone.Contatti value; split into atomic internal references during import.';
comment on column public.contacts.mail_address_preference is
  'Legacy Persone.IndirizzoPosta: 1 personal/home address, 2 office address when populated.';
comment on column public.contacts.legacy_created_at is
  'Legacy Persone.Creazione_scheda.';
comment on column public.contacts.legacy_updated_at is
  'Legacy Persone.Aggiornamento_dati.';
