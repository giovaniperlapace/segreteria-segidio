-- Atomic preparation only: no delivery, no changes to historical source logs.
create or replace function public.prepare_corrected_email_recipients(
  p_event_id bigint, p_source_batch_id bigint, p_actor uuid, p_messages jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  source public.email_batches%rowtype;
  prepared_id bigint;
  eligible jsonb;
  total integer;
begin
  if not exists (select 1 from profiles where id = p_actor and active and role = 'manager') then
    raise exception 'Manager required';
  end if;
  perform pg_advisory_xact_lock(p_event_id);
  select * into source from email_batches
    where id = p_source_batch_id and event_id = p_event_id for update;
  if not found then raise exception 'Source batch not found'; end if;
  if source.status = 'sending' then raise exception 'Source batch is sending'; end if;
  if jsonb_typeof(p_messages) is distinct from 'array' then raise exception 'Invalid messages'; end if;

  select coalesce(jsonb_agg(m), '[]'::jsonb) into eligible
  from jsonb_array_elements(p_messages) m
  join email_logs original on original.id = (m->>'source_log_id')::bigint
  join contacts c on c.id = original.contact_id and c.deleted_at is null
  join event_invitations i on i.id = original.invitation_id
  where original.batch_id = source.id and original.event_id = p_event_id
    and original.status = 'skipped' and original.to_email = 'email-mancante'
    and i.event_id = p_event_id and i.invitation_status in ('selected', 'invited')
    and c.updated_at = (m->>'contact_updated_at')::timestamptz
    and i.updated_at = (m->>'invitation_updated_at')::timestamptz
    and length(trim(m->>'to_email')) > 0
    and length(trim(m->>'subject')) > 0 and length(trim(m->>'rendered_text')) > 0
    and not exists (
      select 1 from email_logs previous
      where previous.event_id = p_event_id and previous.template_id = source.template_id
        and previous.invitation_id = original.invitation_id
        and (previous.status in ('queued','sending','sent','failed')
          or previous.provider_message_id is not null
          or (previous.status = 'skipped' and previous.to_email <> 'email-mancante'))
    );
  total := jsonb_array_length(eligible);
  if total = 0 then return jsonb_build_object('batch_id', null, 'count', 0); end if;

  insert into email_batches(event_id, template_id, target_kind, status, recipient_count,
    include_public_response_link, created_by_profile_id)
  values (p_event_id, source.template_id, 'selected_rows', 'queued', total,
    source.include_public_response_link, p_actor)
  returning id into prepared_id;

  insert into email_batch_attachments(batch_id, attachment_id)
  select prepared_id, attachment_id from email_batch_attachments where batch_id = source.id;

  insert into email_logs(batch_id, event_id, invitation_id, contact_id, template_id,
    to_email, subject, rendered_text, rendered_html, status)
  select prepared_id, p_event_id, original.invitation_id, original.contact_id, source.template_id,
    m->>'to_email', m->>'subject', m->>'rendered_text', m->>'rendered_html', 'queued'
  from jsonb_array_elements(eligible) m
  join email_logs original on original.id = (m->>'source_log_id')::bigint;
  return jsonb_build_object('batch_id', prepared_id, 'count', total);
end;
$$;
revoke all on function public.prepare_corrected_email_recipients(bigint,bigint,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.prepare_corrected_email_recipients(bigint,bigint,uuid,jsonb) to service_role;

notify pgrst, 'reload schema';
