-- Run ONLY in an isolated database after fixtures and the migration.
begin;
insert into profiles values ('00000000-0000-0000-0000-000000000001',true,'manager');
insert into contacts values (1,null,'2026-11-18'),(2,null,'2026-11-18'),(3,null,'2026-11-18'),(4,null,'2026-11-18');
insert into event_invitations values (1,497,'selected','2026-11-18'),(2,497,'selected','2026-11-18'),(3,497,'selected','2026-11-18'),(4,497,'selected','2026-11-18');
insert into email_batches(event_id,template_id,status,include_public_response_link) values (497,1,'completed_with_errors',false);
insert into email_batch_attachments values (1,10),(1,11);
insert into email_logs(batch_id,event_id,invitation_id,contact_id,template_id,to_email,status)
select 1,497,n,n,1,'email-mancante','skipped' from generate_series(1,4) n;
insert into email_logs(batch_id,event_id,invitation_id,contact_id,template_id,to_email,status,provider_message_id)
values (1,497,2,2,1,'already@example.org','sent','accepted');
do $$
declare payload jsonb; result jsonb; new_id bigint;
begin
  select jsonb_agg(jsonb_build_object('source_log_id',n,'contact_updated_at','2026-11-18','invitation_updated_at','2026-11-18',
    'to_email','person'||n||'@example.org','subject','Invito','rendered_text','Test','rendered_html','<p>Test</p>'))
    into payload from generate_series(1,3) n;
  update contacts set updated_at='2026-11-19' where id=3;
  result := prepare_corrected_email_recipients(497,1,'00000000-0000-0000-0000-000000000001',payload);
  assert (result->>'count')::integer=1, 'sent and stale contacts must be excluded';
  new_id := (result->>'batch_id')::bigint;
  assert (select count(*) from email_batch_attachments where batch_id=new_id)=2,'attachments copied';
  assert (select include_public_response_link from email_batches where id=new_id)=false,'link setting preserved';
  assert (select count(*) from email_logs where batch_id=1 and status='skipped')=4,'historical rows unchanged';
  result := prepare_corrected_email_recipients(497,1,'00000000-0000-0000-0000-000000000001',payload);
  assert (result->>'count')::integer=0,'repeat must be idempotent';
  assert (select count(*) from email_batches)=2,'no empty batch';
  -- A failed insert must roll back the newly created batch and attachments.
  begin
    perform prepare_corrected_email_recipients(497,1,'00000000-0000-0000-0000-000000000001',
      '[{"source_log_id":4,"contact_updated_at":"invalid","invitation_updated_at":"2026-11-18","to_email":"x@example.org","subject":"x","rendered_text":"x"}]');
    raise exception 'invalid input accepted';
  exception when invalid_datetime_format then null;
  end;
  assert (select count(*) from email_batches)=2;
  begin
    perform prepare_corrected_email_recipients(497,1,'00000000-0000-0000-0000-000000000002',payload);
    raise exception 'missing manager accepted';
  exception when raise_exception then
    if sqlerrm <> 'Manager required' then raise; end if;
  end;
end $$;
set local role authenticated;
do $$ begin
  begin
    perform public.prepare_corrected_email_recipients(497,1,'00000000-0000-0000-0000-000000000001','[]');
    raise exception 'authenticated may not invoke';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
