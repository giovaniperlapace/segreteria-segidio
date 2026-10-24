-- Immutable, recipient-specific JPG snapshot. Existing log RLS continues to apply.
alter table public.email_logs add column personalized_badge jsonb;
alter table public.email_logs add constraint email_logs_badge_valid check (
  personalized_badge is null or (
    jsonb_typeof(personalized_badge) = 'object'
    and personalized_badge ?& array['file_name','content_type','content_base64','file_size_bytes']
    and jsonb_typeof(personalized_badge->'file_name') = 'string'
    and jsonb_typeof(personalized_badge->'content_base64') = 'string'
    and jsonb_typeof(personalized_badge->'file_size_bytes') = 'number'
    and personalized_badge->>'content_type' = 'image/jpeg'
    and (personalized_badge->>'file_size_bytes')::integer between 1 and 6291456
    and length(personalized_badge->>'content_base64') <= 8388608
  )
);
comment on column public.email_logs.personalized_badge is 'Validated recipient badge snapshot, reused for delivery, retry and sent archive reconstruction.';
notify pgrst, 'reload schema';
