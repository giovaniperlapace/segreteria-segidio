-- Add contact-level fields needed to import useful data from the legacy Access archive.
-- This migration does not import data; it prepares the schema for a later reviewed import.

alter table public.contacts
  add column legacy_access_id integer,
  add column honorific_title text,
  add column mailing_name text,
  add column mobile_phone text,
  add column fax text,
  add column website text;

alter table public.internal_references
  add column legacy_access_contact_name text;

create unique index contacts_legacy_access_id_unique_idx
  on public.contacts (legacy_access_id)
  where legacy_access_id is not null;

create index internal_references_legacy_access_contact_name_idx
  on public.internal_references (lower(trim(legacy_access_contact_name)))
  where legacy_access_contact_name is not null
    and length(trim(legacy_access_contact_name)) > 0;

alter table public.contacts
  add constraint contacts_legacy_access_id_positive check (
    legacy_access_id is null or legacy_access_id > 0
  ),
  add constraint contacts_honorific_title_not_blank check (
    honorific_title is null or length(trim(honorific_title)) > 0
  ),
  add constraint contacts_mailing_name_not_blank check (
    mailing_name is null or length(trim(mailing_name)) > 0
  ),
  add constraint contacts_mobile_phone_not_blank check (
    mobile_phone is null or length(trim(mobile_phone)) > 0
  ),
  add constraint contacts_fax_not_blank check (
    fax is null or length(trim(fax)) > 0
  ),
  add constraint contacts_website_not_blank check (
    website is null or length(trim(website)) > 0
  );

alter table public.internal_references
  add constraint internal_references_legacy_access_contact_name_not_blank check (
    legacy_access_contact_name is null
    or length(trim(legacy_access_contact_name)) > 0
  );

comment on column public.contacts.legacy_access_id is
  'Original EXPO2000.ID from the legacy Access database; used for idempotent imports and relationship mapping.';
comment on column public.contacts.honorific_title is
  'Legacy EXPO2000.Titolo, for titles and honorifics.';
comment on column public.contacts.mailing_name is
  'Legacy EXPO2000.Recapito, kept separately from street address for mailing labels and protocol names.';
comment on column public.contacts.mobile_phone is
  'Legacy EXPO2000.Tel_Cellulare.';
comment on column public.contacts.fax is
  'Legacy EXPO2000.Fax.';
comment on column public.contacts.website is
  'Legacy EXPO2000.Sito_Web.';
comment on column public.internal_references.legacy_access_contact_name is
  'Normalized source label from legacy EXPO2000.Contatto; import creates one internal reference per distinct non-empty value and links it through contact_references.';
