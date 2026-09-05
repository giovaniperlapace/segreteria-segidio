alter table public.email_batches
  drop constraint if exists email_batches_target_kind_valid;

alter table public.email_batches
  add constraint email_batches_target_kind_valid check (
    target_kind in (
      'selected',
      'selected_rows',
      'invited_no_response',
      'participants',
      'all_invited'
    )
  );

notify pgrst, 'reload schema';
