-- Archive is independent of delivery: updating a sent log atomically queues its copy.
create table public.email_sent_archives (
  email_log_id bigint primary key references public.email_logs(id) on delete cascade,
  provider_message_id text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','archived','failed')),
  raw_message text,
  message_id text,
  original_date timestamptz,
  recovered boolean not null default false,
  mailbox text,
  mailbox_uid bigint,
  archived_at timestamptz,
  last_error text,
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index email_sent_archives_pending_idx on public.email_sent_archives(next_attempt_at) where status <> 'archived';
alter table public.email_sent_archives enable row level security;
-- Raw messages include personal response links; all access is through manager-only server actions.
revoke all on public.email_sent_archives from anon, authenticated;
grant all on public.email_sent_archives to service_role;

create function public.queue_email_sent_archive() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sent' and new.provider_message_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    insert into public.email_sent_archives(email_log_id, provider_message_id)
    values (new.id, new.provider_message_id) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.queue_email_sent_archive() from public;
create trigger email_logs_queue_archive after insert or update of status, provider_message_id on public.email_logs
for each row execute function public.queue_email_sent_archive();

create table public.email_delivery_events (
  event_key text primary key,
  provider_message_id text not null,
  recipient text not null,
  kind text not null check (kind in ('Delivered','Bounced','SpamComplaint')),
  occurred_at timestamptz not null,
  details text not null default '',
  recorded_at timestamptz not null default now()
);
create index email_delivery_events_message_idx on public.email_delivery_events(provider_message_id, occurred_at);
alter table public.email_delivery_events enable row level security;
revoke all on public.email_delivery_events from anon, authenticated;
grant all on public.email_delivery_events to service_role;
notify pgrst, 'reload schema';
