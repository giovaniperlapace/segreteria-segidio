begin;

create function public.record_simple_public_response(
  p_token_hash text, p_response public.response_status, p_delegate jsonb
) returns text language plpgsql security invoker set search_path = public as $$
declare
  t invitation_response_tokens;
  i event_invitations;
begin
  select * into t from invitation_response_tokens where token_hash = p_token_hash for update;
  if not found or t.revoked_at is not null or t.expires_at <= clock_timestamp() then return 'invalid'; end if;

  select inv.* into i from event_invitations inv join events e on e.id = inv.event_id
  where inv.id = t.invitation_id and inv.event_id = t.event_id and inv.contact_id = t.contact_id
    and e.parts = '[]'::jsonb and inv.invitation_status <> 'excluded'
  for update of inv;
  if not found or p_response is null or p_response not in ('attending','declined','maybe') then return 'invalid'; end if;

  if i.invitation_status = 'invited' and i.response_source = 'public_link'
     and i.response_status = p_response
     and row(i.delegate_first_name, i.delegate_last_name, i.delegate_email, i.delegate_role)
         is not distinct from row(p_delegate->>'firstName', p_delegate->>'lastName', p_delegate->>'email', p_delegate->>'role') then
    return 'unchanged';
  end if;

  update event_invitations set invitation_status = 'invited', response_status = p_response,
    response_source = 'public_link', attendance_status = 'unknown', response_note = null,
    companion_count = 0, companion_names = null,
    delegate_first_name = p_delegate->>'firstName', delegate_last_name = p_delegate->>'lastName',
    delegate_email = p_delegate->>'email', delegate_role = p_delegate->>'role',
    response_recorded_at = now(), response_recorded_by_profile_id = null,
    invited_at = case when i.invitation_status = 'invited' then i.invited_at else now() end
  where id = i.id;

  insert into invitation_responses (invitation_id, event_id, contact_id, response_status, source,
    response_token_id, previous_response_status, delegate_first_name, delegate_last_name, delegate_email, delegate_role)
  values (i.id, i.event_id, i.contact_id, p_response, 'public_link', t.id, i.response_status,
    p_delegate->>'firstName', p_delegate->>'lastName', p_delegate->>'email', p_delegate->>'role');

  update invitation_response_tokens set used_at = coalesce(used_at, now()), last_response_at = now() where id = t.id;
  return 'recorded';
end $$;

revoke all on function public.record_simple_public_response(text, public.response_status, jsonb) from public, anon, authenticated;
grant execute on function public.record_simple_public_response(text, public.response_status, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
