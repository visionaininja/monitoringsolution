# Docker Hub Monitoring — Dashboard Metric Schema Guide

> **Audience**: Senior DevOps / Platform Engineer integrating the Docker Hub scraper outputs
> into an enterprise monitoring tool (Datadog, New Relic, Grafana, Dynatrace, Splunk, etc.)
> — without Prometheus or Grafana-specific exporters.

---

## 1 — Source Data Payloads

### 1A — Docker Hub API Scraper (`docker-hub-scraper.sh` / `.py`)

Run on any host with internet access. Schedule via cron every **5 minutes** or pipe
output to your monitoring agent's custom log intake.

```json
{
  "timestamp": "2026-06-23T01:00:00Z",
  "scraper_version": "1.0.0",
  "username": "yourspeakadmin",
  "rate_limit": {
    "max_quota_limit": 200,
    "remaining_quota": 187,
    "reset_seconds": 21600,
    "source": "registry-1.docker.io"
  },
  "repositories": [
    { "name": "yourspeakadmin/yourspeak-api", "pull_count": 4200, "last_updated": "2026-06-23T00:55:00Z" },
    { "name": "yourspeakadmin/yourspeak-fe",  "pull_count":  121, "last_updated": "2026-06-22T18:10:00Z" }
  ],
  "repository_count": 2,
  "total_pulls": 4321
}
```

### 1B — Network Flow Logger (`docker-network-logger.sh`)

Run on the **Bastion host** (via cron or monitoring agent exec). Schedule every **1 minute**.

```json
{
  "timestamp": "2026-06-23T01:00:00Z",
  "target_host": "registry-1.docker.io",
  "target_port": 443,
  "registry_ip": "54.198.86.24",
  "connections": {
    "SYN_SENT":    0,
    "ESTABLISHED": 3,
    "TIME_WAIT":   1,
    "CLOSE_WAIT":  0,
    "FIN_WAIT1":   0
  },
  "dns_latency_ms": 12,
  "dns_resolver": "8.8.8.8",
  "alert": false,
  "alert_reasons": []
}
```

---

## 2 — Field → Widget Mapping

### 2A — Rate Limit Gauge

| Field | Path | Widget Type | Notes |
|---|---|---|---|
| Max Pull Quota | `rate_limit.max_quota_limit` | **Static Stat / Label** | Changes only when Docker Hub plan changes |
| Remaining Pulls | `rate_limit.remaining_quota` | **Gauge** (0 → max) | Primary health indicator |
| Quota Used % | `1 - (remaining / max)` | **Percentage Gauge** | Derived field |
| Reset Window | `rate_limit.reset_seconds` | **Countdown Timer / Label** | 6h rolling window |

**Gauge thresholds (Remaining Quota %)**:
```
≥ 50%  → GREEN  (healthy)
20–49% → AMBER  (warning — builds may start failing soon)
< 20%  → RED    (critical — rate limiting imminent)
```

---

### 2B — Repository Pull Counts

| Field | Path | Widget Type | Notes |
|---|---|---|---|
| Per-repo pulls | `repositories[*].pull_count` | **Bar Chart / Table** | X-axis: repo name, Y: pull count |
| Total pulls | `total_pulls` | **Stat Card / Counter** | Sum across all repos |
| Last updated | `repositories[*].last_updated` | **Table column / Tooltip** | Use for staleness detection |

**Recommended layout**: Horizontal bar chart sorted descending by `pull_count`.

---

### 2C — Network Connection States

| Field | Path | Widget Type | Alert Condition |
|---|---|---|---|
| SYN_SENT | `connections.SYN_SENT` | **Status Indicator / Heatmap** | **CRITICAL if > 0** |
| ESTABLISHED | `connections.ESTABLISHED` | **Time-Series Line** | Informational |
| TIME_WAIT | `connections.TIME_WAIT` | **Time-Series Line** | Warning if > 10 |
| CLOSE_WAIT | `connections.CLOSE_WAIT` | **Time-Series Line** | Warning if > 5 |
| DNS Latency | `dns_latency_ms` | **Time-Series Line** | Warning > 100ms · Critical > 500ms |
| Alert flag | `alert` | **Log Stream / Boolean Badge** | Filter for `alert: true` events |

**SYN_SENT explanation**: A non-zero `SYN_SENT` count means the host sent a TCP SYN
to `registry-1.docker.io:443` but never received a SYN-ACK. This is the primary
indicator of a network drop that will manifest as `DeadlineExceeded` in Docker builds.

---

## 3 — Alert Rules (threshold-based)

### Rule 1 — Rate Limit Critical

```yaml
name: docker_hub_quota_critical
condition: rate_limit.remaining_quota / rate_limit.max_quota_limit < 0.20
severity: CRITICAL
message: "Docker Hub pull quota is below 20% ({remaining}/{max} remaining). Build pipelines may start failing."
channel: PagerDuty / Slack #alerts
```

### Rule 2 — Rate Limit Warning

```yaml
name: docker_hub_quota_warning
condition: rate_limit.remaining_quota / rate_limit.max_quota_limit < 0.50
severity: WARNING
message: "Docker Hub pull quota is below 50% ({remaining}/{max} remaining)."
channel: Slack #devops
```

### Rule 3 — SYN_SENT Detected (DeadlineExceeded Risk)

```yaml
name: docker_registry_syn_sent
condition: connections.SYN_SENT > 0
severity: CRITICAL
message: "TCP SYN_SENT={n} detected to registry-1.docker.io:443. Active connection drop — probable DeadlineExceeded cause."
channel: PagerDuty / Slack #incidents
auto_runbook: "Check iptables rules, NAT gateway SNAT table exhaustion, and security group egress on :443"
```

### Rule 4 — DNS Resolution Stall

```yaml
name: docker_registry_dns_stall
condition: dns_latency_ms > 500
severity: WARNING
message: "DNS resolution for registry-1.docker.io took {n}ms (>500ms threshold)."
channel: Slack #devops
```

### Rule 5 — DNS Resolution Failure

```yaml
name: docker_registry_dns_failure
condition: registry_ip == "unresolved"
severity: CRITICAL
message: "DNS resolution for registry-1.docker.io failed completely. Image pulls will fail."
channel: PagerDuty / Slack #incidents
```

---

## 4 — Time-Series Dashboard Layout (Conceptual)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  DOCKER HUB MONITORING                               [Last: 2m ago]     │
├────────────────────┬────────────────────┬────────────────────────────────┤
│  QUOTA REMAINING   │  TOTAL PULLS       │  SYN_SENT STATUS               │
│  [Gauge: 187/200]  │  [Stat: 4,321]     │  [Badge: ✅ 0 (OK)]            │
│  🟢 93.5%          │                    │                                 │
├────────────────────┴────────────────────┴────────────────────────────────┤
│  PULL COUNTS BY REPO                    │  NETWORK CONNECTION STATES     │
│  [Horizontal Bar Chart]                 │  [Time-Series: ESTAB, TIME_WT] │
│  yourspeak-api ████████████████ 4,200   │                                 │
│  yourspeak-fe  █ 121                    │  DNS Latency ─────────── 12ms  │
├─────────────────────────────────────────┴────────────────────────────────┤
│  ALERT LOG STREAM                                                         │
│  [Log Stream: filter alert=true | tail 50 | reverse-chrono]              │
│  [No alerts in past 24h]                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5 — Integration Notes

### Datadog
- Use **Custom Metrics** via DogStatsD or the Metrics API: `docker.hub.quota.remaining`, `docker.hub.quota.max`, `docker.registry.connections.syn_sent`, `docker.registry.dns_latency_ms`
- Use **Log Management** with JSON log intake for the alert log stream

### New Relic
- Use **Flex Integration** to parse the script JSON output into custom events: `DockerHubQuota`, `DockerRegistryNetwork`
- Use **NRQL** alerts on `SELECT latest(remaining_quota) FROM DockerHubQuota WHERE remaining_quota / max_quota_limit < 0.2`

### Splunk
- Forward JSON log lines to Splunk HEC (HTTP Event Collector)
- Create dashboards from `sourcetype=docker_hub_scraper` and `sourcetype=docker_network_logger`

### Generic Agent (e.g., custom monitoring agent)
- Execute scripts via agent exec plugin on a schedule
- Parse stdout as JSON, map fields to your internal metric schema
- The `alert: true` flag in the network logger enables simple boolean filtering without field math
