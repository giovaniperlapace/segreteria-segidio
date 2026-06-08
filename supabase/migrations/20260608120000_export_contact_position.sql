-- Transfer selected position-related data to a new contact in one transaction.
-- Event invitations and internal references intentionally remain on the source contact.

alter table public.contacts
  drop constraint if exists contacts_name_present;

alter table public.contacts
  add constraint contacts_name_present check (
    length(trim(first_name)) > 0
    or length(trim(last_name)) > 0
    or length(trim(coalesce(institution, ''))) > 0
    or length(trim(coalesce(institutional_role, ''))) > 0
  );

create or replace function public.export_contact_position(
  p_source_contact_id bigint,
  p_fields text[],
  p_group_ids bigint[] default '{}'::bigint[]
)
returns bigint
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  allowed_fields constant text[] := array[
    'honorific_title',
    'honorific_title_english',
    'honorific_title_invitation',
    'legacy_description',
    'institutional_role',
    'institutional_role_english',
    'institutional_role_invitation',
    'institution',
    'legacy_salutation',
    'email',
    'email_2',
    'phone',
    'phone_home',
    'phone_office_2',
    'mobile_phone',
    'fax',
    'fax_home',
    'telex_office',
    'address_line',
    'postal_code',
    'city',
    'country',
    'home_address_line',
    'home_postal_code',
    'home_city',
    'home_province',
    'home_country',
    'office_name',
    'office_address_line',
    'office_postal_code',
    'office_city',
    'office_province',
    'office_country',
    'spoken_language',
    'spoken_language_2',
    'invitation_language',
    'translation_language',
    'religion',
    'legacy_organization_name',
    'legacy_office_site',
    'mail_address_preference',
    'accompanist',
    'legacy_archive_type',
    'legacy_invitation_group',
    'website',
    'website_2',
    'notes',
    'missing_data_notes'
  ];
  selected_fields text[];
  selected_group_ids bigint[];
  source_contact public.contacts%rowtype;
  source_data jsonb;
  field_name text;
  column_list text;
  clear_list text;
  new_contact_id bigint;
begin
  if not public.is_manager() then
    raise exception 'POSITION_EXPORT_MANAGER_REQUIRED';
  end if;

  select *
    into source_contact
  from public.contacts
  where id = p_source_contact_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'POSITION_EXPORT_SOURCE_NOT_FOUND';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::text[])
    into selected_fields
  from unnest(coalesce(p_fields, '{}'::text[])) as value;

  select coalesce(array_agg(distinct value order by value), '{}'::bigint[])
    into selected_group_ids
  from unnest(coalesce(p_group_ids, '{}'::bigint[])) as value;

  foreach field_name in array selected_fields loop
    if not field_name = any(allowed_fields) then
      raise exception 'POSITION_EXPORT_FIELD_NOT_ALLOWED:%', field_name;
    end if;
  end loop;

  if cardinality(selected_fields) = 0 and cardinality(selected_group_ids) = 0 then
    raise exception 'POSITION_EXPORT_EMPTY';
  end if;

  source_data := to_jsonb(source_contact);

  if not (
    ('institutional_role' = any(selected_fields)
      and nullif(trim(source_data->>'institutional_role'), '') is not null)
    or
    ('institution' = any(selected_fields)
      and nullif(trim(source_data->>'institution'), '') is not null)
  ) then
    raise exception 'POSITION_EXPORT_IDENTITY_REQUIRED';
  end if;

  if nullif(trim(source_contact.first_name), '') is null
    and nullif(trim(source_contact.last_name), '') is null
    and (
      nullif(trim(source_data->>'institution'), '') is null
      or 'institution' = any(selected_fields)
    )
    and (
      nullif(trim(source_data->>'institutional_role'), '') is null
      or 'institutional_role' = any(selected_fields)
    )
  then
    raise exception 'POSITION_EXPORT_SOURCE_IDENTITY_REQUIRED';
  end if;

  select string_agg(format('%I', value), ', ')
    into column_list
  from unnest(selected_fields) as value;

  select string_agg(format('%I = null', value), ', ')
    into clear_list
  from unnest(selected_fields) as value;

  execute format(
    'insert into public.contacts (%s, created_by_profile_id, updated_by_profile_id)
     select %s, $2, $2
     from public.contacts
     where id = $1
     returning id',
    column_list,
    column_list
  )
  into new_contact_id
  using p_source_contact_id, auth.uid();

  perform set_config('app.actor_profile_id', auth.uid()::text, true);

  if cardinality(selected_group_ids) > 0 then
    insert into public.contact_groups (
      contact_id,
      group_id,
      created_by_profile_id,
      notes
    )
    select
      new_contact_id,
      cg.group_id,
      auth.uid(),
      cg.notes
    from public.contact_groups cg
    where cg.contact_id = p_source_contact_id
      and cg.group_id = any(selected_group_ids);

    delete from public.contact_groups
    where contact_id = p_source_contact_id
      and group_id = any(selected_group_ids);
  end if;

  execute format(
    'update public.contacts
     set %s, updated_by_profile_id = $2
     where id = $1',
    clear_list
  )
  using p_source_contact_id, auth.uid();

  return new_contact_id;
end;
$$;

revoke all on function public.export_contact_position(bigint, text[], bigint[]) from public;
grant execute on function public.export_contact_position(bigint, text[], bigint[]) to authenticated;

comment on function public.export_contact_position(bigint, text[], bigint[]) is
  'Creates a new contact with selected position data, clears those fields from the source, transfers selected groups, and leaves references and event history on the source.';
