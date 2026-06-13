-- Milestone 11: manual invitation and response workflow metadata and counts.

alter table public.event_invitations
  add column if not exists invitation_status_updated_at timestamptz,
  add column if not exists invitation_status_updated_by_profile_id uuid
    references public.profiles (id) on delete set null,
  add column if not exists updated_by_profile_id uuid
    references public.profiles (id) on delete set null,
  add column if not exists response_note text;

alter table public.event_invitations
  add constraint event_invitations_response_note_not_blank check (
    response_note is null or length(trim(response_note)) > 0
  );

create index if not exists event_invitations_status_updated_by_profile_id_idx
  on public.event_invitations (invitation_status_updated_by_profile_id);

create index if not exists event_invitations_updated_by_profile_id_idx
  on public.event_invitations (updated_by_profile_id);

create or replace function public.record_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  changed_record_id text;
  actor_id uuid;
begin
  changed_record_id = coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id');

  if changed_record_id is null then
    changed_record_id = coalesce(
      to_jsonb(new)->>'contact_id',
      to_jsonb(old)->>'contact_id',
      'composite-key'
    );
  end if;

  actor_id = coalesce(
    nullif(current_setting('app.actor_profile_id', true), '')::uuid,
    nullif(to_jsonb(new)->>'updated_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'deleted_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'response_recorded_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'invitation_status_updated_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'selected_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'created_by_profile_id', '')::uuid,
    nullif(to_jsonb(old)->>'updated_by_profile_id', '')::uuid,
    nullif(to_jsonb(old)->>'deleted_by_profile_id', '')::uuid,
    nullif(to_jsonb(old)->>'response_recorded_by_profile_id', '')::uuid,
    nullif(to_jsonb(old)->>'invitation_status_updated_by_profile_id', '')::uuid,
    nullif(to_jsonb(old)->>'selected_by_profile_id', '')::uuid,
    nullif(to_jsonb(old)->>'created_by_profile_id', '')::uuid,
    (select auth.uid())
  );

  insert into public.audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    actor_profile_id
  )
  values (
    tg_table_name,
    changed_record_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    actor_id
  );

  return coalesce(new, old);
end;
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
    count(*) filter (
      where ei.invitation_status = 'invited' and ei.response_status = 'attending'
    ) as attending_count,
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

comment on column public.event_invitations.invitation_status_updated_at is
  'Timestamp of the latest manual invitation status change.';
comment on column public.event_invitations.invitation_status_updated_by_profile_id is
  'Profile that recorded the latest manual invitation status change.';
comment on column public.event_invitations.updated_by_profile_id is
  'Profile that performed the latest operational update on the invitation.';
comment on column public.event_invitations.response_note is
  'Optional operational note about the latest manually recorded response.';
