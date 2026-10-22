-- Run only in an isolated database after the archive migration (minimal email_logs fixture suffices).
begin;
insert into public.email_logs(id,status,provider_message_id) values
(1,'sending',null), (2,'failed',null), (3,'sent','legacy-smtp-id');
update public.email_logs set status='sent',provider_message_id='11111111-1111-1111-1111-111111111111' where id=1;
update public.email_logs set status='sent' where id=1;
do $$ begin
  if (select count(*) from public.email_sent_archives) <> 1 then raise exception 'queue not idempotent'; end if;
end $$;
set local role authenticated;
do $$ begin
  begin perform * from public.email_sent_archives; raise exception 'raw archive exposed'; exception when insufficient_privilege then null; end;
  begin perform * from public.email_delivery_events; raise exception 'evidence exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform * from public.email_sent_archives; raise exception 'anonymous archive exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
select count(*) as service_archive_count from public.email_sent_archives;
reset role;
rollback;
