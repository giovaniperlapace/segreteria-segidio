-- One-off reset before reimporting the real legacy archive from DbSegreteria2.mdb.
-- This intentionally preserves Supabase Auth, application profiles and settings
-- such as contact_languages. It clears operational archive/event data imported
-- from the wrong legacy source.

truncate table
  public.event_invitations,
  public.events,
  public.contact_versions,
  public.contact_groups,
  public.contact_references,
  public.contacts,
  public.groups,
  public.internal_references,
  public.audit_logs
restart identity cascade;
