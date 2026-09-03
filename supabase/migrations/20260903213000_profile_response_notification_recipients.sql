-- Let managers choose which active manager profiles receive public response notifications.

begin;

alter table public.profiles
  add column receives_response_notifications boolean not null default false;

alter table public.profiles
  add constraint profiles_response_notifications_manager_only
  check (not receives_response_notifications or role = 'manager');

comment on column public.profiles.receives_response_notifications is
  'Whether this manager receives email notifications for invitation responses submitted through public links.';

drop function if exists public.admin_manage_profile(
  uuid,
  uuid,
  citext,
  text,
  text,
  public.app_role,
  boolean,
  bigint
);

create function public.admin_manage_profile(
  actor_profile_id uuid,
  target_profile_id uuid,
  target_email citext,
  target_first_name text,
  target_last_name text,
  target_role public.app_role,
  target_active boolean,
  target_reference_id bigint default null,
  target_receives_response_notifications boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  existing_profile public.profiles%rowtype;
  selected_reference public.internal_references%rowtype;
  combined_name text;
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

  if length(trim(target_first_name)) = 0 then
    raise exception 'FIRST_NAME_REQUIRED';
  end if;

  if length(trim(target_last_name)) = 0 then
    raise exception 'LAST_NAME_REQUIRED';
  end if;

  if length(trim(target_email::text)) = 0 then
    raise exception 'EMAIL_REQUIRED';
  end if;

  combined_name = concat_ws(' ', trim(target_first_name), trim(target_last_name));

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

  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    full_name,
    role,
    active,
    receives_response_notifications
  )
  values (
    target_profile_id,
    lower(trim(target_email::text))::citext,
    trim(target_first_name),
    trim(target_last_name),
    combined_name,
    target_role,
    target_active,
    target_receives_response_notifications and target_role = 'manager'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    active = excluded.active,
    receives_response_notifications = excluded.receives_response_notifications;

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
      set
        profile_id = target_profile_id,
        first_name = trim(target_first_name),
        last_name = trim(target_last_name),
        email = lower(trim(target_email::text))::citext,
        active = target_active
      where id = target_reference_id;
    elsif not exists (
      select 1
      from public.internal_references ir
      where ir.profile_id = target_profile_id
    ) then
      insert into public.internal_references (
        profile_id,
        first_name,
        last_name,
        email,
        active,
        created_by_profile_id
      )
      values (
        target_profile_id,
        trim(target_first_name),
        trim(target_last_name),
        lower(trim(target_email::text))::citext,
        target_active,
        actor_profile_id
      );
    else
      update public.internal_references
      set
        first_name = trim(target_first_name),
        last_name = trim(target_last_name),
        email = lower(trim(target_email::text))::citext,
        active = target_active
      where profile_id = target_profile_id;
    end if;
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
  text,
  public.app_role,
  boolean,
  bigint,
  boolean
) from public, anon, authenticated;

grant execute on function public.admin_manage_profile(
  uuid,
  uuid,
  citext,
  text,
  text,
  public.app_role,
  boolean,
  bigint,
  boolean
) to service_role;

commit;
