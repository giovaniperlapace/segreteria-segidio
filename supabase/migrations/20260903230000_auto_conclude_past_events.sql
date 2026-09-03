-- Keep event status aligned with the event end date in the Rome timezone.
-- Archived events remain archived because that is an intentional terminal state.

create extension if not exists pg_cron;

create or replace function public.enforce_past_event_concluded()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ends_at is not null
    and (new.ends_at at time zone 'Europe/Rome')::date
      < (current_timestamp at time zone 'Europe/Rome')::date
    and new.status <> 'archived'
  then
    new.status = 'concluded';
  end if;

  return new;
end;
$$;

drop trigger if exists events_enforce_past_event_concluded on public.events;
create trigger events_enforce_past_event_concluded
before insert or update of ends_at, status on public.events
for each row execute function public.enforce_past_event_concluded();

create or replace function public.conclude_past_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.events
  set
    status = 'concluded',
    updated_by_profile_id = null
  where ends_at is not null
    and (ends_at at time zone 'Europe/Rome')::date
      < (current_timestamp at time zone 'Europe/Rome')::date
    and status in ('draft', 'active');

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.conclude_past_events() from public;
revoke all on function public.enforce_past_event_concluded() from public;

-- Reconcile existing rows immediately when the migration is applied.
select public.conclude_past_events();

-- pg_cron uses GMT on this installation. Run once per day at 23:05 UTC,
-- corresponding to 00:05 CET or 01:05 CEST in Rome.
do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'conclude-past-events'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'conclude-past-events',
    '5 23 * * *',
    'select public.conclude_past_events();'
  );
end;
$$;

comment on function public.conclude_past_events() is
  'Marks draft or active events as concluded when their Rome end date is before today.';
