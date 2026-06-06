-- Make contact history and audit attribution reliable for server-side writes.
-- Service-role PostgREST writes do not have auth.uid(), so the triggers also
-- infer the actor from the operational profile columns on the changed row.

create or replace function public.record_contact_version()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  next_version bigint;
  target_contact_id bigint;
  actor_id uuid;
begin
  target_contact_id = new.id;

  select coalesce(max(version_number), 0) + 1
    into next_version
  from public.contact_versions
  where contact_id = target_contact_id;

  actor_id = coalesce(
    nullif(current_setting('app.actor_profile_id', true), '')::uuid,
    new.updated_by_profile_id,
    new.created_by_profile_id,
    (select auth.uid())
  );

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
    actor_id
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
  actor_id uuid;
begin
  changed_record_id = coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id');

  if changed_record_id is null then
    changed_record_id = coalesce(
      to_jsonb(new)->>'contact_id',
      to_jsonb(old)->>'contact_id',
      'composite-key'
    );
  end if;

  actor_id = coalesce(
    nullif(current_setting('app.actor_profile_id', true), '')::uuid,
    nullif(to_jsonb(new)->>'updated_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'deleted_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'created_by_profile_id', '')::uuid,
    nullif(to_jsonb(old)->>'updated_by_profile_id', '')::uuid,
    nullif(to_jsonb(old)->>'deleted_by_profile_id', '')::uuid,
    nullif(to_jsonb(old)->>'created_by_profile_id', '')::uuid,
    (select auth.uid())
  );

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
    actor_id
  );

  return coalesce(new, old);
end;
$$;
