from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler

from backend.scrapers.twitter_scraper import TwitterFollowingScraper


def configure_logging() -> None:
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        configure_logging()
        try:
            results = TwitterFollowingScraper().run_all()
        except Exception as exc:
            logging.getLogger(__name__).exception("Manual Twitter scrape failed")
            self._send_json(500, {"ok": False, "error": str(exc)})
            return

        self._send_json(
            200,
            {
                "ok": True,
                "count": len(results),
                "results": [asdict(result) for result in results],
            },
        )

    def do_GET(self) -> None:
        self._send_json(405, {"ok": False, "error": "Use POST /api/run-twitter"})
