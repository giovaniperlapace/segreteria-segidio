-- Composite event definitions and invitation-specific selection/responses.
-- Additive: existing events/invitations retain their original behavior.
begin;
alter table public.events add column if not exists parts jsonb not null default '[]'::jsonb;
alter table public.event_invitations add column if not exists part_responses jsonb not null default '[]'::jsonb;
alter table public.invitation_responses add column if not exists part_responses jsonb not null default '[]'::jsonb;

create or replace function public.validate_event_parts() returns trigger
language plpgsql set search_path = public as $$
declare part_item jsonb;
begin
  if jsonb_typeof(new.parts) <> 'array' or jsonb_array_length(new.parts) > 5 then raise exception 'Sono consentite al massimo cinque parti'; end if;
  for part_item in select * from jsonb_array_elements(new.parts) loop
    if coalesce(part_item->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$' or length(trim(coalesce(part_item->>'title',''))) not between 1 and 200 then raise exception 'Nome parte non valido'; end if;
  end loop;
  if (select count(distinct p->>'id') from jsonb_array_elements(new.parts) p) <> jsonb_array_length(new.parts)
    or (select count(distinct lower(trim(p->>'title'))) from jsonb_array_elements(new.parts) p) <> jsonb_array_length(new.parts) then raise exception 'Le parti devono essere diverse'; end if;
  if tg_op = 'UPDATE' and new.parts is distinct from old.parts then
    if jsonb_array_length(old.parts) = 0 and jsonb_array_length(new.parts) > 0 and exists(select 1 from event_invitations where event_id = old.id) then
      raise exception 'Crea un nuovo evento composito: questo evento ha già inviti';
    end if;
    if exists(select 1 from event_invitations i cross join lateral jsonb_array_elements(i.part_responses) r where i.event_id = old.id and not exists(select 1 from jsonb_array_elements(new.parts) p where p->>'id' = r->>'id')) then
      raise exception 'Non puoi rimuovere una parte già inclusa negli inviti';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists validate_event_parts on public.events;
create trigger validate_event_parts before insert or update of parts on public.events for each row execute function public.validate_event_parts();

create or replace function public.validate_invitation_parts() returns trigger
language plpgsql set search_path = public as $$
declare definitions jsonb; response_item jsonb;
begin
  select parts into definitions from events where id = new.event_id for share;
  if jsonb_array_length(definitions) = 0 then
    if new.part_responses <> '[]'::jsonb then raise exception 'Questo evento non ha parti'; end if;
    return new;
  end if;
  if tg_op = 'INSERT' and new.part_responses = '[]'::jsonb then
    select jsonb_agg(jsonb_build_object('id', p->>'id', 'response', 'no_response')) into new.part_responses from jsonb_array_elements(definitions) p;
  end if;
  if jsonb_typeof(new.part_responses) <> 'array' or jsonb_array_length(new.part_responses) not between 1 and jsonb_array_length(definitions) then raise exception 'Seleziona almeno una parte'; end if;
  if (select count(distinct r->>'id') from jsonb_array_elements(new.part_responses) r) <> jsonb_array_length(new.part_responses) then raise exception 'Parti duplicate'; end if;
  for response_item in select * from jsonb_array_elements(new.part_responses) loop
    if not exists(select 1 from jsonb_array_elements(definitions) p where p->>'id' = response_item->>'id') or coalesce(response_item->>'response','') not in ('no_response','attending','declined','maybe','delegated') then raise exception 'Parte o risposta non valida'; end if;
    if response_item->>'response' = 'delegated' and (length(trim(coalesce(response_item->>'firstName',''))) not between 1 and 200 or length(trim(coalesce(response_item->>'lastName',''))) not between 1 and 200 or length(coalesce(response_item->>'email','')) > 320 or coalesce(response_item->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(coalesce(response_item->>'role','')) > 200) then raise exception 'Dati delegato non validi'; end if;
  end loop;
  -- Do not silently erase part-specific answers through the legacy bulk editor.
  if tg_op = 'UPDATE' and new.invitation_status = 'invited' and new.part_responses = old.part_responses and (new.response_status is distinct from old.response_status or new.delegate_email is distinct from old.delegate_email) then raise exception 'Per un evento composito modifica le risposte delle singole parti'; end if;
  if new.invitation_status <> 'invited' then
    select jsonb_agg(jsonb_build_object('id', r->>'id', 'response', 'no_response')) into new.part_responses from jsonb_array_elements(new.part_responses) r;
  end if;
  -- Overall status means expected at at least one part; no summing across parts.
  new.response_status := case
    when exists(select 1 from jsonb_array_elements(new.part_responses) r where r->>'response' in ('attending','delegated')) then 'attending'::public.response_status
    when exists(select 1 from jsonb_array_elements(new.part_responses) r where r->>'response' = 'no_response') then 'no_response'::public.response_status
    when exists(select 1 from jsonb_array_elements(new.part_responses) r where r->>'response' = 'maybe') then 'maybe'::public.response_status
    else 'declined'::public.response_status end;
  new.delegate_first_name := null; new.delegate_last_name := null; new.delegate_email := null; new.delegate_role := null;
  new.companion_count := 0; new.companion_names := null;
  return new;
end $$;
drop trigger if exists validate_invitation_parts on public.event_invitations;
create trigger validate_invitation_parts before insert or update on public.event_invitations for each row execute function public.validate_invitation_parts();

-- Atomic snapshot of each change, protected by existing invitation_responses RLS.
create or replace function public.record_invitation_parts_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.part_responses is distinct from old.part_responses then
    insert into invitation_responses(invitation_id,event_id,contact_id,response_status,previous_response_status,source,actor_profile_id,response_token_id,response_note,part_responses)
    values(new.id,new.event_id,new.contact_id,new.response_status,old.response_status,case when nullif(current_setting('app.part_response_token', true),'') is not null then 'public_link'::public.invitation_response_source else 'admin'::public.invitation_response_source end,coalesce(new.response_recorded_by_profile_id,new.updated_by_profile_id,auth.uid()),nullif(current_setting('app.part_response_token',true),'')::bigint,new.response_note,
      (select jsonb_agg(r || jsonb_build_object('title',p->>'title')) from jsonb_array_elements(new.part_responses) r join events e on e.id=new.event_id cross join lateral jsonb_array_elements(e.parts) p where p->>'id'=r->>'id'));
  end if;
  return new;
end $$;
drop trigger if exists record_invitation_parts_history on public.event_invitations;
create trigger record_invitation_parts_history after update on public.event_invitations for each row execute function public.record_invitation_parts_history();
revoke all on function public.validate_event_parts(), public.validate_invitation_parts(), public.record_invitation_parts_history() from public;
create or replace function public.record_public_part_responses(p_token_hash text, p_responses jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare t invitation_response_tokens; i event_invitations;
begin
  select * into t from invitation_response_tokens where token_hash=p_token_hash for update;
  if not found or t.revoked_at is not null or t.expires_at < now() then return false; end if;
  select * into i from event_invitations where id=t.invitation_id and event_id=t.event_id and contact_id=t.contact_id for update;
  if not found or i.invitation_status='excluded' then return false; end if;
  if jsonb_array_length(p_responses) <> jsonb_array_length(i.part_responses)
    or exists(select 1 from jsonb_array_elements(i.part_responses) r where not exists(select 1 from jsonb_array_elements(p_responses) p where p->>'id'=r->>'id'))
    or exists(select 1 from jsonb_array_elements(p_responses) p where coalesce(p->>'response','no_response')='no_response') then raise exception 'Rispondi a tutte e sole le parti invitate'; end if;
  perform set_config('app.part_response_token',t.id::text,true);
  update event_invitations set part_responses=p_responses, invitation_status='invited', response_source='public_link', response_recorded_at=now(), response_recorded_by_profile_id=null, updated_by_profile_id=null, invited_at=coalesce(invited_at,now()), response_note=null where id=i.id;
  update invitation_response_tokens set used_at=coalesce(used_at,now()),last_response_at=now() where id=t.id;
  return true;
end $$;
revoke all on function public.record_public_part_responses(text,jsonb) from public,anon,authenticated;
grant execute on function public.record_public_part_responses(text,jsonb) to service_role;
create or replace function public.event_part_counts(p_event_id bigint)
returns table(id text,title text,invited bigint,attending bigint,declined bigint,maybe bigint,no_response bigint,delegated bigint)
language sql stable set search_path = public as $$
select p->>'id',p->>'title',count(r),
count(r) filter(where r->>'response' in ('attending','delegated')),
count(r) filter(where r->>'response'='declined'),
count(r) filter(where r->>'response'='maybe'),
count(r) filter(where r->>'response'='no_response'),
count(r) filter(where r->>'response'='delegated')
from events e cross join lateral jsonb_array_elements(e.parts) with ordinality as part(p,ord)
left join event_invitations i on i.event_id=e.id and i.invitation_status <> 'excluded'
left join lateral (select value as r from jsonb_array_elements(i.part_responses) where value->>'id'=p->>'id') matched on true
where e.id=p_event_id group by p,ord order by ord;
$$;
revoke all on function public.event_part_counts(bigint) from public,anon;
grant execute on function public.event_part_counts(bigint) to authenticated,service_role;
notify pgrst, 'reload schema';
commit;
