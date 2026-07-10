#!/usr/bin/env bash
# =============================================================================
# docker-network-logger.sh
# Docker Registry Network Flow Logger — Bastion Host Diagnostic Tool
#
# Purpose:
#   Inspects active TCP connections to registry-1.docker.io:443 from this
#   host to detect connection hangs that cause "DeadlineExceeded" errors.
#   Outputs a structured JSON log line to stdout for monitoring agent ingestion.
#
# Usage (run on Bastion host):
#   bash docker-network-logger.sh
#
# Cron example (every minute to a file your agent scrapes):
#   * * * * * /opt/scripts/docker-network-logger.sh >> /var/log/docker-network.jsonl
#
# Output (one JSON line per run):
# {
#   "timestamp": "2026-06-23T01:00:00Z",
#   "target_host": "registry-1.docker.io",
#   "target_port": 443,
#   "registry_ip": "54.198.86.24",
#   "connections": {
#     "SYN_SENT":   0,
#     "ESTABLISHED": 3,
#     "TIME_WAIT":   1,
#     "CLOSE_WAIT":  0,
#     "FIN_WAIT1":   0
#   },
#   "dns_latency_ms": 12,
#   "dns_resolver":   "8.8.8.8",
#   "alert": false,
#   "alert_reasons": []
# }
#
# Alert thresholds:
#   - SYN_SENT > 0      → possible TCP handshake drop (DeadlineExceeded trigger)
#   - DNS latency > 500ms → DNS resolution stall
# =============================================================================

set -uo pipefail

TARGET_HOST="registry-1.docker.io"
TARGET_PORT=443
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── Step 1: Resolve registry IP ──────────────────────────────────────────────
REGISTRY_IP=$(getent hosts "$TARGET_HOST" 2>/dev/null | awk '{print $1; exit}' || \
              dig +short "$TARGET_HOST" 2>/dev/null | grep -E '^[0-9]+\.' | head -1 || \
              echo "unresolved")

# ── Step 2: DNS latency via dig ───────────────────────────────────────────────
DNS_LATENCY_MS=0
DNS_RESOLVER=""

if command -v dig &>/dev/null; then
  DIG_OUTPUT=$(dig +stats "$TARGET_HOST" 2>/dev/null || true)
  DNS_LATENCY_MS=$(echo "$DIG_OUTPUT" | grep "Query time:" | grep -o '[0-9]*' | head -1)
  DNS_RESOLVER=$(echo "$DIG_OUTPUT" | grep "SERVER:" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  DNS_LATENCY_MS="${DNS_LATENCY_MS:-0}"
  DNS_RESOLVER="${DNS_RESOLVER:-unknown}"
elif command -v nslookup &>/dev/null; then
  # Fallback: measure nslookup timing
  START_NS=$(date +%s%N)
  nslookup "$TARGET_HOST" &>/dev/null || true
  END_NS=$(date +%s%N)
  DNS_LATENCY_MS=$(( (END_NS - START_NS) / 1000000 ))
  DNS_RESOLVER="nslookup"
fi

# ── Step 3: Count TCP connections by state ───────────────────────────────────
# Try `ss` first (modern), fall back to `netstat` (legacy)
SYN_SENT=0
ESTABLISHED=0
TIME_WAIT=0
CLOSE_WAIT=0
FIN_WAIT1=0

if command -v ss &>/dev/null; then
  # ss -tnp: TCP, numeric, show processes
  SS_OUTPUT=$(ss -tnp 2>/dev/null | grep ":${TARGET_PORT}" || true)
  SYN_SENT=$(echo "$SS_OUTPUT"   | grep -c "SYN-SENT"    || true)
  ESTABLISHED=$(echo "$SS_OUTPUT" | grep -c "ESTAB"       || true)
  TIME_WAIT=$(echo "$SS_OUTPUT"  | grep -c "TIME-WAIT"   || true)
  CLOSE_WAIT=$(echo "$SS_OUTPUT" | grep -c "CLOSE-WAIT"  || true)
  FIN_WAIT1=$(echo "$SS_OUTPUT"  | grep -c "FIN-WAIT-1"  || true)
elif command -v netstat &>/dev/null; then
  NS_OUTPUT=$(netstat -tnp 2>/dev/null | grep ":${TARGET_PORT}" || true)
  SYN_SENT=$(echo "$NS_OUTPUT"    | grep -c "SYN_SENT"    || true)
  ESTABLISHED=$(echo "$NS_OUTPUT"  | grep -c "ESTABLISHED" || true)
  TIME_WAIT=$(echo "$NS_OUTPUT"   | grep -c "TIME_WAIT"   || true)
  CLOSE_WAIT=$(echo "$NS_OUTPUT"  | grep -c "CLOSE_WAIT"  || true)
  FIN_WAIT1=$(echo "$NS_OUTPUT"   | grep -c "FIN_WAIT1"   || true)
fi

# Normalize empty strings to 0
SYN_SENT="${SYN_SENT:-0}"
ESTABLISHED="${ESTABLISHED:-0}"
TIME_WAIT="${TIME_WAIT:-0}"
CLOSE_WAIT="${CLOSE_WAIT:-0}"
FIN_WAIT1="${FIN_WAIT1:-0}"

# ── Step 4: Alert logic ───────────────────────────────────────────────────────
ALERT=false
ALERT_REASONS="[]"

declare -a REASONS=()

if (( SYN_SENT > 0 )); then
  REASONS+=("\"SYN_SENT=${SYN_SENT}: TCP handshake drop detected — possible DeadlineExceeded cause\"")
  ALERT=true
fi

if (( DNS_LATENCY_MS > 500 )); then
  REASONS+=("\"DNS latency ${DNS_LATENCY_MS}ms exceeds 500ms threshold — registry resolution stall\"")
  ALERT=true
fi

if (( DNS_LATENCY_MS == 0 && ${#REASONS[@]} == 0 )); then
  # dig not available or returned 0, check if host is reachable at all
  if [[ "$REGISTRY_IP" == "unresolved" ]]; then
    REASONS+=("\"DNS resolution failed: ${TARGET_HOST} could not be resolved\"")
    ALERT=true
  fi
fi

if [[ ${#REASONS[@]} -gt 0 ]]; then
  ALERT_REASONS="[$(IFS=,; echo "${REASONS[*]}")]"
fi

# ── Step 5: Emit JSON log line ─────────────────────────────────────────────
cat <<OUTPUT
{
  "timestamp": "${TIMESTAMP}",
  "target_host": "${TARGET_HOST}",
  "target_port": ${TARGET_PORT},
  "registry_ip": "${REGISTRY_IP}",
  "connections": {
    "SYN_SENT":    ${SYN_SENT},
    "ESTABLISHED": ${ESTABLISHED},
    "TIME_WAIT":   ${TIME_WAIT},
    "CLOSE_WAIT":  ${CLOSE_WAIT},
    "FIN_WAIT1":   ${FIN_WAIT1}
  },
  "dns_latency_ms": ${DNS_LATENCY_MS},
  "dns_resolver": "${DNS_RESOLVER}",
  "alert": ${ALERT},
  "alert_reasons": ${ALERT_REASONS}
}
OUTPUT
