-- Allow PostgREST upserts on contacts.legacy_access_id during legacy Access imports.
-- PostgreSQL unique indexes allow multiple NULL values, so this remains compatible
-- with manually created contacts that do not come from Access.

create unique index if not exists contacts_legacy_access_id_full_unique_idx
  on public.contacts (legacy_access_id);
