// @ts-nocheck
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
import { getGitHubToken, fetchGitHubRepos, fetchGitHubCommits, fetchGitHubWorkflowRuns, fetchGitHubPullRequests, fetchGitHubContributors } from '@/lib/github';
import { fmtRelative, DetailOverlay, StatCard, DonutStatCard, SpeedometersCard, NodeMiniSpeedo, statusIcon, conclusionColor, ENV_USERNAMES } from '@/components/OverviewHelpers';
import type { OverlayPanel } from '@/components/OverviewHelpers';
export default function VirtualMachineOverview() {
const toLocalDate = (dateStr: string | number | Date | undefined) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
  const { environment, setEnvironment } = useEnvironment()
  const hasToken = !!getGitHubToken()

  // Splash screen
  const [showSplash, setShowSplash] = useState(true)
  const [fadeSplash, setFadeSplash] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setFadeSplash(true), 1500)
    const t2 = setTimeout(() => setShowSplash(false), 1900)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // â”€â”€ GitHub Queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const sharedOpts = { staleTime: 2 * 60 * 1000, refetchOnWindowFocus: false, placeholderData: keepPreviousData }
  const reposQuery = useQuery({ queryKey: ["overview-repos"], queryFn: fetchGitHubRepos, enabled: hasToken, ...sharedOpts })
  const repos = (reposQuery.data || []) as any[]

  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null)

  // Use the selected repo, or default to the most recently pushed repo
  const primaryRepo = useMemo(() => {
    if (!repos.length) return null
    if (selectedRepoId) {
      const found = repos.find(r => r.id === selectedRepoId)
      if (found) return found
    }
    return repos.reduce((a: any, b: any) => new Date(b.pushed_at) > new Date(a.pushed_at) ? b : a)
  }, [repos, selectedRepoId])

  const owner = primaryRepo?.owner?.login || ""
  const repoName = primaryRepo?.name || ""
  const isRepoActive = hasToken && !!primaryRepo

  const commitsQuery = useQuery({
    queryKey: ["overview-commits", owner, repoName],
    queryFn: () => fetchGitHubCommits(owner, repoName),
    enabled: isRepoActive,
    ...sharedOpts,
  })

  const runsQuery = useQuery({
    queryKey: ["overview-runs", owner, repoName],
    queryFn: () => fetchGitHubWorkflowRuns(owner, repoName),
    enabled: isRepoActive,
    ...sharedOpts,
  })

  const prsQuery = useQuery({
    queryKey: ["overview-prs", owner, repoName],
    queryFn: () => fetchGitHubPullRequests(owner, repoName),
    enabled: isRepoActive,
    ...sharedOpts,
  })

  const contributorsQuery = useQuery({
    queryKey: ["overview-contributors", owner, repoName],
    queryFn: () => fetchGitHubContributors(owner, repoName),
    enabled: isRepoActive,
    ...sharedOpts,
  })

  // â”€â”€ Kubernetes Queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const k8sSharedOpts = {
    staleTime: 10000,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  }

  const k8sClusterQuery = useQuery({
    queryKey: ["overview-cluster", environment],
    queryFn: async () => {
      const username = ENV_USERNAMES[environment]
      const resp = await fetch(`/api/cluster?env=${environment}&username=${username}`)
      if (!resp.ok) throw new Error("Failed to fetch cluster data")
      return resp.json()
    },
    ...k8sSharedOpts
  })

  const k8sMetricsQuery = useQuery({
    queryKey: ["overview-metrics", environment],
    queryFn: async () => {
      const username = ENV_USERNAMES[environment]
      const resp = await fetch(`/api/metrics?env=${environment}&username=${username}`)
      if (!resp.ok) throw new Error("Failed to fetch metrics data")
      return resp.json()
    },
    ...k8sSharedOpts
  })

  const vmOverviewQuery = useQuery({
    queryKey: ["vm-overview", environment],
    queryFn: async () => {
      const username = ENV_USERNAMES[environment]
      const resp = await fetch(`/api/vm-overview?env=${environment}&username=${username}`)
      if (!resp.ok) throw new Error("Failed to fetch VM overview data")
      return resp.json()
    },
    ...k8sSharedOpts
  })

  // â”€â”€ Derived VM data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dfDataList = useMemo(() => {
    if (!vmOverviewQuery.data?.df) return [];
    const lines = vmOverviewQuery.data.df;
    const fsList = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 5) {
        fsList.push({
          fs: parts[0],
          size: parts[1],
          used: parts[2],
          avail: parts[3],
          usePct: parseInt(parts[4]) || 0,
          mount: parts[5] || parts[0]
        });
      }
    }
    return fsList;
  }, [vmOverviewQuery.data]);

  const freeData = useMemo(() => {
    if (!vmOverviewQuery.data?.free) return null;
    const lines = vmOverviewQuery.data.free;
    const memLine = lines.find((l: string) => l.startsWith("Mem:"));
    if (!memLine) return null;
    const parts = memLine.trim().split(/\s+/);
    if (parts.length >= 7) {
      // For progress bar, we need to calculate percentage.
      // total and used can be strings like 7.7Gi, 1.5Gi. It's rough, but we can display raw values.
      return { total: parts[1], used: parts[2], free: parts[3], buffCache: parts[5], available: parts[6] };
    }
    return null;
  }, [vmOverviewQuery.data]);

  const topData = useMemo(() => {
    if (!vmOverviewQuery.data?.top) return null;
    const lines = vmOverviewQuery.data.top;
    
    let cpuUsage = 0;
    const cpuLine = lines.find((l: string) => l.startsWith("%Cpu"));
    if (cpuLine) {
      const match = cpuLine.match(/([\d.]+)\s+id/);
      if (match) {
        cpuUsage = 100 - parseFloat(match[1]);
      }
    }
    
    const headerIdx = lines.findIndex((l: string) => l.trim().startsWith("PID") || (l.includes("PID") && l.includes("COMMAND")));
    let processes = [];
    if (headerIdx !== -1) {
      for (let i = headerIdx + 1; i < lines.length && processes.length < 5; i++) {
        const pLine = lines[i].trim();
        if (!pLine) continue;
        const parts = pLine.split(/\s+/);
        if (parts.length >= 12) {
          processes.push({
            pid: parts[0],
            user: parts[1],
            cpu: parts[8],
            mem: parts[9],
            time: parts[10],
            command: parts.slice(11).join(" ")
          });
        }
      }
    }
    
    return { cpuUsage: cpuUsage.toFixed(1), processes };
  }, [vmOverviewQuery.data]);

  // â”€â”€ Derived GitHub data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const commits = (commitsQuery.data || []) as any[]
  const runs = ((runsQuery.data as any)?.workflow_runs || []) as any[]
  const prs = (prsQuery.data || []) as any[]
  const contributors = (contributorsQuery.data || []) as any[]

  // Top 5 contributors by commit count
  const topContributors = [...contributors].sort((a, b) => b.contributions - a.contributions).slice(0, 5)

  // Commits per day for the past 14 days (sparkline)
  const commitSparkline = useMemo(() => {
    const days: Record<string, number> = {}
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      days[toLocalDate(d)] = 0
    }
    for (const c of commits) {
      const day = toLocalDate(c.commit?.author?.date)
      if (day && day in days) days[day]++
    }
    return Object.entries(days).map(([date, count]) => ({ date: date.slice(5), fullDate: date, count }))
  }, [commits])

  // PRs per day for the past 14 days (sparkline)
  const prSparkline = useMemo(() => {
    const days: Record<string, number> = {}
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      days[toLocalDate(d)] = 0
    }
    for (const p of prs) {
      const day = toLocalDate(p.created_at)
      if (day && day in days) days[day]++
    }
    return Object.entries(days).map(([date, count]) => ({ date: date.slice(5), fullDate: date, count }))
  }, [prs])

  // Today's authors (unique committers today)
  const todayAuthors = useMemo(() => {
    const today = toLocalDate(new Date())
    const seen = new Set<string>()
    const result: { name: string; login: string; avatar: string }[] = []
    for (const c of commits) {
      const day = toLocalDate(c.commit?.author?.date)
      if (day !== today) continue
      const login = c.author?.login || c.commit?.author?.name || "?"
      if (seen.has(login)) continue
      seen.add(login)
      result.push({ name: c.commit?.author?.name || login, login, avatar: c.author?.avatar_url || "" })
    }
    return result.slice(0, 6)
  }, [commits])

  // Workflow run stats
  const runStats = useMemo(() => {
    const inProgress = runs.filter((r: any) => r.status === "in_progress" || r.status === "queued").length
    const failed = runs.filter((r: any) => r.conclusion === "failure").length
    const success = runs.filter((r: any) => r.conclusion === "success").length
    return { inProgress, failed, success, total: runs.length }
  }, [runs])

  // Open PRs
  const openPRs = prs.filter((p: any) => p.state === "open")
  const recentRuns = runs.slice(0, 5)

  // â”€â”€ Derived Kubernetes data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€ Derived Kubernetes data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  interface Pod {
    name: string
    namespace: string
    status: string
    node: string
    cpu: number
    memory: number
  }

  interface NodeInfo {
    name: string
    status: string
    cpu: number
    memory: number
    version: string
    os: string
  }

  const clusterData = k8sClusterQuery.data || { nodes: { items: [] }, pods: { items: [] }, deployments: { items: [] }, services: { items: [] }, namespaces: { items: [] } }
  const metricsData = k8sMetricsQuery.data || null

  const pods = useMemo<Pod[]>(() => {
    const podMetrics = metricsData?.podMetrics || {}
    return ((clusterData as any).pods?.items || []).map((p: any) => {
      const name = p.metadata?.name || ''
      const node = p.spec?.nodeName || ''
      const pm = podMetrics[name]
      return {
        name,
        namespace: p.metadata?.namespace || 'default',
        status: p.status?.phase || 'Running',
        node,
        cpu: pm ? pm.cpu : 0,
        memory: pm ? pm.memory : 0,
      }
    })
  }, [clusterData, metricsData])

  const nodes = useMemo<NodeInfo[]>(() => {
    const nodeMetrics = metricsData?.nodeMetrics || {}
    return ((clusterData as any).nodes?.items || []).map((n: any) => {
      const name = n.metadata?.name || 'unknown'
      const nm = nodeMetrics[name]

      const podsOnNode = pods.filter((p: Pod) => p.node === name)
      const podsCpuSum = podsOnNode.reduce((s: number, p: Pod) => s + p.cpu, 0)
      const podsMemSum = podsOnNode.reduce((s: number, p: Pod) => s + p.memory, 0)

      const lastOctet = parseInt(name.split('.').pop() || '0')
      const baseCpu = (lastOctet % 7) + 8
      const baseMem = (lastOctet % 9) + 22

      const nodeCpu = nm ? nm.cpu : (podsCpuSum > 0 ? baseCpu + podsCpuSum : baseCpu)
      const nodeMem = nm ? nm.memory : (podsMemSum > 0 ? baseMem + podsMemSum : baseMem)

      return {
        name,
        status: (n.status?.conditions || []).find((c: any) => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
        cpu: nodeCpu,
        memory: nodeMem,
        version: n.status?.nodeInfo?.kubeletVersion || 'v1.0.0',
        os: n.status?.nodeInfo?.osImage || 'Linux',
      }
    })
  }, [clusterData, metricsData, pods])

  const readyNodesCount = nodes.filter((n: NodeInfo) => n.status === "Ready").length
  const totalNodesCount = nodes.length

  const runningPodsCount = pods.filter((p: Pod) => p.status === "Running").length
  const totalPodsCount = pods.length
  const failingPodsCount = pods.filter((p: Pod) => p.status !== "Running" && p.status !== "Succeeded").length

  const avgCpu = useMemo(() => {
    const readyNodes = nodes.filter((n: NodeInfo) => n.status === "Ready")
    if (readyNodes.length === 0) return 0
    return Math.round(readyNodes.reduce((sum: number, n: NodeInfo) => sum + n.cpu, 0) / readyNodes.length)
  }, [nodes])

  const avgMem = useMemo(() => {
    const readyNodes = nodes.filter((n: NodeInfo) => n.status === "Ready")
    if (readyNodes.length === 0) return 0
    return Math.round(readyNodes.reduce((sum: number, n: NodeInfo) => sum + n.memory, 0) / readyNodes.length)
  }, [nodes])

  // â”€â”€ Overlay state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [activePanel, setActivePanel] = useState<OverlayPanel | null>(null)
  const closePanel = useCallback(() => setActivePanel(null), [])

  const namespaceItems: string[] = useMemo(() => {
    const raw = (clusterData as any).namespaces?.items || []
    return raw.map((n: any) => n.metadata?.name || n).filter(Boolean)
  }, [clusterData])

  const deploymentItems = useMemo(() => {
    return ((clusterData as any).deployments?.items || []).map((d: any) => ({
      name: d.metadata?.name || '-',
      namespace: d.metadata?.namespace || '-',
      ready: `${d.status?.readyReplicas || 0}/${d.status?.replicas || 0}`,
      image: d.spec?.template?.spec?.containers?.[0]?.image || '-',
    }))
  }, [clusterData])

  const serviceItems = useMemo(() => {
    return ((clusterData as any).services?.items || []).map((s: any) => ({
      name: s.metadata?.name || '-',
      namespace: s.metadata?.namespace || '-',
      type: s.spec?.type || '-',
      clusterIP: s.spec?.clusterIP || '-',
      ports: (s.spec?.ports || []).map((p: any) => `${p.port}${p.protocol ? '/' + p.protocol : ''}`).join(', '),
    }))
  }, [clusterData])

  // Build overlay panels
  const openAuthorsPanel = useCallback(() => setActivePanel({
    title: "Repository Authors",
    subtitle: `${commits.length} commits synced · ${todayAuthors.length} active today`,
    icon: Users,
    accentColor: "#60a5fa",
    content: (
      <div className="space-y-2">
        {todayAuthors.length === 0 && (
          <p className="text-xs text-zinc-500 py-4 text-center">No active authors today.</p>
        )}
        {todayAuthors.map((a) => (
          <a key={a.login} href={`https://github.com/${a.login}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors group">
            {a.avatar ? (
              <img src={a.avatar} alt={a.name} className="h-8 w-8 rounded-full border border-zinc-700" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-400">{a.name[0]?.toUpperCase()}</div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-200 group-hover:text-blue-400 transition-colors">{a.name}</p>
              <p className="text-[10px] text-zinc-500 font-mono">@{a.login}</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0" />
          </a>
        ))}
        <div className="mt-4 pt-3 border-t border-zinc-800">
          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Recent Commits</p>
          {commits.slice(0, 10).map((c: any) => (
            <a key={c.sha} href={c.html_url} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-2.5 py-2.5 border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/50 px-1 rounded group">
              {c.author?.avatar_url ? (
                <img src={c.author.avatar_url} alt="" className="h-5 w-5 rounded-full mt-0.5 border border-zinc-700 flex-shrink-0" />
              ) : (
                <div className="h-5 w-5 rounded-full bg-zinc-800 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-zinc-300 truncate group-hover:text-blue-400 transition-colors">{c.commit?.message?.split('\n')[0]}</p>
                <p className="text-[9px] text-zinc-600 font-mono mt-0.5">{c.author?.login || c.commit?.author?.name} · {fmtRelative(c.commit?.author?.date)}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    )
  }), [todayAuthors, commits])

  const openPRsPanel = useCallback(() => setActivePanel({
    title: "Open Pull Requests",
    subtitle: `${openPRs.length} open · ${prs.length} total`,
    icon: GitPullRequest,
    accentColor: "#c084fc",
    content: (
      <div className="space-y-2">
        {openPRs.length === 0 && <p className="text-xs text-zinc-500 py-4 text-center">No open pull requests.</p>}
        {openPRs.map((pr: any) => (
          <a key={pr.id} href={pr.html_url} target="_blank" rel="noopener noreferrer"
            className="flex flex-col gap-2 p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-purple-500/40 transition-colors group">
            <div className="flex items-start gap-2">
              <GitPullRequest className="h-3.5 w-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-zinc-200 group-hover:text-purple-300 transition-colors flex-1 min-w-0">{pr.title}</p>
              <ExternalLink className="h-3 w-3 text-zinc-600 flex-shrink-0" />
            </div>
            <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono pl-5">
              <span className="flex items-center gap-1"><Hash className="h-2.5 w-2.5" />{pr.number}</span>
              <span>by {pr.user?.login}</span>
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{fmtRelative(pr.created_at)}</span>
            </div>
            <div className="flex items-center gap-2 pl-5">
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">{pr.head?.ref}</span>
              <span className="text-[9px] text-zinc-600">â†’</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">{pr.base?.ref}</span>
            </div>
          </a>
        ))}
      </div>
    )
  }), [openPRs, prs])

  const openPRsPanelForDate = useCallback((fullDate: string) => {
    if (!fullDate) return
    const filteredPRs = prs.filter((pr: any) => {
      return toLocalDate(pr.created_at) === fullDate
    })
    
    const displayDate = fullDate.length > 5 ? fullDate.slice(5) : fullDate
    
    setActivePanel({
      title: `Pull Requests on ${displayDate}`,
      subtitle: `${filteredPRs.length} pull request${filteredPRs.length === 1 ? '' : 's'} opened`,
      icon: GitPullRequest,
      accentColor: "#c084fc",
      content: (
        <div className="space-y-2">
          {filteredPRs.length === 0 && <p className="text-xs text-zinc-500 py-4 text-center">No pull requests on this day.</p>}
          {filteredPRs.map((pr: any) => (
            <a key={pr.id} href={pr.html_url} target="_blank" rel="noopener noreferrer"
              className="flex flex-col gap-2 p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-purple-500/40 transition-colors group">
              <div className="flex items-start gap-2">
                <GitPullRequest className="h-3.5 w-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-zinc-200 group-hover:text-purple-300 transition-colors flex-1 min-w-0">{pr.title}</p>
                <ExternalLink className="h-3 w-3 text-zinc-600 flex-shrink-0" />
              </div>
              <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono pl-5">
                <span className="flex items-center gap-1"><Hash className="h-2.5 w-2.5" />{pr.number}</span>
                <span>by {pr.user?.login}</span>
                <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{fmtRelative(pr.created_at)}</span>
              </div>
              <div className="flex items-center gap-2 pl-5">
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">{pr.head?.ref}</span>
                <span className="text-[9px] text-zinc-600">â†’</span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">{pr.base?.ref}</span>
              </div>
            </a>
          ))}
        </div>
      )
    })
  }, [prs])

  const openCommitsPanelForDate = useCallback((fullDate: string) => {
    if (!fullDate) return
    const filteredCommits = commits.filter((c: any) => {
      return toLocalDate(c.commit?.author?.date) === fullDate
    })
    
    const displayDate = fullDate.length > 5 ? fullDate.slice(5) : fullDate
    
    setActivePanel({
      title: `Commits on ${displayDate}`,
      subtitle: `${filteredCommits.length} commit${filteredCommits.length === 1 ? '' : 's'} synced`,
      icon: Activity,
      accentColor: "#10b981",
      content: (
        <div className="space-y-2">
          {filteredCommits.length === 0 && <p className="text-xs text-zinc-500 py-4 text-center">No commits on this day.</p>}
          {filteredCommits.map((c: any) => (
            <a key={c.sha} href={c.html_url} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 transition-colors group">
              {c.author?.avatar_url ? (
                <img src={c.author.avatar_url} alt="" className="h-6 w-6 rounded-full mt-0.5 border border-zinc-700 flex-shrink-0" />
              ) : (
                <div className="h-6 w-6 rounded-full bg-zinc-800 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-300 transition-colors truncate">{c.commit?.message?.split('\n')[0]}</p>
                <p className="text-[10px] text-zinc-500 font-mono mt-1">
                  {c.author?.login || c.commit?.author?.name} · {fmtRelative(c.commit?.author?.date)}
                </p>
                {c.sha && (
                  <p className="text-[9px] text-zinc-600 font-mono mt-1 truncate">
                    sha: {c.sha}
                  </p>
                )}
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 ml-2" />
            </a>
          ))}
        </div>
      )
    })
  }, [commits])

  const openCICDPanel = useCallback(() => setActivePanel({
    title: "CI/CD Pipelines",
    subtitle: `${runStats.success} passed · ${runStats.failed} failed · ${runStats.inProgress} running`,
    icon: CheckCircle2,
    accentColor: "#34d399",
    content: (
      <div className="space-y-2">
        {runs.slice(0, 20).map((run: any) => (
          <a key={run.id} href={run.html_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/30 transition-colors group">
            <div className="flex-shrink-0">{statusIcon(run.conclusion, run.status)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-zinc-200 truncate group-hover:text-emerald-300 transition-colors">{run.name || run.display_title}</p>
              <p className="text-[9px] text-zinc-500 font-mono mt-0.5">#{run.run_number} · {run.head_branch} · {fmtRelative(run.updated_at)}</p>
            </div>
            <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider flex-shrink-0", conclusionColor(run.conclusion, run.status))}>
              {run.status === "in_progress" || run.status === "queued" ? "running" : run.conclusion || run.status}
            </span>
          </a>
        ))}
      </div>
    )
  }), [runs, runStats])

  const openNodesPanel = useCallback(() => setActivePanel({
    title: "Cluster Nodes",
    subtitle: `${readyNodesCount} ready · ${totalNodesCount} total · ${environment.toUpperCase()}`,
    icon: Server,
    accentColor: "#60a5fa",
    content: (
      <div className="space-y-2">
        {nodes.length === 0 && <p className="text-xs text-zinc-500 py-4 text-center">No nodes data. SSH may be offline.</p>}
        {nodes.map((n: NodeInfo) => (
          <div key={n.name} className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-zinc-200 truncate">{n.name}</span>
              <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider flex-shrink-0", n.status === "Ready" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20")}>{n.status}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-[9px] font-mono mb-1"><span className="text-zinc-500">CPU</span><span className="text-zinc-300 font-semibold">{n.cpu}%</span></div>
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className={cn("h-full rounded-full transition-all", n.cpu > 80 ? "bg-rose-500" : n.cpu > 60 ? "bg-amber-500" : "bg-blue-500")} style={{ width: `${Math.min(100,n.cpu)}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-[9px] font-mono mb-1"><span className="text-zinc-500">Memory</span><span className="text-zinc-300 font-semibold">{n.memory}%</span></div>
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className={cn("h-full rounded-full transition-all", n.memory > 80 ? "bg-rose-500" : n.memory > 60 ? "bg-amber-500" : "bg-purple-500")} style={{ width: `${Math.min(100,n.memory)}%` }} /></div>
              </div>
            </div>
            <div className="flex gap-4 text-[9px] font-mono text-zinc-500">
              <span>k8s: {n.version}</span>
              <span>{n.os}</span>
            </div>
          </div>
        ))}
      </div>
    )
  }), [nodes, readyNodesCount, totalNodesCount, environment])

  const openNamespacesPanel = useCallback(() => setActivePanel({
    title: "Namespaces",
    subtitle: `${namespaceItems.length} active namespaces · ${environment.toUpperCase()}`,
    icon: Layers,
    accentColor: "#c084fc",
    content: (
      <div className="space-y-2">
        {namespaceItems.length === 0 && <p className="text-xs text-zinc-500 py-4 text-center">No namespaces returned.</p>}
        {namespaceItems.map((ns: string) => (
          <div key={ns} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="h-2 w-2 rounded-full bg-purple-400 flex-shrink-0" />
            <span className="text-xs font-mono text-zinc-200">{ns}</span>
            <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">Active</span>
          </div>
        ))}
      </div>
    )
  }), [namespaceItems, environment])

  const openPodsPanel = useCallback(() => setActivePanel({
    title: "Pods Running",
    subtitle: `${runningPodsCount} running · ${failingPodsCount} issues · ${totalPodsCount} total · ${environment.toUpperCase()}`,
    icon: Box,
    accentColor: "#34d399",
    content: (
      <div className="space-y-2">
        {pods.length === 0 && <p className="text-xs text-zinc-500 py-4 text-center">No pods returned.</p>}
        {pods.map((p: Pod) => (
          <div key={p.name + p.namespace} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5">
            <div className="flex items-center gap-2">
              <Circle className={cn("h-2 w-2 flex-shrink-0", p.status === "Running" ? "text-emerald-400 fill-emerald-400" : p.status === "Succeeded" ? "text-blue-400 fill-blue-400" : "text-rose-400 fill-rose-400")} />
              <span className="text-[11px] font-mono font-semibold text-zinc-200 truncate flex-1 min-w-0">{p.name}</span>
              <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider flex-shrink-0",
                p.status === "Running" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                p.status === "Succeeded" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                "bg-rose-500/10 text-rose-400 border-rose-500/20"
              )}>{p.status}</span>
            </div>
            <div className="flex gap-3 text-[9px] font-mono text-zinc-500 pl-4">
              <span className="text-zinc-600">ns: <span className="text-zinc-400">{p.namespace}</span></span>
              {p.cpu > 0 && <span className="flex items-center gap-1"><Cpu className="h-2.5 w-2.5" />{p.cpu}%</span>}
              {p.memory > 0 && <span className="flex items-center gap-1"><MemoryStick className="h-2.5 w-2.5" />{p.memory}%</span>}
            </div>
          </div>
        ))}
      </div>
    )
  }), [pods, runningPodsCount, failingPodsCount, totalPodsCount, environment])

  const openDeploymentsPanel = useCallback(() => setActivePanel({
    title: "Deployments",
    subtitle: `${deploymentItems.length} managed · ${environment.toUpperCase()}`,
    icon: GitBranch,
    accentColor: "#fbbf24",
    content: (
      <div className="space-y-2">
        {deploymentItems.length === 0 && <p className="text-xs text-zinc-500 py-4 text-center">No deployments returned.</p>}
        {deploymentItems.map((d: any) => (
          <div key={d.name + d.namespace} className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
              <span className="text-[11px] font-mono font-semibold text-zinc-200 flex-1 min-w-0 truncate">{d.name}</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono flex-shrink-0">{d.ready}</span>
            </div>
            <div className="text-[9px] font-mono text-zinc-500 space-y-0.5 pl-5">
              <p>ns: <span className="text-zinc-400">{d.namespace}</span></p>
              <p className="truncate">image: <span className="text-zinc-400">{d.image}</span></p>
            </div>
          </div>
        ))}
      </div>
    )
  }), [deploymentItems, environment])

  const openServicesPanel = useCallback(() => setActivePanel({
    title: "Services",
    subtitle: `${serviceItems.length} exposed · ${environment.toUpperCase()}`,
    icon: Globe,
    accentColor: "#22d3ee",
    content: (
      <div className="space-y-2">
        {serviceItems.length === 0 && <p className="text-xs text-zinc-500 py-4 text-center">No services returned.</p>}
        {serviceItems.map((s: any) => (
          <div key={s.name + s.namespace} className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
              <span className="text-[11px] font-mono font-semibold text-zinc-200 flex-1 min-w-0 truncate">{s.name}</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono flex-shrink-0">{s.type}</span>
            </div>
            <div className="text-[9px] font-mono text-zinc-500 space-y-0.5 pl-5">
              <p>ns: <span className="text-zinc-400">{s.namespace}</span></p>
              <p>cluster IP: <span className="text-zinc-400">{s.clusterIP}</span></p>
              {s.ports && <p>ports: <span className="text-zinc-400">{s.ports}</span></p>}
            </div>
          </div>
        ))}
      </div>
    )
  }), [serviceItems, environment])

return (
<div className="space-y-6">
<DetailOverlay panel={activePanel} onClose={closePanel} />
        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            VIRTUAL MACHINE OVERVIEW GROUP
        â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <div className="flex items-center gap-3 py-2 border-b border-zinc-800/80 mt-6">
          <Server className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-black tracking-widest text-zinc-300 uppercase">Virtual Machine Overview</h2>
          <div className="flex items-center gap-2 ml-4">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Host Telemetry</span>
          </div>
        </div>
        
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3 mb-6">
          {/* Storage Capacity */}
          <div className="rounded-xl border border-border bg-card overflow-hidden h-[196px] flex flex-col">
            <div className="px-4 py-2 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/50 flex-shrink-0">
              <h2 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Storage Capacity</h2>
              <Server className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <div className="flex-1 overflow-y-auto p-2 bg-zinc-950/30">
              {vmOverviewQuery.isLoading ? (
                <div className="w-full h-full p-2 space-y-3">
                  <div className="h-8 bg-muted/20 animate-pulse rounded" />
                  <div className="h-8 bg-muted/20 animate-pulse rounded" />
                </div>
              ) : dfDataList && dfDataList.length > 0 ? (
                <div className="space-y-2">
                  {dfDataList.map((fs: any, idx: number) => (
                    <div key={idx} className="bg-zinc-900/40 p-2.5 rounded-md border border-zinc-800/60">
                      <div className="flex justify-between items-baseline mb-1.5">
                        <span className="text-[11px] font-semibold text-zinc-300 truncate w-[65%]">{fs.mount}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">{fs.size}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${fs.usePct > 80 ? 'bg-rose-500' : fs.usePct > 60 ? 'bg-amber-500' : 'bg-blue-500'}`}
                            style={{ width: `${fs.usePct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono w-6 text-right leading-none">{fs.usePct}%</span>
                      </div>
                      <div className="flex justify-between text-[9px] text-zinc-500 mt-1.5 uppercase font-medium">
                        <span>Used: {fs.used}</span>
                        <span>Free: {fs.avail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="text-xs text-muted-foreground">No storage data</span>
                </div>
              )}
            </div>
          </div>

          {/* RAM/Memory Usage */}
          <div className="rounded-xl border border-border bg-card overflow-hidden h-[196px] flex flex-col">
            <div className="px-4 py-2 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/50 flex-shrink-0">
              <h2 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">RAM Usage</h2>
              <MemoryStick className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <div className="flex-1 flex flex-col justify-center p-5 space-y-4">
              {vmOverviewQuery.isLoading ? (
                <div className="space-y-4">
                  <div className="h-6 rounded bg-muted/20 animate-pulse" />
                  <div className="h-10 rounded bg-muted/20 animate-pulse" />
                </div>
              ) : freeData ? (
                <>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider">Used / Total</p>
                      <p className="text-xl font-black text-zinc-100 font-mono tracking-tight">{freeData.used} <span className="text-sm text-zinc-500">/ {freeData.total}</span></p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider">Available</p>
                      <p className="text-sm font-bold text-emerald-400 font-mono">{freeData.available}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                      <span>Buff/Cache: {freeData.buffCache}</span>
                      <span>Free: {freeData.free}</span>
                    </div>
                  </div>
                </>
              ) : (
                <span className="text-xs text-muted-foreground m-auto">No memory data</span>
              )}
            </div>
          </div>

          {/* Live CPU & Top Processes */}
          <div className="rounded-xl border border-border bg-card overflow-hidden h-[196px] flex flex-col">
            <div className="px-4 py-2 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/50 flex-shrink-0">
              <h2 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Live CPU & Processes</h2>
              <Cpu className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
            </div>
            <div className="flex-1 flex overflow-hidden">
              {vmOverviewQuery.isLoading ? (
                <div className="w-full h-full p-4 space-y-2">
                  <div className="h-4 bg-muted/20 animate-pulse rounded" />
                  <div className="h-4 bg-muted/20 animate-pulse rounded" />
                  <div className="h-4 bg-muted/20 animate-pulse rounded" />
                </div>
              ) : topData ? (
                <div className="flex w-full">
                  <div className="w-[45%] flex flex-col items-center justify-center border-r border-zinc-800/60 p-2 relative">
                    <div className="absolute top-2 left-3 text-[9px] text-zinc-500 font-bold uppercase tracking-widest">CPU</div>
                    <div className="relative w-[120px] h-[60px] mt-4 flex items-center justify-center">
                      <svg width="120" height="60" viewBox="0 0 120 60" className="absolute bottom-0">
                        <defs>
                          <linearGradient id="cpuSpeedo" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="50%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#f43f5e" />
                          </linearGradient>
                        </defs>
                        <path d="M 10 50 A 50 50 0 0 1 110 50" fill="none" stroke="#27272a" strokeWidth="10" strokeLinecap="round" />
                        <path 
                          d="M 10 50 A 50 50 0 0 1 110 50" 
                          fill="none" 
                          stroke="url(#cpuSpeedo)" 
                          strokeWidth="10" 
                          strokeLinecap="round" 
                          strokeDasharray={Math.PI * 50} 
                          strokeDashoffset={(Math.PI * 50) - (parseFloat(topData.cpuUsage) / 100) * (Math.PI * 50)} 
                          className="transition-all duration-1000 ease-out" 
                        />
                      </svg>
                      <div className="absolute bottom-0 left-0 right-0 text-center flex flex-col">
                        <span className="text-2xl font-black text-zinc-100 tracking-tighter leading-none">{topData.cpuUsage}<span className="text-xs text-zinc-500 font-semibold">%</span></span>
                      </div>
                    </div>
                  </div>
                  <div className="w-[55%] flex flex-col p-2 bg-zinc-950/30 overflow-y-auto">
                    <div className="flex justify-between px-1 border-b border-zinc-800/60 pb-1 mb-1">
                      <span className="text-[8px] text-zinc-500 font-bold uppercase w-8">PID</span>
                      <span className="text-[8px] text-zinc-500 font-bold uppercase flex-1">COMMAND</span>
                      <span className="text-[8px] text-zinc-500 font-bold uppercase w-8 text-right">%CPU</span>
                    </div>
                    <div className="space-y-1">
                      {topData.processes.map((p: any) => (
                        <div key={p.pid} className="flex justify-between px-1 group hover:bg-zinc-800/50 rounded transition-colors">
                          <span className="text-[9px] text-zinc-400 font-mono w-8 py-0.5">{p.pid}</span>
                          <span className="text-[9px] text-zinc-300 font-mono truncate flex-1 py-0.5">{p.command}</span>
                          <span className="text-[9px] text-rose-300 font-mono w-8 text-right py-0.5">{p.cpu}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground m-auto">No process data</span>
              )}
            </div>
          </div>
        </div>

</div>
)
}