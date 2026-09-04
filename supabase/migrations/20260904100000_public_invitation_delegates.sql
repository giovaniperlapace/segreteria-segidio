-- Store event-only delegate details for public invitation responses.

alter table public.event_invitations
  add column if not exists delegate_first_name text,
  add column if not exists delegate_last_name text,
  add column if not exists delegate_email text;

alter table public.invitation_responses
  add column if not exists delegate_first_name text,
  add column if not exists delegate_last_name text,
  add column if not exists delegate_email text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_invitations_delegate_complete'
      and conrelid = 'public.event_invitations'::regclass
  ) then
    alter table public.event_invitations
      add constraint event_invitations_delegate_complete check (
        (delegate_first_name is null and delegate_last_name is null and delegate_email is null)
        or
        (
          response_status = 'declined'
          and delegate_first_name is not null
          and delegate_last_name is not null
          and delegate_email is not null
          and length(trim(delegate_first_name)) between 1 and 200
          and length(trim(delegate_last_name)) between 1 and 200
          and length(trim(delegate_email)) between 3 and 320
          and delegate_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'invitation_responses_delegate_complete'
      and conrelid = 'public.invitation_responses'::regclass
  ) then
    alter table public.invitation_responses
      add constraint invitation_responses_delegate_complete check (
        (delegate_first_name is null and delegate_last_name is null and delegate_email is null)
        or
        (
          response_status = 'declined'
          and delegate_first_name is not null
          and delegate_last_name is not null
          and delegate_email is not null
          and length(trim(delegate_first_name)) between 1 and 200
          and length(trim(delegate_last_name)) between 1 and 200
          and length(trim(delegate_email)) between 3 and 320
          and delegate_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        )
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
          when ei.response_status = 'declined' and ei.delegate_email is not null
            then 1
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
          when ei.invitation_status = 'invited'
            and ei.response_status = 'declined'
            and ei.delegate_email is not null
            then 1
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

comment on column public.event_invitations.delegate_first_name is
  'First name of the event-only delegate attending instead of the invited contact.';
comment on column public.event_invitations.delegate_last_name is
  'Last name of the event-only delegate attending instead of the invited contact.';
comment on column public.event_invitations.delegate_email is
  'Email of the event-only delegate; this person is not added to the contacts archive.';
comment on column public.invitation_responses.delegate_first_name is
  'Historical snapshot of the event-only delegate first name.';
comment on column public.invitation_responses.delegate_last_name is
  'Historical snapshot of the event-only delegate last name.';
comment on column public.invitation_responses.delegate_email is
  'Historical snapshot of the event-only delegate email.';

notify pgrst, 'reload schema';
