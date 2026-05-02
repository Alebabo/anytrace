with people_seed (slug, full_name, role_title, company, location, summary, top_pick_note) as (
  values
    ('anton-osika', 'Anton Osika', 'AI founder and engineer', 'Lovable', 'Stockholm, Sweden', 'Tracks Anton Osika across X, GitHub and LinkedIn for product, AI and founder signals.', 'Watching for OSS traction and investor attention.'),
    ('fabian-hedin', 'Fabian Hedin', 'Founder and builder', 'Lovable', 'Stockholm, Sweden', 'Tracks Fabian Hedin across X, GitHub and LinkedIn for product and developer-tooling signals.', 'Watching for OSS traction and investor attention.'),
    ('eldad-fux', 'Eldad Fux', 'Founder and open-source operator', 'Appwrite', 'Tel Aviv, Israel', 'Tracks Eldad Fux across X, GitHub and LinkedIn for infrastructure and open-source signals.', 'Watching for OSS traction and investor attention.'),
    ('caarlos0', 'Carlos Alexandro Becker', 'Open-source maintainer', '', 'Brazil', 'Tracks caarlos0 across X, GitHub and LinkedIn for developer-tooling and OSS signals.', 'Watching for OSS traction and investor attention.'),
    ('sindre-sorhus', 'Sindre Sorhus', 'Open-source creator', '', 'Thailand', 'Tracks Sindre Sorhus across X, GitHub and LinkedIn for high-signal JavaScript and OSS activity.', 'Watching for OSS traction and investor attention.'),
    ('kamran-ahmed', 'Kamran Ahmed', 'Open-source founder and engineer', 'Roadmap', 'Dubai, UAE', 'Tracks Kamran Ahmed across X, GitHub and LinkedIn for OSS and developer-education signals.', 'Watching for OSS traction and investor attention.'),
    ('evan-you', 'Evan You', 'Framework creator', 'Vue', 'Singapore', 'Tracks Evan You across X, GitHub and LinkedIn for framework and OSS momentum.', 'Watching for OSS traction and investor attention.'),
    ('mitchell-hashimoto', 'Mitchell Hashimoto', 'Infrastructure founder and engineer', '', 'United States', 'Tracks Mitchell Hashimoto across X, GitHub and LinkedIn for infrastructure and developer-platform signals.', 'Watching for OSS traction and investor attention.'),
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
    ('fabian-hedin', 'x', 'fabianhedin', 'https://twitter.com/fabianhedin'),
    ('fabian-hedin', 'github', 'fabianhedin', 'https://github.com/fabianhedin'),
    ('fabian-hedin', 'linkedin', 'fabianhedin', 'https://www.linkedin.com/in/fabianhedin/'),
    ('eldad-fux', 'x', 'eldadfux', 'https://twitter.com/eldadfux'),
    ('eldad-fux', 'github', 'eldadfux', 'https://github.com/eldadfux'),
    ('eldad-fux', 'linkedin', 'eldadfux', 'https://www.linkedin.com/in/eldadfux/'),
    ('caarlos0', 'x', 'caarlos0', 'https://twitter.com/caarlos0'),
    ('caarlos0', 'github', 'caarlos0', 'https://github.com/caarlos0'),
    ('caarlos0', 'linkedin', 'carlos-alberto-de-araujo-silva', 'https://www.linkedin.com/in/carlos-alberto-de-araujo-silva/'),
    ('sindre-sorhus', 'x', 'sindresorhus', 'https://twitter.com/sindresorhus'),
    ('sindre-sorhus', 'github', 'sindresorhus', 'https://github.com/sindresorhus'),
    ('sindre-sorhus', 'linkedin', 'sindresorhus', 'https://www.linkedin.com/in/sindresorhus/'),
    ('kamran-ahmed', 'x', 'kamranahmedse', 'https://twitter.com/kamranahmedse'),
    ('kamran-ahmed', 'github', 'kamranahmedse', 'https://github.com/kamranahmedse'),
    ('kamran-ahmed', 'linkedin', 'kamranahmedse', 'https://www.linkedin.com/in/kamranahmedse/'),
    ('evan-you', 'x', 'youyuxi', 'https://twitter.com/youyuxi'),
    ('evan-you', 'github', 'yyx990803', 'https://github.com/yyx990803'),
    ('evan-you', 'linkedin', 'evanyou', 'https://www.linkedin.com/in/evanyou/'),
    ('mitchell-hashimoto', 'x', 'mitchellh', 'https://twitter.com/mitchellh'),
    ('mitchell-hashimoto', 'github', 'mitchellh', 'https://github.com/mitchellh'),
    ('mitchell-hashimoto', 'linkedin', 'mitchellh', 'https://www.linkedin.com/in/mitchellh/'),
    ('andrej-karpathy', 'x', 'karpathy', 'https://twitter.com/karpathy'),
    ('andrej-karpathy', 'github', 'karpathy', 'https://github.com/karpathy'),
    ('andrej-karpathy', 'linkedin', 'andrej-karpathy', 'https://www.linkedin.com/in/andrej-karpathy/')
) as seed(slug, platform, handle, profile_url)
  on seed.slug = p.slug
on conflict (person_id, platform, handle) do update
set
  profile_url = excluded.profile_url,
  is_primary = true;
