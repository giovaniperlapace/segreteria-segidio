create or replace view public.contacts_missing_required_data
with (security_invoker = true)
as
select *
from (
  select
    c.id,
    c.first_name,
    c.last_name,
    c.institution,
    c.institutional_role,
    c.email,
    c.phone,
    c.status,
    c.priority,
    array_remove(array[
      case when length(trim(c.first_name)) = 0 and length(trim(c.last_name)) = 0 then 'name' end,
      case
        when c.email is null and c.email_2 is null then 'email'
      end,
      case when c.institutional_role is null or length(trim(c.institutional_role)) = 0 then 'institutional_role' end,
      case when c.institution is null or length(trim(c.institution)) = 0 then 'institution' end
    ], null) as missing_fields
  from public.contacts c
  where c.status = 'active'
) missing
where cardinality(missing.missing_fields) > 0;

grant select on public.contacts_missing_required_data to authenticated;
