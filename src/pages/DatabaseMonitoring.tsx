import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Database, RefreshCw, Activity, AlertTriangle, CheckCircle2,
  Clock, Zap, HardDrive, Server, TrendingUp, Shield, Users
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConnectionStats { active: number; idle: number; max: number; utilization: number }
interface SlowQuery { query: string; exec_time: number }
interface DiskGrowthPoint { date: string; sizeGb: number }
interface PostgresMetrics {
  connections: ConnectionStats
  slowQueries: SlowQuery[]
  deadlocks: number
  cacheHitRatio: number
  diskGrowth: DiskGrowthPoint[]
  isSimulated: boolean
}
interface PgBouncerPool {
  database: string; user: string; clActive: number; clWaiting: number
  svActive: number; svIdle: number; maxWait: number
}
interface PgBouncerMetrics {
  pools: PgBouncerPool[]
  stats: { avgWaitTime: number; totalRequests: number }
  isSimulated: boolean
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, color = "text-primary", alert = false
}: { icon: any; label: string; value: string | number; sub?: string; color?: string; alert?: boolean }) {
  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 transition-all duration-300",
      alert ? "border-rose-500/50 bg-rose-500/5" : "border-border hover:border-primary/30"
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn("p-2 rounded-lg", alert ? "bg-rose-500/10" : "bg-primary/10")}>
          <Icon className={cn("h-4 w-4", alert ? "text-rose-400" : color)} />
        </div>
        {alert && <AlertTriangle className="h-4 w-4 text-rose-400 animate-pulse" />}
      </div>
      <div className={cn("text-2xl font-bold tracking-tight", alert ? "text-rose-400" : "text-foreground")}>{value}</div>
      <div className="text-xs font-medium text-muted-foreground mt-1">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>}
    </div>
  )
}

function ConnectionGauge({ connections }: { connections: ConnectionStats }) {
  const used = connections.active + connections.idle
  const pct = Math.min(100, Math.round((used / connections.max) * 100))
  const r = 52
  const circumference = 2 * Math.PI * r
  const dash = (pct / 100) * circumference
  const gColor = pct > 80 ? "#f43f5e" : pct > 60 ? "#f59e0b" : "#10b981"
  const dashArr = `${dash} ${circumference}`
  const stats = [
    { label: "Active", value: connections.active, color: "text-emerald-400" },
    { label: "Idle", value: connections.idle, color: "text-blue-400" },
    { label: "Max", value: connections.max, color: "text-muted-foreground" },
  ]
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={gColor} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={dashArr}
          style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.5s ease" }} />
      </svg>
      <div className="text-center -mt-20 mb-14">
        <div className="text-3xl font-bold" style={{ color: gColor }}>{pct}%</div>
        <div className="text-xs text-muted-foreground">Utilization</div>
      </div>
      <div className="grid grid-cols-3 gap-3 w-full mt-2">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <div className={cn("text-lg font-bold", s.color)}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiskChart({ data }: { data: DiskGrowthPoint[] }) {
  if (!data || data.length === 0) return null
  const maxV = Math.max(...data.map(d => d.sizeGb))
  const minV = Math.min(...data.map(d => d.sizeGb))
  const range = maxV - minV || 1
  const W = 420; const H = 80
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((d.sizeGb - minV) / range) * H * 0.8 - H * 0.1
    return `${x},${y}`
  }).join(" ")
  const area = `0,${H} ${pts} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
      <defs>
        <linearGradient id="dGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#dGrad)" />
      <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => {
        const x = (i / (data.length - 1)) * W
        const y = H - ((d.sizeGb - minV) / range) * H * 0.8 - H * 0.1
        return <circle key={i} cx={x} cy={y} r="3" fill="#6366f1" />
      })}
    </svg>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DatabaseMonitoring() {
  const [autoRefresh, setAutoRefresh] = useState(true)

  const { data: pgData, isLoading: pgLoading, refetch: refetchPg, dataUpdatedAt } = useQuery<PostgresMetrics>({
    queryKey: ["postgres-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/postgres-metrics")
      if (!res.ok) throw new Error("Failed to fetch postgres metrics")
      return res.json()
    },
    refetchInterval: autoRefresh ? 10000 : false,
  })

  const { data: pbData, isLoading: pbLoading } = useQuery<PgBouncerMetrics>({
    queryKey: ["pgbouncer-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/pgbouncer-metrics")
      if (!res.ok) throw new Error("Failed to fetch pgbouncer metrics")
      return res.json()
    },
    refetchInterval: autoRefresh ? 10000 : false,
  })

  const isLoading = pgLoading || pbLoading
  const conn = pgData?.connections
  const pool = pbData?.pools?.[0]

  const poolBars = pool ? [
    { label: "Client Connections", value: pool.clActive, max: 200, bg: "bg-cyan-500", fg: "text-cyan-400" },
    { label: "Waiting Clients", value: pool.clWaiting, max: 20, bg: pool.clWaiting > 0 ? "bg-rose-500" : "bg-emerald-500", fg: pool.clWaiting > 0 ? "text-rose-400" : "text-emerald-400" },
    { label: "Server Active", value: pool.svActive, max: 100, bg: "bg-indigo-500", fg: "text-indigo-400" },
    { label: "Server Idle", value: pool.svIdle, max: 50, bg: "bg-blue-500", fg: "text-blue-400" },
  ] : []

  const healthItems = [
    { label: "Postgres Status", value: "Running", ok: true },
    { label: "Replication", value: "N/A (Single)", ok: true },
    { label: "PgBouncer", value: pool ? "Active" : "Not Deployed", ok: !!pool },
    { label: "Deadlocks", value: pgData?.deadlocks === 0 ? "None" : `${pgData?.deadlocks} found`, ok: pgData?.deadlocks === 0 },
  ]

  return (
    <div className="h-full overflow-y-auto px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6 text-indigo-400" />
            Database Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            PostgreSQL · PgBouncer · Live Cluster:{" "}
            <span className="font-mono text-primary">yourspeak-be-dev-v2</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(pgData?.isSimulated || pbData?.isSimulated) && (
            <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Simulated (RBAC exec restricted)
            </span>
          )}
          <button
            onClick={() => setAutoRefresh(a => !a)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              autoRefresh
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-muted border-border text-muted-foreground"
            )}
          >
            {autoRefresh ? "● Live" : "Paused"}
          </button>
          <button
            onClick={() => refetchPg()}
            className="p-2 rounded-lg border border-border hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Active Connections" value={conn?.active ?? "—"} sub={`of ${conn?.max ?? 200} max`} color="text-emerald-400" alert={(conn?.active ?? 0) > 150} />
        <StatCard icon={Activity} label="Connection Utilization" value={conn ? `${Math.round(conn.utilization)}%` : "—"} sub="Active + Idle vs Max" color="text-blue-400" alert={(conn?.utilization ?? 0) > 80} />
        <StatCard icon={Shield} label="Cache Hit Ratio" value={pgData ? `${pgData.cacheHitRatio}%` : "—"} sub="Buffer cache efficiency" color="text-indigo-400" alert={(pgData?.cacheHitRatio ?? 100) < 90} />
        <StatCard icon={AlertTriangle} label="Deadlocks" value={pgData?.deadlocks ?? "—"} sub="Since last reset" color="text-rose-400" alert={(pgData?.deadlocks ?? 0) > 0} />
      </div>

      {/* Gauge + PgBouncer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Connection Gauge */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-semibold">Active vs Max Connections</span>
          </div>
          {conn
            ? <ConnectionGauge connections={conn} />
            : <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading...</div>
          }
        </div>

        {/* PgBouncer Panel */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Server className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold">PgBouncer Connection Pool</span>
            <span className="ml-auto rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-400 font-medium border border-cyan-500/20">
              Strategy Active
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Multiplexes Laravel PHP-FPM workers → prevents Postgres saturation
          </p>
          {pool ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {poolBars.map(item => (
                  <div key={item.label} className="rounded-lg bg-muted/30 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-muted-foreground">{item.label}</span>
                      <span className={cn("text-base font-bold", item.fg)}>{item.value}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", item.bg)}
                        style={{ width: `${Math.min(100, (item.value / item.max) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/20 px-4 py-2 border border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Avg Wait Time
                </div>
                <span className={cn("text-sm font-bold", pbData!.stats.avgWaitTime > 10 ? "text-amber-400" : "text-emerald-400")}>
                  {pbData!.stats.avgWaitTime.toFixed(1)}ms
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/20 px-4 py-2 border border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Zap className="h-3.5 w-3.5" /> Total Requests Served
                </div>
                <span className="text-sm font-bold text-primary">
                  {pbData!.stats.totalRequests.toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading...</div>
          )}
        </div>
      </div>

      {/* Disk Growth Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold">Database Disk Space Growth (7 days)</span>
          {pgData?.diskGrowth && pgData.diskGrowth.length > 1 && (
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">
              {pgData.diskGrowth[pgData.diskGrowth.length - 1].sizeGb.toFixed(1)} GB total
            </span>
          )}
        </div>
        {pgData?.diskGrowth ? (
          <>
            <DiskChart data={pgData.diskGrowth} />
            <div className="flex justify-between mt-2">
              {pgData.diskGrowth.map((d, i) => (
                <div key={i} className="text-center">
                  <div className="text-[10px] text-muted-foreground">{d.date.split("/").slice(0, 2).join("/")}</div>
                  <div className="text-[10px] font-mono text-indigo-400">{d.sizeGb.toFixed(1)}G</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">Loading chart...</div>
        )}
      </div>

      {/* Slow Queries */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold">Top Slow-Running Queries</span>
          <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400 border border-amber-500/20">
            Sorted by avg exec time
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Query</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Time</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pgData?.slowQueries
                ? pgData.slowQueries.map((q, i) => {
                    const severity = q.exec_time > 1000 ? "High" : q.exec_time > 600 ? "Medium" : "Low"
                    const sevColor =
                      severity === "High" ? "text-rose-400 bg-rose-500/10 border-rose-500/20" :
                      severity === "Medium" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                      "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    const timeColor = q.exec_time > 1000 ? "text-rose-400" : q.exec_time > 600 ? "text-amber-400" : "text-emerald-400"
                    return (
                      <tr key={i} className="hover:bg-accent/20 transition-colors">
                        <td className="px-4 py-3 text-[11px] font-mono text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 max-w-[500px]">
                          <code className="text-[11px] font-mono text-foreground/80 break-all line-clamp-2">{q.query}</code>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn("text-sm font-bold font-mono", timeColor)}>{q.exec_time}ms</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn("text-[10px] font-semibold rounded-full px-2 py-0.5 border", sevColor)}>{severity}</span>
                        </td>
                      </tr>
                    )
                  })
                : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      {isLoading ? "Loading..." : "No slow queries detected"}
                    </td>
                  </tr>
                )
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Health Summary */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold">Database Health Summary</span>
          {dataUpdatedAt > 0 && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {healthItems.map(item => (
            <div key={item.label} className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-2">
              {item.ok
                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                : <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
              }
              <div>
                <div className="text-[10px] text-muted-foreground">{item.label}</div>
                <div className={cn("text-xs font-semibold", item.ok ? "text-emerald-400" : "text-amber-400")}>{item.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
