-- Milestone 16: public invitation response links and response history.

do $$
begin
  create type public.invitation_response_source as enum ('admin', 'public_link');
exception
  when duplicate_object then null;
end
$$;

alter table public.event_invitations
  add column if not exists response_source public.invitation_response_source;

create table if not exists public.invitation_response_tokens (
  id bigint generated always as identity primary key,
  invitation_id bigint not null references public.event_invitations (id) on delete cascade,
  event_id bigint not null references public.events (id) on delete cascade,
  contact_id bigint not null references public.contacts (id) on delete restrict,
  token_hash text not null unique,
  token_prefix text not null,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  used_at timestamptz,
  last_response_at timestamptz,
  constraint invitation_response_tokens_hash_not_blank check (length(trim(token_hash)) > 0),
  constraint invitation_response_tokens_prefix_not_blank check (length(trim(token_prefix)) > 0)
);

create table if not exists public.invitation_responses (
  id bigint generated always as identity primary key,
  invitation_id bigint not null references public.event_invitations (id) on delete cascade,
  event_id bigint not null references public.events (id) on delete cascade,
  contact_id bigint not null references public.contacts (id) on delete restrict,
  response_status public.response_status not null,
  source public.invitation_response_source not null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  response_token_id bigint references public.invitation_response_tokens (id) on delete set null,
  previous_response_status public.response_status,
  response_note text,
  companion_count integer not null default 0,
  companion_names text,
  recorded_at timestamptz not null default now(),
  constraint invitation_responses_note_not_blank check (
    response_note is null or length(trim(response_note)) > 0
  ),
  constraint invitation_responses_companion_count_range check (
    companion_count >= 0 and companion_count <= 20
  ),
  constraint invitation_responses_companion_names_not_blank check (
    companion_names is null or length(trim(companion_names)) > 0
  ),
  constraint invitation_responses_source_actor_valid check (
    (source = 'admin' and actor_profile_id is not null)
    or
    (source = 'public_link' and response_token_id is not null)
  )
);

alter table public.email_logs
  add column if not exists response_token_id bigint
    references public.invitation_response_tokens (id) on delete set null,
  add column if not exists response_url text;

do $$
begin
  alter table public.email_logs
    add constraint email_logs_response_url_not_blank check (
      response_url is null or length(trim(response_url)) > 0
    );
exception
  when duplicate_object then null;
end
$$;

create index if not exists invitation_response_tokens_invitation_idx
  on public.invitation_response_tokens (invitation_id, created_at desc);
create index if not exists invitation_response_tokens_event_idx
  on public.invitation_response_tokens (event_id, created_at desc);
create index if not exists invitation_response_tokens_active_hash_idx
  on public.invitation_response_tokens (token_hash)
  where revoked_at is null;
create index if not exists invitation_responses_invitation_recorded_idx
  on public.invitation_responses (invitation_id, recorded_at desc);
create index if not exists invitation_responses_event_recorded_idx
  on public.invitation_responses (event_id, recorded_at desc);
create index if not exists invitation_responses_actor_profile_idx
  on public.invitation_responses (actor_profile_id);
create index if not exists invitation_responses_token_idx
  on public.invitation_responses (response_token_id);
create index if not exists event_invitations_response_source_idx
  on public.event_invitations (event_id, response_source);
create index if not exists email_logs_response_token_idx
  on public.email_logs (response_token_id);

do $$
begin
  create trigger invitation_responses_audit
  after insert or update or delete on public.invitation_responses
  for each row execute function public.record_audit_log();
exception
  when duplicate_object then null;
end
$$;

alter table public.invitation_response_tokens enable row level security;
alter table public.invitation_responses enable row level security;

do $$
begin
  create policy invitation_response_tokens_manager_all on public.invitation_response_tokens
  for all to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy invitation_responses_manager_all on public.invitation_responses
  for all to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));
exception
  when duplicate_object then null;
end
$$;

update public.event_invitations
set response_source = 'admin'
where response_source is null
  and response_status <> 'no_response'
  and response_recorded_by_profile_id is not null;

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
    nullif(to_jsonb(new)->>'actor_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'updated_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'deleted_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'response_recorded_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'invitation_status_updated_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'selected_by_profile_id', '')::uuid,
    nullif(to_jsonb(new)->>'created_by_profile_id', '')::uuid,
    nullif(to_jsonb(old)->>'actor_profile_id', '')::uuid,
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

comment on column public.event_invitations.response_source is
  'Source of the current response value: manager/admin entry or public response link.';
comment on table public.invitation_response_tokens is
  'Bearer tokens generated for public invitation response links. The raw token is not stored here.';
comment on table public.invitation_responses is
  'Append-only history of invitation response values, recording whether each value came from an admin or public link.';
comment on column public.email_logs.response_url is
  'Public response URL included in the outgoing invitation email.';
