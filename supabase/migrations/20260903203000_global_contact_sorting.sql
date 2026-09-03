drop function if exists public.search_contacts_page(
  text,
  text,
  text,
  text,
  bigint[],
  bigint[],
  text,
  date,
  date,
  date,
  date,
  integer,
  integer
);

create or replace function public.search_contacts_page(
  p_search text default '',
  p_status text default 'active',
  p_match text default 'and',
  p_priority text default 'all',
  p_group_ids bigint[] default '{}'::bigint[],
  p_reference_ids bigint[] default '{}'::bigint[],
  p_missing text default 'all',
  p_created_from date default null,
  p_created_to date default null,
  p_updated_from date default null,
  p_updated_to date default null,
  p_limit integer default 100,
  p_offset integer default 0,
  p_sort_key text default 'lastName',
  p_sort_direction text default 'asc'
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
      coalesce(p_reference_ids, '{}'::bigint[]) as reference_ids,
      case when p_missing in ('yes', 'no') then p_missing else 'all' end as missing_filter,
      case
        when p_sort_key in (
          'name', 'lastName', 'institution', 'groups', 'references', 'country',
          'createdAt', 'updatedAt', 'status', 'priority', 'missing'
        ) then p_sort_key
        else 'lastName'
      end as sort_key,
      case when p_sort_direction = 'desc' then 'desc' else 'asc' end as sort_direction,
      greatest(1, least(coalesce(p_limit, 100), 200)) as page_limit,
      greatest(0, coalesce(p_offset, 0)) as page_offset
  ),
  decorated as (
    select
      c.*,
      coalesce(m.missing_fields, '{}'::text[]) as missing_fields,
      n.*,
      case when n.sort_key = 'groups' then (
        select string_agg(lower(g.name), ', ' order by lower(g.name), g.id)
        from public.contact_groups cg
        join public.groups g on g.id = cg.group_id
        where cg.contact_id = c.id
      ) end as group_names,
      case when n.sort_key = 'references' then (
        select string_agg(lower(r.full_name), ', ' order by lower(r.full_name), r.id)
        from public.contact_references cr
        join public.internal_references r on r.id = cr.reference_id
        where cr.contact_id = c.id
      ) end as reference_names,
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
        case when cardinality(d.reference_ids) > 0 then 1 else 0 end +
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
          when cardinality(d.reference_ids) > 0 and exists (
            select 1
            from public.contact_references cr
            where cr.contact_id = d.id
              and cr.reference_id = any(d.reference_ids)
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
    order by
      case when sort_key = 'name' and sort_direction = 'asc' then lower(first_name) end asc nulls last,
      case when sort_key = 'name' and sort_direction = 'desc' then lower(first_name) end desc nulls last,
      case when sort_key = 'lastName' and sort_direction = 'asc' then lower(last_name) end asc nulls last,
      case when sort_key = 'lastName' and sort_direction = 'desc' then lower(last_name) end desc nulls last,
      case when sort_key = 'institution' and sort_direction = 'asc' then lower(institution) end asc nulls last,
      case when sort_key = 'institution' and sort_direction = 'desc' then lower(institution) end desc nulls last,
      case when sort_key = 'groups' and sort_direction = 'asc' then group_names end asc nulls last,
      case when sort_key = 'groups' and sort_direction = 'desc' then group_names end desc nulls last,
      case when sort_key = 'references' and sort_direction = 'asc' then reference_names end asc nulls last,
      case when sort_key = 'references' and sort_direction = 'desc' then reference_names end desc nulls last,
      case when sort_key = 'country' and sort_direction = 'asc' then lower(country) end asc nulls last,
      case when sort_key = 'country' and sort_direction = 'desc' then lower(country) end desc nulls last,
      case when sort_key = 'createdAt' and sort_direction = 'asc' then created_at end asc nulls last,
      case when sort_key = 'createdAt' and sort_direction = 'desc' then created_at end desc nulls last,
      case when sort_key = 'updatedAt' and sort_direction = 'asc' then updated_at end asc nulls last,
      case when sort_key = 'updatedAt' and sort_direction = 'desc' then updated_at end desc nulls last,
      case when sort_key = 'status' and sort_direction = 'asc' then status::text end asc nulls last,
      case when sort_key = 'status' and sort_direction = 'desc' then status::text end desc nulls last,
      case when sort_key = 'priority' and sort_direction = 'asc' then priority::text end asc nulls last,
      case when sort_key = 'priority' and sort_direction = 'desc' then priority::text end desc nulls last,
      case when sort_key = 'missing' and sort_direction = 'asc' then cardinality(missing_fields) end asc,
      case when sort_key = 'missing' and sort_direction = 'desc' then cardinality(missing_fields) end desc,
      lower(last_name) asc nulls last,
      lower(first_name) asc nulls last,
      id asc
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
      - 'reference_ids'
      - 'missing_filter'
      - 'sort_key'
      - 'sort_direction'
      - 'page_limit'
      - 'page_offset'
      - 'missing_fields'
      - 'group_names'
      - 'reference_names'
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

grant execute on function public.search_contacts_page(
  text,
  text,
  text,
  text,
  bigint[],
  bigint[],
  text,
  date,
  date,
  date,
  date,
  integer,
  integer,
  text,
  text
) to authenticated;
