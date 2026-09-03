alter table public.email_batches
  add column if not exists include_public_response_link boolean not null default true;

comment on column public.email_batches.include_public_response_link is
  'When true, invitation emails in the batch include the personal public response link and HTML button.';
