do $$
declare
  dirty_reference public.internal_references%rowtype;
  clean_name text;
  parsed record;
begin
  for dirty_reference in
    select *
    from public.internal_references
    where full_name like '%,%'
      and array_length(
        array_remove(
          string_to_array(regexp_replace(full_name, '\s*,\s*', ',', 'g'), ','),
          ''
        ),
        1
      ) = 1
  loop
    clean_name = trim(both ',' from dirty_reference.full_name);
    clean_name = regexp_replace(trim(clean_name), '\s+', ' ', 'g');

    select *
    into parsed
    from public.parse_internal_reference_name(clean_name);

    update public.internal_references
    set
      first_name = parsed.parsed_first_name,
      last_name = parsed.parsed_last_name,
      full_name = concat_ws(' ', parsed.parsed_first_name, parsed.parsed_last_name),
      legacy_access_contact_name = clean_name
    where id = dirty_reference.id;
  end loop;
end;
$$;
