-- Run only in an isolated database with the application schema and new migration.
-- Every fixture is rolled back; no emails are sent.
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000071','composite-test@example.invalid');
insert into profiles(id,first_name,last_name,full_name,email,role) values('00000000-0000-4000-8000-000000000071','Composite','Test','Composite Test','composite-test@example.invalid','manager');
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000072','reference-test@example.invalid');
insert into profiles(id,first_name,last_name,full_name,email,role) values('00000000-0000-4000-8000-000000000072','Reference','Test','Reference Test','reference-test@example.invalid','reference');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000071',true);
do $$
declare e bigint; c bigint; i bigint; token_id bigint; r event_invitations; n integer;
begin
  insert into contacts(first_name,last_name) values('Fixture','Composite') returning id into c;
  insert into events(title,starts_at,parts) values('Fixture composite',now()+interval '1 day','[{"id":"mass","title":"Celebrazione"},{"id":"reception","title":"Ricevimento"}]') returning id into e;
  insert into event_invitations(event_id,contact_id,invitation_status,updated_by_profile_id) values(e,c,'invited','00000000-0000-4000-8000-000000000071') returning id into i;
  select * into r from event_invitations where id=i;
  assert jsonb_array_length(r.part_responses)=2, 'default includes every part';
  insert into invitation_response_tokens(invitation_id,event_id,contact_id,token_hash,token_prefix) values(i,e,c,'test-composite-hash','test') returning id into token_id;
  assert record_public_part_responses('test-composite-hash','[{"id":"mass","response":"attending"},{"id":"reception","response":"delegated","firstName":"Delegate","lastName":"Test","email":"delegate@example.invalid"}]'), 'response saved';
  select * into r from event_invitations where id=i;
  assert exists(select 1 from event_part_counts(e) where id='reception' and attending=1 and delegated=1), 'per-part count includes delegate';
  assert r.response_status='attending' and r.delegate_email is null, 'aggregate does not overwrite per-part delegates';
  select count(*) into n from invitation_responses where invitation_id=i and response_token_id=token_id and source='public_link' and jsonb_array_length(part_responses)=2;
  assert n=1, 'one atomic public history snapshot';
  assert exists(select 1 from invitation_responses where invitation_id=i and part_responses @> '[{"id":"mass","title":"Celebrazione"}]'), 'snapshot preserves titles';
  begin
    perform record_public_part_responses('test-composite-hash','[{"id":"mass","response":"declined"}]');
    raise exception 'TEST FAILED: omitted part accepted';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  begin
    update events set parts='[{"id":"mass","title":"Celebrazione"}]' where id=e;
    raise exception 'TEST FAILED: invited part removed';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  begin
    update event_invitations set response_status='declined' where id=i;
    raise exception 'TEST FAILED: legacy bulk erased answers';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  perform set_config('app.part_response_token','',true);
  update event_invitations set part_responses='[{"id":"mass","response":"maybe"}]',response_source='admin',response_recorded_by_profile_id='00000000-0000-4000-8000-000000000071' where id=i;
  select * into r from event_invitations where id=i;
  assert r.response_status='maybe', 'admin wins';
  assert exists(select 1 from invitation_responses where invitation_id=i and source='admin'), 'admin history';
  begin
    perform record_public_part_responses('test-composite-hash','[{"id":"mass","response":"declined"},{"id":"reception","response":"attending"}]');
    raise exception 'TEST FAILED: uninvited part accepted';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
  assert record_public_part_responses('test-composite-hash','[{"id":"mass","response":"declined"}]'), 'only selected part answered';
  update invitation_response_tokens set revoked_at=now() where id=token_id;
  assert not record_public_part_responses('test-composite-hash','[{"id":"mass","response":"attending"}]'), 'revoked token rejected';
  assert not has_function_privilege('anon','record_public_part_responses(text,jsonb)','execute'), 'anonymous RPC blocked';
  assert not has_function_privilege('authenticated','record_public_part_responses(text,jsonb)','execute'), 'authenticated direct RPC blocked';
end $$;
set local role authenticated;
do $$ begin assert (select count(*) from events)=1, 'manager sees event'; assert (select count(*) from invitation_responses)>0, 'manager sees history'; end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000072',true);
set local role authenticated;
do $$ begin assert (select count(*) from events)=0, 'unassigned reference cannot read event'; assert (select count(*) from invitation_responses)=0, 'reference cannot read response history'; end $$;
reset role;
set local role anon;
do $$ begin assert (select count(*) from events)=0, 'anon cannot read events'; assert (select count(*) from invitation_responses)=0, 'anon cannot read responses'; end $$;
reset role;
rollback;
