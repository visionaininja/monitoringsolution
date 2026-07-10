#!/usr/bin/env bash
# =============================================================================
# docker-hub-scraper.sh
# Docker Hub API Scraper for Monitoring Agent Integration
#
# Purpose:
#   Authenticates with Docker Hub using a Personal Access Token (PAT),
#   fetches the Registry v2 rate-limit headers, and retrieves per-repository
#   pull counts. Outputs a single clean JSON object to stdout for ingestion
#   by any monitoring agent (Datadog, New Relic, custom scrapers, etc.).
#
# Usage:
#   export DOCKER_HUB_USERNAME="yourspeakadmin"
#   export DOCKER_HUB_PAT="yourspeak.admin123"
#   bash docker-hub-scraper.sh
#
# Or pass inline:
#   DOCKER_HUB_USERNAME=yourspeakadmin DOCKER_HUB_PAT=<token> bash docker-hub-scraper.sh
#
# Output (JSON to stdout):
#   {
#     "timestamp": "2026-06-23T01:00:00Z",
#     "username": "yourspeakadmin",
#     "rate_limit": {
#       "max_quota_limit": 200,
#       "remaining_quota": 187,
#       "reset_seconds": 21600,
#       "source": "registry-1.docker.io"
#     },
#     "repositories": [ ... ],
#     "total_pulls": 4321,
#     "scraper_version": "1.0.0"
#   }
#
# Exit codes:
#   0 = success
#   1 = missing credentials
#   2 = authentication failure
#   3 = API fetch failure
# =============================================================================

set -euo pipefail

SCRAPER_VERSION="1.0.0"
REGISTRY_HOST="registry-1.docker.io"
AUTH_HOST="auth.docker.io"
HUB_API_HOST="hub.docker.com"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── Credentials ───────────────────────────────────────────────────────────────
USERNAME="${DOCKER_HUB_USERNAME:-}"
PAT="${DOCKER_HUB_PAT:-}"

if [[ -z "$USERNAME" || -z "$PAT" ]]; then
  cat <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "error": "Missing credentials. Set DOCKER_HUB_USERNAME and DOCKER_HUB_PAT environment variables.",
  "exit_code": 1
}
EOF
  exit 1
fi

# ── Helper: emit error JSON and exit ─────────────────────────────────────────
error_exit() {
  local msg="$1"
  local code="${2:-3}"
  cat <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "username": "${USERNAME}",
  "error": "${msg}",
  "exit_code": ${code}
}
EOF
  exit "$code"
}

# ── Step 1: Authenticate — get Docker Hub JWT ──────────────────────────────
# Docker Hub uses two separate auth systems:
#   A) registry-1.docker.io uses oauth2 token from auth.docker.io (for rate-limit headers)
#   B) hub.docker.com REST API uses Basic Auth with username/PAT directly
#
# We'll get the registry JWT for rate-limit checks.

REGISTRY_TOKEN=$(curl -s --fail \
  -u "${USERNAME}:${PAT}" \
  "https://${AUTH_HOST}/token?service=registry.docker.io&scope=repository:${USERNAME}/*:pull" \
  | grep -o '"token":"[^"]*"' | head -1 | sed 's/"token":"//;s/"//') || true

# ── Step 2: Check rate-limit headers from registry v2 API ─────────────────
# The rate limit is exposed as response headers on a HEAD request.
# Headers: RateLimit-Limit, RateLimit-Remaining (per 6-hour window)

RATE_LIMIT_RESPONSE=$(curl -s -I --fail \
  -H "Authorization: Bearer ${REGISTRY_TOKEN}" \
  "https://${REGISTRY_HOST}/v2/" 2>&1) || true

MAX_QUOTA=$(echo "$RATE_LIMIT_RESPONSE" | grep -i "ratelimit-limit:" | grep -o '[0-9]*' | head -1)
REMAINING=$(echo "$RATE_LIMIT_RESPONSE" | grep -i "ratelimit-remaining:" | grep -o '[0-9]*' | head -1)
RESET_WINDOW=$(echo "$RATE_LIMIT_RESPONSE" | grep -i "ratelimit-limit:" | grep -o 'w=[0-9]*' | grep -o '[0-9]*' | head -1)

# Defaults if headers are absent (e.g., authenticated unlimited plan)
MAX_QUOTA="${MAX_QUOTA:-0}"
REMAINING="${REMAINING:-0}"
RESET_WINDOW="${RESET_WINDOW:-21600}"

# ── Step 3: Fetch repository list and pull counts from Hub API ────────────
# hub.docker.com REST API accepts Basic Auth: username + PAT
HUB_RESPONSE=$(curl -s --fail \
  -u "${USERNAME}:${PAT}" \
  "https://${HUB_API_HOST}/v2/repositories/${USERNAME}/?page_size=100&ordering=last_updated" 2>/dev/null) || error_exit "Failed to fetch repositories from hub.docker.com" 3

# Parse repositories using grep/sed (portable, no jq dependency)
# Each repo entry has: name, pull_count, last_updated
REPO_NAMES=$(echo "$HUB_RESPONSE" | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"//')
PULL_COUNTS=$(echo "$HUB_RESPONSE" | grep -o '"pull_count":[0-9]*' | sed 's/"pull_count"://')
LAST_UPDATED=$(echo "$HUB_RESPONSE" | grep -o '"last_updated":"[^"]*"' | sed 's/"last_updated":"//;s/"//')
TOTAL_COUNT=$(echo "$HUB_RESPONSE" | grep -o '"count":[0-9]*' | head -1 | sed 's/"count"://')

# Build repositories JSON array
REPOS_JSON="["
FIRST=true
TOTAL_PULLS=0

# Read into arrays
mapfile -t NAMES_ARR <<< "$REPO_NAMES"
mapfile -t PULLS_ARR <<< "$PULL_COUNTS"
mapfile -t DATES_ARR <<< "$LAST_UPDATED"

for i in "${!NAMES_ARR[@]}"; do
  NAME="${NAMES_ARR[$i]:-}"
  PULLS="${PULLS_ARR[$i]:-0}"
  UPDATED="${DATES_ARR[$i]:-}"
  [[ -z "$NAME" ]] && continue

  TOTAL_PULLS=$((TOTAL_PULLS + ${PULLS:-0}))

  if [[ "$FIRST" == true ]]; then
    FIRST=false
  else
    REPOS_JSON+=","
  fi

  REPOS_JSON+=$(cat <<REPO
{
    "name": "${USERNAME}/${NAME}",
    "pull_count": ${PULLS},
    "last_updated": "${UPDATED}"
  }
REPO
)
done

REPOS_JSON+="]"

# ── Step 4: Output final JSON ─────────────────────────────────────────────
cat <<OUTPUT
{
  "timestamp": "${TIMESTAMP}",
  "scraper_version": "${SCRAPER_VERSION}",
  "username": "${USERNAME}",
  "rate_limit": {
    "max_quota_limit": ${MAX_QUOTA},
    "remaining_quota": ${REMAINING},
    "reset_seconds": ${RESET_WINDOW},
    "source": "${REGISTRY_HOST}"
  },
  "repositories": ${REPOS_JSON},
  "repository_count": ${TOTAL_COUNT:-0},
  "total_pulls": ${TOTAL_PULLS}
}
OUTPUT
