create extension if not exists pgcrypto;

drop table if exists public.signals cascade;
drop type if exists public.signal_kind cascade;
drop type if exists public.signal_confidence cascade;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1), 'Member')
  )
  on conflict (id) do update
    set email = excluded.email;

  insert into public.subscriptions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default 'Member',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_started_at timestamptz not null default timezone('utc', now()),
  trial_ends_at timestamptz not null default (timezone('utc', now()) + interval '14 days'),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.vc_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  title text not null,
  firm text not null,
  tier text not null default 'vc' check (tier in ('angel', 'microvc', 'vc')),
  region text not null default 'Europe',
  country text not null,
  city text not null default '',
  x_handle text,
  linkedin_url text,
  github_username text,
  website_url text,
  notes text not null default '',
  is_seeded boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.tracked_people (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  full_name text not null,
  role_title text not null,
  company text not null default '',
  location text not null default '',
  summary text not null default '',
  avatar_url text,
  top_pick_note text not null default '',
  is_watchlist boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.person_identities (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.tracked_people(id) on delete cascade,
  platform text not null check (platform in ('x', 'github', 'linkedin')),
  handle text not null,
  profile_url text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (person_id, platform, handle)
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.tracked_people(id) on delete cascade,
  vc_source_id uuid references public.vc_sources(id) on delete set null,
  platform text not null check (platform in ('x', 'github', 'linkedin', 'system')),
  event_type text not null check (event_type in ('vc_follow', 'repo_traction', 'big_tech_exit', 'launch', 'mention')),
  headline text not null,
  description text not null default '',
  source_url text not null,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.weekly_pick_snapshots (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  person_id uuid not null references public.tracked_people(id) on delete cascade,
  rank integer not null,
  score integer not null,
  primary_reason text not null,
  summary text not null,
  vc_follow_count integer not null default 0,
  github_attention_score integer not null default 0,
  big_tech_exit boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (week_start, person_id),
  unique (week_start, rank)
);

create table public.weekly_pick_reasons (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.weekly_pick_snapshots(id) on delete cascade,
  reason_kind text not null check (reason_kind in ('vc_follow_burst', 'repo_traction', 'big_tech_exit')),
  title text not null,
  detail text not null,
  metric_value integer,
  source_event_id uuid references public.activity_events(id) on delete set null,
  display_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_activity_events_person_occurred_at on public.activity_events (person_id, occurred_at desc);
create index idx_activity_events_vc_source on public.activity_events (vc_source_id);
create index idx_weekly_pick_snapshots_week_rank on public.weekly_pick_snapshots (week_start desc, rank asc);
create index idx_person_identities_person on public.person_identities (person_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create trigger vc_sources_set_updated_at
before update on public.vc_sources
for each row execute function public.set_updated_at();

create trigger tracked_people_set_updated_at
before update on public.tracked_people
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.vc_sources enable row level security;
alter table public.tracked_people enable row level security;
alter table public.person_identities enable row level security;
alter table public.activity_events enable row level security;
alter table public.weekly_pick_snapshots enable row level security;
alter table public.weekly_pick_reasons enable row level security;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id);

create policy "Users can read own subscription"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

create policy "Authenticated users can read vc sources"
on public.vc_sources
for select
to authenticated
using (true);

create policy "Authenticated users can read tracked people"
on public.tracked_people
for select
to authenticated
using (true);

create policy "Authenticated users can read person identities"
on public.person_identities
for select
to authenticated
using (true);

create policy "Authenticated users can read activity events"
on public.activity_events
for select
to authenticated
using (true);

create policy "Authenticated users can read weekly pick snapshots"
on public.weekly_pick_snapshots
for select
to authenticated
using (true);

create policy "Authenticated users can read weekly pick reasons"
on public.weekly_pick_reasons
for select
to authenticated
using (true);

with inserted_vcs as (
  insert into public.vc_sources (
    slug, name, title, firm, tier, region, country, city, x_handle, linkedin_url, website_url, notes, is_seeded
  ) values
    (
      'ricardo-seixas',
      'Ricardo Seixas',
      'Partner',
      'Point Nine',
      'vc',
      'Europe',
      'DE',
      'Berlin',
      'ricardoseixas',
      'https://www.linkedin.com/in/ricardoseixas/',
      'https://www.pointnine.com/',
      'Early-stage SaaS and marketplace investor.',
      true
    ),
    (
      'saul-klein',
      'Saul Klein',
      'Co-Founder',
      'LocalGlobe',
      'vc',
      'Europe',
      'UK',
      'London',
      'saulklein',
      'https://www.linkedin.com/in/saulklein/',
      'https://www.localglobe.vc/',
      'London-based early-stage operator-investor.',
      true
    ),
    (
      'carlotta-perez',
      'Carlotta Perez',
      'Principal',
      'Seedcamp',
      'vc',
      'Europe',
      'UK',
      'London',
      'carlottacperez',
      'https://www.linkedin.com/in/carlottacperez/',
      'https://seedcamp.com/',
      'Product-focused investor covering Europe.',
      true
    )
  returning id, slug
),
inserted_people as (
  insert into public.tracked_people (
    slug, full_name, role_title, company, location, summary, top_pick_note, is_watchlist
  ) values
    (
      'lena-fischer',
      'Lena Fischer',
      'Founder building AI workflow infrastructure',
      'TraceLayer',
      'Berlin, Germany',
      'Ex-Stripe product lead building workflow infra for operators.',
      '3 European VCs followed her this week and GitHub traction is accelerating.',
      true
    ),
    (
      'jonah-larsen',
      'Jonah Larsen',
      'Open-source founder',
      'CachePilot',
      'Copenhagen, Denmark',
      'Maintains a growing observability tool with strong GitHub momentum.',
      'Two VCs engaged and the repo is taking off.',
      true
    ),
    (
      'maya-dufour',
      'Maya Dufour',
      'Former product lead now founding',
      'Stealth',
      'Paris, France',
      'Recently left a senior product role to start a developer tools company.',
      'Big-tech style exit plus early investor attention.',
      true
    ),
    (
      'tobias-lindholm',
      'Tobias Lindholm',
      'Infrastructure engineer turned founder',
      'Northstar Devtools',
      'Stockholm, Sweden',
      'Building deployment tooling for small engineering teams.',
      'Still early, with signals below the top-pick threshold.',
      true
    )
  returning id, slug
),
identities as (
  insert into public.person_identities (person_id, platform, handle, profile_url, is_primary)
  select p.id, 'x', x.handle, x.url, true
  from inserted_people p
  join (
    values
      ('lena-fischer', 'lenafischer', 'https://x.com/lenafischer'),
      ('jonah-larsen', 'jonahlarsen', 'https://x.com/jonahlarsen'),
      ('maya-dufour', 'mayadufour', 'https://x.com/mayadufour'),
      ('tobias-lindholm', 'tobiaslindholm', 'https://x.com/tobiaslindholm')
  ) as x(slug, handle, url)
    on x.slug = p.slug
  union all
  select p.id, 'github', g.handle, g.url, true
  from inserted_people p
  join (
    values
      ('lena-fischer', 'lenafischer', 'https://github.com/lenafischer'),
      ('jonah-larsen', 'jonahlarsen', 'https://github.com/jonahlarsen'),
      ('maya-dufour', 'mayadufour', 'https://github.com/mayadufour'),
      ('tobias-lindholm', 'tobiaslindholm', 'https://github.com/tobiaslindholm')
  ) as g(slug, handle, url)
    on g.slug = p.slug
  union all
  select p.id, 'linkedin', l.handle, l.url, true
  from inserted_people p
  join (
    values
      ('lena-fischer', 'lena-fischer', 'https://www.linkedin.com/in/lena-fischer/'),
      ('jonah-larsen', 'jonah-larsen', 'https://www.linkedin.com/in/jonah-larsen/'),
      ('maya-dufour', 'maya-dufour', 'https://www.linkedin.com/in/maya-dufour/'),
      ('tobias-lindholm', 'tobias-lindholm', 'https://www.linkedin.com/in/tobias-lindholm/')
  ) as l(slug, handle, url)
    on l.slug = p.slug
  returning id
),
seed_events as (
  insert into public.activity_events (
    person_id, vc_source_id, platform, event_type, headline, description, source_url, occurred_at, metadata
  )
  select
    p.id,
    v.id,
    e.platform,
    e.event_type,
    e.headline,
    e.description,
    e.source_url,
    e.occurred_at,
    e.metadata::jsonb
  from (
    values
      ('lena-fischer', 'ricardo-seixas', 'x', 'vc_follow', 'Ricardo Seixas followed Lena Fischer on X', 'Point Nine partner added Lena to his radar this week.', 'https://x.com/lenafischer/status/1001', '2026-04-28T08:30:00Z', '{"kind":"follow"}'),
      ('lena-fischer', 'saul-klein', 'x', 'vc_follow', 'Saul Klein followed Lena Fischer on X', 'LocalGlobe attention landed two days later.', 'https://x.com/lenafischer/status/1002', '2026-04-29T11:00:00Z', '{"kind":"follow"}'),
      ('lena-fischer', 'carlotta-perez', 'x', 'vc_follow', 'Carlotta Perez followed Lena Fischer on X', 'Seedcamp completed a three-VC burst inside the week.', 'https://x.com/lenafischer/status/1003', '2026-05-01T09:10:00Z', '{"kind":"follow"}'),
      ('lena-fischer', null, 'github', 'repo_traction', 'TraceLayer hit 1.8k GitHub stars', 'A new release pushed the repo into high weekly traction.', 'https://github.com/lenafischer/tracelayer', '2026-04-30T16:10:00Z', '{"stars":1800,"weekly_star_delta":430}'),
      ('lena-fischer', null, 'system', 'big_tech_exit', 'Lena left Stripe to build full-time', 'Former Stripe product lead is now building TraceLayer full time.', 'https://www.linkedin.com/in/lena-fischer/', '2026-04-27T07:00:00Z', '{"company":"Stripe"}'),
      ('jonah-larsen', 'ricardo-seixas', 'x', 'vc_follow', 'Ricardo Seixas followed Jonah Larsen on X', 'Interest appeared after a recent demo thread.', 'https://x.com/jonahlarsen/status/2001', '2026-04-30T12:00:00Z', '{"kind":"follow"}'),
      ('jonah-larsen', 'saul-klein', 'x', 'vc_follow', 'Saul Klein followed Jonah Larsen on X', 'Second VC signal, but still below the hard threshold.', 'https://x.com/jonahlarsen/status/2002', '2026-05-01T10:00:00Z', '{"kind":"follow"}'),
      ('jonah-larsen', null, 'github', 'repo_traction', 'CachePilot crossed 950 GitHub stars', 'Open-source growth is strong across the past seven days.', 'https://github.com/jonahlarsen/cachepilot', '2026-05-01T13:30:00Z', '{"stars":950,"weekly_star_delta":220}'),
      ('maya-dufour', 'carlotta-perez', 'x', 'vc_follow', 'Carlotta Perez followed Maya Dufour on X', 'Seedcamp started tracking Maya after her launch teaser.', 'https://x.com/mayadufour/status/3001', '2026-04-29T15:00:00Z', '{"kind":"follow"}'),
      ('maya-dufour', null, 'system', 'big_tech_exit', 'Maya Dufour left Google to start up', 'Former Google product lead is now building in developer tooling.', 'https://www.linkedin.com/in/maya-dufour/', '2026-04-28T09:45:00Z', '{"company":"Google"}'),
      ('tobias-lindholm', 'ricardo-seixas', 'x', 'vc_follow', 'Ricardo Seixas followed Tobias Lindholm on X', 'A first signal, but not yet enough for a weekly pick.', 'https://x.com/tobiaslindholm/status/4001', '2026-05-01T08:00:00Z', '{"kind":"follow"}')
  ) as e(person_slug, vc_slug, platform, event_type, headline, description, source_url, occurred_at, metadata)
  join inserted_people p on p.slug = e.person_slug
  left join inserted_vcs v on v.slug = e.vc_slug
  returning id, person_id, event_type, headline
),
snapshots as (
  insert into public.weekly_pick_snapshots (
    week_start, person_id, rank, score, primary_reason, summary, vc_follow_count, github_attention_score, big_tech_exit
  )
  select
    date '2026-04-27',
    p.id,
    s.rank,
    s.score,
    s.primary_reason,
    s.summary,
    s.vc_follow_count,
    s.github_attention_score,
    s.big_tech_exit
  from inserted_people p
  join (
    values
      ('lena-fischer', 1, 98, '3 VC follows in 7 days', 'Three European VCs followed Lena this week, with GitHub momentum and a Stripe exit adding conviction.', 3, 430, true),
      ('jonah-larsen', 2, 74, 'GitHub repo traction', 'Jonah is still below the 3-VC threshold, but open-source traction keeps him in the weekly stack.', 2, 220, false),
      ('maya-dufour', 3, 68, 'Big tech exit', 'Maya left Google and already picked up an early Seedcamp signal.', 1, 0, true)
  ) as s(slug, rank, score, primary_reason, summary, vc_follow_count, github_attention_score, big_tech_exit)
    on s.slug = p.slug
  returning id, person_id
)
insert into public.weekly_pick_reasons (
  snapshot_id, reason_kind, title, detail, metric_value, source_event_id, display_order
)
select
  snap.id,
  r.reason_kind,
  r.title,
  r.detail,
  r.metric_value,
  ev.id,
  r.display_order
from snapshots snap
join inserted_people p on p.id = snap.person_id
join (
  values
    ('lena-fischer', 'vc_follow_burst', '3 VC follows this week', 'Point Nine, LocalGlobe and Seedcamp all followed Lena within seven days.', 3, 'Ricardo Seixas followed Lena Fischer on X', 0),
    ('lena-fischer', 'repo_traction', 'GitHub traction accelerating', 'TraceLayer added roughly 430 stars this week.', 430, 'TraceLayer hit 1.8k GitHub stars', 1),
    ('lena-fischer', 'big_tech_exit', 'Recent Stripe exit', 'Lena recently left Stripe to build TraceLayer full-time.', 1, 'Lena left Stripe to build full-time', 2),
    ('jonah-larsen', 'repo_traction', 'Strong repo momentum', 'CachePilot added over 200 stars this week.', 220, 'CachePilot crossed 950 GitHub stars', 0),
    ('jonah-larsen', 'vc_follow_burst', '2 VC follows so far', 'Investor attention is building, but still below the 3-follow trigger.', 2, 'Ricardo Seixas followed Jonah Larsen on X', 1),
    ('maya-dufour', 'big_tech_exit', 'Left Google recently', 'Maya left Google and is now building a new devtools company.', 1, 'Maya Dufour left Google to start up', 0),
    ('maya-dufour', 'vc_follow_burst', 'Early VC attention', 'Seedcamp has already picked up Maya this week.', 1, 'Carlotta Perez followed Maya Dufour on X', 1)
) as r(person_slug, reason_kind, title, detail, metric_value, event_headline, display_order)
  on r.person_slug = p.slug
left join seed_events ev on ev.person_id = p.id and ev.headline = r.event_headline;
