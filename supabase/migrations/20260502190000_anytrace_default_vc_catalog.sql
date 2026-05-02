alter table public.vc_sources
  add column if not exists size_label text,
  add column if not exists sector_focus text,
  add column if not exists twitter_url text;

update public.vc_sources
set
  size_label = coalesce(size_label, title),
  sector_focus = coalesce(sector_focus, firm),
  twitter_url = coalesce(
    twitter_url,
    case when x_handle is not null then 'https://twitter.com/' || x_handle else null end
  );

with new_seed_data (slug, name, country, size_label, sector_focus, twitter_url, linkedin_url) as (
  values
    ('atomico', 'Atomico', 'Vereinigtes Königreich', 'groß', 'General Tech, Software, Deep Tech', 'https://twitter.com/atomico', 'https://www.linkedin.com/company/atomico/'),
    ('index-ventures', 'Index Ventures', 'UK/Europa', 'groß', 'Software, Consumer, Fintech, SaaS', 'https://twitter.com/indexventures', 'https://www.linkedin.com/company/index-ventures/'),
    ('earlybird-venture-capital', 'Earlybird Venture Capital', 'Deutschland', 'groß', 'Tech, B2B/B2C, Fintech, Marktplätze', 'https://twitter.com/earlybirdvc', 'https://www.linkedin.com/company/earlybird-venture-capital/'),
    ('hv-capital', 'HV Capital', 'Deutschland', 'groß', 'Digital Tech, E-Commerce, Fintech', 'https://twitter.com/hvcapital', 'https://www.linkedin.com/company/hv-capital/'),
    ('project-a-ventures', 'Project A Ventures', 'Deutschland', 'mittel/groß', 'Digital Tech, Fintech, E-Commerce, SaaS', 'https://twitter.com/projecta', 'https://www.linkedin.com/company/project-a-ventures/'),
    ('apx', 'APX', 'Deutschland', 'klein', 'Pre-Seed/Seed, digitale Start-ups, SaaS, Marktplätze', 'https://twitter.com/apx_accelerator', 'https://www.linkedin.com/company/apx-accelerator/'),
    ('fly-ventures', 'Fly Ventures', 'Deutschland', 'klein', 'Frühphase, B2B-Software, Deep Tech, AI', 'https://twitter.com/flyvc', 'https://www.linkedin.com/company/fly-ventures/'),
    ('rheingau-founders', 'Rheingau Founders', 'Deutschland', 'klein', 'Early Stage, Digital Tech, Marktplätze, B2C/B2B', 'https://twitter.com/RheingauFounders', 'https://www.linkedin.com/company/rheingau-founders/'),
    ('high-tech-grunderfonds-htgf', 'High-Tech Gründerfonds (HTGF)', 'Deutschland', 'klein', 'Seed, Tech-Start-ups, Industrial Tech, Digital Tech, Life Sciences', 'https://twitter.com/htgf', 'https://www.linkedin.com/company/high-tech-grunderfonds/'),
    ('picus-capital', 'Picus Capital', 'Deutschland', 'klein', 'Frühphase, skalierbare Geschäftsmodelle, Fintech, SaaS', 'https://twitter.com/picuscapital', 'https://www.linkedin.com/company/picus-capital/'),
    ('yellow-vc', 'Yellow.vc', 'Spanien/Frankreich', 'klein', 'Pre-Seed, B2B & B2C, opportunistische Tech-Deals, Fokus Süd- und Frankreich', 'https://twitter.com/yellowvc_', 'https://www.linkedin.com/company/yellow-vc/')
),
upserted as (
  insert into public.vc_sources (
    slug,
    name,
    title,
    firm,
    size_label,
    sector_focus,
    tier,
    region,
    country,
    city,
    x_handle,
    twitter_url,
    linkedin_url,
    notes,
    is_seeded
  )
  select
    slug,
    name,
    size_label,
    sector_focus,
    size_label,
    sector_focus,
    case when size_label = 'klein' then 'microvc' else 'vc' end,
    'Europe',
    country,
    '',
    regexp_replace(twitter_url, '^https?://(www\.)?twitter\.com/', ''),
    twitter_url,
    linkedin_url,
    sector_focus,
    true
  from new_seed_data
  on conflict (slug) do update
  set
    name = excluded.name,
    title = excluded.title,
    firm = excluded.firm,
    size_label = excluded.size_label,
    sector_focus = excluded.sector_focus,
    tier = excluded.tier,
    region = excluded.region,
    country = excluded.country,
    city = excluded.city,
    x_handle = excluded.x_handle,
    twitter_url = excluded.twitter_url,
    linkedin_url = excluded.linkedin_url,
    notes = excluded.notes,
    is_seeded = true
  returning id, slug
),
mapping(old_slug, new_slug) as (
  values
    ('ricardo-seixas', 'atomico'),
    ('saul-klein', 'index-ventures'),
    ('carlotta-perez', 'earlybird-venture-capital')
),
resolved_mapping as (
  select old_vc.id as old_id, new_vc.id as new_id
  from mapping
  join public.vc_sources old_vc on old_vc.slug = mapping.old_slug
  join public.vc_sources new_vc on new_vc.slug = mapping.new_slug
)
update public.activity_events ev
set vc_source_id = rm.new_id
from resolved_mapping rm
where ev.vc_source_id = rm.old_id;

with mapping(old_slug, new_slug) as (
  values
    ('ricardo-seixas', 'atomico'),
    ('saul-klein', 'index-ventures'),
    ('carlotta-perez', 'earlybird-venture-capital')
),
resolved_mapping as (
  select old_vc.id as old_id, new_vc.id as new_id
  from mapping
  join public.vc_sources old_vc on old_vc.slug = mapping.old_slug
  join public.vc_sources new_vc on new_vc.slug = mapping.new_slug
)
update public.user_vc_watchlist_items wl
set vc_source_id = rm.new_id
from resolved_mapping rm
where wl.vc_source_id = rm.old_id
  and not exists (
    select 1
    from public.user_vc_watchlist_items existing
    where existing.user_id = wl.user_id
      and existing.vc_source_id = rm.new_id
  );

delete from public.user_vc_watchlist_items
where vc_source_id in (
  select id
  from public.vc_sources
  where slug in ('ricardo-seixas', 'saul-klein', 'carlotta-perez')
);

delete from public.vc_sources
where slug in ('ricardo-seixas', 'saul-klein', 'carlotta-perez');

insert into public.user_vc_watchlist_items (user_id, vc_source_id)
select u.id, vc.id
from auth.users u
cross join public.vc_sources vc
where vc.is_seeded = true
on conflict (user_id, vc_source_id) do nothing;
