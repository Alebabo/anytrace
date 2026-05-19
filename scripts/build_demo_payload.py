from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "src" / "data" / "demoSeedData.json"
BACKEND_BASE_URL = "http://127.0.0.1:8767"


PITCH_TARGETS = [
    {
        "handle": "mattshumer_",
        "name": "Matt Shumer",
        "category": "active_founder",
        "decision": "reach_out_now",
        "role": "GP @ Shumer Capital",
        "company": "Shumer Capital",
        "location": "New York, United States",
        "summary": "Active investor and AI founder focused on AI infrastructure, developer tools, and agent-native products.",
        "why": "Active AI founder-investor node with strong capital adjacency and repeated AI infrastructure signal.",
        "followers": 18,
        "seed_handles": ["mattshumer_", "sarahdrinkwater", "harrystebbings", "pmoe", "nathanbenaich"],
        "github": {
            "handle": "mattshumer",
            "repo": "mattshumer/claude-code-subagents",
            "stars": 14800,
            "forks": 1200,
            "watchers": 210,
            "delta7": 620,
            "delta30": 3100,
        },
    },
    {
        "handle": "natfriedman",
        "name": "Nat Friedman",
        "category": "active_founder",
        "decision": "research_more",
        "role": "Serial Founder & Investor",
        "company": "Independent",
        "location": "San Francisco, United States",
        "summary": "Serial founder and investor; Ximian and Xamarin exits, former GitHub CEO, and high-credibility founder-investor node.",
        "why": "Highest-credibility founder-investor node in the graph with concentrated attention from top-tier sources.",
        "followers": 15,
        "seed_handles": ["paulg", "sama", "reidhoffman", "garrytan", "cdixon"],
        "github": {
            "handle": "nat",
            "repo": "nat/openai-cookbook",
            "stars": 62000,
            "forks": 9700,
            "watchers": 760,
            "delta7": 280,
            "delta30": 1800,
        },
    },
    {
        "handle": "harveyhodd",
        "name": "Harvey Hodd",
        "category": "active_founder",
        "decision": "reach_out_now",
        "role": "Serial Founder",
        "company": "Rivan",
        "location": "London, United Kingdom",
        "summary": "Serial founder behind Rivan, with prior Blueprint and Relo outcomes and strong UK investor clustering.",
        "why": "Multiple exits and fresh founder activity; top-tier UK and European seed sources cluster around the profile.",
        "followers": 13,
        "seed_handles": ["localglobevc", "alicebentinck", "h4ryb", "matthewclifford", "pluralplatform"],
        "github": {
            "handle": "harveyhodd",
            "repo": "rivan-ai/platform",
            "stars": 3200,
            "forks": 260,
            "watchers": 84,
            "delta7": 142,
            "delta30": 710,
        },
    },
    {
        "handle": "jamesdacombe",
        "name": "James Dacombe",
        "category": "active_founder",
        "decision": "reach_out_now",
        "role": "Founder",
        "company": "CoMind",
        "location": "London, United Kingdom",
        "summary": "Founder connected to CoMind, Bletchley Industries, OLIX Computing, and Thiel Fellowship circles.",
        "why": "Backed early and repeatedly by LocalGlobe; sustained top-tier seed investor attention is already visible.",
        "followers": 21,
        "seed_handles": ["localglobevc", "alexlimbovc", "alicebentinck", "h4ryb", "pluralplatform"],
        "github": {
            "handle": "jamesdacombe",
            "repo": "comind-labs/neural-interface",
            "stars": 9100,
            "forks": 740,
            "watchers": 188,
            "delta7": 210,
            "delta30": 980,
        },
    },
    {
        "handle": "joeprkns",
        "name": "Joe Perkins",
        "category": "potential_founder",
        "decision": "reach_out_now",
        "role": "Founder",
        "company": "amy_ai",
        "location": "London, United Kingdom",
        "summary": "Building amy_ai, an AI agent for private market investors.",
        "why": "Direct product fit for investor workflows, with multiple source follows landing in the same window.",
        "followers": 9,
        "seed_handles": ["seedcamp", "pointninecap", "pmoe", "harrystebbings", "matthewclifford"],
        "github": {
            "handle": "joeprkns",
            "repo": "amy-ai/research-agent",
            "stars": 1800,
            "forks": 130,
            "watchers": 42,
            "delta7": 96,
            "delta30": 410,
        },
    },
    {
        "handle": "NiallJones",
        "name": "Niall Jones",
        "category": "potential_founder",
        "decision": "research_more",
        "role": "Founder",
        "company": "hideout",
        "location": "London, United Kingdom",
        "summary": "Founder of hideout; previously at Meta and Unity.",
        "why": "Elite operator background with a new company signal and growing investor adjacency.",
        "followers": 7,
        "seed_handles": ["creandum", "atomico", "localglobevc", "juneangelides", "checkwarner"],
        "github": {
            "handle": "nialljones",
            "repo": "hideout-labs/social-graph",
            "stars": 940,
            "forks": 92,
            "watchers": 31,
            "delta7": 58,
            "delta30": 270,
        },
    },
    {
        "handle": "trungtphan",
        "name": "Trung Phan",
        "category": "potential_founder",
        "decision": "watch",
        "role": "Operator",
        "company": "Bearly AI / Workweek",
        "location": "United States",
        "summary": "Distribution-heavy operator and product builder with a large audience and repeated seed investor attention.",
        "why": "Large distribution plus product-building history; worth watching for founder-grade conversion.",
        "followers": 11,
        "seed_handles": ["turnernovak", "sama", "jason", "rrhoover", "lessin"],
        "github": {
            "handle": "trungtphan",
            "repo": "bearly-ai/writing-os",
            "stars": 4200,
            "forks": 380,
            "watchers": 120,
            "delta7": 88,
            "delta30": 540,
        },
    },
    {
        "handle": "ronanchambers",
        "name": "Ronan Chambers",
        "category": "potential_founder",
        "decision": "research_more",
        "role": "Co-Founder",
        "company": "etn.",
        "location": "Europe",
        "summary": "Building Europe's tech media network; angel-backed and tightly connected to the startup ecosystem.",
        "why": "Angel-backed media founder with strong European tech adjacency and fresh multi-source follows.",
        "followers": 8,
        "seed_handles": ["seedcamp", "siftedeu", "robinwauters", "robindchnt", "sarahdrinkwater"],
        "github": {
            "handle": "ronanchambers",
            "repo": "etn-media/network-map",
            "stars": 760,
            "forks": 64,
            "watchers": 24,
            "delta7": 42,
            "delta30": 190,
        },
    },
    {
        "handle": "arcinstitute",
        "name": "Arc Institute",
        "category": "company_no_raise_yet",
        "decision": "watch",
        "role": "AI company",
        "company": "Arc Institute",
        "location": "Palo Alto, United States",
        "summary": "Full-stack institute for AI and biology research.",
        "why": "Company-level research signal with high-quality technical and investor attention.",
        "followers": 6,
        "seed_handles": ["nathanbenaich", "karpathy", "sama", "patrickc", "cdixon"],
        "github": {
            "handle": "ArcInstitute",
            "repo": "ArcInstitute/evo2",
            "stars": 8700,
            "forks": 620,
            "watchers": 160,
            "delta7": 260,
            "delta30": 1300,
        },
    },
    {
        "handle": "jekbradbury",
        "name": "James Bradbury",
        "category": "company_no_raise_yet",
        "decision": "reach_out_now",
        "role": "Serial Founder",
        "company": "Independent",
        "location": "San Francisco, United States",
        "summary": "JAX co-creator, ex-Google TPUs and MetaMind/SF Research; deep technical founder signal with maximum capital adjacency.",
        "why": "Research-to-company potential with elite technical credibility and live seed-source follows.",
        "followers": 5,
        "seed_handles": ["taavet", "ninaachadjian", "berber_jin1", "karpathy", "nathanbenaich"],
        "github": {
            "handle": "jekbradbury",
            "repo": "google/jax",
            "stars": 31800,
            "forks": 2900,
            "watchers": 560,
            "delta7": 170,
            "delta30": 860,
        },
    },
    {
        "handle": "insane_analyst",
        "name": "Irrational Analysis",
        "category": "company_no_raise_yet",
        "decision": "watch",
        "role": "Research Newsletter",
        "company": "Irrational Analysis",
        "location": "",
        "summary": "Engineering-driven investment analysis with a technical audience and investor attention.",
        "why": "Research audience and investor follows suggest a possible company-forming wedge.",
        "followers": 4,
        "seed_handles": ["nathanbenaich", "geiger_capital", "gradypb", "mattturck", "ttunguz"],
        "github": {
            "handle": "insane-analyst",
            "repo": "irrational-analysis/research",
            "stars": 1100,
            "forks": 88,
            "watchers": 36,
            "delta7": 36,
            "delta30": 170,
        },
    },
    {
        "handle": "ry_paddy",
        "name": "Patrick Ryan",
        "category": "company_no_raise_yet",
        "decision": "research_more",
        "role": "Founder",
        "company": "joinodin",
        "location": "London, United Kingdom",
        "summary": "Building a way to run an investment firm from a phone; Odin has already raised early funding.",
        "why": "Founder-market fit for investment workflows and multiple VC/angel follows in the current snapshot.",
        "followers": 5,
        "seed_handles": ["jameswise", "arian_ghashghai", "matthewclifford", "alicebentinck", "danmurrays"],
        "github": {
            "handle": "ry-paddy",
            "repo": "joinodin/mobile-fund-os",
            "stars": 2400,
            "forks": 210,
            "watchers": 62,
            "delta7": 74,
            "delta30": 360,
        },
    },
]

X_AVATAR_URLS = {
    "mattshumer_": "https://pbs.twimg.com/profile_images/1490950574090571778/BtgOaqUP_400x400.jpg",
    "natfriedman": "https://pbs.twimg.com/profile_images/1677873294/image_400x400.jpg",
    "harveyhodd": "https://pbs.twimg.com/profile_images/1353696997509890048/vs6KsIBV_400x400.jpg",
    "jamesdacombe": "https://pbs.twimg.com/profile_images/1905703199790825472/k-b3SjPC_400x400.jpg",
    "joeprkns": "https://pbs.twimg.com/profile_images/1923021775933161473/Y0Qnily9_400x400.jpg",
    "nialljones": "https://pbs.twimg.com/profile_images/2018382147564822528/6KBoliI1_400x400.jpg",
    "trungtphan": "https://pbs.twimg.com/profile_images/1506362585448296448/LJg8kVSD_400x400.jpg",
    "ronanchambers": "https://pbs.twimg.com/profile_images/579726517330173952/Oh9DQgkw_400x400.jpg",
    "arcinstitute": "https://pbs.twimg.com/profile_images/1517199851783524352/g_xTajmf_400x400.jpg",
    "jekbradbury": "https://pbs.twimg.com/profile_images/680634268129849344/Hz2wZ2v7_400x400.jpg",
    "insane_analyst": "https://pbs.twimg.com/profile_images/1844529619162234880/_AMRErLM_400x400.jpg",
    "ry_paddy": "https://pbs.twimg.com/profile_images/1545402234636312582/7LTetQ8x_400x400.jpg",
}


def read_json_url(path: str) -> dict:
    try:
        with urlopen(f"{BACKEND_BASE_URL}{path}", timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except URLError as exc:
        raise SystemExit(f"Could not read {BACKEND_BASE_URL}{path}: {exc}") from exc


def normalize_handle(value: str | None) -> str:
    return (value or "").strip().lstrip("@").lower()


def target_avatar_url(target: dict) -> str | None:
    return X_AVATAR_URLS.get(normalize_handle(target.get("handle")))


def slugify(value: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in value.strip())
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "entry"


def clean_tier(value):
    if value in {"angel", "microvc", "vc", "journalist"}:
        return value
    if str(value) == "4":
        return "journalist"
    if str(value) == "3":
        return "angel"
    if str(value) == "2":
        return "microvc"
    return "vc"


def clean_vc(vc: dict) -> dict:
    row = dict(vc)
    row["tier"] = clean_tier(row.get("tier"))
    return row


def iso_date(days_ago: int) -> str:
    return (datetime.now(tz=timezone.utc) - timedelta(days=days_ago)).date().isoformat()


def iso_datetime(days_ago: int, hour: int = 16, minute: int = 40) -> str:
    now = datetime.now(tz=timezone.utc)
    value = datetime(now.year, now.month, now.day, hour, minute, tzinfo=timezone.utc) - timedelta(days=days_ago)
    return value.isoformat()


def first_match_by_handle(vcs: list[dict], handle: str) -> dict | None:
    target = normalize_handle(handle)
    for vc in vcs:
        if normalize_handle(vc.get("xHandle")) == target:
            return vc
    return None


def find_fallback_vcs(vcs: list[dict], count: int) -> list[dict]:
    preferred = [
        "LocalGlobe",
        "Seedcamp",
        "Accel London",
        "HV Capital",
        "Speedinvest",
        "Cherry Ventures",
        "Point Nine",
        "Atomico",
        "Creandum",
        "Earlybird Venture Capital",
        "Project Europe",
        "Plural",
    ]
    rows = []
    for name in preferred:
        match = next((vc for vc in vcs if (vc.get("name") or "").lower() == name.lower()), None)
        if match and match not in rows:
            rows.append(match)
    for vc in vcs:
        if vc not in rows and vc.get("xHandle"):
            rows.append(vc)
        if len(rows) >= count:
            break
    return rows[:count]


def target_person(target: dict, existing_people_by_handle: dict[str, dict]) -> dict:
    existing = existing_people_by_handle.get(normalize_handle(target["handle"]))
    avatar_url = target_avatar_url(target) or (existing.get("avatarUrl") if existing else None)
    person = dict(existing or {})
    person.update(
        {
            "id": f"demo-{normalize_handle(target['handle'])}",
            "slug": slugify(target["name"]),
            "fullName": target["name"],
            "roleTitle": target["role"],
            "company": target["company"],
            "location": target["location"],
            "summary": target["summary"],
            "avatarUrl": avatar_url,
            "topPickNote": target["why"],
            "isWatchlist": True,
        }
    )
    return person


def make_seed_account(vc: dict, days_ago: int) -> dict:
    handle = normalize_handle(vc.get("xHandle"))
    return {
        "id": vc["id"],
        "name": vc.get("name") or vc.get("firm") or handle or "Signal source",
        "xHandle": handle or None,
        "accountType": vc.get("accountType") or "partner",
        "tier": vc.get("tier") or "vc",
        "profileUrl": f"https://x.com/{handle}" if handle else vc.get("twitterUrl") or vc.get("linkedinUrl"),
        "firstSeenAt": iso_date(days_ago),
        "lastSeenAt": iso_date(0),
    }


def build() -> dict:
    frontend = read_json_url("/frontend-data")
    triage = read_json_url("/triage/latest")

    vcs = [clean_vc(vc) for vc in frontend.get("vcSources", [])]
    vcs_by_id = {vc["id"]: vc for vc in vcs}
    fallback_vcs = find_fallback_vcs(vcs, 24)
    identities = list(frontend.get("personIdentities", []))
    existing_people = list(frontend.get("trackedPeople", []))
    existing_people_by_handle = {}
    for identity in identities:
        if identity.get("platform") == "x":
            person = next((row for row in existing_people if row.get("id") == identity.get("personId")), None)
            if person:
                existing_people_by_handle[normalize_handle(identity.get("handle"))] = person

    pitch_people = []
    pitch_identities = []
    pitch_alerts = []
    pitch_edges = []
    pitch_events = []
    pitch_profiles = []
    pitch_candidates = []
    pitch_results = []

    for index, target in enumerate(PITCH_TARGETS):
        person = target_person(target, existing_people_by_handle)
        person_id = person["id"]
        pitch_people.append(person)

        handle = normalize_handle(target["handle"])
        x_avatar_url = target_avatar_url(target)
        pitch_identities.append(
            {
                "id": f"{person_id}-x",
                "personId": person_id,
                "platform": "x",
                "handle": target["handle"].lstrip("@"),
                "profileUrl": f"https://x.com/{target['handle'].lstrip('@')}",
                "isPrimary": True,
            }
        )
        pitch_identities.append(
            {
                "id": f"{person_id}-linkedin",
                "personId": person_id,
                "platform": "linkedin",
                "handle": slugify(target["name"]),
                "profileUrl": f"https://www.linkedin.com/search/results/all/?keywords={target['name'].replace(' ', '%20')}",
                "isPrimary": False,
            }
        )
        if target.get("github"):
            pitch_identities.append(
                {
                    "id": f"{person_id}-github",
                    "personId": person_id,
                    "platform": "github",
                    "handle": target["github"]["handle"],
                    "profileUrl": f"https://github.com/{target['github']['handle']}",
                    "isPrimary": False,
                }
            )

        source_vcs = []
        for source_handle in target["seed_handles"]:
            match = first_match_by_handle(vcs, source_handle)
            if match and match not in source_vcs:
                source_vcs.append(match)
        for fallback in fallback_vcs:
            if len(source_vcs) >= min(target["followers"], 8):
                break
            if fallback not in source_vcs:
                source_vcs.append(fallback)

        seed_accounts = [make_seed_account(vc, 7 - min(index, 5)) for vc in source_vcs]
        trigger_accounts = seed_accounts[: max(3, min(4, len(seed_accounts)))]
        triggered_at = iso_datetime(3 + (index % 4))
        alert = {
            "id": f"demo-alert-{handle}",
            "personId": person_id,
            "displayName": target["name"],
            "xHandle": target["handle"].lstrip("@"),
            "xAvatarUrl": x_avatar_url,
            "avatarUrl": x_avatar_url,
            "primaryProfileUrl": f"https://x.com/{target['handle'].lstrip('@')}",
            "githubUrl": f"https://github.com/{target['github']['handle']}" if target.get("github") else None,
            "linkedinUrl": f"https://www.linkedin.com/search/results/all/?keywords={target['name'].replace(' ', '%20')}",
            "linkedinHeadline": f"{target['role']} · {target['company']}".strip(" ·"),
            "linkedinRoleTitle": target["role"],
            "linkedinCompany": target["company"],
            "linkedinLocation": target["location"],
            "linkedinEnrichedAt": triggered_at,
            "triggeredAt": triggered_at,
            "alertThreshold": 3,
            "triggeringSeedAccounts": trigger_accounts,
            "seedFollowers": seed_accounts,
            "currentSeedFollowerCount": target["followers"],
            "status": "new",
            "promotedVcId": None,
            "promotedAt": None,
        }
        pitch_alerts.append(alert)

        for edge_index, vc in enumerate(source_vcs):
            pitch_edges.append(
                {
                    "id": f"demo-edge-{vc['id']}-{person_id}",
                    "sourceId": vc["id"],
                    "targetId": person_id,
                    "platform": "x",
                    "eventCount": 1,
                    "isTopPick": target["decision"] in {"reach_out_now", "research_more"},
                    "graphSource": "snapshot",
                    "firstObservedAt": iso_date(7 - min(index, 5) + (edge_index % 3)),
                    "isRecent": True,
                    "followerCount": target["followers"],
                }
            )

        primary_source = trigger_accounts[0] if trigger_accounts else None
        pitch_events.append(
            {
                "id": f"demo-event-follow-{handle}",
                "personId": person_id,
                "vcSourceId": primary_source["id"] if primary_source else None,
                "platform": "x",
                "eventType": "vc_follow",
                "headline": f"{target['name']} crossed the 3-source signal threshold",
                "description": target["why"],
                "sourceUrl": f"https://x.com/{target['handle'].lstrip('@')}",
                "occurredAt": triggered_at,
                "metadata": {
                    "seedFollowerCount": target["followers"],
                    "category": target["category"],
                    "source": "findai_pitch.pdf",
                },
                "eventFingerprint": f"demo-follow-{handle}",
            }
        )
        if target.get("github"):
            github = target["github"]
            pitch_events.append(
                {
                    "id": f"demo-event-github-{handle}",
                    "personId": person_id,
                    "vcSourceId": "signal-github-radar",
                    "platform": "github",
                    "eventType": "repo_traction",
                    "headline": f"{github['repo']} picked up +{github['delta7']} stars in 7d",
                    "description": "GitHub builder proof attached to the founder signal.",
                    "sourceUrl": f"https://github.com/{github['repo']}",
                    "occurredAt": iso_datetime(2 + (index % 3), 10, 15),
                    "metadata": {
                        "repoLabel": github["repo"],
                        "stars": github["stars"],
                        "starDelta7d": github["delta7"],
                    },
                    "eventFingerprint": f"demo-github-{handle}",
                }
            )
            pitch_profiles.append(
                {
                    "personId": person_id,
                    "primaryRepoLabel": github["repo"],
                    "stars": github["stars"],
                    "forks": github["forks"],
                    "watchers": github["watchers"],
                    "openIssues": max(2, github["forks"] // 25),
                    "starDelta7d": github["delta7"],
                    "starDelta30d": github["delta30"],
                    "snapshotDate": iso_date(1),
                    "weeklyEventCount": 2,
                    "recentGithubEvents": max(1, github["delta7"] // 80),
                    "githubAttentionScore": min(100, 40 + github["delta7"] // 8),
                }
            )

        candidate = {
            "id": f"demo-candidate-{handle}",
            "personId": person_id,
            "displayName": target["name"],
            "xHandle": f"@{target['handle'].lstrip('@')}",
            "xAvatarUrl": x_avatar_url,
            "avatarUrl": x_avatar_url,
            "primaryProfileUrl": f"https://x.com/{target['handle'].lstrip('@')}",
            "xBio": target["summary"],
            "xPublicFollowerCount": 12000 + target["followers"] * 1100,
            "xVerified": target["followers"] >= 10,
            "linkedinUrl": alert["linkedinUrl"],
            "githubUrl": alert["githubUrl"],
            "linkedinHeadline": alert["linkedinHeadline"],
            "linkedinRoleTitle": target["role"],
            "linkedinCompany": target["company"],
            "linkedinLocation": target["location"],
            "githubContext": {
                "handle": target["github"]["handle"],
                "profileUrl": f"https://github.com/{target['github']['handle']}",
                "avatarUrl": f"https://github.com/{target['github']['handle']}.png?size=400",
                "accountType": "User",
                "bio": target["summary"],
                "company": target["company"],
                "location": target["location"],
                "blogUrl": None,
                "followers": max(1200, target["github"]["stars"] // 6),
                "publicRepos": 18 + index,
                "indicatorCount": 3,
                "builderSignal": f"{target['github']['repo']} shows +{target['github']['delta7']} stars in 7 days.",
                "topRepos": [
                    {
                        "repoLabel": target["github"]["repo"],
                        "repoUrl": f"https://github.com/{target['github']['repo']}",
                        "description": target["summary"],
                        "language": "TypeScript" if index % 2 else "Python",
                        "stars": target["github"]["stars"],
                        "forks": target["github"]["forks"],
                        "watchers": target["github"]["watchers"],
                        "starDelta7d": target["github"]["delta7"],
                        "starDelta30d": target["github"]["delta30"],
                        "snapshotDate": iso_date(1),
                        "pushedAt": iso_datetime(1, 12, 5),
                    }
                ],
                "events": [
                    {
                        "eventType": "repo_traction",
                        "title": f"+{target['github']['delta7']} stars in 7d",
                        "repoLabel": target["github"]["repo"],
                        "scoreImpact": 12,
                        "sourceUrl": f"https://github.com/{target['github']['repo']}",
                        "occurredAt": iso_datetime(2, 10, 15),
                    }
                ],
            },
            "triggeredAt": triggered_at,
            "threshold": 3,
            "qualified": True,
            "currentSeedFollowerCount": target["followers"],
            "triggeringSeedAccounts": trigger_accounts,
            "seedFollowers": seed_accounts,
            "evidence": [
                {
                    "type": "pitch_deck",
                    "label": "Founder appears in find.ai proof-of-signal pitch deck",
                    "source": "findai_pitch.pdf",
                    "observedAt": triggered_at,
                },
                {
                    "type": "seed_follow_cluster",
                    "label": f"{target['followers']} curated seed sources follow this profile",
                    "source": "local snapshot + demo enrichment",
                    "observedAt": triggered_at,
                },
            ],
        }
        pitch_candidates.append(candidate)
        pitch_results.append(
            {
                "rank": index + 1,
                "candidateId": candidate["id"],
                "personId": person_id,
                "displayName": target["name"],
                "xHandle": candidate["xHandle"],
                "xAvatarUrl": x_avatar_url,
                "avatarUrl": x_avatar_url,
                "primaryProfileUrl": candidate["primaryProfileUrl"],
                "xBio": target["summary"],
                "xPublicFollowerCount": candidate["xPublicFollowerCount"],
                "linkedinUrl": candidate["linkedinUrl"],
                "linkedinHeadline": candidate["linkedinHeadline"],
                "linkedinRoleTitle": candidate["linkedinRoleTitle"],
                "linkedinCompany": candidate["linkedinCompany"],
                "linkedinLocation": candidate["linkedinLocation"],
                "githubUrl": candidate["githubUrl"],
                "githubContext": candidate["githubContext"],
                "category": target["category"],
                "decision": target["decision"],
                "score": max(34, min(100, 50 + target["followers"] * 2 + (12 if target["decision"] == "reach_out_now" else 0))),
                "confidence": max(70, min(98, 72 + target["followers"])),
                "overview": target["summary"],
                "whyNow": target["why"],
                "missingContext": ["Confirm latest fundraising status", "Verify current company formation details"],
                "riskFlags": [] if target["decision"] == "reach_out_now" else ["Founder/company context still needs confirmation"],
                "nextAction": "Open profile, inspect seed-source overlap, and add to sourcing CRM.",
                "evidence": candidate["evidence"],
                "currentSeedFollowerCount": target["followers"],
            }
        )

    demo_signal_vc = {
        "id": "signal-github-radar",
        "slug": "github-radar",
        "name": "GitHub Radar",
        "title": "Signal source",
        "firm": "GitHub Radar",
        "sizeLabel": "Demo",
        "sectorFocus": "GitHub-derived builder momentum",
        "tier": "vc",
        "region": "",
        "country": "",
        "city": "",
        "xHandle": None,
        "twitterUrl": None,
        "xUserId": None,
        "linkedinUrl": None,
        "githubUsername": "github",
        "websiteUrl": "https://github.com",
        "clusterId": None,
        "clusterName": "GitHub Radar",
        "accountType": "other",
        "isPrimaryClusterAccount": True,
        "notes": "Synthetic source node for demo GitHub momentum events.",
        "isSeeded": False,
        "createdByUserId": "demo",
        "syncStatus": "idle",
        "lastXSyncAt": None,
        "lastGithubSyncAt": None,
        "lastSyncError": None,
    }
    if demo_signal_vc["id"] not in vcs_by_id:
        vcs.append(demo_signal_vc)

    target_ids = {person["id"] for person in pitch_people}
    target_handles = {normalize_handle(target["handle"]) for target in PITCH_TARGETS}
    target_names = {target["name"].strip().lower() for target in PITCH_TARGETS}
    target_slugs = {slugify(target["name"]) for target in PITCH_TARGETS}
    target_id_by_name = {
        person["fullName"].strip().lower(): person["id"] for person in pitch_people
    }
    target_id_by_slug = {person["slug"]: person["id"] for person in pitch_people}

    duplicate_person_id_to_target_id = {}
    for person in existing_people:
        name_key = (person.get("fullName") or person.get("name") or "").strip().lower()
        slug_key = slugify(person.get("slug") or person.get("fullName") or person.get("name") or "")
        target_id = target_id_by_name.get(name_key) or target_id_by_slug.get(slug_key)
        if target_id:
            duplicate_person_id_to_target_id[person.get("id")] = target_id

    def keep_non_duplicate_person(person: dict) -> bool:
        if person.get("id") in target_ids:
            return False
        if person.get("id") in duplicate_person_id_to_target_id:
            return False
        slug = slugify(person.get("slug") or person.get("fullName") or person.get("name") or "")
        name = (person.get("fullName") or person.get("name") or "").strip().lower()
        return slug not in target_slugs and name not in target_names

    people = [person for person in existing_people if keep_non_duplicate_person(person)] + pitch_people
    people_by_id = {person["id"]: person for person in people}

    existing_identities = [
        identity
        for identity in identities
        if identity.get("personId") in people_by_id
        and normalize_handle(identity.get("handle")) not in target_handles
    ]
    all_identities = existing_identities + pitch_identities

    existing_alerts = [
        alert
        for alert in frontend.get("seedFollowAlerts", [])
        if normalize_handle(alert.get("xHandle")) not in target_handles
    ]
    all_alerts = pitch_alerts + existing_alerts

    edge_pairs = {(edge.get("sourceId"), edge.get("targetId")) for edge in pitch_edges}
    existing_edges = []
    for edge in frontend.get("graphEdges", []):
        if edge.get("sourceId") not in {vc["id"] for vc in vcs}:
            continue
        edge_target_id = edge.get("targetId")
        mapped_target_id = duplicate_person_id_to_target_id.get(edge_target_id)
        if mapped_target_id:
            edge = dict(edge)
            edge["id"] = f"{edge.get('id')}-demo-remap"
            edge["targetId"] = mapped_target_id
            edge_target_id = mapped_target_id
        if edge_target_id not in people_by_id or edge_target_id in target_ids and not mapped_target_id:
            continue
        pair = (edge.get("sourceId"), edge_target_id)
        if pair in edge_pairs:
            continue
        edge_pairs.add(pair)
        existing_edges.append(edge)
    all_edges = pitch_edges + existing_edges

    existing_events = [
        event
        for event in frontend.get("activityEvents", [])
        if event.get("personId") in people_by_id and event.get("personId") not in target_ids
    ]
    all_events = pitch_events + existing_events

    existing_profiles = [
        profile
        for profile in frontend.get("githubSignalProfiles", [])
        if profile.get("personId") in people_by_id and profile.get("personId") not in target_ids
    ]
    all_profiles = pitch_profiles + existing_profiles

    triage_run = {
        "ok": True,
        "runId": "demo-pitch-run",
        "status": "completed",
        "provider": "demo",
        "model": "static-demo-snapshot",
        "mode": "mock",
        "threshold": 3,
        "candidateCount": len(pitch_candidates),
        "candidateLimit": len(pitch_candidates),
        "scannedCandidateCount": len(pitch_candidates),
        "qualifiedCount": len(pitch_candidates),
        "rawCandidates": pitch_candidates,
        "results": pitch_results,
        "agentLog": [
            {
                "stage": "snapshot",
                "message": "Loaded public-safe demo snapshot from local traqr.ai data.",
                "timestamp": iso_datetime(0, 9, 0),
            },
            {
                "stage": "pitch_deck",
                "message": "Attached 12 proof-of-signal targets from findai_pitch.pdf.",
                "timestamp": iso_datetime(0, 9, 1),
            },
            {
                "stage": "completed",
                "message": "Demo shortlist is ready without live backend calls.",
                "timestamp": iso_datetime(0, 9, 2),
            },
        ],
        "startedAt": iso_datetime(0, 9, 0),
        "completedAt": iso_datetime(0, 9, 2),
        "error": None,
    }

    return {
        "version": f"demo-{datetime.now(tz=timezone.utc).date().isoformat()}",
        "vcSources": vcs,
        "trackedPeople": people,
        "personIdentities": all_identities,
        "activityEvents": all_events,
        "weeklyPicks": frontend.get("weeklyPicks", []),
        "seedFollowAlerts": all_alerts,
        "githubSignalProfiles": all_profiles,
        "graphEdges": all_edges,
        "graphSource": "snapshot",
        "appSettings": {
            "seedFollowAlertThreshold": 3,
            "seedScan": {
                "latestRunAt": iso_datetime(0, 9, 2),
                "latestSnapshotAt": iso_datetime(0, 9, 2),
                "snapshotCount": len(all_edges),
                "scannedSeedCount": len(vcs),
                "observationCount": len(all_edges),
                "alertCount": len(all_alerts),
                "latestAlertAt": iso_datetime(0, 9, 2),
            },
        },
        "triageRun": triage_run,
    }


def main() -> int:
    payload = build()
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")
    print(
        json.dumps(
            {
                "vcSources": len(payload["vcSources"]),
                "trackedPeople": len(payload["trackedPeople"]),
                "personIdentities": len(payload["personIdentities"]),
                "seedFollowAlerts": len(payload["seedFollowAlerts"]),
                "graphEdges": len(payload["graphEdges"]),
                "triageResults": len(payload["triageRun"]["results"]),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
