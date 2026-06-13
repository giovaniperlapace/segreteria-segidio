-- Milestone 11 extension: companions for single manual invitation responses.

alter table public.event_invitations
  add column if not exists companion_count integer not null default 0,
  add column if not exists companion_names text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_invitations_companion_count_range'
      and conrelid = 'public.event_invitations'::regclass
  ) then
    alter table public.event_invitations
      add constraint event_invitations_companion_count_range check (
        companion_count >= 0 and companion_count <= 20
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_invitations_companion_names_not_blank'
      and conrelid = 'public.event_invitations'::regclass
  ) then
    alter table public.event_invitations
      add constraint event_invitations_companion_names_not_blank check (
        companion_names is null or length(trim(companion_names)) > 0
      );
  end if;
end
$$;

create or replace function public.event_invitation_counts(p_event_ids bigint[])
returns table(
  event_id bigint,
  invitation_count bigint,
  attending_count bigint,
  attended_count bigint,
  attention_count bigint
)
language sql
stable
as $$
  select
    ei.event_id,
    count(*) as invitation_count,
    coalesce(
      sum(
        case
          when ei.response_status = 'attending'
            then 1 + greatest(coalesce(ei.companion_count, 0), 0)
          else 0
        end
      ),
      0
    )::bigint as attending_count,
    count(*) filter (where ei.attendance_status = 'attended') as attended_count,
    count(*) filter (where ei.attention_flag) as attention_count
  from public.event_invitations ei
  where ei.event_id = any(coalesce(p_event_ids, '{}'::bigint[]))
  group by ei.event_id;
$$;

create or replace function public.event_invitation_response_counts(p_event_id bigint)
returns table (
  total_count bigint,
  selected_count bigint,
  invited_count bigint,
  no_response_count bigint,
  attending_count bigint,
  declined_count bigint,
  maybe_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    count(*) as total_count,
    count(*) filter (where ei.invitation_status = 'selected') as selected_count,
    count(*) filter (where ei.invitation_status = 'invited') as invited_count,
    count(*) filter (
      where ei.invitation_status = 'invited' and ei.response_status = 'no_response'
    ) as no_response_count,
    coalesce(
      sum(
        case
          when ei.invitation_status = 'invited' and ei.response_status = 'attending'
            then 1 + greatest(coalesce(ei.companion_count, 0), 0)
          else 0
        end
      ),
      0
    )::bigint as attending_count,
    count(*) filter (
      where ei.invitation_status = 'invited' and ei.response_status = 'declined'
    ) as declined_count,
    count(*) filter (
      where ei.invitation_status = 'invited' and ei.response_status = 'maybe'
    ) as maybe_count
  from public.event_invitations ei
  where ei.event_id = p_event_id;
$$;

grant execute on function public.event_invitation_response_counts(bigint) to authenticated;

comment on column public.event_invitations.companion_count is
  'Number of companions attached to a manually recorded attending response.';
comment on column public.event_invitations.companion_names is
  'Optional names or notes identifying companions for a manually recorded attending response.';
