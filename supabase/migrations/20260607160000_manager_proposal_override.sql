create or replace function public.protect_invitation_proposal_reference_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.is_manager()
    or exists (
      select 1
      from public.profiles p
      where p.id = coalesce(new.decided_by_profile_id, old.decided_by_profile_id)
        and p.role = 'manager'
        and p.active
    )
  then
    return new;
  end if;

  if old.reference_id <> public.current_internal_reference_id()
    or old.status <> 'pending'
    or new.status not in ('approved', 'excluded')
    or new.event_id <> old.event_id
    or new.contact_id <> old.contact_id
    or new.reference_id <> old.reference_id
    or new.manager_note is distinct from old.manager_note
    or new.created_by_profile_id is distinct from old.created_by_profile_id
    or new.created_at <> old.created_at
    or new.decided_by_profile_id <> auth.uid()
    or new.decided_at is null
  then
    raise exception 'INVALID_REFERENCE_PROPOSAL_UPDATE';
  end if;

  return new;
end;
$$;
