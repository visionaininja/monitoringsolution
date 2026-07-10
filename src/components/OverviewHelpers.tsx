import React, { useState, useEffect, useMemo, useCallback } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import {
  Users, Activity, CheckCircle2, GitBranch, GitPullRequest,
  TrendingUp, XCircle, AlertTriangle, Play, ChevronRight,
  Server, Box, Globe, Layers, X, ExternalLink, Clock,
  Cpu, MemoryStick, Hash, Circle, Container, Wifi, WifiOff, Download, RefreshCw, UploadCloud
} from "lucide-react"
import { ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, BarChart, Bar, Cell, PieChart, Pie } from "recharts"
import {
  fetchGitHubRepos, fetchGitHubWorkflowRuns, fetchGitHubCommits,
  fetchGitHubPullRequests, fetchGitHubContributors, getGitHubToken
} from "@/lib/github"
import { useEnvironment, Environment } from "@/context/EnvironmentContext"
import { cn } from "@/lib/utils"

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const ENV_USERNAMES: Record<Environment, string> = {
  dev: "dev",
  staging: "staging",
  production: "production",
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const fmtRelative = (dateStr: string) => {
  if (!dateStr) return ""
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export const statusIcon = (conclusion: string | null, status: string) => {
  if (status === "in_progress" || status === "queued") return <Play className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
  if (conclusion === "success") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  if (conclusion === "failure") return <XCircle className="h-3.5 w-3.5 text-rose-400" />
  return <Play className="h-3.5 w-3.5 text-zinc-500 animate-pulse" />
}

export const conclusionColor = (conclusion: string | null, status: string) => {
  if (status === "in_progress" || status === "queued") return "bg-amber-500/10 text-amber-400 border-amber-500/25"
  if (conclusion === "success") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
  if (conclusion === "failure") return "bg-rose-500/10 text-rose-400 border-rose-500/25"
  return "bg-zinc-500/10 text-zinc-400 border-zinc-500/25"
}

// â”€â”€â”€ Detail Overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type OverlayPanel = { title: string; subtitle: string; icon: any; accentColor: string; content: React.ReactNode }

export function DetailOverlay({ panel, onClose }: { panel: OverlayPanel | null; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  if (!panel) return null
  const Icon = panel.icon
  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-end" role="dialog">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* drawer */}
      <div className="relative z-10 h-full w-full max-w-lg flex flex-col bg-zinc-950 border-l border-zinc-800 shadow-2xl animate-in slide-in-from-right duration-300">
        {/* header */}
        <div className={cn("flex items-center gap-3 px-5 py-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md flex-shrink-0")}>
          <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${panel.accentColor}18` }}>
            <Icon className="h-4 w-4" style={{ color: panel.accentColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-zinc-100 truncate">{panel.title}</div>
            <div className="text-[10px] text-zinc-500 truncate">{panel.subtitle}</div>
          </div>
          <button onClick={onClose} className="ml-2 p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {panel.content}
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Stat Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function StatCard({ icon: Icon, label, value, sub, color, bg, loading, onClick }: {
  icon: any; label: string; value: string | number; sub?: string
  color: string; bg: string; loading?: boolean; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border bg-card p-5 space-y-3 hover:scale-[1.01] hover:border-zinc-600 hover:shadow-lg transition-all duration-300 relative overflow-hidden group",
        onClick && "cursor-pointer hover:ring-1 hover:ring-zinc-600/50"
      )}
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-white/[0.02] to-transparent rounded-bl-full pointer-events-none" />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</span>
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110", bg)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
      </div>
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-7 w-20 rounded bg-muted/50 animate-pulse" />
          <div className="h-3 w-28 rounded bg-muted/40 animate-pulse" />
        </div>
      ) : (
        <div>
          <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          {onClick && <p className="text-[9px] text-zinc-600 mt-1 group-hover:text-zinc-400 transition-colors">Click to expand</p>}
        </div>
      )}
    </div>
  )
}

export function DonutStatCard({ icon: Icon, label, value, sub, colorClass, strokeColor, max, onClick }: any) {
  const radius = 36;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 100;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border border-zinc-800/80 bg-[#0c0c0e] hover:border-zinc-700 transition-all duration-300 group flex flex-col relative overflow-hidden h-[196px]",
        onClick && "cursor-pointer hover:ring-1 hover:ring-zinc-600/50"
      )}
    >
      {/* Dynamic background glow matching card color */}
      <div className="absolute inset-0 blur-3xl opacity-5 pointer-events-none" style={{ backgroundColor: strokeColor }} />

      {/* Header matching SpeedometersCard */}
      <div className="px-4 py-2.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/50 flex-shrink-0">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
        <Icon className={cn("h-3.5 w-3.5", colorClass)} />
      </div>

      {/* Centered Donut Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
        <div className="relative w-20 h-20 flex-shrink-0 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full transform -rotate-90">
            <circle cx="40" cy="40" r={radius} fill="transparent" stroke="#27272a" strokeWidth={strokeWidth} />
            <circle
              cx="40" cy="40" r={radius}
              fill="transparent"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black tracking-tight text-zinc-100">
              {value}
            </span>
            {max !== undefined && (
              <span className="text-[9px] text-zinc-500 font-semibold border-t border-zinc-800/80 pt-0.5 mt-0.5">
                of {max}
              </span>
            )}
          </div>
        </div>

        {sub && (
          <div className="text-[10px] text-zinc-400 font-medium mt-3 text-center truncate w-full px-1">
            {sub}
          </div>
        )}
        {onClick && (
          <div className="text-[8px] text-zinc-500 font-semibold mt-1 group-hover:text-zinc-300 transition-colors uppercase tracking-wider">
            Click to expand
          </div>
        )}
      </div>
    </div>
  )
}

export function SpeedometersCard({ cpu, mem, disk }: { cpu: number, mem: number, disk?: number }) {
  // This component now renders line charts instead of speedometer gauges
  return <TelemetryLineChartCard cpu={cpu} mem={mem} disk={disk} />
}

type TimeRange = '30s' | '1m' | '3m' | '5m';
const TIME_RANGE_SECONDS: Record<TimeRange, number> = { '30s': 30, '1m': 60, '3m': 180, '5m': 300 };
const TIME_RANGES: TimeRange[] = ['30s', '1m', '3m', '5m'];

interface DataPoint {
  time: string;
  timestamp: number;
  value: number;
}

function MetricLineChart({
  label,
  value,
  color,
  gradientId,
  unit = '%',
}: {
  label: string;
  value: number;
  color: string;
  gradientId: string;
  unit?: string;
}) {
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1m');
  const historyRef = React.useRef<DataPoint[]>([]);
  const [chartData, setChartData] = React.useState<DataPoint[]>([]);

  // Accumulate history on each value update
  React.useEffect(() => {
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    historyRef.current.push({ time: timeStr, timestamp: now, value: Math.max(0, Math.min(100, value || 0)) });

    // Keep max 5 minutes of history
    const cutoff = now - 300 * 1000;
    historyRef.current = historyRef.current.filter(p => p.timestamp >= cutoff);

    // Filter by selected range
    const rangeCutoff = now - TIME_RANGE_SECONDS[timeRange] * 1000;
    setChartData(historyRef.current.filter(p => p.timestamp >= rangeCutoff));
  }, [value, timeRange]);

  const clamped = Math.max(0, Math.min(100, value || 0));
  const statusColor = clamped > 80 ? '#ef4444' : clamped > 60 ? '#f59e0b' : color;

  return (
    <div className="flex flex-col h-full">
      {/* Metric header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}40` }} />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-extrabold text-zinc-100 font-mono tabular-nums" style={{ color: statusColor }}>
            {clamped.toFixed(1)}
            <span className="text-[9px] font-semibold text-zinc-500 ml-0.5">{unit}</span>
          </span>
        </div>
      </div>

      {/* Time range filter */}
      <div className="flex items-center gap-1 px-3 pb-1.5 flex-shrink-0">
        {TIME_RANGES.map(range => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={cn(
              "text-[8px] font-bold px-1.5 py-0.5 rounded-md border transition-all duration-200 uppercase tracking-wider",
              timeRange === range
                ? "border-zinc-600 bg-zinc-800 text-zinc-200"
                : "border-transparent bg-transparent text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900"
            )}
          >
            {range}
          </button>
        ))}
      </div>

      {/* Line chart */}
      <div className="flex-1 min-h-0 px-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 8, fill: '#52525b' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 8, fill: '#52525b' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                fontSize: '10px',
                fontFamily: 'monospace',
                padding: '6px 10px',
              }}
              itemStyle={{ color: color }}
              labelStyle={{ color: '#a1a1aa', fontSize: '9px' }}
              formatter={(val: number) => [`${val.toFixed(1)}%`, label]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3, fill: color, stroke: '#0c0c0e', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TelemetryLineChartCard({ cpu, mem, disk }: { cpu: number, mem: number, disk?: number }) {
  const hasDisk = disk !== undefined;

  return (
    <div className="w-full rounded-xl border border-zinc-800/80 bg-[#0c0c0e] overflow-hidden flex flex-col hover:border-zinc-700 transition-colors duration-300">
      {/* Header */}
      <div className="px-4 py-2 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/50 flex-shrink-0">
        <h2 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Live Host Telemetry</h2>
        <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
      </div>

      {/* Charts grid */}
      <div className={cn("flex-1 grid divide-x divide-zinc-800/80", hasDisk ? "grid-cols-3" : "grid-cols-2")} style={{ minHeight: '180px' }}>
        <MetricLineChart label="CPU Usage" value={cpu} color="#60a5fa" gradientId="cpuGrad" />
        <MetricLineChart label="RAM Usage" value={mem} color="#c084fc" gradientId="memGrad" />
        {hasDisk && <MetricLineChart label="Disk Usage" value={disk} color="#34d399" gradientId="diskGrad" />}
      </div>
    </div>
  );
}

export function NodeMiniSpeedo({ val, label, color }: { val: number; label: string; color: string }) {
  const radius = 22
  const strokeWidth = 4.5
  const cx = 25
  const cy = 24
  const circumference = Math.PI * radius
  const clamped = Math.max(0, Math.min(100, val || 0))
  const offset = circumference - (clamped / 100) * circumference

  // Dynamic status color coding
  const finalColor = clamped > 80 ? "#ef4444" : clamped > 60 ? "#f59e0b" : color

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[50px] h-[25px] flex items-center justify-center">
        <svg width="50" height="25" viewBox="0 0 50 25" className="absolute bottom-0">
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="#27272a"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke={finalColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute bottom-0 left-0 right-0 text-center">
          <span className="text-[11px] font-extrabold text-zinc-100 font-mono leading-none">{clamped}%</span>
        </div>
      </div>
      <span className="text-[8px] font-semibold text-zinc-400 uppercase tracking-wider mt-1">{label}</span>
    </div>
  )
}

// â”€â”€â”€ Docker Overview Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

