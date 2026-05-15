from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Iterator
from uuid import uuid4

from backend.config import Settings
from backend.db import SupabaseDB, normalize_handle


class LocalTwitterStateStore:
    def __init__(self, db_path: str) -> None:
        self.path = Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                create table if not exists twitter_following_snapshots (
                  id text primary key,
                  vc_id text not null,
                  followed_handle text not null,
                  first_seen_at text not null,
                  created_at text not null,
                  unique (vc_id, followed_handle)
                );

                create table if not exists twitter_vc_cursors (
                  vc_id text primary key,
                  last_known_handle text,
                  last_run_at text not null
                );

                create table if not exists twitter_vc_follows (
                  id text primary key,
                  candidate_id text not null,
                  vc_id text not null,
                  first_seen_at text not null,
                  last_seen_at text not null,
                  unique (candidate_id, vc_id)
                );
                """
            )

    def get_twitter_cursor(self, vc_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                "select vc_id, last_known_handle, last_run_at from twitter_vc_cursors where vc_id = ?",
                (vc_id,),
            ).fetchone()
        return dict(row) if row else None

    def count_twitter_snapshots(self, vc_id: str) -> int:
        with self._connect() as connection:
            row = connection.execute(
                "select count(*) as snapshot_count from twitter_following_snapshots where vc_id = ?",
                (vc_id,),
            ).fetchone()
        return int(row["snapshot_count"]) if row else 0

    def count_all_twitter_snapshots(self) -> int:
        with self._connect() as connection:
            row = connection.execute(
                "select count(*) as snapshot_count from twitter_following_snapshots"
            ).fetchone()
        return int(row["snapshot_count"]) if row else 0

    def list_twitter_snapshots(self) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                select id, vc_id, followed_handle, first_seen_at, created_at
                from twitter_following_snapshots
                order by first_seen_at desc, created_at desc
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def get_twitter_summary(self) -> dict:
        with self._connect() as connection:
            snapshot_row = connection.execute(
                """
                select count(*) as snapshot_count, max(created_at) as latest_snapshot_at
                from twitter_following_snapshots
                """
            ).fetchone()
            cursor_row = connection.execute(
                """
                select count(*) as scanned_seed_count, max(last_run_at) as latest_run_at
                from twitter_vc_cursors
                """
            ).fetchone()
        return {
            "snapshotCount": int(snapshot_row["snapshot_count"] or 0) if snapshot_row else 0,
            "latestSnapshotAt": snapshot_row["latest_snapshot_at"] if snapshot_row else None,
            "scannedSeedCount": int(cursor_row["scanned_seed_count"] or 0) if cursor_row else 0,
            "latestRunAt": cursor_row["latest_run_at"] if cursor_row else None,
        }

    def twitter_snapshot_exists(self, vc_id: str, followed_handle: str) -> bool:
        normalized_handle = normalize_handle(followed_handle)
        with self._connect() as connection:
            row = connection.execute(
                "select 1 from twitter_following_snapshots where vc_id = ? and followed_handle = ? limit 1",
                (vc_id, normalized_handle),
            ).fetchone()
        return bool(row)

    def upsert_twitter_snapshot(self, vc_id: str, followed_handle: str, first_seen_at: date) -> None:
        normalized_handle = normalize_handle(followed_handle)
        now_iso = datetime.utcnow().isoformat()
        with self._connect() as connection:
            existing = connection.execute(
                "select id, created_at, first_seen_at from twitter_following_snapshots where vc_id = ? and followed_handle = ?",
                (vc_id, normalized_handle),
            ).fetchone()
            if existing:
                existing_first_seen = existing["first_seen_at"] or first_seen_at.isoformat()
                first_seen_value = min(existing_first_seen, first_seen_at.isoformat())
                connection.execute(
                    """
                    update twitter_following_snapshots
                    set first_seen_at = ?
                    where id = ?
                    """,
                    (first_seen_value, existing["id"]),
                )
                return

            connection.execute(
                """
                insert into twitter_following_snapshots (id, vc_id, followed_handle, first_seen_at, created_at)
                values (?, ?, ?, ?, ?)
                """,
                (str(uuid4()), vc_id, normalized_handle, first_seen_at.isoformat(), now_iso),
            )

    def upsert_twitter_cursor(self, vc_id: str, last_known_handle: str, last_run_at: datetime | None = None) -> None:
        normalized_handle = normalize_handle(last_known_handle)
        timestamp = (last_run_at or datetime.utcnow()).isoformat()
        with self._connect() as connection:
            connection.execute(
                """
                insert into twitter_vc_cursors (vc_id, last_known_handle, last_run_at)
                values (?, ?, ?)
                on conflict(vc_id) do update set
                  last_known_handle = excluded.last_known_handle,
                  last_run_at = excluded.last_run_at
                """,
                (vc_id, normalized_handle, timestamp),
            )

    def upsert_twitter_vc_follow(
        self,
        candidate_id: str,
        vc_id: str,
        *,
        first_seen_at: date,
        last_seen_at: date,
    ) -> None:
        with self._connect() as connection:
            existing = connection.execute(
                "select id, first_seen_at, last_seen_at from twitter_vc_follows where candidate_id = ? and vc_id = ?",
                (candidate_id, vc_id),
            ).fetchone()
            if existing:
                first_seen_value = min(existing["first_seen_at"], first_seen_at.isoformat())
                last_seen_value = max(existing["last_seen_at"], last_seen_at.isoformat())
                connection.execute(
                    """
                    update twitter_vc_follows
                    set first_seen_at = ?, last_seen_at = ?
                    where id = ?
                    """,
                    (first_seen_value, last_seen_value, existing["id"]),
                )
                return

            connection.execute(
                """
                insert into twitter_vc_follows (id, candidate_id, vc_id, first_seen_at, last_seen_at)
                values (?, ?, ?, ?, ?)
                """,
                (str(uuid4()), candidate_id, vc_id, first_seen_at.isoformat(), last_seen_at.isoformat()),
            )

    def prune_twitter_snapshots(self, *, max_rows: int, protected_handles: set[str] | None = None) -> int:
        if max_rows <= 0:
            return 0

        protected = {normalize_handle(handle) for handle in (protected_handles or set()) if normalize_handle(handle)}
        with self._connect() as connection:
            rows = connection.execute(
                """
                select id, followed_handle, first_seen_at, created_at
                from twitter_following_snapshots
                order by first_seen_at asc, created_at asc
                """
            ).fetchall()
            overflow = len(rows) - max_rows
            if overflow <= 0:
                return 0

            unprotected_rows = [
                row for row in rows if normalize_handle(row["followed_handle"]) not in protected
            ]
            protected_rows = [
                row for row in rows if normalize_handle(row["followed_handle"]) in protected
            ]
            ids_to_delete = [row["id"] for row in (unprotected_rows + protected_rows)[:overflow]]
            if not ids_to_delete:
                return 0

            placeholders = ",".join("?" for _ in ids_to_delete)
            connection.execute(
                f"delete from twitter_following_snapshots where id in ({placeholders})",
                ids_to_delete,
            )
        return len(ids_to_delete)

    def clear_twitter_state(self) -> None:
        with self._connect() as connection:
            connection.execute("delete from twitter_following_snapshots")
            connection.execute("delete from twitter_vc_cursors")
            connection.execute("delete from twitter_vc_follows")


def create_twitter_state_store(settings: Settings, db: SupabaseDB) -> SupabaseDB | LocalTwitterStateStore:
    if settings.twitter_state_backend == "local":
        return LocalTwitterStateStore(settings.twitter_local_db_path)
    return db
