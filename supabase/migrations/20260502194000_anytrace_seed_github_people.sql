with people_seed (slug, full_name, role_title, company, location, summary, top_pick_note) as (
  values
    ('anton-osika', 'Anton Osika', 'AI founder and engineer', 'Lovable', 'Stockholm, Sweden', 'Tracks Anton Osika across X, GitHub and LinkedIn for product, AI and founder signals.', 'Watching for OSS traction and investor attention.'),
    ('eldad-fux', 'Eldad Fux', 'Founder and open-source operator', 'Appwrite', 'Tel Aviv, Israel', 'Tracks Eldad Fux across X, GitHub and LinkedIn for infrastructure and open-source signals.', 'Watching for OSS traction and investor attention.'),
    ('guillermo-rauch', 'Guillermo Rauch', 'Founder and open-source builder', 'Vercel', 'San Francisco, United States', 'Tracks Guillermo Rauch across X, GitHub and LinkedIn for web infrastructure and AI tooling signals.', 'Watching for OSS traction and investor attention.'),
    ('mitchell-hashimoto', 'Mitchell Hashimoto', 'Infrastructure founder and engineer', 'Ghostty', 'Los Angeles, United States', 'Tracks Mitchell Hashimoto across X, GitHub and LinkedIn for infrastructure and developer-platform signals.', 'Watching for OSS traction and investor attention.'),
    ('andrej-karpathy', 'Andrej Karpathy', 'AI researcher and builder', 'Eureka Labs', 'United States', 'Tracks Andrej Karpathy across X, GitHub and LinkedIn for AI and developer-tooling signals.', 'Watching for OSS traction and investor attention.')
),
upserted_people as (
  insert into public.tracked_people (
    slug,
    full_name,
    role_title,
    company,
    location,
    summary,
    top_pick_note,
    is_watchlist
  )
  select
    slug,
    full_name,
    role_title,
    company,
    location,
    summary,
    top_pick_note,
    true
  from people_seed
  on conflict (slug) do update
  set
    full_name = excluded.full_name,
    role_title = excluded.role_title,
    company = excluded.company,
    location = excluded.location,
    summary = excluded.summary,
    top_pick_note = excluded.top_pick_note,
    is_watchlist = true
  returning id, slug
)
insert into public.person_identities (
  person_id,
  platform,
  handle,
  profile_url,
  is_primary
)
select
  p.id,
  seed.platform,
  seed.handle,
  seed.profile_url,
  true
from upserted_people p
join (
  values
    ('anton-osika', 'x', 'antonosika', 'https://twitter.com/antonosika'),
    ('anton-osika', 'github', 'AntonOsika', 'https://github.com/AntonOsika'),
    ('anton-osika', 'linkedin', 'antonosika', 'https://www.linkedin.com/in/antonosika/'),
    ('eldad-fux', 'x', 'eldadfux', 'https://twitter.com/eldadfux'),
    ('eldad-fux', 'github', 'eldadfux', 'https://github.com/eldadfux'),
    ('eldad-fux', 'linkedin', 'eldadfux', 'https://www.linkedin.com/in/eldadfux/'),
    ('guillermo-rauch', 'x', 'rauchg', 'https://twitter.com/rauchg'),
    ('guillermo-rauch', 'github', 'rauchg', 'https://github.com/rauchg'),
    ('guillermo-rauch', 'linkedin', 'rauchg', 'https://www.linkedin.com/in/rauchg/'),
    ('mitchell-hashimoto', 'x', 'mitchellh', 'https://twitter.com/mitchellh'),
    ('mitchell-hashimoto', 'github', 'mitchellh', 'https://github.com/mitchellh'),
    ('mitchell-hashimoto', 'linkedin', 'mitchellh', 'https://www.linkedin.com/in/mitchellh/'),
    ('andrej-karpathy', 'x', 'karpathy', 'https://twitter.com/karpathy'),
    ('andrej-karpathy', 'github', 'karpathy', 'https://github.com/karpathy'),
    ('andrej-karpathy', 'linkedin', 'andrej-karpathy-9a650716', 'https://www.linkedin.com/in/andrej-karpathy-9a650716/')
) as seed(slug, platform, handle, profile_url)
  on seed.slug = p.slug
on conflict (person_id, platform, handle) do update
set
  profile_url = excluded.profile_url,
  is_primary = true;
