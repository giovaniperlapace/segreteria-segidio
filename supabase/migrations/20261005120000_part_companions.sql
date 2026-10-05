-- Accompanying guests belong to a single invited event part. No existing rows are rewritten.
begin;
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
    if response_item ? 'companionCount' and (jsonb_typeof(response_item->'companionCount') <> 'number' or (response_item->>'companionCount')::numeric not between 0 and 20 or trunc((response_item->>'companionCount')::numeric) <> (response_item->>'companionCount')::numeric) then raise exception 'Numero accompagnatori non valido'; end if;
    if response_item ? 'companionNames' and (jsonb_typeof(response_item->'companionNames') <> 'string' or length(response_item->>'companionNames') > 2000) then raise exception 'Nomi accompagnatori non validi'; end if;
  end loop;
  select jsonb_agg(case when r->>'response' = 'attending' and coalesce((r->>'companionCount')::integer,0) > 0 then r else r - 'companionCount' - 'companionNames' end)
    into new.part_responses from jsonb_array_elements(new.part_responses) r;
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
create or replace function public.event_part_counts(p_event_id bigint)
returns table(id text,title text,invited bigint,attending bigint,declined bigint,maybe bigint,no_response bigint,delegated bigint)
language sql stable set search_path = public as $$
select p->>'id',p->>'title',count(r),
coalesce(sum(case when r->>'response'='attending' then 1 + coalesce((r->>'companionCount')::integer,0) when r->>'response'='delegated' then 1 else 0 end),0)::bigint,
count(r) filter(where r->>'response'='declined'),
count(r) filter(where r->>'response'='maybe'),
count(r) filter(where r->>'response'='no_response'),
count(r) filter(where r->>'response'='delegated')
from events e cross join lateral jsonb_array_elements(e.parts) with ordinality as part(p,ord)
left join event_invitations i on i.event_id=e.id and i.invitation_status <> 'excluded'
left join lateral (select value as r from jsonb_array_elements(i.part_responses) where value->>'id'=p->>'id') matched on true
where e.id=p_event_id group by p,ord order by ord;
$$;
notify pgrst, 'reload schema';
commit;
