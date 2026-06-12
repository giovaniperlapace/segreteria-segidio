create extension if not exists pg_trgm;

create index if not exists contacts_operational_status_name_idx
  on public.contacts (status, lower(last_name), lower(first_name), id)
  where deleted_at is null;

create index if not exists contacts_operational_created_at_idx
  on public.contacts (created_at, id)
  where deleted_at is null;

create index if not exists contacts_operational_updated_at_idx
  on public.contacts (updated_at, id)
  where deleted_at is null;

create index if not exists contacts_operational_search_trgm_idx
  on public.contacts
  using gin (
    lower(
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(institution, '') || ' ' ||
      coalesce(institutional_role, '') || ' ' ||
      coalesce(email::text, '') || ' ' ||
      coalesce(email_2::text, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(country, '')
    ) gin_trgm_ops
  )
  where deleted_at is null;

create index if not exists event_invitations_event_response_attendance_contact_idx
  on public.event_invitations (event_id, response_status, attendance_status, contact_id);

create index if not exists event_invitations_event_contact_status_idx
  on public.event_invitations (event_id, contact_id, response_status, attendance_status);

create index if not exists invitation_proposals_event_contact_status_idx
  on public.invitation_proposals (event_id, contact_id, status);

create index if not exists events_search_trgm_idx
  on public.events
  using gin (
    lower(
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(location, '')
    ) gin_trgm_ops
  );

create or replace function public.search_contacts_page(
  p_search text default '',
  p_status text default 'active',
  p_match text default 'and',
  p_priority text default 'all',
  p_group_ids bigint[] default '{}'::bigint[],
  p_reference_id bigint default null,
  p_missing text default 'all',
  p_created_from date default null,
  p_created_to date default null,
  p_updated_from date default null,
  p_updated_to date default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(contact jsonb, total_count bigint)
language sql
stable
as $$
  with normalized as (
    select
      nullif(lower(trim(coalesce(p_search, ''))), '') as search_term,
      case when p_status in ('active', 'standby', 'all') then p_status else 'active' end as status_filter,
      case when p_match = 'or' then 'or' else 'and' end as match_filter,
      case
        when p_priority in ('standard', 'important', 'critical') then p_priority
        else 'all'
      end as priority_filter,
      coalesce(p_group_ids, '{}'::bigint[]) as group_ids,
      p_reference_id as reference_id,
      case when p_missing in ('yes', 'no') then p_missing else 'all' end as missing_filter,
      greatest(1, least(coalesce(p_limit, 100), 200)) as page_limit,
      greatest(0, coalesce(p_offset, 0)) as page_offset
  ),
  decorated as (
    select
      c.*,
      coalesce(m.missing_fields, '{}'::text[]) as missing_fields,
      n.*,
      (
        lower(
          coalesce(c.first_name, '') || ' ' ||
          coalesce(c.last_name, '') || ' ' ||
          coalesce(c.institution, '') || ' ' ||
          coalesce(c.institutional_role, '') || ' ' ||
          coalesce(c.email::text, '') || ' ' ||
          coalesce(c.email_2::text, '') || ' ' ||
          coalesce(c.city, '') || ' ' ||
          coalesce(c.country, '')
        )
      ) as search_blob
    from public.contacts c
    cross join normalized n
    left join public.contacts_missing_required_data m on m.id = c.id
    where c.deleted_at is null
  ),
  evaluated as (
    select
      d.*,
      (
        case when d.search_term is not null then 1 else 0 end +
        case when d.status_filter = 'standby' then 1 else 0 end +
        case when d.priority_filter <> 'all' then 1 else 0 end +
        case when cardinality(d.group_ids) > 0 then 1 else 0 end +
        case when d.reference_id is not null and d.reference_id > 0 then 1 else 0 end +
        case when d.missing_filter <> 'all' then 1 else 0 end +
        case when p_created_from is not null or p_created_to is not null then 1 else 0 end +
        case when p_updated_from is not null or p_updated_to is not null then 1 else 0 end
      ) as active_criteria,
      (
        case when d.search_term is not null and d.search_blob like '%' || d.search_term || '%' then 1 else 0 end +
        case when d.status_filter = 'standby' and d.status::text = 'standby' then 1 else 0 end +
        case when d.priority_filter <> 'all' and d.priority::text = d.priority_filter then 1 else 0 end +
        case
          when cardinality(d.group_ids) > 0 and exists (
            select 1
            from public.contact_groups cg
            where cg.contact_id = d.id
              and cg.group_id = any(d.group_ids)
          ) then 1 else 0
        end +
        case
          when d.reference_id is not null and d.reference_id > 0 and exists (
            select 1
            from public.contact_references cr
            where cr.contact_id = d.id
              and cr.reference_id = d.reference_id
          ) then 1 else 0
        end +
        case
          when d.missing_filter = 'yes' and cardinality(d.missing_fields) > 0 then 1
          when d.missing_filter = 'no' and cardinality(d.missing_fields) = 0 then 1
          else 0
        end +
        case
          when (p_created_from is not null or p_created_to is not null)
            and (p_created_from is null or d.created_at >= p_created_from::timestamptz)
            and (p_created_to is null or d.created_at < (p_created_to + 1)::timestamptz)
          then 1 else 0
        end +
        case
          when (p_updated_from is not null or p_updated_to is not null)
            and (p_updated_from is null or d.updated_at >= p_updated_from::timestamptz)
            and (p_updated_to is null or d.updated_at < (p_updated_to + 1)::timestamptz)
          then 1 else 0
        end
      ) as matching_criteria
    from decorated d
  ),
  filtered as (
    select *
    from evaluated e
    where
      (e.status_filter <> 'active' or e.status::text = 'active')
      and (
        e.active_criteria = 0
        or (e.match_filter = 'or' and e.matching_criteria > 0)
        or (e.match_filter = 'and' and e.matching_criteria = e.active_criteria)
      )
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
    order by lower(last_name) asc nulls last, lower(first_name) asc nulls last, id asc
    limit (select page_limit from normalized)
    offset (select page_offset from normalized)
  )
  select
    to_jsonb(c)
      - 'search_term'
      - 'status_filter'
      - 'match_filter'
      - 'priority_filter'
      - 'group_ids'
      - 'reference_id'
      - 'missing_filter'
      - 'page_limit'
      - 'page_offset'
      - 'missing_fields'
      - 'search_blob'
      - 'active_criteria'
      - 'matching_criteria'
      - 'total_rows'
      || jsonb_build_object(
        'group_ids', coalesce((
          select jsonb_agg(cg.group_id order by cg.group_id)
          from public.contact_groups cg
          where cg.contact_id = c.id
        ), '[]'::jsonb),
        'reference_ids', coalesce((
          select jsonb_agg(cr.reference_id order by cr.reference_id)
          from public.contact_references cr
          where cr.contact_id = c.id
        ), '[]'::jsonb),
        'missing_fields', to_jsonb(c.missing_fields),
        'event_history', '[]'::jsonb
      ) as contact,
    c.total_rows as total_count
  from counted c;
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
    count(*) filter (where ei.response_status = 'attending') as attending_count,
    count(*) filter (where ei.attendance_status = 'attended') as attended_count,
    count(*) filter (where ei.attention_flag) as attention_count
  from public.event_invitations ei
  where ei.event_id = any(coalesce(p_event_ids, '{}'::bigint[]))
  group by ei.event_id;
$$;

create or replace function public.event_candidate_contacts_page(
  p_event_id bigint,
  p_search text default '',
  p_status text default 'active',
  p_match text default 'and',
  p_priority text default 'all',
  p_missing text default 'all',
  p_group_ids bigint[] default '{}'::bigint[],
  p_reference_ids bigint[] default '{}'::bigint[],
  p_past_event_ids bigint[] default '{}'::bigint[],
  p_past_response text default 'all',
  p_past_attendance text default 'all',
  p_limit integer default 80,
  p_offset integer default 0
)
returns table(candidate jsonb, total_count bigint)
language sql
stable
as $$
  with normalized as (
    select
      nullif(lower(trim(coalesce(p_search, ''))), '') as search_term,
      case when p_status in ('active', 'standby', 'all') then p_status else 'active' end as status_filter,
      case when p_match = 'or' then 'or' else 'and' end as match_filter,
      case
        when p_priority in ('standard', 'important', 'critical') then p_priority
        else 'all'
      end as priority_filter,
      case when p_missing in ('yes', 'no') then p_missing else 'all' end as missing_filter,
      coalesce(p_group_ids, '{}'::bigint[]) as group_ids,
      coalesce(p_reference_ids, '{}'::bigint[]) as reference_ids,
      coalesce(p_past_event_ids, '{}'::bigint[]) as past_event_ids,
      case
        when p_past_response in ('no_response', 'attending', 'declined', 'maybe') then p_past_response
        else 'all'
      end as past_response,
      case
        when p_past_attendance in ('unknown', 'attended', 'absent') then p_past_attendance
        else 'all'
      end as past_attendance,
      greatest(1, least(coalesce(p_limit, 80), 200)) as page_limit,
      greatest(0, coalesce(p_offset, 0)) as page_offset
  ),
  decorated as (
    select
      c.id,
      c.first_name,
      c.last_name,
      c.institution,
      c.institutional_role,
      c.email,
      c.email_2,
      c.status,
      c.priority,
      coalesce(m.missing_fields, '{}'::text[]) as missing_fields,
      n.*,
      lower(
        coalesce(c.first_name, '') || ' ' ||
        coalesce(c.last_name, '') || ' ' ||
        coalesce(c.institution, '') || ' ' ||
        coalesce(c.institutional_role, '') || ' ' ||
        coalesce(c.email::text, '') || ' ' ||
        coalesce(c.email_2::text, '')
      ) as search_blob
    from public.contacts c
    cross join normalized n
    left join public.contacts_missing_required_data m on m.id = c.id
    where c.deleted_at is null
      and not exists (
        select 1
        from public.event_invitations ei
        where ei.event_id = p_event_id
          and ei.contact_id = c.id
      )
  ),
  evaluated as (
    select
      d.*,
      (
        case when d.search_term is not null then 1 else 0 end +
        case when d.status_filter = 'standby' then 1 else 0 end +
        case when d.priority_filter <> 'all' then 1 else 0 end +
        case when d.missing_filter <> 'all' then 1 else 0 end +
        case when cardinality(d.group_ids) > 0 then 1 else 0 end +
        case when cardinality(d.reference_ids) > 0 then 1 else 0 end +
        case when cardinality(d.past_event_ids) > 0 then 1 else 0 end
      ) as active_criteria,
      (
        case when d.search_term is not null and d.search_blob like '%' || d.search_term || '%' then 1 else 0 end +
        case when d.status_filter = 'standby' and d.status::text = 'standby' then 1 else 0 end +
        case when d.priority_filter <> 'all' and d.priority::text = d.priority_filter then 1 else 0 end +
        case
          when d.missing_filter = 'yes' and cardinality(d.missing_fields) > 0 then 1
          when d.missing_filter = 'no' and cardinality(d.missing_fields) = 0 then 1
          else 0
        end +
        case
          when cardinality(d.group_ids) > 0 and exists (
            select 1
            from public.contact_groups cg
            where cg.contact_id = d.id
              and cg.group_id = any(d.group_ids)
          ) then 1 else 0
        end +
        case
          when cardinality(d.reference_ids) > 0 and exists (
            select 1
            from public.contact_references cr
            where cr.contact_id = d.id
              and cr.reference_id = any(d.reference_ids)
          ) then 1 else 0
        end +
        case
          when cardinality(d.past_event_ids) > 0 and exists (
            select 1
            from public.event_invitations pei
            where pei.contact_id = d.id
              and pei.event_id = any(d.past_event_ids)
              and (d.past_response = 'all' or pei.response_status::text = d.past_response)
              and (d.past_attendance = 'all' or pei.attendance_status::text = d.past_attendance)
          ) then 1 else 0
        end
      ) as matching_criteria
    from decorated d
  ),
  filtered as (
    select *
    from evaluated e
    where
      (e.status_filter <> 'active' or e.status::text = 'active')
      and (
        e.active_criteria = 0
        or (e.match_filter = 'or' and e.matching_criteria > 0)
        or (e.match_filter = 'and' and e.matching_criteria = e.active_criteria)
      )
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
    order by lower(coalesce(last_name, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(institution, '')), id
    limit (select page_limit from normalized)
    offset (select page_offset from normalized)
  )
  select
    jsonb_build_object(
      'id', c.id,
      'name', coalesce(nullif(trim(c.first_name || ' ' || c.last_name), ''), nullif(c.institution, ''), 'Contatto senza nome'),
      'detail', array_to_string(array_remove(array[c.institutional_role, c.institution], null), ' · '),
      'email', coalesce(c.email::text, c.email_2::text),
      'status', c.status,
      'priority', c.priority,
      'groups', coalesce((
        select jsonb_agg(g.name order by g.name)
        from public.contact_groups cg
        join public.groups g on g.id = cg.group_id
        where cg.contact_id = c.id
      ), '[]'::jsonb),
      'references', coalesce((
        select jsonb_agg(ir.full_name order by ir.full_name)
        from public.contact_references cr
        join public.internal_references ir on ir.id = cr.reference_id
        where cr.contact_id = c.id
      ), '[]'::jsonb),
      'missingFields', to_jsonb(c.missing_fields),
      'proposalSummary', (
        select nullif(string_agg(coalesce(ir.full_name, 'Referente') || ': ' || ip.status::text, '; ' order by ir.full_name), '')
        from public.invitation_proposals ip
        left join public.internal_references ir on ir.id = ip.reference_id
        where ip.event_id = p_event_id
          and ip.contact_id = c.id
      )
    ) as candidate,
    c.total_rows as total_count
  from counted c;
$$;

grant execute on function public.search_contacts_page(
  text, text, text, text, bigint[], bigint, text, date, date, date, date, integer, integer
) to authenticated;

grant execute on function public.event_invitation_counts(bigint[]) to authenticated;

grant execute on function public.event_candidate_contacts_page(
  bigint, text, text, text, text, text, bigint[], bigint[], bigint[], text, text, integer, integer
) to authenticated;
