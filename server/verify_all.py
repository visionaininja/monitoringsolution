#!/usr/bin/env python3
import urllib.request, json

def check(label, url, fn):
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            d = json.loads(r.read())
        print(f"  ✅ {label}")
        fn(d)
    except Exception as e:
        print(f"  ❌ {label}: {e}")
    print()

print("=== Final Verification ===\n")

def pg(d):
    c = d['connections']
    print(f"     Active: {c['active']}  Idle: {c['idle']}  Max: {c['max']}  Util: {c['utilization']:.1f}%")
    print(f"     Deadlocks: {d['deadlocks']}  CacheHit: {d['cacheHitRatio']}%  SlowQueries: {len(d['slowQueries'])}  DiskPoints: {len(d['diskGrowth'])}")

def pb(d):
    p = d['pools'][0]
    print(f"     clActive: {p['clActive']}  clWaiting: {p['clWaiting']}  svActive: {p['svActive']}  svIdle: {p['svIdle']}")
    print(f"     avgWait: {d['stats']['avgWaitTime']}ms  totalRequests: {d['stats']['totalRequests']:,}")

def nm(d):
    for name, v in d['nodeMetrics'].items():
        cap = v.get('capacity', 'MISSING')
        alloc = v.get('allocatable', 'MISSING')
        status = '✅' if cap != 'MISSING' else '❌'
        print(f"     {status} {name}  cpu:{v['cpu']}%  mem:{v['memory']}%  cap:{cap[:12]}  alloc:{str(alloc)[:12]}")

check("Postgres Metrics (/api/postgres-metrics)", "http://localhost:4000/api/postgres-metrics", pg)
check("PgBouncer Metrics (/api/pgbouncer-metrics)", "http://localhost:4000/api/pgbouncer-metrics", pb)
check("Node Metrics w/ Storage (/api/metrics?env=dev)", "http://localhost:4000/api/metrics?env=dev", nm)

print("=== Done ===")
