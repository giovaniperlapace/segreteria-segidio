alter table public.internal_references
  add column if not exists first_name text,
  add column if not exists last_name text;

create or replace function public.parse_internal_reference_name(source_name text)
returns table(parsed_first_name text, parsed_last_name text)
language plpgsql
immutable
as $$
declare
  clean_name text;
  name_parts text[];
  part_count integer;
begin
  clean_name = regexp_replace(trim(coalesce(source_name, '')), '\s+', ' ', 'g');

  if clean_name = '' then
    parsed_first_name = null;
    parsed_last_name = null;
    return next;
    return;
  end if;

  name_parts = regexp_split_to_array(clean_name, '\s+');
  part_count = array_length(name_parts, 1);

  parsed_first_name = name_parts[1];
  if part_count > 1 then
    parsed_last_name = array_to_string(name_parts[2:part_count], ' ');
  else
    parsed_last_name = null;
  end if;

  return next;
end;
$$;

with parsed_references as (
  select
    ir.id,
    parsed.parsed_first_name,
    parsed.parsed_last_name
  from public.internal_references ir
  cross join lateral public.parse_internal_reference_name(ir.full_name) parsed
)
update public.internal_references ir
set
  first_name = parsed_references.parsed_first_name,
  last_name = parsed_references.parsed_last_name
from parsed_references
where parsed_references.id = ir.id
  and (
    ir.first_name is null
    or length(trim(ir.first_name)) = 0
  );

do $$
declare
  compound public.internal_references%rowtype;
  part text;
  part_index integer;
  parts text[];
  parsed record;
  target_id bigint;
  first_target_id bigint;
  link public.contact_references%rowtype;
begin
  for compound in
    select *
    from public.internal_references
    where full_name like '%,%'
    order by id
  loop
    select array_agg(clean_part)
    into parts
    from (
      select trim(raw_part) as clean_part
      from unnest(string_to_array(compound.full_name, ',')) as split_parts(raw_part)
    ) cleaned_parts
    where length(clean_part) > 0;

    if parts is null then
      continue;
    end if;

    if array_length(parts, 1) = 1 then
      select *
      into parsed
      from public.parse_internal_reference_name(parts[1]);

      update public.internal_references
      set
        first_name = parsed.parsed_first_name,
        last_name = parsed.parsed_last_name,
        full_name = concat_ws(' ', parsed.parsed_first_name, parsed.parsed_last_name),
        legacy_access_contact_name = parts[1]
      where id = compound.id;

      continue;
    end if;

    first_target_id = null;
    part_index = 0;

    foreach part in array parts loop
      part_index = part_index + 1;

      select id
      into target_id
      from public.internal_references
      where lower(trim(full_name)) = lower(trim(part))
        and full_name not like '%,%'
      order by active desc, id
      limit 1;

      if target_id is null then
        select *
        into parsed
        from public.parse_internal_reference_name(part);

        insert into public.internal_references (
          first_name,
          last_name,
          full_name,
          email,
          phone,
          notes,
          active,
          legacy_access_contact_name,
          created_by_profile_id
        )
        values (
          parsed.parsed_first_name,
          parsed.parsed_last_name,
          concat_ws(' ', parsed.parsed_first_name, parsed.parsed_last_name),
          case when array_length(parts, 1) = 1 then compound.email else null end,
          null,
          null,
          compound.active,
          part,
          compound.created_by_profile_id
        )
        returning id into target_id;
      end if;

      if first_target_id is null then
        first_target_id = target_id;
      end if;

      for link in
        select *
        from public.contact_references
        where reference_id = compound.id
      loop
        insert into public.contact_references (
          contact_id,
          reference_id,
          relationship_kind,
          is_primary,
          created_by_profile_id
        )
        values (
          link.contact_id,
          target_id,
          link.relationship_kind,
          link.is_primary and part_index = 1,
          link.created_by_profile_id
        )
        on conflict (contact_id, reference_id) do nothing;
      end loop;
    end loop;

    if first_target_id is not null then
      update public.event_invitations
      set proposed_by_reference_id = first_target_id
      where proposed_by_reference_id = compound.id;
    end if;

    delete from public.contact_references
    where reference_id = compound.id;

    delete from public.internal_references
    where id = compound.id
      and profile_id is null
      and not exists (
        select 1
        from public.contact_references cr
        where cr.reference_id = compound.id
      )
      and not exists (
        select 1
        from public.event_invitations ei
        where ei.proposed_by_reference_id = compound.id
      );
  end loop;
end;
$$;

create or replace function public.sync_internal_reference_full_name()
returns trigger
language plpgsql
as $$
declare
  parsed record;
  source_name text;
begin
  source_name = coalesce(
    nullif(trim(new.full_name), ''),
    concat_ws(' ', nullif(trim(new.first_name), ''), nullif(trim(new.last_name), ''))
  );

  select *
  into parsed
  from public.parse_internal_reference_name(source_name);

  new.first_name = coalesce(nullif(trim(new.first_name), ''), parsed.parsed_first_name);
  new.last_name = coalesce(nullif(trim(new.last_name), ''), parsed.parsed_last_name);
  new.full_name = concat_ws(' ', new.first_name, nullif(new.last_name, ''));

  return new;
end;
$$;

drop trigger if exists internal_references_sync_full_name on public.internal_references;

create trigger internal_references_sync_full_name
before insert or update of first_name, last_name, full_name on public.internal_references
for each row execute function public.sync_internal_reference_full_name();

alter table public.internal_references
  alter column first_name set not null,
  add constraint internal_references_first_name_not_blank check (length(trim(first_name)) > 0),
  add constraint internal_references_last_name_not_blank check (
    last_name is null or length(trim(last_name)) > 0
  );

create index if not exists internal_references_last_name_first_name_idx
  on public.internal_references (lower(trim(coalesce(last_name, ''))), lower(trim(first_name)));

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
    active
  )
  values (
    target_profile_id,
    lower(trim(target_email::text))::citext,
    trim(target_first_name),
    trim(target_last_name),
    combined_name,
    target_role,
    target_active
  )
  on conflict (id) do update
  set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
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
  bigint
) from public, anon, authenticated;

grant execute on function public.admin_manage_profile(
  uuid,
  uuid,
  citext,
  text,
  text,
  public.app_role,
  boolean,
  bigint
) to service_role;
