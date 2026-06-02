-- Initial MVP schema for Segreteria Segidio.
-- This migration creates the core archive/event/invitation model with RLS.

create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.app_role as enum ('manager', 'reference');
create type public.contact_status as enum ('active', 'standby');
create type public.contact_priority as enum ('standard', 'important', 'critical');
create type public.event_status as enum ('draft', 'active', 'concluded', 'archived');
create type public.invitation_status as enum ('draft', 'proposed', 'selected', 'invited', 'excluded');
create type public.response_status as enum ('no_response', 'attending', 'declined', 'maybe');
create type public.attendance_status as enum ('unknown', 'attended', 'absent');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email citext,
  role public.app_role not null default 'reference',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (email is null or length(trim(email::text)) > 0),
  constraint profiles_full_name_not_blank check (length(trim(full_name)) > 0)
);

create table public.internal_references (
  id bigint generated always as identity primary key,
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null,
  email citext,
  phone text,
  notes text,
  active boolean not null default true,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_references_full_name_not_blank check (length(trim(full_name)) > 0),
  constraint internal_references_email_not_blank check (email is null or length(trim(email::text)) > 0)
);

create table public.groups (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  active boolean not null default true,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_not_blank check (length(trim(name)) > 0)
);

create table public.contacts (
  id bigint generated always as identity primary key,
  first_name text not null default '',
  last_name text not null default '',
  email citext,
  phone text,
  address_line text,
  city text,
  postal_code text,
  country text,
  spoken_language text,
  institutional_role text,
  institution text,
  notes text,
  status public.contact_status not null default 'active',
  priority public.contact_priority not null default 'standard',
  missing_data_notes text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_name_present check (
    length(trim(first_name)) > 0
    or length(trim(last_name)) > 0
    or length(trim(coalesce(institution, ''))) > 0
  ),
  constraint contacts_email_not_blank check (email is null or length(trim(email::text)) > 0)
);

create table public.contact_groups (
  contact_id bigint not null references public.contacts (id) on delete cascade,
  group_id bigint not null references public.groups (id) on delete restrict,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  notes text,
  primary key (contact_id, group_id)
);

create table public.contact_references (
  contact_id bigint not null references public.contacts (id) on delete cascade,
  reference_id bigint not null references public.internal_references (id) on delete restrict,
  relationship_kind text not null default 'assigned',
  is_primary boolean not null default false,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  notes text,
  primary key (contact_id, reference_id),
  constraint contact_references_relationship_kind_not_blank check (length(trim(relationship_kind)) > 0)
);

create table public.events (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  organizational_notes text,
  status public.event_status not null default 'draft',
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_not_blank check (length(trim(title)) > 0),
  constraint events_ends_after_starts check (ends_at is null or ends_at >= starts_at)
);

create table public.event_invitations (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events (id) on delete cascade,
  contact_id bigint not null references public.contacts (id) on delete restrict,
  invitation_status public.invitation_status not null default 'selected',
  response_status public.response_status not null default 'no_response',
  attendance_status public.attendance_status not null default 'unknown',
  proposed_by_reference_id bigint references public.internal_references (id) on delete set null,
  selected_by_profile_id uuid references public.profiles (id) on delete set null,
  response_recorded_by_profile_id uuid references public.profiles (id) on delete set null,
  invited_at timestamptz,
  response_recorded_at timestamptz,
  attended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_invitations_event_contact_unique unique (event_id, contact_id)
);

create table public.contact_versions (
  id bigint generated always as identity primary key,
  contact_id bigint not null references public.contacts (id) on delete restrict,
  version_number bigint not null,
  action text not null,
  snapshot jsonb not null,
  changed_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint contact_versions_action_valid check (action in ('insert', 'update')),
  constraint contact_versions_unique unique (contact_id, version_number)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default now(),
  constraint audit_logs_action_valid check (action in ('insert', 'update', 'delete'))
);

create unique index groups_active_name_unique_idx
  on public.groups (lower(name))
  where active;

create index profiles_role_active_idx on public.profiles (role, active);
create index internal_references_profile_id_idx on public.internal_references (profile_id);
create index internal_references_active_idx on public.internal_references (active);
create index internal_references_created_by_profile_id_idx on public.internal_references (created_by_profile_id);
create index groups_created_by_profile_id_idx on public.groups (created_by_profile_id);
create index contacts_status_idx on public.contacts (status);
create index contacts_priority_idx on public.contacts (priority);
create index contacts_email_idx on public.contacts (email);
create index contacts_name_idx on public.contacts (lower(last_name), lower(first_name));
create index contacts_created_by_profile_id_idx on public.contacts (created_by_profile_id);
create index contacts_updated_by_profile_id_idx on public.contacts (updated_by_profile_id);
create index contact_groups_group_id_idx on public.contact_groups (group_id);
create index contact_groups_contact_id_idx on public.contact_groups (contact_id);
create index contact_groups_created_by_profile_id_idx on public.contact_groups (created_by_profile_id);
create index contact_references_reference_id_idx on public.contact_references (reference_id);
create index contact_references_contact_id_idx on public.contact_references (contact_id);
create index contact_references_created_by_profile_id_idx on public.contact_references (created_by_profile_id);
create unique index contact_references_primary_unique_idx
  on public.contact_references (contact_id)
  where is_primary;
create index events_status_starts_at_idx on public.events (status, starts_at);
create index events_created_by_profile_id_idx on public.events (created_by_profile_id);
create index events_updated_by_profile_id_idx on public.events (updated_by_profile_id);
create index event_invitations_event_id_idx on public.event_invitations (event_id);
create index event_invitations_contact_id_idx on public.event_invitations (contact_id);
create index event_invitations_response_status_idx on public.event_invitations (response_status);
create index event_invitations_proposed_by_reference_id_idx on public.event_invitations (proposed_by_reference_id);
create index event_invitations_selected_by_profile_id_idx on public.event_invitations (selected_by_profile_id);
create index event_invitations_response_recorded_by_profile_id_idx on public.event_invitations (response_recorded_by_profile_id);
create index contact_versions_contact_id_version_idx on public.contact_versions (contact_id, version_number desc);
create index contact_versions_changed_by_profile_id_idx on public.contact_versions (changed_by_profile_id);
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id, occurred_at desc);
create index audit_logs_actor_profile_id_idx on public.audit_logs (actor_profile_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active
  limit 1;
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(public.current_profile_role() = 'manager', false);
$$;

create or replace function public.current_internal_reference_id()
returns bigint
language sql
stable
security definer
set search_path = public, auth
as $$
  select ir.id
  from public.internal_references ir
  where ir.profile_id = (select auth.uid())
    and ir.active
  limit 1;
$$;

create or replace function public.can_access_contact(target_contact_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(public.is_manager(), false)
    or exists (
      select 1
      from public.contact_references cr
      where cr.contact_id = target_contact_id
        and cr.reference_id = public.current_internal_reference_id()
    );
$$;

create or replace function public.can_access_event(target_event_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(public.is_manager(), false)
    or exists (
      select 1
      from public.event_invitations ei
      join public.contact_references cr on cr.contact_id = ei.contact_id
      where ei.event_id = target_event_id
        and cr.reference_id = public.current_internal_reference_id()
    );
$$;

create or replace function public.record_contact_version()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  next_version bigint;
  target_contact_id bigint;
begin
  target_contact_id = new.id;

  select coalesce(max(version_number), 0) + 1
    into next_version
  from public.contact_versions
  where contact_id = target_contact_id;

  insert into public.contact_versions (
    contact_id,
    version_number,
    action,
    snapshot,
    changed_by_profile_id
  )
  values (
    target_contact_id,
    next_version,
    lower(tg_op),
    to_jsonb(new),
    (select auth.uid())
  );

  return new;
end;
$$;

create or replace function public.record_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  changed_record_id text;
begin
  changed_record_id = coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id');

  if changed_record_id is null then
    changed_record_id = coalesce(
      to_jsonb(new)->>'contact_id',
      to_jsonb(old)->>'contact_id',
      'composite-key'
    );
  end if;

  insert into public.audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    actor_profile_id
  )
  values (
    tg_table_name,
    changed_record_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    (select auth.uid())
  );

  return coalesce(new, old);
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger internal_references_set_updated_at
before update on public.internal_references
for each row execute function public.set_updated_at();

create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger event_invitations_set_updated_at
before update on public.event_invitations
for each row execute function public.set_updated_at();

create trigger contacts_record_version
after insert or update on public.contacts
for each row execute function public.record_contact_version();

create trigger profiles_audit
after insert or update or delete on public.profiles
for each row execute function public.record_audit_log();

create trigger internal_references_audit
after insert or update or delete on public.internal_references
for each row execute function public.record_audit_log();

create trigger groups_audit
after insert or update or delete on public.groups
for each row execute function public.record_audit_log();

create trigger contacts_audit
after insert or update or delete on public.contacts
for each row execute function public.record_audit_log();

create trigger contact_groups_audit
after insert or update or delete on public.contact_groups
for each row execute function public.record_audit_log();

create trigger contact_references_audit
after insert or update or delete on public.contact_references
for each row execute function public.record_audit_log();

create trigger events_audit
after insert or update or delete on public.events
for each row execute function public.record_audit_log();

create trigger event_invitations_audit
after insert or update or delete on public.event_invitations
for each row execute function public.record_audit_log();

create or replace view public.contacts_missing_required_data
with (security_invoker = true)
as
select *
from (
  select
    c.id,
    c.first_name,
    c.last_name,
    c.institution,
    c.institutional_role,
    c.email,
    c.phone,
    c.status,
    c.priority,
    array_remove(array[
      case when length(trim(c.first_name)) = 0 and length(trim(c.last_name)) = 0 then 'name' end,
      case when c.email is null then 'email' end,
      case when c.institutional_role is null or length(trim(c.institutional_role)) = 0 then 'institutional_role' end,
      case when c.institution is null or length(trim(c.institution)) = 0 then 'institution' end
    ], null) as missing_fields
  from public.contacts c
  where c.status = 'active'
) missing
where cardinality(missing.missing_fields) > 0;

alter table public.profiles enable row level security;
alter table public.internal_references enable row level security;
alter table public.groups enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_groups enable row level security;
alter table public.contact_references enable row level security;
alter table public.events enable row level security;
alter table public.event_invitations enable row level security;
alter table public.contact_versions enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_access on public.profiles
for select to authenticated
using ((select public.is_manager()) or id = (select auth.uid()));

create policy profiles_manager_insert on public.profiles
for insert to authenticated
with check ((select public.is_manager()));

create policy profiles_manager_update on public.profiles
for update to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy internal_references_select_access on public.internal_references
for select to authenticated
using ((select public.is_manager()) or profile_id = (select auth.uid()));

create policy internal_references_manager_insert on public.internal_references
for insert to authenticated
with check ((select public.is_manager()));

create policy internal_references_manager_update on public.internal_references
for update to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy groups_select_active_or_manager on public.groups
for select to authenticated
using (active or (select public.is_manager()));

create policy groups_manager_insert on public.groups
for insert to authenticated
with check ((select public.is_manager()));

create policy groups_manager_update on public.groups
for update to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy contacts_select_access on public.contacts
for select to authenticated
using ((select public.can_access_contact(id)));

create policy contacts_insert_manager_or_creator on public.contacts
for insert to authenticated
with check (
  (select public.is_manager())
  or created_by_profile_id = (select auth.uid())
);

create policy contacts_update_access on public.contacts
for update to authenticated
using ((select public.can_access_contact(id)))
with check ((select public.can_access_contact(id)));

create policy contact_groups_select_access on public.contact_groups
for select to authenticated
using ((select public.can_access_contact(contact_id)));

create policy contact_groups_manager_insert on public.contact_groups
for insert to authenticated
with check ((select public.is_manager()));

create policy contact_groups_manager_update on public.contact_groups
for update to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy contact_groups_manager_delete on public.contact_groups
for delete to authenticated
using ((select public.is_manager()));

create policy contact_references_select_access on public.contact_references
for select to authenticated
using (
  (select public.is_manager())
  or reference_id = (select public.current_internal_reference_id())
  or (select public.can_access_contact(contact_id))
);

create policy contact_references_manager_insert on public.contact_references
for insert to authenticated
with check ((select public.is_manager()));

create policy contact_references_reference_insert_self on public.contact_references
for insert to authenticated
with check (
  reference_id = (select public.current_internal_reference_id())
);

create policy contact_references_manager_update on public.contact_references
for update to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy contact_references_manager_delete on public.contact_references
for delete to authenticated
using ((select public.is_manager()));

create policy events_select_access on public.events
for select to authenticated
using ((select public.can_access_event(id)));

create policy events_manager_insert on public.events
for insert to authenticated
with check ((select public.is_manager()));

create policy events_manager_update on public.events
for update to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy event_invitations_select_access on public.event_invitations
for select to authenticated
using (
  (select public.is_manager())
  or (select public.can_access_contact(contact_id))
);

create policy event_invitations_manager_insert on public.event_invitations
for insert to authenticated
with check ((select public.is_manager()));

create policy event_invitations_manager_update on public.event_invitations
for update to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy event_invitations_manager_delete on public.event_invitations
for delete to authenticated
using ((select public.is_manager()));

create policy contact_versions_select_access on public.contact_versions
for select to authenticated
using ((select public.can_access_contact(contact_id)));

create policy audit_logs_manager_select on public.audit_logs
for select to authenticated
using ((select public.is_manager()));

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.internal_references to authenticated;
grant select, insert, update on public.groups to authenticated;
grant select, insert, update, delete on public.contact_groups to authenticated;
grant select, insert, update, delete on public.contact_references to authenticated;
grant select, insert, update on public.contacts to authenticated;
grant select, insert, update on public.events to authenticated;
grant select, insert, update, delete on public.event_invitations to authenticated;
grant select on public.contact_versions to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.contacts_missing_required_data to authenticated;

grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.current_internal_reference_id() to authenticated;
grant execute on function public.can_access_contact(bigint) to authenticated;
grant execute on function public.can_access_event(bigint) to authenticated;
