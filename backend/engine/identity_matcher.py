from __future__ import annotations

import logging
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

from backend.db import SupabaseDB, normalize_handle, normalize_linkedin_url, normalize_name

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class IdentityMatchResult:
    tracked_person_id: str
    candidate_id: str
    confidence: float
    reasons: list[dict[str, Any]]
    status: str


class IdentityMatcher:
    AUTO_MATCH_THRESHOLD = 0.84
    SUGGEST_THRESHOLD = 0.56

    def __init__(self, db: SupabaseDB) -> None:
        self.db = db

    @staticmethod
    def _string_similarity(left: str, right: str) -> float:
        if not left or not right:
            return 0.0
        return SequenceMatcher(None, left, right).ratio()

    @staticmethod
    def _extract_linkedin_slug(value: str | None) -> str:
        normalized = normalize_linkedin_url(value) or ""
        if not normalized:
            return ""
        parts = [part for part in normalized.split("/") if part]
        return parts[-1] if parts else ""

    @staticmethod
    def _token_set(value: str | None) -> set[str]:
        normalized = normalize_name(value)
        if not normalized:
            return set()
        return {token for token in normalized.replace("-", " ").split() if len(token) >= 3}

    def _token_overlap(self, left: str | None, right: str | None) -> float:
        left_tokens = self._token_set(left)
        right_tokens = self._token_set(right)
        if not left_tokens or not right_tokens:
            return 0.0
        intersection = len(left_tokens & right_tokens)
        union = len(left_tokens | right_tokens)
        if union == 0:
            return 0.0
        return intersection / union

    def _score_match(self, tracked: dict[str, Any], candidate: dict[str, Any]) -> tuple[float, list[dict[str, Any]]]:
        score = 0.0
        reasons: list[dict[str, Any]] = []

        tracked_name = normalize_name(tracked.get("name"))
        candidate_name = normalize_name(candidate.get("name"))
        name_similarity = self._string_similarity(tracked_name, candidate_name)
        if name_similarity >= 0.96:
            score += 0.4
            reasons.append({"signal": "name_exactish", "value": round(name_similarity, 3)})
        elif name_similarity >= 0.86:
            score += 0.25
            reasons.append({"signal": "name_similar", "value": round(name_similarity, 3)})

        tracked_github = normalize_handle(tracked.get("github_username"))
        candidate_github = normalize_handle(candidate.get("github_username"))
        if tracked_github and candidate_github and tracked_github == candidate_github:
            score += 0.55
            reasons.append({"signal": "github_exact", "value": tracked_github})

        tracked_x = normalize_handle(tracked.get("twitter_handle"))
        candidate_x = normalize_handle(candidate.get("twitter_handle"))
        if tracked_x and candidate_x and tracked_x == candidate_x:
            score += 0.55
            reasons.append({"signal": "x_exact", "value": tracked_x})

        tracked_linkedin = normalize_linkedin_url(tracked.get("linkedin_url"))
        candidate_linkedin = normalize_linkedin_url(candidate.get("linkedin_url"))
        if tracked_linkedin and candidate_linkedin and tracked_linkedin == candidate_linkedin:
            score += 0.6
            reasons.append({"signal": "linkedin_exact", "value": tracked_linkedin})

        tracked_linkedin_slug = self._extract_linkedin_slug(tracked.get("linkedin_url"))
        candidate_linkedin_slug = self._extract_linkedin_slug(candidate.get("linkedin_url"))
        if (
            tracked_linkedin_slug
            and candidate_linkedin_slug
            and tracked_linkedin_slug == candidate_linkedin_slug
            and tracked_linkedin != candidate_linkedin
        ):
            score += 0.35
            reasons.append({"signal": "linkedin_slug_exact", "value": tracked_linkedin_slug})

        tracked_company = normalize_name(tracked.get("company"))
        candidate_company = normalize_name(candidate.get("company"))
        if tracked_company and candidate_company and tracked_company == candidate_company:
            score += 0.15
            reasons.append({"signal": "company_exact", "value": tracked_company})
        else:
            company_similarity = self._string_similarity(tracked_company, candidate_company)
            if company_similarity >= 0.9:
                score += 0.12
                reasons.append({"signal": "company_similar", "value": round(company_similarity, 3)})

        tracked_location = normalize_name(tracked.get("location"))
        candidate_location = normalize_name(candidate.get("location"))
        if tracked_location and candidate_location and tracked_location == candidate_location:
            score += 0.08
            reasons.append({"signal": "location_exact", "value": tracked_location})
        else:
            location_similarity = self._string_similarity(tracked_location, candidate_location)
            if location_similarity >= 0.9:
                score += 0.05
                reasons.append({"signal": "location_similar", "value": round(location_similarity, 3)})

        if tracked_github and candidate_name and tracked_github in candidate_name:
            score += 0.06
            reasons.append({"signal": "github_in_name", "value": tracked_github})

        role_similarity = self._token_overlap(tracked.get("role_title"), candidate.get("role_title"))
        if role_similarity >= 0.5:
            score += 0.08
            reasons.append({"signal": "role_overlap", "value": round(role_similarity, 3)})

        summary_similarity = self._token_overlap(tracked.get("summary"), candidate.get("summary") or candidate.get("bio"))
        if summary_similarity >= 0.3:
            score += 0.06
            reasons.append({"signal": "summary_overlap", "value": round(summary_similarity, 3)})

        medium_signal_count = sum(
            1
            for reason in reasons
            if reason["signal"] in {
                "name_similar",
                "company_exact",
                "company_similar",
                "location_exact",
                "location_similar",
                "role_overlap",
                "summary_overlap",
                "linkedin_slug_exact",
            }
        )
        if name_similarity >= 0.82 and medium_signal_count >= 2:
            score += 0.12
            reasons.append({"signal": "multi_signal_boost", "value": medium_signal_count})

        return min(score, 1.0), reasons

    def _write_direct_identities(self, tracked_people: list[dict[str, Any]]) -> None:
        for person in tracked_people:
            if person.get("github_username"):
                handle = normalize_handle(person["github_username"]) or ""
                self.db.upsert_person_identity(
                    tracked_person_id=person["id"],
                    candidate_id=None,
                    platform="github",
                    handle=handle,
                    profile_url=f"https://github.com/{handle}",
                    is_primary=True,
                    match_confidence=1.0,
                    match_source="tracked_git_people_direct",
                )

            if person.get("twitter_handle"):
                handle = normalize_handle(person["twitter_handle"]) or ""
                self.db.upsert_person_identity(
                    tracked_person_id=person["id"],
                    candidate_id=None,
                    platform="x",
                    handle=handle,
                    profile_url=f"https://x.com/{handle}",
                    is_primary=not bool(person.get("github_username")),
                    match_confidence=1.0,
                    match_source="tracked_git_people_direct",
                )

            if person.get("linkedin_url"):
                linkedin_url = person["linkedin_url"].strip()
                self.db.upsert_person_identity(
                    tracked_person_id=person["id"],
                    candidate_id=None,
                    platform="linkedin",
                    handle=linkedin_url,
                    profile_url=linkedin_url,
                    is_primary=not bool(person.get("github_username") or person.get("twitter_handle")),
                    match_confidence=1.0,
                    match_source="tracked_git_people_direct",
                )

    def run(self) -> list[IdentityMatchResult]:
        tracked_people = self.db.list_tracked_git_people(active_only=True)
        candidates = self.db.list_candidates(active_only=True)
        self.db.clear_identity_match_candidates()
        self._write_direct_identities(tracked_people)

        results: list[IdentityMatchResult] = []
        for tracked in tracked_people:
            best_candidate: dict[str, Any] | None = None
            best_score = 0.0
            best_reasons: list[dict[str, Any]] = []

            for candidate in candidates:
                score, reasons = self._score_match(tracked, candidate)
                if score > best_score:
                    best_score = score
                    best_reasons = reasons
                    best_candidate = candidate

                if score >= self.SUGGEST_THRESHOLD:
                    status = "matched" if score >= self.AUTO_MATCH_THRESHOLD else "suggested"
                    self.db.upsert_identity_match_candidate(
                        tracked_person_id=tracked["id"],
                        candidate_id=candidate["id"],
                        confidence=score,
                        reasons=reasons,
                        status=status,
                    )

            if not best_candidate or best_score < self.SUGGEST_THRESHOLD:
                continue

            status = "matched" if best_score >= self.AUTO_MATCH_THRESHOLD else "suggested"
            result = IdentityMatchResult(
                tracked_person_id=tracked["id"],
                candidate_id=best_candidate["id"],
                confidence=best_score,
                reasons=best_reasons,
                status=status,
            )
            results.append(result)

            if status != "matched":
                continue

            if best_candidate.get("github_username"):
                github_handle = normalize_handle(best_candidate["github_username"]) or ""
                self.db.upsert_person_identity(
                    tracked_person_id=tracked["id"],
                    candidate_id=best_candidate["id"],
                    platform="github",
                    handle=github_handle,
                    profile_url=f"https://github.com/{github_handle}",
                    is_primary=not bool(tracked.get("github_username")),
                    match_confidence=best_score,
                    match_source="identity_matcher",
                )

            if best_candidate.get("twitter_handle"):
                x_handle = normalize_handle(best_candidate["twitter_handle"]) or ""
                self.db.upsert_person_identity(
                    tracked_person_id=tracked["id"],
                    candidate_id=best_candidate["id"],
                    platform="x",
                    handle=x_handle,
                    profile_url=f"https://x.com/{x_handle}",
                    is_primary=not bool(tracked.get("twitter_handle")),
                    match_confidence=best_score,
                    match_source="identity_matcher",
                )

            if best_candidate.get("linkedin_url"):
                linkedin_url = best_candidate["linkedin_url"].strip()
                self.db.upsert_person_identity(
                    tracked_person_id=tracked["id"],
                    candidate_id=best_candidate["id"],
                    platform="linkedin",
                    handle=linkedin_url,
                    profile_url=linkedin_url,
                    is_primary=not bool(tracked.get("linkedin_url")),
                    match_confidence=best_score,
                    match_source="identity_matcher",
                )

            logger.info(
                "Matched tracked person %s to candidate %s with confidence %.2f",
                tracked.get("name"),
                best_candidate.get("name"),
                best_score,
            )

        return results
