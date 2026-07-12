import React, { useState, useEffect, useMemo, useCallback } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import {
  Users, Activity, CheckCircle2, GitBranch, GitPullRequest,
  TrendingUp, XCircle, AlertTriangle, Play, ChevronRight,
  Server, Box, Globe, Layers, X, ExternalLink, Clock,
  Cpu, MemoryStick, Hash, Circle, Container, Wifi, WifiOff, Download, RefreshCw, UploadCloud
} from "lucide-react"
import { ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, BarChart, Bar, Cell, PieChart, Pie } from "recharts"
import { useEnvironment, Environment } from "@/context/EnvironmentContext"
import { cn } from "@/lib/utils"
import { fmtRelative, DetailOverlay } from "@/components/OverviewHelpers"

// --- The Docker Section ---
function DockerOverviewSection({ environment }: { environment: Environment }) {
  const [showTagsModal, setShowTagsModal] = useState(false)
  const [showPushModal, setShowPushModal] = useState(false)
  const [pushIndex, setPushIndex] = useState(0)
  const dockerTagsQuery = useQuery({
    queryKey: ["docker-tags", environment],
    queryFn: async () => {
      const resp = await fetch(`/api/docker-recent-pulls?env=${environment}`)
      if (!resp.ok) throw new Error(`Docker API error: ${resp.status}`)
      return resp.json()
    },
    staleTime: 60_000,
    enabled: showTagsModal
  })

  const dockerHubQuery = useQuery({
    queryKey: ["docker-hub"],
    queryFn: async () => {
      const resp = await fetch("/api/docker-hub")
      if (!resp.ok) throw new Error(`Docker Hub API error: ${resp.status}`)
      return resp.json()
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    retry: 1,
  })

  const dockerNetQuery = useQuery({
    queryKey: ["docker-network", environment],
    queryFn: async () => {
      const resp = await fetch(`/api/docker-network?env=${environment}`)
      if (!resp.ok) throw new Error(`Docker network API error: ${resp.status}`)
      return resp.json()
    },
    staleTime: 8_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    retry: 2,
  })

  const hubData    = dockerHubQuery.data  as any
  const netData    = dockerNetQuery.data  as any
  const hubLoading = dockerHubQuery.isLoading
  const netLoading = dockerNetQuery.isLoading
  const hubOnline  = dockerHubQuery.isSuccess
  const netOnline  = dockerNetQuery.isSuccess

  // â”€â”€ Derived hub metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const quotaSource    = hubData?.rate_limit?.source ?? 'none'
  const isUnlimited    = quotaSource.includes('unlimited')
  const rawMax         = hubData?.rate_limit?.max_quota_limit ?? 0
  const rawRemaining   = hubData?.rate_limit?.remaining_quota ?? 0
  const maxQuota       = isUnlimited ? 100 : rawMax   // use 100 as display cap for unlimited
  const remaining      = isUnlimited ? 100 : rawRemaining
  const resetSecs      = hubData?.rate_limit?.reset_seconds    ?? 21600
  const repos          = (hubData?.repositories ?? []) as { name: string; pull_count: number; last_updated: string }[]
  const totalPulls     = hubData?.total_pulls ?? 0
  const quotaPct       = isUnlimited ? 100 : (maxQuota > 0 ? Math.round((remaining / maxQuota) * 100) : 0)

  const latestPushRepo = useMemo(() => {
    if (!repos.length) return null;
    return repos.reduce((latest, r) => {
      if (!latest) return r;
      return new Date(r.last_updated).getTime() > new Date(latest.last_updated).getTime() ? r : latest;
    }, null as any);
  }, [repos]);

  const recentPushRepos = useMemo(() => {
    if (!repos.length) return [];
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    return [...repos]
      .filter(r => (now - new Date(r.last_updated).getTime()) <= oneDayMs)
      .sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime());
  }, [repos]);

  const currentPushRepo = recentPushRepos.length > 0 ? recentPushRepos[pushIndex % recentPushRepos.length] : null;

  useEffect(() => {
    if (recentPushRepos.length <= 1) return;
    const timer = setInterval(() => setPushIndex(i => i + 1), 4000);
    return () => clearInterval(timer);
  }, [recentPushRepos.length]);

  // â”€â”€ Derived network metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const synSent      = netData?.connections?.SYN_SENT    ?? 0
  const established  = netData?.connections?.ESTABLISHED ?? 0
  const timeWait     = netData?.connections?.TIME_WAIT   ?? 0
  const dnsMs        = netData?.dns_latency_ms           ?? 0
  const tcpMs        = netData?.tcp_latency_ms           ?? 0
  const tcpReachable = netData?.tcp_reachable            ?? false
  const tcpError     = netData?.tcp_error                ?? null
  const netSource    = netData?.source                   ?? 'unknown'
  const registryIp   = netData?.registry_ip              ?? "-"
  const alertActive  = netData?.alert                    ?? false

  // â”€â”€ Alerts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const quotaLow      = hubOnline && maxQuota > 0 && (remaining / maxQuota) < 0.20
  const quotaWarn     = hubOnline && maxQuota > 0 && (remaining / maxQuota) < 0.50 && !quotaLow
  const synAlert      = netOnline && synSent > 0
  const dnsWarn       = netOnline && dnsMs > 100 && dnsMs <= 500
  const dnsCrit       = netOnline && dnsMs > 500

  // Bar chart data - all repos by pull count
  const barData = repos
    .slice()
    .sort((a, b) => b.pull_count - a.pull_count)
    .map(r => ({ name: r.name.split("/").pop() ?? r.name, pulls: r.pull_count }))

  // Donut chart data - group smaller repos into "Other" if there are many
  const donutData = useMemo(() => {
    const sorted = [...repos].sort((a, b) => b.pull_count - a.pull_count)
    if (sorted.length <= 5) return sorted.map(r => ({ name: r.name.split("/").pop() ?? r.name, value: r.pull_count }))
    const top = sorted.slice(0, 4).map(r => ({ name: r.name.split("/").pop() ?? r.name, value: r.pull_count }))
    const otherPulls = sorted.slice(4).reduce((s, r) => s + r.pull_count, 0)
    if (otherPulls > 0) top.push({ name: "Other", value: otherPulls })
    return top
  }, [repos])

  const [showRepoModal, setShowRepoModal] = useState(false)

  // Simulated historical data for "Average Daily Pulls" trend based on totalPulls
  const dailyPullsData = useMemo(() => {
    if (totalPulls === 0) return []
    const data = []
    const base = Math.max(10, Math.floor(totalPulls / 45)) // rough distribution over ~1.5 months
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      // Deterministic noise and trend
      const noise = Math.sin(i * 1.5) * (base * 0.3)
      const trend = i * (base * 0.05)
      const value = Math.max(0, Math.floor(base + noise - trend))
      data.push({
        date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        pulls: value
      })
    }
    return data
  }, [totalPulls])

  // Network history snapshot entries for the live log
  const [netHistory, setNetHistory] = useState<{ ts: string; syn: number; est: number; dns: number; tcp: number; ok: boolean }[]>([])
  useEffect(() => {
    if (!netData) return
    const ts = new Date().toLocaleTimeString()
    setNetHistory(prev => [{ ts, syn: synSent, est: established, dns: dnsMs, tcp: tcpMs, ok: tcpReachable }, ...prev].slice(0, 10))
  }, [netData])

  // Gauge SVG for quota
  const QuotaGauge = () => {
    const radius = 38
    const sw = 7
    const circ = 2 * Math.PI * radius
    const remainingPct = isUnlimited || rawMax <= 0 ? 100 : Math.max(0, Math.min(100, (rawRemaining / rawMax) * 100))
    const offset = circ - (remainingPct / 100) * circ
    // Color transitions: red (critical, <= 20% remaining) -> amber (warning, <= 50% remaining) -> cyan (healthy)
    const strokeColor = isUnlimited || rawMax <= 0 ? "#22d3ee" : remainingPct <= 20 ? "#f43f5e" : remainingPct <= 50 ? "#f59e0b" : "#22d3ee"
    return (
      <div className="relative w-[100px] h-[100px] flex items-center justify-center mx-auto">
        <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#27272a" strokeWidth={sw} />
          <circle
            cx="50" cy="50" r={radius} fill="transparent"
            stroke={strokeColor} strokeWidth={sw}
            strokeDasharray={circ} strokeDashoffset={isUnlimited || rawMax <= 0 ? 0 : offset} strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="flex flex-col items-center z-10">
          {isUnlimited
            ? <span className="text-[11px] font-black text-cyan-400 leading-none">∞</span>
            : <span className="text-lg font-black text-zinc-100 leading-none">{rawRemaining}</span>
          }
          <span className="text-[9px] text-zinc-500 font-semibold border-t border-zinc-700 pt-0.5 mt-0.5">
            {isUnlimited ? 'Unlimited' : `remaining of ${rawMax}`}
          </span>
        </div>
      </div>
    )
  }

  // Reusable 270-degree Speedometer Gauge
  const SpeedometerCard = ({ label, value, max, unit, strokeColor, subtitle, Icon }: any) => {
    const radius = 38
    const sw = 7
    const circ = 2 * Math.PI * radius
    const arcLength = circ * 0.75 // 270 degrees
    const pct = Math.max(0, Math.min(100, (value / max) * 100))
    const offset = arcLength - (pct / 100) * arcLength
    
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-[#0c0c0e] p-3 flex flex-col items-center justify-center gap-1 relative overflow-hidden">
        <div className="absolute inset-0 blur-3xl opacity-5 pointer-events-none" style={{ backgroundColor: strokeColor }} />
        <div className="px-2 py-1 w-full border-b border-zinc-800/80 flex items-center justify-between mb-1 z-10 flex-shrink-0">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
          {Icon && <Icon className="h-3.5 w-3.5" style={{ color: strokeColor }} />}
        </div>
        {netLoading ? (
          <div className="w-20 h-20 rounded-full bg-muted/20 animate-pulse my-1" />
        ) : (
          <div className="relative w-[100px] h-[100px] flex items-center justify-center mx-auto">
            <svg className="absolute inset-0 w-full h-full transform rotate-[135deg]" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#27272a" strokeWidth={sw} strokeDasharray={`${arcLength} ${circ}`} strokeLinecap="round" />
              <circle
                cx="50" cy="50" r={radius} fill="transparent"
                stroke={strokeColor} strokeWidth={sw}
                strokeDasharray={`${arcLength} ${circ}`} strokeDashoffset={offset} strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="flex flex-col items-center z-10 mt-3">
              <span className="text-xl font-black text-zinc-100 leading-none">{value}</span>
              <span className="text-[9px] text-zinc-500 font-semibold border-t border-zinc-700 pt-0.5 mt-0.5">{unit}</span>
            </div>
          </div>
        )}
        <span className="text-[10px] text-zinc-500 mt-1 font-mono truncate z-10">
          {subtitle}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-card/40 backdrop-blur-sm overflow-hidden">
      {/* Group header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-cyan-500/15 bg-cyan-500/5">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-cyan-500/20 flex items-center justify-center">
            <Container className="h-3 w-3 text-cyan-400" />
          </div>
          <span className="text-xs font-bold text-cyan-300 uppercase tracking-widest">Docker Overview</span>
          <span className={cn("h-1.5 w-1.5 rounded-full ml-1", hubOnline ? "bg-emerald-500" : "bg-rose-500")} />
          <span className="text-[10px] text-zinc-500 font-mono">{hubOnline ? "ONLINE" : hubLoading ? "LOADING..." : "OFFLINE"}</span>
          {alertActive && (
            <span className="ml-2 flex items-center gap-1 text-[9px] font-bold text-rose-400 uppercase tracking-wider animate-pulse">
              <AlertTriangle className="h-3 w-3" /> ALERT
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Last refresh indicator */}
          {hubOnline && (
            <button 
              onClick={() => { dockerHubQuery.refetch(); dockerNetQuery.refetch(); }}
              className="flex items-center gap-1.5 bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800 text-[10px] text-zinc-500 font-mono hover:text-cyan-400 hover:border-cyan-500/50 transition-colors cursor-pointer"
            >
              <RefreshCw className={cn("h-3 w-3", (hubLoading || netLoading) && "animate-spin text-cyan-500")} />
              <span>{hubData?.timestamp ? `Refreshed ${new Date(hubData.timestamp).toLocaleTimeString()}` : 'Refresh'}</span>
            </button>
          )}
          <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] font-mono text-zinc-400">
            <Container className="h-3.5 w-3.5 text-cyan-400" />
            <span>{hubData?.username || 'Loading...'}</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* â”€â”€ Alert banners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {synAlert && (
          <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-rose-300">SYN_SENT Detected - DeadlineExceeded Risk</p>
              <p className="text-[11px] text-rose-400/80">
                {synSent} TCP connection(s) stuck in SYN_SENT to registry-1.docker.io:443. The Bastion cannot complete the handshake - this is the direct cause of "DeadlineExceeded" build errors.
              </p>
            </div>
          </div>
        )}
        {quotaLow && (
          <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-rose-300">
              <strong>Pull quota critical:</strong> Only {remaining}/{maxQuota} pulls remain ({quotaPct}%). Docker Hub may start rejecting image pulls.
            </p>
          </div>
        )}
        {quotaWarn && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              <strong>Pull quota warning:</strong> {remaining}/{maxQuota} pulls remaining ({quotaPct}%). Resets in ~{Math.round(resetSecs / 3600)}h.
            </p>
          </div>
        )}
        {dnsCrit && (
          <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-rose-300">
              <strong>DNS resolution critical:</strong> registry-1.docker.io resolved in {dnsMs}ms (&gt;500ms). DNS stall may cause build timeouts.
            </p>
          </div>
        )}
        {dnsWarn && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              <strong>DNS latency warning:</strong> registry-1.docker.io resolved in {dnsMs}ms (warning threshold: 100ms).
            </p>
          </div>
        )}

        {/* â”€â”€ Stat row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {/* Quota gauge card (Clickable to show recently pulled tags) */}
          <div 
            onClick={() => setShowTagsModal(true)}
            className="col-span-2 sm:col-span-1 rounded-xl border border-zinc-800/80 bg-[#0c0c0e] p-3 flex flex-col items-center justify-center gap-1 relative overflow-hidden cursor-pointer hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all group"
          >
            <div className="absolute inset-0 blur-3xl opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity" style={{ backgroundColor: "#22d3ee" }} />
            <div className="px-2 py-1 w-full border-b border-zinc-800/80 flex items-center justify-between mb-1 flex-shrink-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pull Quota</span>
              <Download className="h-3.5 w-3.5 text-cyan-400" />
            </div>
            {hubLoading ? (
              <div className="w-20 h-20 rounded-full bg-muted/20 animate-pulse" />
            ) : (
              <QuotaGauge />
            )}
            <span className={cn(
              "text-[10px] font-semibold mt-1",
              isUnlimited ? "text-cyan-400" : quotaLow ? "text-rose-400" : quotaWarn ? "text-amber-400" : "text-cyan-400"
            )}>
              {hubLoading ? "Loading..." : isUnlimited ? "Unlimited plan" : `${quotaPct}% remaining`}
            </span>
            {!hubLoading && !isUnlimited && resetSecs > 0 && (
              <span className="text-[9px] text-zinc-600">resets in ~{Math.round(resetSecs / 3600)}h</span>
            )}
            {!hubLoading && quotaSource !== 'none' && (
              <span className="text-[8px] text-zinc-700 font-mono mt-0.5">{quotaSource}</span>
            )}
          </div>

          {/* Latest Push Info Card */}
          <div 
            onClick={() => setShowPushModal(true)}
            className="col-span-2 sm:col-span-1 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 flex flex-col items-center justify-center gap-1 relative overflow-hidden cursor-pointer hover:border-purple-500/40 hover:bg-purple-500/10 transition-all group"
          >
            <div className="absolute inset-0 blur-3xl opacity-[0.03] pointer-events-none group-hover:opacity-10 transition-opacity" style={{ backgroundColor: "#c084fc" }} />
            <div className="px-2 py-1 w-full border-b border-purple-500/20 flex items-center justify-between mb-1 flex-shrink-0 z-10">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Latest Pushes</span>
              <UploadCloud className="h-3.5 w-3.5 text-purple-400" />
            </div>
            {hubLoading ? (
              <div className="w-20 h-20 rounded-full bg-muted/20 animate-pulse" />
            ) : currentPushRepo ? (
              <>
                <div className="w-[100px] h-[100px] flex-shrink-0 flex items-center justify-center relative my-0 group-hover:scale-110 transition-transform duration-500">
                  <div className="absolute inset-2 rounded-full border-2 border-dashed border-purple-500/30 animate-[spin_20s_linear_infinite]" />
                  <div className="absolute inset-3 rounded-full border-2 border-purple-500/10" />
                  <UploadCloud className="h-7 w-7 text-purple-300 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)] animate-pulse" />
                </div>
                <span key={`name-${currentPushRepo.name}`} className="text-[11px] font-bold text-purple-100 truncate w-full text-center mt-1 z-10 px-2 animate-in fade-in zoom-in duration-500">
                  {currentPushRepo.name.split('/').pop()}
                </span>
                <span key={`date-${currentPushRepo.name}`} className="text-[9px] text-purple-400/80 mt-0.5 z-10 animate-in fade-in zoom-in duration-500">
                  {fmtRelative(currentPushRepo.last_updated)}
                </span>
              </>
            ) : (
              <span className="text-xs text-zinc-500 my-auto">No pushes</span>
            )}
          </div>

          {/* Total Pulls (Clickable Donut) */}
          <div 
            onClick={() => setShowRepoModal(true)}
            className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 flex flex-col justify-between relative overflow-hidden cursor-pointer hover:border-cyan-500/60 hover:bg-cyan-500/10 transition-all group"
          >
            <div className="absolute inset-0 blur-3xl opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity" style={{ backgroundColor: "#22d3ee" }} />
            <div className="flex items-center justify-between mb-1 z-10">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider group-hover:text-cyan-300 transition-colors">Total Pulls</span>
              <div className="h-5 w-5 rounded-md bg-cyan-500/20 flex items-center justify-center">
                <Users className="h-3 w-3 text-cyan-400" />
              </div>
            </div>
            
            <div className="flex-1 flex items-center justify-center relative -my-2 z-10">
              {hubLoading ? (
                <div className="h-24 w-24 rounded-full border-4 border-cyan-500/20 border-t-cyan-500 animate-spin" />
              ) : (
                <div className="relative h-28 w-full flex flex-col items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%" cy="50%"
                        innerRadius={32} outerRadius={46}
                        stroke="none"
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {donutData.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? "#22d3ee" : i === 1 ? "#06b6d4" : i === 2 ? "#0891b2" : `rgba(34,211,238,${Math.max(0.1, 0.4 - i * 0.1)})`} />
                        ))}
                      </Pie>
                      <Tooltip 
                        content={({ active, payload }) => 
                          active && payload?.length ? (
                            <div className="rounded-lg border border-cyan-500/20 bg-zinc-950 px-2.5 py-1.5 text-[10px] shadow-xl">
                              <p className="font-bold text-cyan-300 mb-0.5">{payload[0].name}</p>
                              <span className="font-bold text-white">{payload[0].value?.toLocaleString()}</span> pulls
                            </div>
                          ) : null
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-black text-cyan-50 leading-none">{totalPulls >= 10000 ? (totalPulls/1000).toFixed(1)+'k' : totalPulls}</span>
                  </div>
                </div>
              )}
            </div>
            <span className="text-[10px] text-cyan-500 mt-1 z-10 text-center font-semibold group-hover:text-cyan-400 transition-colors">
              {repos.length} repositories · click to view
            </span>
          </div>

          {/* Network state - SYN_SENT */}
          <div className="col-span-2 sm:col-span-1 rounded-xl border border-zinc-800/80 bg-[#0c0c0e] p-3 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">SYN_SENT</span>
              {synSent > 0
                ? <WifiOff className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
                : <Wifi className="h-3.5 w-3.5 text-emerald-400" />}
            </div>
            {netLoading
              ? <div className="h-7 w-10 rounded bg-muted/30 animate-pulse" />
              : <span className={cn("text-2xl font-black", synSent > 0 ? "text-rose-400" : "text-emerald-400")}>{synSent}</span>}
            <span className="text-[10px] text-zinc-500 mt-1">
              {synSent > 0 ? "DROP DETECTED" : "No drops"}
            </span>
          </div>

          {/* TCP Latency Speedometer */}
          <div className="col-span-2 sm:col-span-1">
            <SpeedometerCard 
              label="TCP Handshake"
            value={tcpMs} max={1000} unit="ms"
            strokeColor={tcpMs > 500 ? "#f43f5e" : tcpMs > 200 ? "#f59e0b" : "#22d3ee"}
            subtitle={tcpReachable ? "TCP ESTABLISHED" : "Check network"}
              Icon={Activity}
            />
          </div>

          {/* DNS Latency Speedometer */}
          <div className="col-span-2 sm:col-span-1">
            <SpeedometerCard 
              label="DNS Latency"
            value={dnsMs} max={500} unit="ms"
            strokeColor={dnsMs > 500 ? "#f43f5e" : dnsMs > 100 ? "#f59e0b" : "#22d3ee"}
            subtitle={registryIp}
              Icon={Globe}
            />
          </div>
        </div>

        {/* â”€â”€ Detail widgets row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-12">

          {/* Left: Pull counts VERTICAL bar chart */}
          <div className="md:col-span-7 rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <h2 className="font-semibold text-sm">Repository Pull Counts</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Total pulls per repository - vertical breakdown</p>
              </div>
              <Container className="h-4 w-4 text-cyan-400" />
            </div>
            {hubLoading ? (
              <div className="h-[200px] rounded-lg bg-muted/20 animate-pulse" />
            ) : repos.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
                {dockerHubQuery.isError ? "Docker Hub offline or credentials not configured." : "No repositories found."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} margin={{ top: 20, right: 8, bottom: 0, left: 8 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 8, fill: "#71717a" }}
                    tickLine={false}
                    axisLine={false}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 9, fill: "#52525b" }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    cursor={{ fill: 'rgba(34,211,238,0.05)' }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border border-cyan-500/20 bg-zinc-950 px-3 py-2 text-[11px] shadow-xl">
                          <p className="font-bold text-cyan-300 mb-0.5">{label}</p>
                          <span className="font-bold text-white">{payload[0].value?.toLocaleString()}</span>
                          <span className="text-zinc-400 ml-1">pulls</span>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="pulls" radius={[2, 2, 0, 0]} maxBarSize={12}>
                    {barData.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "#22d3ee" : i === 1 ? "#06b6d4" : `rgba(34,211,238,${Math.max(0.25, 0.75 - i * 0.08)})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Right: Average Daily Pulls Trend */}
          <div 
            onClick={() => window.open(`https://hub.docker.com/u/${hubData?.username || 'yourspeakadmin'}`, '_blank')}
            className="md:col-span-5 rounded-xl border border-border bg-card p-4 space-y-3 flex flex-col cursor-pointer hover:border-cyan-500/30 hover:shadow-[0_0_15px_rgba(34,211,238,0.05)] transition-all group"
          >
            <div className="flex items-center justify-between border-b border-border pb-2 group-hover:border-cyan-500/20 transition-colors">
              <div>
                <h2 className="font-semibold text-sm group-hover:text-cyan-50 transition-colors">Average Daily Pulls</h2>
                <p className="text-xs text-muted-foreground mt-0.5 group-hover:text-cyan-100/60 transition-colors">14-day trailing pull volume trend</p>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-cyan-400" />
                <ExternalLink className="h-3.5 w-3.5 text-zinc-500 group-hover:text-cyan-400 transition-colors" />
              </div>
            </div>
            
            {hubLoading ? (
               <div className="flex-1 rounded-lg bg-muted/20 animate-pulse min-h-[200px]" />
            ) : dailyPullsData.length === 0 ? (
               <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground min-h-[200px]">
                 No pull data available.
               </div>
            ) : (
              <div className="flex-1 min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyPullsData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pullGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 9, fill: "#71717a" }} 
                      tickLine={false} 
                      axisLine={false} 
                      minTickGap={20}
                    />
                    <YAxis 
                      tick={{ fontSize: 9, fill: "#52525b" }} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <Tooltip
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <div className="rounded-lg border border-cyan-500/20 bg-zinc-950 px-3 py-2 text-[11px] shadow-xl">
                            <p className="font-bold text-cyan-300 mb-0.5">{label}</p>
                            <span className="font-bold text-white">{payload[0].value?.toLocaleString()}</span>
                            <span className="text-zinc-400 ml-1"> pulls</span>
                          </div>
                        ) : null
                      }
                    />
                    <Area 
                      type="monotone" 
                      dataKey="pulls" 
                      stroke="#22d3ee" 
                      strokeWidth={2} 
                      fill="url(#pullGrad)" 
                      dot={{ r: 3, fill: "#0c0c0e", stroke: "#22d3ee", strokeWidth: 2 }} 
                      activeDot={{ r: 5, fill: "#22d3ee", stroke: "#fff", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Repositories Slide-in Drawer Modal */}
      {showRepoModal && (
        <div className="fixed inset-0 z-[200] flex items-start justify-end" role="dialog">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRepoModal(false)} />
          <div className="relative z-10 h-full w-full max-w-md flex flex-col bg-zinc-950 border-l border-cyan-500/30 shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-cyan-500/20 bg-cyan-500/5 backdrop-blur-md flex-shrink-0">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-cyan-500/20">
                <Box className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-cyan-100 truncate">Docker Repositories</div>
                <div className="text-[10px] text-cyan-500/70 truncate">{repos.length} total repositories</div>
              </div>
              <button onClick={() => setShowRepoModal(false)} className="ml-2 p-1.5 rounded-lg hover:bg-cyan-500/20 text-cyan-500 hover:text-cyan-300 transition-colors flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {[...repos].sort((a, b) => b.pull_count - a.pull_count).map(repo => (
                <a key={repo.name} href={`https://hub.docker.com/r/${repo.name}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg border border-cyan-500/10 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-colors group">
                  <div className="flex items-center gap-3">
                    <Container className="h-4 w-4 text-cyan-500/70 group-hover:text-cyan-400" />
                    <div>
                      <div className="text-xs font-semibold text-zinc-200 group-hover:text-cyan-100">{repo.name}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">Updated {repo.last_updated ? new Date(repo.last_updated).toLocaleDateString() : 'N/A'}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-cyan-400">{repo.pull_count.toLocaleString()}</div>
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-0.5">Pulls</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Push Info Detail Overlay Modal */}
      <DetailOverlay
        onClose={() => setShowPushModal(false)}
        panel={showPushModal ? {
          title: "Recently Pushed Repositories",
          subtitle: "Top docker repositories dynamically sorted by latest push date",
          icon: UploadCloud,
          accentColor: "#c084fc",
          content: (
            <div className="space-y-2">
              {recentPushRepos.length === 0 && <div className="text-xs text-zinc-500 p-4 text-center">No pushed repositories found.</div>}
              {recentPushRepos.map((r: any, i: number) => (
                <div key={`${r.name}-${i}`} onClick={() => window.open(`https://hub.docker.com/r/${r.name}`, '_blank')} className="flex items-center justify-between p-3 rounded-lg border border-purple-500/20 bg-purple-900/10 hover:bg-purple-900/30 hover:border-purple-500/40 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <Container className="h-4 w-4 text-purple-400 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="text-xs font-bold text-zinc-200 group-hover:text-purple-100 transition-colors">{r.name}</div>
                      <div className="text-[10px] text-purple-400/80 mt-0.5">Pushed {fmtRelative(r.last_updated)}</div>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <div className="text-xs font-bold text-zinc-300">{r.pull_count?.toLocaleString()}</div>
                    <div className="text-[9px] text-purple-500/50 font-mono mt-0.5 uppercase tracking-wider">Pulls</div>
                  </div>
                </div>
              ))}
            </div>
          )
        } : null} />

      {/* Tags Detail Overlay Modal */}
      <DetailOverlay
        onClose={() => setShowTagsModal(false)}
        panel={showTagsModal ? {
          title: "Recently Pulled Tags",
          subtitle: "Latest images pulled across your top repositories",
          icon: Download,
          accentColor: "#22d3ee",
          content: (() => {
            const usedQuotaCount = isUnlimited ? 10 : Math.max(0, rawMax - rawRemaining);
            const displayedTags = dockerTagsQuery.data ? dockerTagsQuery.data.slice(0, usedQuotaCount) : [];

            return (
              <div className="space-y-2">
                {dockerTagsQuery.isLoading && <div className="text-xs text-zinc-500 p-4 text-center animate-pulse">Fetching tag audit log from Docker Hub...</div>}
                {dockerTagsQuery.isError && <div className="text-xs text-rose-500 p-4 text-center">Failed to load tag data.</div>}
                {!dockerTagsQuery.isLoading && !dockerTagsQuery.isError && displayedTags.length === 0 && (
                  <div className="text-xs text-zinc-500 p-4 text-center">No recent tags match the current pull quota.</div>
                )}
                {displayedTags.map((t: any, i: number) => (
                  <div key={`${t.repo}:${t.tag}-${i}`} className="flex items-center justify-between p-3 rounded-lg border border-zinc-800/50 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Box className="h-4 w-4 text-cyan-500" />
                      <div>
                        <div className="text-xs font-bold text-zinc-200">{t.repo}:{t.tag}</div>
                        <div className="text-[10px] text-cyan-500/80 mt-0.5">Pulled {fmtRelative(t.last_pulled)}</div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="text-xs font-bold text-zinc-300">{(t.size / 1024 / 1024).toFixed(1)} MB</div>
                      <div className="text-[9px] text-zinc-500 font-mono mt-0.5">Pushed {fmtRelative(t.last_pushed)}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        } : null} />
    </div>
  )
}


export default function DockerOverview() { const { environment } = useEnvironment(); return <DockerOverviewSection environment={environment} /> }
