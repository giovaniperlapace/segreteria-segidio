do $$
declare
  duplicate_group record;
  duplicate_id bigint;
  keeper_id bigint;
begin
  for duplicate_group in
    select
      lower(trim(full_name)) as normalized_name,
      min(id) as first_id,
      array_agg(id order by profile_id is null, active desc, id) as ordered_ids
    from public.internal_references
    group by lower(trim(full_name))
    having count(*) > 1
  loop
    keeper_id = duplicate_group.ordered_ids[1];

    foreach duplicate_id in array duplicate_group.ordered_ids loop
      if duplicate_id = keeper_id then
        continue;
      end if;

      insert into public.contact_references (
        contact_id,
        reference_id,
        relationship_kind,
        is_primary,
        created_by_profile_id
      )
      select
        contact_id,
        keeper_id,
        relationship_kind,
        is_primary,
        created_by_profile_id
      from public.contact_references
      where reference_id = duplicate_id
      on conflict (contact_id, reference_id) do nothing;

      update public.event_invitations
      set proposed_by_reference_id = keeper_id
      where proposed_by_reference_id = duplicate_id;

      delete from public.contact_references
      where reference_id = duplicate_id;

      delete from public.internal_references
      where id = duplicate_id
        and profile_id is null
        and not exists (
          select 1
          from public.contact_references cr
          where cr.reference_id = duplicate_id
        )
        and not exists (
          select 1
          from public.event_invitations ei
          where ei.proposed_by_reference_id = duplicate_id
        );
    end loop;
  end loop;
end;
$$;
