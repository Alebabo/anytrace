-- Anytrace graph integrity checks and repair helpers
-- Run these in Supabase SQL Editor when graph edges are missing or look stale.

-- 1. Current VC catalog
select
  id,
  slug,
  name,
  country,
  size_label,
  is_seeded
from public.vc_sources
order by is_seeded desc, name;

-- 2. User VC watchlist links
select
  w.user_id,
  w.vc_source_id,
  v.slug,
  v.name,
  w.created_at
from public.user_vc_watchlist_items w
left join public.vc_sources v on v.id = w.vc_source_id
order by w.user_id, v.name nulls last, w.created_at;

-- 3. VC follow events currently available to the graph
select
  e.id,
  e.person_id,
  p.full_name,
  e.vc_source_id,
  v.slug,
  v.name,
  e.platform,
  e.event_type,
  e.headline,
  e.occurred_at
from public.activity_events e
left join public.tracked_people p on p.id = e.person_id
left join public.vc_sources v on v.id = e.vc_source_id
where e.event_type = 'vc_follow'
order by e.occurred_at desc;

-- 4. Orphaned VC follow events: these will never render as graph edges
select
  e.id,
  e.vc_source_id,
  e.person_id,
  e.headline,
  e.occurred_at
from public.activity_events e
left join public.vc_sources v on v.id = e.vc_source_id
where e.event_type = 'vc_follow'
  and e.vc_source_id is not null
  and v.id is null
order by e.occurred_at desc;

-- 5. Watchlist items pointing to deleted VC rows
select
  w.id,
  w.user_id,
  w.vc_source_id,
  w.created_at
from public.user_vc_watchlist_items w
left join public.vc_sources v on v.id = w.vc_source_id
where v.id is null
order by w.created_at desc;

-- 6. Count graph-ready edges per VC
select
  v.slug,
  v.name,
  count(*) filter (where e.event_type = 'vc_follow') as follow_event_count,
  count(distinct e.person_id) filter (where e.event_type = 'vc_follow') as connected_people
from public.vc_sources v
left join public.activity_events e on e.vc_source_id = v.id
group by v.slug, v.name
order by connected_people desc, follow_event_count desc, v.name;

-- 7. Repair: ensure every user has all seeded default VCs in the watchlist
insert into public.user_vc_watchlist_items (user_id, vc_source_id)
select
  u.id,
  v.id
from auth.users u
join public.vc_sources v on v.is_seeded = true
left join public.user_vc_watchlist_items w
  on w.user_id = u.id
 and w.vc_source_id = v.id
where w.id is null;

-- 8. Repair template: remap legacy VC slugs to current default VC slugs
-- Adjust the values list only if your legacy/source slugs differ.
with slug_map as (
  select *
  from (
    values
      ('ricardo-seixas', 'atomico'),
      ('saul-klein', 'index-ventures'),
      ('carlotta-perez', 'earlybird-venture-capital')
  ) as m(old_slug, new_slug)
),
legacy_ids as (
  select
    old_vc.id as old_id,
    new_vc.id as new_id
  from slug_map m
  join public.vc_sources old_vc on old_vc.slug = m.old_slug
  join public.vc_sources new_vc on new_vc.slug = m.new_slug
)
update public.activity_events e
set vc_source_id = l.new_id
from legacy_ids l
where e.vc_source_id = l.old_id;

-- 9. Repair template: remap watchlist rows to current default VC slugs
with slug_map as (
  select *
  from (
    values
      ('ricardo-seixas', 'atomico'),
      ('saul-klein', 'index-ventures'),
      ('carlotta-perez', 'earlybird-venture-capital')
  ) as m(old_slug, new_slug)
),
legacy_ids as (
  select
    old_vc.id as old_id,
    new_vc.id as new_id
  from slug_map m
  join public.vc_sources old_vc on old_vc.slug = m.old_slug
  join public.vc_sources new_vc on new_vc.slug = m.new_slug
)
update public.user_vc_watchlist_items w
set vc_source_id = l.new_id
from legacy_ids l
where w.vc_source_id = l.old_id;
