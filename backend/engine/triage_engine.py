from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

import requests

from backend.config import Settings, get_settings
from backend.db import SupabaseDB, normalize_handle, utc_now

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {"active_founder", "potential_founder", "company_no_raise_yet"}
VALID_DECISIONS = {"reach_out_now", "research_more", "watch", "discard"}
OBVIOUS_SIGNAL_MAGNET_HANDLES = {
    "anthropicai",
    "claudeai",
    "darioamodei",
    "demishassabis",
    "johncoogan",
    "leopoldasch",
    "ylecun",
    "openai",
    "palmerluckey",
    "willmanidis",
}
KNOWN_VC_PARTNER_HANDLES = {
    "ethanchoi7",
    "anjneymidha",
    "joshuakushner",
}
OBVIOUS_SIGNAL_MAGNET_NAMES = {
    "anthropic",
    "claude",
    "dario amodei",
    "demis hassabis",
    "openai",
    "palmer luckey",
    "yann lecun",
}
BIG_VC_FIRM_TOKENS = {
    "@a16z",
    "@accel",
    "@khoslaventures",
    "@sequoia",
    "a16z",
    "accel",
    "andreessen horowitz",
    "benchmark",
    "bessemer",
    "general catalyst",
    "greylock",
    "index ventures",
    "khosla",
    "khosla ventures",
    "khoslaventures",
    "kleiner perkins",
    "lightspeed",
    "sequoia",
    "sequoia capital",
    "thrive capital",
    "union square ventures",
}
VC_ROLE_TOKENS = {
    "general partner",
    "managing partner",
    "partner",
    "principal",
    "venture partner",
}
FOUNDER_SIGNAL_TOKENS = {
    "building",
    "co-founder",
    "cofounder",
    "founder",
    "founding",
    "newco",
    "pre-seed",
    "preseed",
    "seed",
    "stealth",
}
ESTABLISHED_AI_LAB_TOKENS = {
    "@anthropicai",
    "@openai",
    "anthropic",
    "claude code",
    "deepmind",
    "google deepmind",
    "openai",
}
NON_FOUNDER_MEDIA_TOKENS = {
    "monitor the situation",
    "signal tip line",
    "watch history in the making",
}
INVESTOR_PROFILE_TOKENS = {
    "asset managers",
    "capital allocator",
    "fund manager",
    "investment generalist",
    "investor",
    "private equity",
    "venture capital",
}
NON_FOUNDER_OPERATOR_TOKENS = {
    "principal ideas guy",
    "principal @",
    "principal at",
    "partner @",
    "partner at",
    "venture partner",
}
ESTABLISHED_OPERATOR_TOKENS = {
    "@cursor_ai ceo",
    "cursor_ai ceo",
    "cursor ceo",
}
PUBLIC_PROFILE_FOLLOWER_LIMIT = 100_000


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _compact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _compact(item) for key, item in value.items() if item not in (None, "", [], {})}
    if isinstance(value, list):
        return [_compact(item) for item in value if item not in (None, "", [], {})]
    return value


def _extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if not stripped:
        raise ValueError("Featherless returned an empty response.")

    candidates = [stripped]
    if stripped.startswith("```"):
        unfenced = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        unfenced = re.sub(r"\s*```$", "", unfenced).strip()
        candidates.append(unfenced)

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        candidates.append(stripped[start : end + 1])

    last_error: json.JSONDecodeError | None = None
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            break
        except json.JSONDecodeError as exc:
            last_error = exc
            try:
                parsed = json.loads(_repair_model_json(candidate))
                break
            except json.JSONDecodeError as repaired_exc:
                last_error = repaired_exc
    else:
        if start < 0 or end <= start:
            raise ValueError("Featherless response did not contain a JSON object.") from None
        detail = f" line {last_error.lineno} column {last_error.colno}" if last_error else ""
        raise ValueError(f"Featherless response was not valid JSON{detail}.") from None

    if not isinstance(parsed, dict):
        raise ValueError("Featherless response JSON must be an object.")
    return parsed


def _repair_model_json(text: str) -> str:
    repaired = text.strip()
    repaired = re.sub(r"^```(?:json)?\s*", "", repaired, flags=re.IGNORECASE)
    repaired = re.sub(r"\s*```$", "", repaired).strip()
    repaired = re.sub(r",(\s*[}\]])", r"\1", repaired)
    repaired = re.sub(r"}\s*(?={)", "},", repaired)
    repaired = re.sub(r"]\s*(?={)", "],", repaired)
    repaired = re.sub(r'"\s*(?="(?:candidateId|candidate_id|id|category|decision|score|confidence|whyNow|why_now|missingContext|missing_context|riskFlags|risk_flags|nextAction|next_action)")', '",', repaired)
    return repaired


def _label_seed(seed: dict[str, Any]) -> str:
    handle = _as_text(seed.get("xHandle"))
    name = _as_text(seed.get("name")) or "Seed source"
    return f"{name} (@{handle})" if handle else name


def _extract_github_handle_from_url(value: Any) -> str | None:
    text = _as_text(value)
    if not text:
        return None
    match = re.search(r"github\.com/([A-Za-z0-9-]{1,39})(?:[/?#]|$)", text, flags=re.IGNORECASE)
    if not match:
        return None
    handle = match.group(1).strip("-").lower()
    if handle in {"apps", "blog", "collections", "features", "marketplace", "orgs", "pricing", "topics"}:
        return None
    return handle or None


@dataclass(slots=True)
class TriageEngine:
    db: SupabaseDB
    settings: Settings

    @classmethod
    def build(cls) -> "TriageEngine":
        settings = get_settings()
        return cls(db=SupabaseDB.from_settings(settings), settings=settings)

    def latest_payload(self) -> dict[str, Any]:
        run = self.db.get_latest_triage_run()
        if not run:
            return {
                "ok": True,
                "status": "empty",
                "provider": "featherless",
                "model": self.settings.featherless_triage_model,
                "threshold": self.db.get_seed_follow_alert_threshold(),
                "rawCandidates": [],
                "results": [],
                "agentLog": [],
            }
        payload = run.get("payload") or {}
        payload["ok"] = run.get("status") != "error"
        return payload

    def run(self) -> dict[str, Any]:
        run_id = str(uuid4())
        started_at = utc_now().isoformat()
        threshold = max(3, self.db.get_seed_follow_alert_threshold())
        provider = "featherless"
        model = self.settings.featherless_triage_model
        agent_log: list[dict[str, Any]] = [
            self._log("system", f"Starting Anytrace.ai signal triage with {threshold}+ source threshold.", started_at),
        ]

        latest_linkedin = self.db.list_latest_linkedin_enrichments_by_person()
        x_profile_cache = self._load_x_profile_cache()
        github_context_maps = self._load_github_context_maps()
        alerts = self.db.list_seed_follow_alerts()
        all_candidates = [
            self._candidate_from_alert(
                alert,
                latest_linkedin.get(alert["discovered_person_id"]),
                self._x_profile_for_handle(x_profile_cache, alert.get("x_handle")),
                self._github_context_for_alert(
                    alert,
                    self._x_profile_for_handle(x_profile_cache, alert.get("x_handle")),
                    github_context_maps,
                ),
            )
            for alert in alerts
        ]
        raw_candidates = self._prioritize_candidates(all_candidates)[: self.settings.triage_candidate_limit]
        if self.settings.github_public_lookup:
            for candidate in raw_candidates:
                if candidate.get("githubContext"):
                    continue
                github_context = self._fetch_public_github_context_for_x_handle(candidate.get("xHandle"))
                if not github_context:
                    continue
                self._attach_github_context(candidate, github_context)
                agent_log.append(
                    self._log(
                        "github",
                        f"Resolved GitHub @{github_context.get('handle')} for {candidate.get('xHandle') or candidate.get('displayName')} via verified Twitter link.",
                    )
                )
        qualified = [candidate for candidate in raw_candidates if candidate["qualified"]]
        target_candidates: list[dict[str, Any]] = []

        for candidate in raw_candidates:
            count = candidate["currentSeedFollowerCount"]
            handle = candidate.get("xHandle") or candidate["displayName"]
            agent_log.append(
                self._log(
                    "collector",
                    f"Checking {threshold}+ follow threshold for {handle}: {count} tracked source{'s' if count != 1 else ''}.",
                )
            )
            if candidate["qualified"]:
                exclusion_reason = self._exclusion_reason(candidate)
                if exclusion_reason:
                    agent_log.append(self._log("filter", f"Excluding {handle} from top picks: {exclusion_reason}."))
                else:
                    target_candidates.append(candidate)
                    agent_log.append(self._log("resolver", f"Resolving pre-seed founder/company context for {handle}."))
                    github_signal = (candidate.get("githubContext") or {}).get("builderSignal")
                    if github_signal:
                        agent_log.append(self._log("github", f"Adding GitHub builder evidence for {handle}: {github_signal}."))
            else:
                agent_log.append(self._log("collector", f"Skipping {handle}: below Anytrace.ai proof-of-signal threshold."))

        if not target_candidates:
            completed_at = utc_now().isoformat()
            payload = self._payload(
                ok=True,
                run_id=run_id,
                status="completed",
                threshold=threshold,
                provider=provider,
                model=model,
                started_at=started_at,
                completed_at=completed_at,
                raw_candidates=raw_candidates,
                results=[],
                agent_log=agent_log
                + [
                    self._log(
                        "decision",
                        "No pre-seed founder-grade profiles remained after removing obvious network magnets.",
                    )
                ],
            )
            return self._store_payload(payload)

        agent_log.append(
            self._log(
                "model",
                f"Calling Featherless triage model {model or 'unconfigured'} for {len(target_candidates)} pre-seed founder candidate{'s' if len(target_candidates) != 1 else ''}.",
            )
        )

        if self.settings.featherless_triage_mock:
            results = self._mock_results(target_candidates)
            agent_log.append(self._log("model", "Mock mode enabled; generated deterministic Featherless-shaped triage."))
        else:
            try:
                results = self._call_featherless(target_candidates)
            except Exception as exc:
                logger.warning("Featherless triage failed: %s", exc)
                completed_at = utc_now().isoformat()
                payload = self._payload(
                    ok=False,
                    run_id=run_id,
                    status="error",
                    threshold=threshold,
                    provider=provider,
                    model=model,
                    started_at=started_at,
                    completed_at=completed_at,
                    raw_candidates=raw_candidates,
                    results=[],
                    agent_log=agent_log + [self._log("error", f"Featherless triage failed: {exc}")],
                    error=str(exc),
                )
                return self._store_payload(payload)

        candidate_by_id = {candidate["id"]: candidate for candidate in target_candidates}
        normalized_results = [
            self._finalize_result(result, candidate_by_id)
            for result in self._normalize_results(results, target_candidates)
            if result.get("decision") != "discard"
        ]
        normalized_results.sort(
            key=lambda row: (
                -self._decision_priority(_as_text(row.get("decision"))),
                -int(row.get("score") or 0),
                -int(row.get("confidence") or 0),
                row["displayName"],
            )
        )
        for index, result in enumerate(normalized_results, start=1):
            result["rank"] = index
            agent_log.append(
                self._log(
                    "decision",
                    f"#{index} {result['displayName']}: {result['decision']} ({result['category']}) because {result['whyNow']}",
                )
            )

        completed_at = utc_now().isoformat()
        payload = self._payload(
            ok=True,
            run_id=run_id,
            status="completed",
            threshold=threshold,
            provider=provider,
            model=model,
            started_at=started_at,
            completed_at=completed_at,
            raw_candidates=raw_candidates,
            results=normalized_results,
            agent_log=agent_log,
        )
        return self._store_payload(payload)

    def _store_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.db.insert_triage_run(
            run_id=payload["runId"],
            status=payload["status"],
            threshold=int(payload["threshold"]),
            provider=payload["provider"],
            model=payload.get("model"),
            candidate_count=int(payload["candidateCount"]),
            qualified_count=int(payload["qualifiedCount"]),
            payload=payload,
            started_at=payload["startedAt"],
            completed_at=payload.get("completedAt"),
            error=payload.get("error"),
        )
        return payload

    def _payload(
        self,
        *,
        ok: bool,
        run_id: str,
        status: str,
        threshold: int,
        provider: str,
        model: str | None,
        started_at: str,
        completed_at: str,
        raw_candidates: list[dict[str, Any]],
        results: list[dict[str, Any]],
        agent_log: list[dict[str, Any]],
        error: str | None = None,
    ) -> dict[str, Any]:
        return {
            "ok": ok,
            "runId": run_id,
            "status": status,
            "provider": provider,
            "model": model,
            "mode": "mock" if self.settings.featherless_triage_mock else "live",
            "threshold": threshold,
            "candidateCount": len(raw_candidates),
            "scannedCandidateCount": len(raw_candidates),
            "candidateLimit": self.settings.triage_candidate_limit,
            "qualifiedCount": len([candidate for candidate in raw_candidates if candidate.get("qualified")]),
            "rawCandidates": raw_candidates,
            "results": results,
            "agentLog": agent_log,
            "startedAt": started_at,
            "completedAt": completed_at,
            "error": error,
        }

    def _load_x_profile_cache(self) -> dict[str, dict[str, Any]]:
        path = Path(self.settings.local_db_path).parent / "x_profile_cache.json"
        if not path.exists():
            return {}
        try:
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Could not read X profile cache for triage: %s", exc)
            return {}
        if not isinstance(payload, dict):
            return {}
        return {normalize_handle(key): value for key, value in payload.items() if isinstance(value, dict)}

    @staticmethod
    def _x_profile_for_handle(cache: dict[str, dict[str, Any]], handle: Any) -> dict[str, Any] | None:
        normalized = normalize_handle(handle)
        if not normalized:
            return None
        return cache.get(normalized)

    @staticmethod
    def _github_url_from_x_profile(x_profile: dict[str, Any] | None) -> str | None:
        profile = x_profile or {}
        for key in ["website", "url", "expandedUrl", "expanded_url"]:
            value = _as_text(profile.get(key))
            handle = _extract_github_handle_from_url(value)
            if handle:
                return f"https://github.com/{handle}"
        return None

    def _load_github_context_maps(self) -> dict[str, dict[str, dict[str, Any]]]:
        by_x_handle: dict[str, dict[str, Any]] = {}
        by_github_handle: dict[str, dict[str, Any]] = {}
        snapshots_by_person = self.db.list_latest_github_repo_snapshots_by_tracked_person()
        events_by_person = self.db.list_recent_github_person_events_by_tracked_person(limit_per_person=4)

        for person in self.db.list_tracked_git_people(active_only=True):
            github_handle = normalize_handle(person.get("github_username"))
            if not github_handle:
                continue
            context = self._github_context_from_tracked_person(
                person,
                snapshots_by_person.get(str(person.get("id") or ""), []),
                events_by_person.get(str(person.get("id") or ""), []),
            )
            by_github_handle[github_handle] = context
            x_handle = normalize_handle(person.get("twitter_handle"))
            if x_handle:
                by_x_handle[x_handle] = context

        for observed in self.db.list_github_observed_people():
            github_handle = normalize_handle(observed.get("github_username"))
            if not github_handle:
                continue
            context = self._github_context_from_observed_person(observed)
            by_github_handle.setdefault(github_handle, context)
            x_handle = normalize_handle(observed.get("twitter_handle"))
            if x_handle and self._github_context_strength(context) >= self._github_context_strength(by_x_handle.get(x_handle)):
                by_x_handle[x_handle] = context

        return {"by_x_handle": by_x_handle, "by_github_handle": by_github_handle}

    def _github_context_for_alert(
        self,
        alert: dict[str, Any],
        x_profile: dict[str, Any] | None,
        maps: dict[str, dict[str, dict[str, Any]]],
    ) -> dict[str, Any] | None:
        x_handle = normalize_handle(alert.get("x_handle"))
        if x_handle:
            matched = maps["by_x_handle"].get(x_handle)
            if matched:
                return matched

        github_handles = [
            _extract_github_handle_from_url(alert.get("github_url")),
            _extract_github_handle_from_url(self._github_url_from_x_profile(x_profile)),
        ]
        for handle in github_handles:
            if not handle:
                continue
            matched = maps["by_github_handle"].get(handle)
            if matched:
                return matched
            return self._minimal_github_context(handle)
        return None

    @classmethod
    def _github_context_from_tracked_person(
        cls,
        person: dict[str, Any],
        snapshots: list[dict[str, Any]],
        events: list[dict[str, Any]],
    ) -> dict[str, Any]:
        handle = normalize_handle(person.get("github_username")) or ""
        top_repos = [cls._github_repo_context(snapshot, handle) for snapshot in snapshots[:5]]
        recent_events = [cls._github_event_context(event) for event in events[:4]]
        context = _compact(
            {
                "handle": handle,
                "profileUrl": f"https://github.com/{handle}" if handle else None,
                "bio": person.get("summary"),
                "company": person.get("company"),
                "location": person.get("location"),
                "source": "tracked_github_profile",
                "topRepos": top_repos,
                "events": recent_events,
            }
        )
        context["builderSignal"] = cls._github_builder_signal(context)
        return context

    @classmethod
    def _github_context_from_observed_person(cls, observed: dict[str, Any]) -> dict[str, Any]:
        handle = normalize_handle(observed.get("github_username")) or ""
        context = _compact(
            {
                "handle": handle,
                "profileUrl": observed.get("profile_url") or (f"https://github.com/{handle}" if handle else None),
                "avatarUrl": observed.get("avatar_url"),
                "bio": observed.get("bio"),
                "company": observed.get("company"),
                "location": observed.get("location"),
                "blogUrl": observed.get("blog_url"),
                "followers": cls._optional_int(observed.get("followers_count")),
                "publicRepos": cls._optional_int(observed.get("public_repos_count")),
                "indicatorCount": cls._optional_int(observed.get("indicator_count")),
                "indicators": observed.get("indicators") or [],
                "source": "observed_github_network",
            }
        )
        context["builderSignal"] = cls._github_builder_signal(context)
        return context

    @staticmethod
    def _minimal_github_context(handle: str) -> dict[str, Any]:
        context = {
            "handle": handle,
            "profileUrl": f"https://github.com/{handle}",
            "source": "linked_github_profile",
        }
        context["builderSignal"] = "GitHub profile is linked, but repo traction still needs verification."
        return context

    def _fetch_public_github_context_for_x_handle(self, x_handle: Any) -> dict[str, Any] | None:
        normalized_x = normalize_handle(x_handle)
        if not normalized_x:
            return None
        headers = {"Accept": "application/vnd.github+json"}
        if self.settings.github_token:
            headers["Authorization"] = f"Bearer {self.settings.github_token}"
        try:
            response = requests.get(f"https://api.github.com/users/{normalized_x}", headers=headers, timeout=8)
        except requests.RequestException as exc:
            logger.info("GitHub public profile lookup failed for %s: %s", normalized_x, exc)
            return None
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            logger.info("GitHub public profile lookup for %s returned HTTP %s", normalized_x, response.status_code)
            return None

        user = response.json()
        github_twitter = normalize_handle(user.get("twitter_username"))
        if github_twitter != normalized_x:
            return None
        github_handle = normalize_handle(user.get("login"))
        if not github_handle:
            return None

        repos: list[dict[str, Any]] = []
        try:
            repo_response = requests.get(
                f"https://api.github.com/users/{github_handle}/repos",
                headers=headers,
                params={"sort": "updated", "per_page": 10},
                timeout=8,
            )
            if repo_response.status_code < 400:
                repos = [repo for repo in repo_response.json() if isinstance(repo, dict)]
        except requests.RequestException as exc:
            logger.info("GitHub repo lookup failed for %s: %s", github_handle, exc)

        top_repos = [
            self._github_repo_context_from_api(repo)
            for repo in sorted(repos, key=lambda repo: int(repo.get("stargazers_count") or 0), reverse=True)[:5]
        ]
        context = _compact(
            {
                "handle": github_handle,
                "profileUrl": user.get("html_url") or f"https://github.com/{github_handle}",
                "avatarUrl": user.get("avatar_url"),
                "accountType": user.get("type"),
                "bio": user.get("bio"),
                "company": user.get("company"),
                "location": user.get("location"),
                "blogUrl": user.get("blog"),
                "followers": self._optional_int(user.get("followers")),
                "publicRepos": self._optional_int(user.get("public_repos")),
                "source": "github_public_profile_verified_twitter",
                "topRepos": top_repos,
            }
        )
        context["builderSignal"] = self._github_builder_signal(context)
        return context

    @staticmethod
    def _github_repo_context_from_api(repo: dict[str, Any]) -> dict[str, Any]:
        owner = (repo.get("owner") or {}).get("login")
        name = _as_text(repo.get("name"))
        repo_label = "/".join(part for part in [_as_text(owner), name] if part)
        return _compact(
            {
                "repoOwner": owner,
                "repoName": name or None,
                "repoLabel": repo_label or None,
                "repoUrl": repo.get("html_url") or (f"https://github.com/{repo_label}" if repo_label else None),
                "description": repo.get("description"),
                "language": repo.get("language"),
                "stars": repo.get("stargazers_count"),
                "forks": repo.get("forks_count"),
                "watchers": repo.get("watchers_count"),
                "openIssues": repo.get("open_issues_count"),
                "pushedAt": repo.get("pushed_at"),
            }
        )

    @classmethod
    def _attach_github_context(cls, candidate: dict[str, Any], context: dict[str, Any]) -> None:
        if not context:
            return
        github_url = _as_text(context.get("profileUrl"))
        candidate["githubContext"] = context
        if github_url:
            candidate["githubUrl"] = github_url
        evidence = candidate.setdefault("evidence", [])
        if github_url and not any(item.get("type") == "github_context" for item in evidence):
            evidence.append(
                {
                    "type": "github_context",
                    "label": "GitHub profile linked to the signal profile",
                    "source": github_url,
                }
            )
        if context.get("builderSignal") and not any(item.get("type") == "github_builder_evidence" for item in evidence):
            evidence.append(
                {
                    "type": "github_builder_evidence",
                    "label": context["builderSignal"],
                    "source": github_url or context.get("profileUrl"),
                }
            )
        existing_repos = {
            _as_text(item.get("label")).split(":", 1)[0]
            for item in evidence
            if item.get("type") == "github_repo_signal"
        }
        for repo in (context.get("topRepos") or [])[:2]:
            repo_label = _as_text(repo.get("repoLabel"))
            if not repo_label or repo_label in existing_repos:
                continue
            stars = cls._optional_int(repo.get("stars")) or 0
            delta = cls._optional_int(repo.get("starDelta7d")) or 0
            evidence.append(
                {
                    "type": "github_repo_signal",
                    "label": f"{repo_label}: {stars} stars" + (f", +{delta} this week" if delta else ""),
                    "source": repo.get("repoUrl") or github_url,
                    "observedAt": repo.get("snapshotDate") or repo.get("pushedAt"),
                }
            )

    @classmethod
    def _github_repo_context(cls, snapshot: dict[str, Any], fallback_owner: str) -> dict[str, Any]:
        owner = _as_text(snapshot.get("repo_owner")) or fallback_owner
        name = _as_text(snapshot.get("repo_name"))
        repo_label = "/".join(part for part in [owner, name] if part)
        return _compact(
            {
                "repoOwner": owner or None,
                "repoName": name or None,
                "repoLabel": repo_label or None,
                "repoUrl": f"https://github.com/{repo_label}" if repo_label else None,
                "stars": cls._optional_int(snapshot.get("stars")),
                "forks": cls._optional_int(snapshot.get("forks")),
                "watchers": cls._optional_int(snapshot.get("watchers")),
                "openIssues": cls._optional_int(snapshot.get("open_issues")),
                "starDelta7d": cls._optional_int(snapshot.get("star_delta_7d")),
                "starDelta30d": cls._optional_int(snapshot.get("star_delta_30d")),
                "snapshotDate": snapshot.get("snapshot_date"),
            }
        )

    @staticmethod
    def _github_event_context(event: dict[str, Any]) -> dict[str, Any]:
        detail = event.get("detail") or {}
        repo_label = detail.get("repoLabel") or "/".join(
            part for part in [_as_text(event.get("repo_owner")), _as_text(event.get("repo_name"))] if part
        )
        return _compact(
            {
                "eventType": event.get("event_type"),
                "title": event.get("title"),
                "repoLabel": repo_label or None,
                "scoreImpact": event.get("score_impact"),
                "sourceUrl": event.get("source_url"),
                "occurredAt": event.get("occurred_at"),
            }
        )

    @classmethod
    def _github_builder_signal(cls, context: dict[str, Any]) -> str:
        events = context.get("events") or []
        for event in events:
            if _as_text(event.get("eventType")) == "repo_traction" and event.get("title"):
                return _as_text(event["title"])[:180]

        repos = context.get("topRepos") or []
        for repo in repos:
            repo_label = _as_text(repo.get("repoLabel"))
            delta = cls._optional_int(repo.get("starDelta7d")) or 0
            stars = cls._optional_int(repo.get("stars")) or 0
            if repo_label and delta > 0:
                return f"Builder proof: {repo_label} gained +{delta} GitHub stars this week."
            if repo_label and stars >= 50:
                return f"Builder proof: {repo_label} has {stars} GitHub stars."

        public_repos = cls._optional_int(context.get("publicRepos")) or 0
        followers = cls._optional_int(context.get("followers")) or 0
        if public_repos >= 3 or followers >= 20:
            return f"GitHub profile shows {public_repos} public repos and {followers} followers."
        if context.get("bio") or context.get("company"):
            return "GitHub profile adds builder/company context to the source cluster."
        return "GitHub profile is linked, but repo traction still needs verification."

    @classmethod
    def _github_context_strength(cls, context: dict[str, Any] | None) -> int:
        if not context:
            return 0
        score = 1 if context.get("profileUrl") else 0
        score += 2 if context.get("bio") else 0
        score += 2 if context.get("company") else 0
        score += min(4, cls._optional_int(context.get("indicatorCount")) or 0)
        score += min(4, len(context.get("topRepos") or []))
        score += min(4, len(context.get("events") or []))
        for repo in (context.get("topRepos") or [])[:3]:
            score += 4 if (cls._optional_int(repo.get("starDelta7d")) or 0) > 0 else 0
        return score

    def _candidate_from_alert(
        self,
        alert: dict[str, Any],
        linkedin: dict[str, Any] | None,
        x_profile: dict[str, Any] | None = None,
        github_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        x_handle = normalize_handle(alert.get("x_handle"))
        follower_count = int(alert.get("current_seed_follower_count") or 0)
        threshold = max(3, int(alert.get("trigger_threshold") or self.db.get_seed_follow_alert_threshold()))
        seed_followers = alert.get("seed_followers") or []
        triggering_seed_accounts = alert.get("triggering_seed_accounts") or []
        display_name = _as_text(alert.get("display_name")) or (f"@{x_handle}" if x_handle else "Discovered profile")
        linkedin = linkedin or {}
        linkedin_url = _as_text(alert.get("linkedin_url")) or _as_text(linkedin.get("linkedin_url"))
        linkedin_headline = _as_text(linkedin.get("headline"))
        linkedin_role = _as_text(linkedin.get("role_title"))
        linkedin_company = _as_text(linkedin.get("company"))
        linkedin_location = _as_text(linkedin.get("location"))
        x_profile = x_profile or {}
        github_context = github_context or {}
        x_bio = _as_text(x_profile.get("bio"))
        x_avatar_url = _as_text(
            x_profile.get("avatar")
            or x_profile.get("avatarUrl")
            or x_profile.get("profileImageUrl")
            or x_profile.get("profile_image_url")
        )
        x_public_followers = self._optional_int(x_profile.get("followerCount"))
        x_verified = bool(x_profile.get("verified") or x_profile.get("isBlueVerified") or x_profile.get("isIdentityVerified"))
        primary_profile_url = _as_text(alert.get("primary_profile_url")) or (f"https://x.com/{x_handle}" if x_handle else "")
        github_url = (
            _as_text(alert.get("github_url"))
            or _as_text(github_context.get("profileUrl"))
            or self._github_url_from_x_profile(x_profile)
            or None
        )
        evidence = [
            {
                "type": "x_follow_cluster",
                "label": f"{follower_count} curated signal sources follow this profile",
                "source": "Anytrace.ai signal network",
            },
            *[
                {
                    "type": "seed_source",
                    "label": _label_seed(seed),
                    "observedAt": seed.get("firstSeenAt") or seed.get("lastSeenAt"),
                    "source": seed.get("profileUrl"),
                }
                for seed in seed_followers[:8]
            ],
        ]
        if linkedin_headline or linkedin_role or linkedin_company:
            evidence.append(
                {
                    "type": "linkedin_context",
                    "label": " / ".join(item for item in [linkedin_role, linkedin_company, linkedin_headline] if item),
                    "source": linkedin_url or None,
                }
            )
        if github_url:
            evidence.append(
                {
                    "type": "github_context",
                    "label": "GitHub profile linked to the signal profile",
                    "source": github_url,
                }
            )
        if github_context.get("builderSignal"):
            evidence.append(
                {
                    "type": "github_builder_evidence",
                    "label": github_context["builderSignal"],
                    "source": github_context.get("profileUrl") or github_url,
                }
            )
        for repo in (github_context.get("topRepos") or [])[:2]:
            repo_label = _as_text(repo.get("repoLabel")) or _as_text(repo.get("name"))
            stars = self._optional_int(repo.get("stars")) or 0
            delta = self._optional_int(repo.get("starDelta7d")) or 0
            if not repo_label:
                continue
            evidence.append(
                {
                    "type": "github_repo_signal",
                    "label": f"{repo_label}: {stars} stars" + (f", +{delta} this week" if delta else ""),
                    "source": repo.get("repoUrl") or github_url,
                    "observedAt": repo.get("snapshotDate"),
                }
            )
        if x_bio:
            evidence.append(
                {
                    "type": "x_profile_context",
                    "label": f"X bio: {x_bio[:180]}",
                    "source": primary_profile_url or None,
                }
            )
        return _compact(
            {
                "id": alert["id"],
                "personId": alert["discovered_person_id"],
                "displayName": display_name,
                "xHandle": f"@{x_handle}" if x_handle else None,
                "xAvatarUrl": x_avatar_url or None,
                "primaryProfileUrl": primary_profile_url,
                "githubUrl": github_url,
                "githubContext": github_context or None,
                "linkedinUrl": linkedin_url or None,
                "linkedinHeadline": linkedin_headline or None,
                "linkedinRoleTitle": linkedin_role or None,
                "linkedinCompany": linkedin_company or None,
                "linkedinLocation": linkedin_location or None,
                "xBio": x_bio or None,
                "xPublicFollowerCount": x_public_followers,
                "xVerified": x_verified,
                "triggeredAt": alert.get("triggered_at"),
                "threshold": threshold,
                "qualified": follower_count >= threshold,
                "currentSeedFollowerCount": follower_count,
                "triggeringSeedAccounts": triggering_seed_accounts,
                "seedFollowers": seed_followers,
                "evidence": evidence,
            }
        )

    @staticmethod
    def _prioritize_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        def time_value(candidate: dict[str, Any]) -> str:
            return str(candidate.get("triggeredAt") or "")

        return sorted(
            candidates,
            key=lambda candidate: (
                bool(candidate.get("qualified")),
                int(candidate.get("currentSeedFollowerCount") or 0),
                time_value(candidate),
            ),
            reverse=True,
        )

    @staticmethod
    def _candidate_text(candidate: dict[str, Any]) -> str:
        github_context = candidate.get("githubContext") or {}
        github_repos = github_context.get("topRepos") or []
        fragments = [
            *[
                _as_text(candidate.get(key))
                for key in [
                    "displayName",
                    "xHandle",
                    "xBio",
                    "linkedinHeadline",
                    "linkedinRoleTitle",
                    "linkedinCompany",
                    "linkedinLocation",
                ]
            ],
            *[
                _as_text(github_context.get("bio")),
                _as_text(github_context.get("company")),
                _as_text(github_context.get("builderSignal")),
                *[_as_text(repo.get("repoLabel")) for repo in github_repos[:3]],
                *[_as_text(repo.get("description")) for repo in github_repos[:3]],
            ],
        ]
        return " ".join(fragments).lower()

    @classmethod
    def _exclusion_reason(cls, candidate: dict[str, Any]) -> str | None:
        handle = normalize_handle(candidate.get("xHandle"))
        display_name = _as_text(candidate.get("displayName")).lower()
        text = cls._candidate_text(candidate)

        if handle in OBVIOUS_SIGNAL_MAGNET_HANDLES or display_name in OBVIOUS_SIGNAL_MAGNET_NAMES:
            return "obvious network gravity from an established AI lab, public figure, or large company"
        github_context = candidate.get("githubContext") or {}
        if _as_text(github_context.get("accountType")).lower() == "organization":
            return "GitHub organization or product account; not an individual founder lead"
        if handle in KNOWN_VC_PARTNER_HANDLES:
            return "known partner/founder of a large VC firm, not a pre-seed founder lead"
        if any(firm in text for firm in BIG_VC_FIRM_TOKENS) and any(role in text for role in VC_ROLE_TOKENS):
            return "large VC partner profile; the follow cluster is expected, not alpha"
        if "venture capital" in text and any(role in text for role in VC_ROLE_TOKENS):
            return "venture-capital operator profile; not a founder raising pre-seed"
        if any(token in text for token in ESTABLISHED_AI_LAB_TOKENS) and not any(
            token in text for token in {"founder", "co-founder", "cofounder", "stealth", "newco", "pre-seed", "preseed"}
        ):
            return "established AI-lab or large-company profile; not a pre-seed founder lead"
        if any(token in text for token in ESTABLISHED_OPERATOR_TOKENS):
            return "established company operator; strong network gravity but no pre-seed timing signal"
        if any(token in text for token in NON_FOUNDER_MEDIA_TOKENS):
            return "media or monitoring account; not a founder-grade profile"
        if any(token in text for token in INVESTOR_PROFILE_TOKENS) and not any(
            token in text for token in {"founder", "co-founder", "cofounder", "stealth", "newco", "pre-seed", "preseed"}
        ):
            return "investor profile; the follow cluster is expected, not founder alpha"
        if any(token in text for token in NON_FOUNDER_OPERATOR_TOKENS) and not any(
            token in text for token in {"founder", "co-founder", "cofounder", "stealth", "newco", "pre-seed", "preseed"}
        ):
            return "operator or investor role without founder/pre-seed signal"
        public_followers = cls._optional_int(candidate.get("xPublicFollowerCount")) or 0
        has_structured_context = bool(
            candidate.get("linkedinHeadline")
            or candidate.get("linkedinRoleTitle")
            or candidate.get("linkedinCompany")
            or candidate.get("githubUrl")
            or candidate.get("githubContext")
        )
        has_strong_founder_signal = any(
            token in text for token in {"founder", "co-founder", "cofounder", "stealth", "newco", "pre-seed", "preseed"}
        )
        if public_followers >= PUBLIC_PROFILE_FOLLOWER_LIMIT and not has_structured_context and not has_strong_founder_signal:
            return "large public profile with expected network gravity and no founder/pre-seed context"
        return None

    @classmethod
    def _preseed_fit_score(cls, candidate: dict[str, Any]) -> int:
        text = cls._candidate_text(candidate)
        follower_count = int(candidate.get("currentSeedFollowerCount") or 0)
        has_linkedin = bool(candidate.get("linkedinHeadline") or candidate.get("linkedinRoleTitle"))
        has_company = bool(candidate.get("linkedinCompany"))
        has_github = bool(candidate.get("githubUrl") or candidate.get("githubContext"))
        github_builder_score = cls._github_builder_score(candidate)
        has_x_bio = bool(candidate.get("xBio"))
        founderish = any(token in text for token in FOUNDER_SIGNAL_TOKENS)
        stealth_or_building = any(token in text for token in {"building", "newco", "pre-seed", "preseed", "stealth"})

        score = min(42, follower_count * 3)
        score += 30 if founderish else 0
        score += 16 if stealth_or_building else 0
        score += 10 if has_linkedin else 0
        score += 8 if has_company else 0
        score += 4 if has_github else 0
        score += github_builder_score
        score += 4 if has_x_bio else 0
        if "raised" in text or "series" in text:
            score -= 18
        if not (founderish or has_linkedin or has_company or has_github):
            score = min(score, 38)
        if founderish and not (has_linkedin or has_company or has_github) and not any(
            token in text for token in {"founder", "co-founder", "cofounder", "stealth", "newco", "pre-seed", "preseed"}
        ):
            score = min(score, 62)
        return max(0, min(100, score))

    @classmethod
    def _github_builder_score(cls, candidate: dict[str, Any]) -> int:
        context = candidate.get("githubContext") or {}
        if not context:
            return 0
        score = 0
        text = " ".join(
            [
                _as_text(context.get("bio")),
                _as_text(context.get("company")),
                _as_text(context.get("builderSignal")),
            ]
        ).lower()
        if any(token in text for token in {"building", "founder", "co-founder", "cofounder", "stealth", "startup"}):
            score += 5
        if context.get("bio") or context.get("company"):
            score += 2
        if (cls._optional_int(context.get("publicRepos")) or 0) >= 3:
            score += 3
        for repo in (context.get("topRepos") or [])[:3]:
            delta = cls._optional_int(repo.get("starDelta7d")) or 0
            stars = cls._optional_int(repo.get("stars")) or 0
            if delta >= 25:
                score += 7
            elif delta > 0:
                score += 4
            elif stars >= 100:
                score += 3
        for event in (context.get("events") or [])[:3]:
            if _as_text(event.get("eventType")) == "repo_traction":
                score += 6
            elif event.get("eventType"):
                score += 2
        return min(14, score)

    def _call_featherless(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not self.settings.featherless_api_key:
            raise RuntimeError("FEATHERLESS_API_KEY is required unless FEATHERLESS_TRIAGE_MOCK=true.")
        if not self.settings.featherless_triage_model:
            raise RuntimeError("FEATHERLESS_TRIAGE_MODEL is required.")

        model_candidates = [self._model_candidate(candidate) for candidate in candidates]
        response = requests.post(
            f"{self.settings.featherless_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.settings.featherless_api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": self.settings.frontend_base_url,
                "X-Title": "Anytrace.ai Featherless Triage",
            },
            json={
                "model": self.settings.featherless_triage_model,
                "temperature": 0.2,
                "max_tokens": 6000,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are the Anytrace.ai VC sourcing triage agent. Classify alert-qualified X profiles for "
                            "early-stage European VC sourcing. Optimize for potential founders and founders likely to "
                            "raise pre-seed soon. Do not reward famous AI labs, large company accounts, public tech "
                            "figures, investors, or VC partners for obvious network gravity. VC/investor employees must be discard unless "
                            "there is explicit current founder evidence. Use only supplied evidence. Return minified strict JSON "
                            "with no markdown, comments, prose, trailing commas, or missing commas."
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "task": "Rank founder-grade profiles for immediate VC sourcing.",
                                "allowedCategories": sorted(VALID_CATEGORIES),
                                "allowedDecisions": sorted(VALID_DECISIONS),
                                "formatRules": [
                                    "Return one JSON object only.",
                                    "The top-level object must contain a results array.",
                                    "Every array item must be separated with a comma.",
                                    "Keep all sentence fields under 22 words.",
                                    "Use only candidate ids supplied below.",
                                    "Do not rank established AI labs, famous founders, investors, or VC partners as top picks.",
                                    "If a bio says partner/principal/investor at a VC firm, return discard unless explicit current founder evidence exists.",
                                    "Reach_out_now requires a credible founder/startup/pre-seed signal, not follower count alone.",
                                    "Treat GitHub as builder evidence only; do not reward stars or followers without startup/founder context.",
                                ],
                                "outputShape": {
                                    "results": [
                                        {
                                            "candidateId": "string",
                                            "category": "active_founder | potential_founder | company_no_raise_yet",
                                            "decision": "reach_out_now | research_more | watch | discard",
                                            "score": "integer 0-100",
                                            "confidence": "integer 0-100",
                                            "whyNow": "one concise sentence grounded in evidence",
                                            "missingContext": ["strings"],
                                            "riskFlags": ["strings"],
                                            "nextAction": "one concrete VC analyst action",
                                        }
                                    ]
                                },
                                "candidates": model_candidates,
                            },
                            ensure_ascii=True,
                        ),
                    },
                ],
            },
            timeout=75,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Featherless returned HTTP {response.status_code}: {response.text[:500]}")

        payload = response.json()
        try:
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError("Featherless response did not include choices[0].message.content.") from exc
        parsed = _extract_json_object(str(content))
        results = parsed.get("results") or parsed.get("rankedCandidates") or parsed.get("ranked_candidates")
        if not isinstance(results, list):
            raise RuntimeError("Featherless JSON did not include a results array.")
        return [row for row in results if isinstance(row, dict)]

    @staticmethod
    def _model_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
        seed_followers = candidate.get("seedFollowers") or []
        return _compact(
            {
                "id": candidate.get("id"),
                "displayName": candidate.get("displayName"),
                "xHandle": candidate.get("xHandle"),
                "primaryProfileUrl": candidate.get("primaryProfileUrl"),
                "xBio": _as_text(candidate.get("xBio"))[:300],
                "xPublicFollowerCount": candidate.get("xPublicFollowerCount"),
                "linkedinUrl": candidate.get("linkedinUrl"),
                "linkedinHeadline": _as_text(candidate.get("linkedinHeadline"))[:360],
                "linkedinRoleTitle": _as_text(candidate.get("linkedinRoleTitle"))[:140],
                "linkedinCompany": _as_text(candidate.get("linkedinCompany"))[:140],
                "linkedinLocation": _as_text(candidate.get("linkedinLocation"))[:120],
                "githubUrl": candidate.get("githubUrl"),
                "github": TriageEngine._model_github_context(candidate.get("githubContext") or {}),
                "currentSeedFollowerCount": candidate.get("currentSeedFollowerCount"),
                "topSeedFollowers": [
                    _compact(
                        {
                            "name": seed.get("name"),
                            "xHandle": seed.get("xHandle"),
                            "accountType": seed.get("accountType"),
                            "tier": seed.get("tier"),
                        }
                    )
                    for seed in seed_followers[:6]
                ],
                "evidence": (candidate.get("evidence") or [])[:9],
            }
        )

    @staticmethod
    def _model_github_context(context: dict[str, Any]) -> dict[str, Any]:
        return _compact(
            {
                "handle": context.get("handle"),
                "profileUrl": context.get("profileUrl"),
                "bio": _as_text(context.get("bio"))[:240],
                "company": _as_text(context.get("company"))[:140],
                "followers": context.get("followers"),
                "publicRepos": context.get("publicRepos"),
                "builderSignal": _as_text(context.get("builderSignal"))[:220],
                "topRepos": [
                    _compact(
                        {
                            "repoLabel": repo.get("repoLabel"),
                            "description": _as_text(repo.get("description"))[:180],
                            "language": repo.get("language"),
                            "stars": repo.get("stars"),
                            "starDelta7d": repo.get("starDelta7d"),
                            "starDelta30d": repo.get("starDelta30d"),
                            "snapshotDate": repo.get("snapshotDate"),
                            "pushedAt": repo.get("pushedAt"),
                        }
                    )
                    for repo in (context.get("topRepos") or [])[:3]
                ],
                "events": [
                    _compact(
                        {
                            "eventType": event.get("eventType"),
                            "title": _as_text(event.get("title"))[:180],
                            "repoLabel": event.get("repoLabel"),
                            "occurredAt": event.get("occurredAt"),
                        }
                    )
                    for event in (context.get("events") or [])[:3]
                ],
            }
        )

    def _normalize_results(self, model_results: list[dict[str, Any]], candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        fallback_by_id = {candidate["id"]: self._fallback_result(candidate) for candidate in candidates}
        candidate_by_id = {candidate["id"]: candidate for candidate in candidates}
        normalized: dict[str, dict[str, Any]] = {}

        for row in model_results:
            candidate_id = _as_text(row.get("candidateId") or row.get("candidate_id") or row.get("id"))
            if candidate_id not in candidate_by_id:
                continue
            base = fallback_by_id[candidate_id]
            category = _as_text(row.get("category"))
            if category == "active_founder" and base["category"] != "active_founder":
                category = base["category"]
            if category == "company_no_raise_yet" and base["category"] == "potential_founder":
                category = base["category"]
            decision = _as_text(row.get("decision"))
            score = base["score"]
            if decision == "discard" and score >= 55:
                decision = "research_more"
            elif decision == "discard" and score >= 35:
                decision = "watch"
            if score < 35:
                decision = "discard"
            elif score < 55 and decision == "reach_out_now":
                decision = "research_more"
            elif score < 45 and decision == "research_more":
                decision = "watch"
            decision = decision if decision in VALID_DECISIONS else base["decision"]
            normalized[candidate_id] = {
                **base,
                "category": category if category in VALID_CATEGORIES else base["category"],
                "decision": decision,
                "score": score,
                "confidence": self._guard_confidence(row.get("confidence"), base["confidence"], decision),
                "whyNow": self._guard_why_now(
                    _as_text(row.get("whyNow") or row.get("why_now")) or base["whyNow"],
                    candidate_by_id[candidate_id],
                    decision,
                ),
                "missingContext": self._string_list(row.get("missingContext") or row.get("missing_context")) or base["missingContext"],
                "riskFlags": self._guard_risk_flags(
                    self._string_list(row.get("riskFlags") or row.get("risk_flags")) or base["riskFlags"],
                    candidate_by_id[candidate_id],
                    decision,
                ),
                "nextAction": self._guard_next_action(
                    _as_text(row.get("nextAction") or row.get("next_action")) or base["nextAction"],
                    decision,
                    candidate_by_id[candidate_id],
                ),
            }

        for candidate_id, fallback in fallback_by_id.items():
            normalized.setdefault(candidate_id, fallback)
        return list(normalized.values())

    def _finalize_result(
        self,
        result: dict[str, Any],
        candidate_by_id: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        candidate = candidate_by_id.get(_as_text(result.get("candidateId"))) or {}
        decision = _as_text(result.get("decision"))
        if decision not in VALID_DECISIONS:
            decision = "watch"
        category = _as_text(result.get("category"))
        if decision != "reach_out_now" and category == "active_founder":
            category = "potential_founder"
        if category not in VALID_CATEGORIES:
            category = "potential_founder"

        why_now = self._guard_why_now(_as_text(result.get("whyNow")), candidate, decision)

        return {
            **result,
            "category": category,
            "decision": decision,
            "overview": self._candidate_overview(candidate, why_now),
            "whyNow": why_now,
            "riskFlags": self._guard_risk_flags(result.get("riskFlags") or [], candidate, decision),
            "nextAction": self._guard_next_action(_as_text(result.get("nextAction")), decision, candidate),
        }

    def _mock_results(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [self._fallback_result(candidate) for candidate in candidates]

    def _fallback_result(self, candidate: dict[str, Any]) -> dict[str, Any]:
        text = self._candidate_text(candidate)
        follower_count = int(candidate.get("currentSeedFollowerCount") or 0)
        has_company = bool(candidate.get("linkedinCompany"))
        has_linkedin = bool(candidate.get("linkedinHeadline") or candidate.get("linkedinRoleTitle"))
        has_github = bool(candidate.get("githubUrl") or candidate.get("githubContext"))
        github_builder_score = self._github_builder_score(candidate)
        has_x_bio = bool(candidate.get("xBio"))
        founderish = any(token in text for token in FOUNDER_SIGNAL_TOKENS)
        backed = any(token in text for token in ["raised", "backed", "exit", "exited", "gp"])

        if founderish and backed:
            category = "active_founder"
        elif has_company or founderish:
            category = "company_no_raise_yet"
        else:
            category = "potential_founder"

        score = self._preseed_fit_score(candidate)
        confidence = min(
            92,
            45
            + min(follower_count, 12) * 3
            + (8 if has_linkedin else 0)
            + (6 if has_x_bio else 0)
            + (4 if has_github else 0)
            + min(8, github_builder_score),
        )
        if score >= 72:
            decision = "reach_out_now"
        elif score >= 55:
            decision = "research_more"
        elif score >= 40:
            decision = "watch"
        else:
            decision = "discard"

        seed_labels = [_label_seed(seed) for seed in (candidate.get("seedFollowers") or [])[:3]]
        why_now = (
            f"{follower_count} curated signal sources are clustered around this profile"
            + (f", including {', '.join(seed_labels)}" if seed_labels else "")
            + "."
        )
        missing_context = []
        if not has_linkedin:
            missing_context.append("LinkedIn enrichment missing")
        if not has_github:
            missing_context.append("GitHub context missing")
        risk_flags = ["Evidence is based on social follow clustering, not confirmed fundraising intent"]
        if decision in {"reach_out_now", "research_more"} and not has_company:
            risk_flags.append("No confirmed company context yet")
        if not founderish:
            risk_flags.append("Founder/pre-seed signal is not confirmed yet")

        return _compact(
            {
                "candidateId": candidate["id"],
                "personId": candidate.get("personId"),
                "displayName": candidate["displayName"],
                "xHandle": candidate.get("xHandle"),
                "xAvatarUrl": candidate.get("xAvatarUrl"),
                "primaryProfileUrl": candidate.get("primaryProfileUrl"),
                "xBio": candidate.get("xBio"),
                "xPublicFollowerCount": candidate.get("xPublicFollowerCount"),
                "linkedinUrl": candidate.get("linkedinUrl"),
                "linkedinHeadline": candidate.get("linkedinHeadline"),
                "linkedinRoleTitle": candidate.get("linkedinRoleTitle"),
                "linkedinCompany": candidate.get("linkedinCompany"),
                "linkedinLocation": candidate.get("linkedinLocation"),
                "githubUrl": candidate.get("githubUrl"),
                "githubContext": candidate.get("githubContext"),
                "category": category,
                "decision": decision,
                "score": score,
                "confidence": confidence,
                "overview": self._candidate_overview(candidate, why_now),
                "whyNow": why_now,
                "missingContext": missing_context,
                "riskFlags": risk_flags,
                "nextAction": self._next_action(decision, candidate),
                "evidence": candidate.get("evidence") or [],
                "currentSeedFollowerCount": follower_count,
            }
        )

    @staticmethod
    def _candidate_overview(candidate: dict[str, Any], why_now: str | None = None) -> str:
        role_context = " at ".join(
            item
            for item in [
                _as_text(candidate.get("linkedinRoleTitle")),
                _as_text(candidate.get("linkedinCompany")),
            ]
            if item
        )
        linkedin_headline = _as_text(candidate.get("linkedinHeadline"))
        x_bio = _as_text(candidate.get("xBio"))
        github_context = candidate.get("githubContext") or {}
        github_signal = _as_text(github_context.get("builderSignal"))
        source_count = int(candidate.get("currentSeedFollowerCount") or 0)
        fragments: list[str] = []

        if role_context:
            fragments.append(f"LinkedIn shows {role_context}.")
        elif linkedin_headline:
            fragments.append(f"LinkedIn headline: {linkedin_headline[:180]}.")

        if x_bio:
            fragments.append(f"X profile says: {x_bio[:180]}.")

        if github_signal:
            fragments.append(f"GitHub builder proof: {github_signal[:180]}.")

        if why_now:
            fragments.append(why_now)
        elif source_count:
            fragments.append(f"{source_count} curated signal sources follow this profile.")

        if not fragments:
            return "Anytrace.ai has a follow-cluster signal, but the profile still needs founder and company verification."
        return " ".join(fragments)[:520]

    @staticmethod
    def _next_action(decision: str, candidate: dict[str, Any]) -> str:
        if decision == "reach_out_now":
            return "Open the profile, verify current company context, and draft a warm intro within 24 hours."
        if decision == "research_more":
            return "Verify founder/company context across LinkedIn, X, and GitHub before drafting outreach."
        if decision == "watch":
            return "Keep in the Signal Inbox and wait for one more strong source or company signal."
        return f"Archive {candidate['displayName']} unless stronger evidence appears."

    @classmethod
    def _guard_next_action(cls, action: str, decision: str, candidate: dict[str, Any]) -> str:
        if decision == "reach_out_now":
            return action
        if decision == "research_more":
            return "Verify founder/company context across LinkedIn, X, and GitHub before drafting outreach."
        if decision == "watch":
            return "Keep on watch and wait for confirmed company, build-in-public, or hiring/fundraising signals."
        return f"Archive {candidate['displayName']} unless stronger evidence appears."

    @classmethod
    def _guard_why_now(cls, why_now: str, candidate: dict[str, Any], decision: str) -> str:
        normalized = why_now.lower()
        contradictory = [
            "famous founder",
            "high follower count",
            "not a good fit",
            "not a top pick",
            "not a pre-seed",
            "not pre-seed",
            "not founder",
            "established ai lab",
            "established investor",
            "large company",
        ]
        mentions_public_followers = bool(re.search(r"\b\d+[\d,.kKmM]*\s+followers\b", normalized))
        if decision in {"research_more", "watch"}:
            why_now = ""
        if decision != "discard" and (any(token in normalized for token in contradictory) or mentions_public_followers):
            why_now = ""

        if why_now:
            return why_now

        follower_count = int(candidate.get("currentSeedFollowerCount") or 0)
        x_bio = _as_text(candidate.get("xBio"))
        if x_bio and any(token in cls._candidate_text(candidate) for token in FOUNDER_SIGNAL_TOKENS):
            return f"X bio shows founder-like activity, and {follower_count} curated signal sources follow this profile."
        github_context = candidate.get("githubContext") or {}
        if github_context.get("builderSignal") and cls._github_builder_score(candidate) >= 6:
            return f"GitHub builder evidence plus {follower_count} curated signal sources make this worth founder verification."
        if candidate.get("linkedinHeadline") or candidate.get("linkedinRoleTitle") or candidate.get("linkedinCompany"):
            return f"LinkedIn context plus {follower_count} curated signal sources make this worth founder verification."
        return f"{follower_count} curated signal sources follow this profile, but founder/company context is still unverified."

    @classmethod
    def _guard_risk_flags(cls, flags: list[str], candidate: dict[str, Any], decision: str) -> list[str]:
        follower_count = int(candidate.get("currentSeedFollowerCount") or 0)
        cleaned: list[str] = []
        for flag in flags:
            normalized = flag.lower()
            if normalized in {"low", "medium", "high"}:
                continue
            if decision != "discard" and any(
                token in normalized
                for token in {
                    "established ai lab",
                    "famous founder",
                    "high follower count",
                    "not a good fit",
                    "not a top pick",
                }
            ):
                continue
            if normalized == "network gravity":
                cleaned.append("Potential network gravity from source cluster")
                continue
            if "vc/investor employee" in normalized or "vc investor employee" in normalized:
                continue
            if "vc partner" in normalized or "partner at" in normalized or "partner @" in normalized:
                continue
            if "low follower count" in normalized and follower_count >= 10:
                continue
            if "reach out" in normalized and decision != "reach_out_now":
                continue
            cleaned.append(flag)

        text = cls._candidate_text(candidate)
        if not any(token in text for token in FOUNDER_SIGNAL_TOKENS):
            cleaned.append("Founder/pre-seed context is not confirmed yet")
        if not (candidate.get("linkedinHeadline") or candidate.get("linkedinRoleTitle") or candidate.get("linkedinCompany")):
            cleaned.append("LinkedIn/company context needs verification")
        if not cleaned:
            cleaned.append("Evidence is signal-based and should be verified before outreach")

        deduped: list[str] = []
        seen: set[str] = set()
        for flag in cleaned:
            key = flag.lower()
            if key not in seen:
                seen.add(key)
                deduped.append(flag)
        return deduped[:4]

    @staticmethod
    def _optional_int(value: Any) -> int | None:
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _bounded_int(value: Any, fallback: int) -> int:
        try:
            numeric = int(float(value))
        except (TypeError, ValueError):
            numeric = fallback
        return max(0, min(100, numeric))

    @staticmethod
    def _guard_confidence(value: Any, fallback: int, decision: str) -> int:
        numeric = TriageEngine._bounded_int(value, fallback)
        if decision != "discard" and numeric < 40:
            return max(40, min(92, fallback))
        return numeric

    @staticmethod
    def _decision_priority(decision: str) -> int:
        return {
            "reach_out_now": 4,
            "research_more": 3,
            "watch": 2,
            "discard": 1,
        }.get(decision, 0)

    @staticmethod
    def _string_list(value: Any) -> list[str]:
        if isinstance(value, str):
            return [value.strip()] if value.strip() else []
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    @staticmethod
    def _log(stage: str, message: str, timestamp: str | None = None) -> dict[str, str]:
        return {
            "stage": stage,
            "message": message,
            "timestamp": timestamp or utc_now().isoformat(),
        }
