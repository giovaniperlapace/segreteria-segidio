-- Add safe, audited manager-only profile administration.

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

create or replace function public.admin_manage_profile(
  actor_profile_id uuid,
  target_profile_id uuid,
  target_email citext,
  target_full_name text,
  target_role public.app_role,
  target_active boolean,
  target_reference_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  existing_profile public.profiles%rowtype;
  selected_reference public.internal_references%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('public.admin_manage_profile'));

  if not exists (
    select 1
    from public.profiles p
    where p.id = actor_profile_id
      and p.role = 'manager'
      and p.active
  ) then
    raise exception 'MANAGER_REQUIRED';
  end if;

  if length(trim(target_full_name)) = 0 then
    raise exception 'FULL_NAME_REQUIRED';
  end if;

  if length(trim(target_email::text)) = 0 then
    raise exception 'EMAIL_REQUIRED';
  end if;

  select *
  into existing_profile
  from public.profiles p
  where p.id = target_profile_id;

  if existing_profile.id is not null
    and existing_profile.role = 'manager'
    and existing_profile.active
    and not (target_role = 'manager' and target_active)
    and (
      select count(*)
      from public.profiles p
      where p.role = 'manager'
        and p.active
    ) <= 1
  then
    raise exception 'LAST_ACTIVE_MANAGER';
  end if;

  perform set_config('app.actor_profile_id', actor_profile_id::text, true);

  insert into public.profiles (id, email, full_name, role, active)
  values (
    target_profile_id,
    lower(trim(target_email::text))::citext,
    trim(target_full_name),
    target_role,
    target_active
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    active = excluded.active;

  if target_role = 'reference' then
    if target_reference_id is not null then
      select *
      into selected_reference
      from public.internal_references ir
      where ir.id = target_reference_id
      for update;

      if selected_reference.id is null then
        raise exception 'REFERENCE_NOT_FOUND';
      end if;

      if selected_reference.profile_id is not null
        and selected_reference.profile_id <> target_profile_id
      then
        raise exception 'REFERENCE_ALREADY_LINKED';
      end if;

      update public.internal_references
      set profile_id = null
      where profile_id = target_profile_id
        and id <> target_reference_id;

      update public.internal_references
      set profile_id = target_profile_id
      where id = target_reference_id;
    elsif not exists (
      select 1
      from public.internal_references ir
      where ir.profile_id = target_profile_id
    ) then
      insert into public.internal_references (
        profile_id,
        full_name,
        email,
        active,
        created_by_profile_id
      )
      values (
        target_profile_id,
        trim(target_full_name),
        lower(trim(target_email::text))::citext,
        target_active,
        actor_profile_id
      );
    end if;

    update public.internal_references
    set active = target_active
    where profile_id = target_profile_id;
  else
    update public.internal_references
    set profile_id = null
    where profile_id = target_profile_id;
  end if;
end;
$$;

revoke all on function public.admin_manage_profile(
  uuid,
  uuid,
  citext,
  text,
  public.app_role,
  boolean,
  bigint
) from public, anon, authenticated;

grant execute on function public.admin_manage_profile(
  uuid,
  uuid,
  citext,
  text,
  public.app_role,
  boolean,
  bigint
) to service_role;

