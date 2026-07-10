#!/usr/bin/env python3
"""
docker-hub-scraper.py
Docker Hub API Scraper — Python (stdlib only, zero dependencies)

Purpose:
    Authenticates with Docker Hub using a Personal Access Token (PAT),
    checks the registry rate-limit headers, and fetches per-repository
    pull counts. Outputs clean JSON to stdout for monitoring agent ingestion.

Usage:
    export DOCKER_HUB_USERNAME="yourspeakadmin"
    export DOCKER_HUB_PAT="yourspeak.admin123"
    python3 docker-hub-scraper.py

    # Or inline:
    DOCKER_HUB_USERNAME=yourspeakadmin DOCKER_HUB_PAT=<token> python3 docker-hub-scraper.py

Output schema: see docker-hub-scraper.sh for full schema documentation.

Exit codes:
    0 = success
    1 = missing credentials
    2 = authentication failure
    3 = API fetch failure
"""

import json
import os
import sys
import urllib.request
import urllib.error
import base64
from datetime import datetime, timezone

SCRAPER_VERSION = "1.0.0"
REGISTRY_HOST   = "registry-1.docker.io"
AUTH_HOST       = "auth.docker.io"
HUB_API_HOST    = "hub.docker.com"


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def error_exit(msg: str, code: int = 3):
    print(json.dumps({
        "timestamp": utc_now(),
        "error": msg,
        "exit_code": code
    }, indent=2))
    sys.exit(code)


def basic_auth_header(username: str, password: str) -> str:
    creds = f"{username}:{password}".encode("utf-8")
    return "Basic " + base64.b64encode(creds).decode("ascii")


def http_get(url: str, headers: dict = None) -> tuple[dict, dict]:
    """Returns (parsed_json_or_none, response_headers_dict)."""
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            resp_headers = dict(resp.headers)
            try:
                return json.loads(raw), resp_headers
            except json.JSONDecodeError:
                return {"_raw": raw}, resp_headers
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} from {url}: {e.reason}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"URL error for {url}: {e.reason}")


def http_head(url: str, headers: dict = None) -> dict:
    """HEAD request — returns response headers."""
    req = urllib.request.Request(url, headers=headers or {}, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return dict(resp.headers)
    except Exception:
        return {}


def get_registry_token(username: str, pat: str) -> str | None:
    """Fetch a short-lived JWT from auth.docker.io for rate-limit header checks."""
    url = (
        f"https://{AUTH_HOST}/token"
        f"?service=registry.docker.io"
        f"&scope=repository:{username}/*:pull"
    )
    try:
        data, _ = http_get(url, headers={"Authorization": basic_auth_header(username, pat)})
        return data.get("token") or data.get("access_token")
    except Exception:
        return None


def get_rate_limits(token: str | None) -> dict:
    """HEAD /v2/ on registry-1.docker.io and parse RateLimit headers."""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    resp_headers = http_head(f"https://{REGISTRY_HOST}/v2/", headers=headers)

    # Header names are case-insensitive; try both casing variants
    def header_val(name: str) -> str:
        for k, v in resp_headers.items():
            if k.lower() == name.lower():
                return v
        return ""

    limit_raw     = header_val("RateLimit-Limit")     # e.g. "200;w=21600"
    remaining_raw = header_val("RateLimit-Remaining") # e.g. "187;w=21600"

    def parse_val(raw: str) -> int:
        try:
            return int(raw.split(";")[0].strip())
        except (ValueError, IndexError):
            return 0

    def parse_window(raw: str) -> int:
        try:
            part = [p for p in raw.split(";") if p.strip().startswith("w=")]
            return int(part[0].split("=")[1]) if part else 21600
        except Exception:
            return 21600

    return {
        "max_quota_limit": parse_val(limit_raw),
        "remaining_quota": parse_val(remaining_raw),
        "reset_seconds":   parse_window(limit_raw or remaining_raw),
        "source":          REGISTRY_HOST
    }


def get_repositories(username: str, pat: str) -> tuple[list, int]:
    """Fetch all repositories and their pull counts from hub.docker.com."""
    url = (
        f"https://{HUB_API_HOST}/v2/repositories/{username}/"
        f"?page_size=100&ordering=last_updated"
    )
    try:
        data, _ = http_get(url, headers={"Authorization": basic_auth_header(username, pat)})
    except RuntimeError as e:
        raise RuntimeError(f"Failed to fetch repositories: {e}")

    results = data.get("results", [])
    total_count = data.get("count", len(results))

    repos = []
    for r in results:
        repos.append({
            "name":         f"{username}/{r.get('name', '')}",
            "pull_count":   r.get("pull_count", 0),
            "last_updated": r.get("last_updated", ""),
        })

    return repos, total_count


def main():
    username = os.environ.get("DOCKER_HUB_USERNAME", "").strip()
    pat      = os.environ.get("DOCKER_HUB_PAT", "").strip()

    if not username or not pat:
        error_exit(
            "Missing credentials. Set DOCKER_HUB_USERNAME and DOCKER_HUB_PAT environment variables.",
            code=1
        )

    # Step 1: Get registry JWT for rate-limit header check
    token = get_registry_token(username, pat)

    # Step 2: Rate-limit headers
    rate_limit = get_rate_limits(token)

    # Step 3: Repository pull counts
    try:
        repos, repo_count = get_repositories(username, pat)
    except RuntimeError as e:
        error_exit(str(e), code=3)

    total_pulls = sum(r["pull_count"] for r in repos)

    payload = {
        "timestamp":        utc_now(),
        "scraper_version":  SCRAPER_VERSION,
        "username":         username,
        "rate_limit":       rate_limit,
        "repositories":     repos,
        "repository_count": repo_count,
        "total_pulls":      total_pulls,
    }

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
