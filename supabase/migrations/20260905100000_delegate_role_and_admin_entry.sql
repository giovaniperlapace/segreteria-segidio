-- Add an optional event-only role/title for delegates entered publicly or by an admin.

alter table public.event_invitations
  add column if not exists delegate_role text;

alter table public.invitation_responses
  add column if not exists delegate_role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_invitations_delegate_role_valid'
      and conrelid = 'public.event_invitations'::regclass
  ) then
    alter table public.event_invitations
      add constraint event_invitations_delegate_role_valid check (
        delegate_role is null
        or (
          delegate_email is not null
          and length(trim(delegate_role)) between 1 and 200
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'invitation_responses_delegate_role_valid'
      and conrelid = 'public.invitation_responses'::regclass
  ) then
    alter table public.invitation_responses
      add constraint invitation_responses_delegate_role_valid check (
        delegate_role is null
        or (
          delegate_email is not null
          and length(trim(delegate_role)) between 1 and 200
        )
      );
  end if;
end
$$;

comment on column public.event_invitations.delegate_role is
  'Optional role or title of the event-only delegate; this person is not added to contacts.';
comment on column public.invitation_responses.delegate_role is
  'Historical snapshot of the optional event-only delegate role or title.';

notify pgrst, 'reload schema';
