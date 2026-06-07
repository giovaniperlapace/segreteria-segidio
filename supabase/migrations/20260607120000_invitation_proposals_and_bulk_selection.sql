-- Milestone 10: keep reference approvals separate from effective event invitations.

create type public.invitation_proposal_status as enum (
  'pending',
  'approved',
  'excluded'
);

create table public.invitation_proposals (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events (id) on delete cascade,
  contact_id bigint not null references public.contacts (id) on delete cascade,
  reference_id bigint not null references public.internal_references (id) on delete cascade,
  status public.invitation_proposal_status not null default 'pending',
  manager_note text,
  decision_note text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  decided_by_profile_id uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitation_proposals_event_contact_reference_unique
    unique (event_id, contact_id, reference_id),
  constraint invitation_proposals_manager_note_not_blank check (
    manager_note is null or length(trim(manager_note)) > 0
  ),
  constraint invitation_proposals_decision_note_not_blank check (
    decision_note is null or length(trim(decision_note)) > 0
  ),
  constraint invitation_proposals_decision_consistent check (
    (status = 'pending' and decided_at is null and decided_by_profile_id is null)
    or (status <> 'pending' and decided_at is not null and decided_by_profile_id is not null)
  )
);

create index invitation_proposals_event_status_idx
  on public.invitation_proposals (event_id, status);
create index invitation_proposals_reference_status_idx
  on public.invitation_proposals (reference_id, status);
create index invitation_proposals_contact_id_idx
  on public.invitation_proposals (contact_id);

create trigger invitation_proposals_set_updated_at
before update on public.invitation_proposals
for each row execute function public.set_updated_at();

create or replace function public.protect_invitation_proposal_reference_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.is_manager() then
    return new;
  end if;

  if old.reference_id <> public.current_internal_reference_id()
    or old.status <> 'pending'
    or new.status not in ('approved', 'excluded')
    or new.event_id <> old.event_id
    or new.contact_id <> old.contact_id
    or new.reference_id <> old.reference_id
    or new.manager_note is distinct from old.manager_note
    or new.created_by_profile_id is distinct from old.created_by_profile_id
    or new.created_at <> old.created_at
    or new.decided_by_profile_id <> auth.uid()
    or new.decided_at is null
  then
    raise exception 'INVALID_REFERENCE_PROPOSAL_UPDATE';
  end if;

  return new;
end;
$$;

create trigger invitation_proposals_protect_reference_update
before update on public.invitation_proposals
for each row execute function public.protect_invitation_proposal_reference_update();

create trigger invitation_proposals_audit
after insert or update or delete on public.invitation_proposals
for each row execute function public.record_audit_log();

alter table public.invitation_proposals enable row level security;

create policy invitation_proposals_select_access on public.invitation_proposals
for select to authenticated
using (
  (select public.is_manager())
  or reference_id = (select public.current_internal_reference_id())
);

create policy invitation_proposals_manager_insert on public.invitation_proposals
for insert to authenticated
with check ((select public.is_manager()));

create policy invitation_proposals_manager_update on public.invitation_proposals
for update to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

create policy invitation_proposals_reference_update on public.invitation_proposals
for update to authenticated
using (
  reference_id = (select public.current_internal_reference_id())
  and status = 'pending'
)
with check (
  reference_id = (select public.current_internal_reference_id())
  and status in ('approved', 'excluded')
  and decided_by_profile_id = (select auth.uid())
  and decided_at is not null
);

create policy invitation_proposals_manager_delete on public.invitation_proposals
for delete to authenticated
using ((select public.is_manager()));

grant select, insert, update, delete on public.invitation_proposals to authenticated;
grant usage, select on sequence public.invitation_proposals_id_seq to authenticated;

create or replace function public.can_access_event(target_event_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(public.is_manager(), false)
    or exists (
      select 1
      from public.event_invitations ei
      join public.contact_references cr on cr.contact_id = ei.contact_id
      where ei.event_id = target_event_id
        and cr.reference_id = public.current_internal_reference_id()
    )
    or exists (
      select 1
      from public.invitation_proposals ip
      where ip.event_id = target_event_id
        and ip.reference_id = public.current_internal_reference_id()
    );
$$;

comment on table public.invitation_proposals is
  'Reference-specific candidates awaiting approval. Rows do not count as effective event invitations.';
