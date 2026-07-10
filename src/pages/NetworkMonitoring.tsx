import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Search,
  RefreshCw,
  X,
  FileCode,
  Copy,
  Check,
  Zap,
  Globe,
  Database,
  ArrowRightLeft,
  Server,
  Filter,
  Terminal,
  ChevronRight,
  Info
} from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  AreaChart,
  Area,
  Legend
} from "recharts"

interface OciVcnLog {
  id: string
  datetime: string
  iso: string
  version: string
  src_ip: string
  dst_ip: string
  src_port: number
  dst_port: number
  protocol: number
  packets: number
  bytes: number
  action: "ACCEPT" | "REJECT" | "PENDING"
  status: string
  env: "dev" | "staging" | "prod"
  gateway: "Internet Gateway" | "NAT Gateway" | "Service Gateway" | "Local"
  raw: any
}

interface OciLogsResponse {
  success: boolean
  isRealData: boolean
  logs: OciVcnLog[]
  summary: {
    totalFlows: number
    acceptedFlows: number
    rejectedFlows: number
    activeAnomalies: number
  }
}

type SubnetGroup = "FE" | "BE" | "DB" | "EXT"

export default function NetworkMonitoring() {
  const [envFilter, setEnvFilter] = useState<"all" | "dev" | "staging" | "prod">("dev")
  const [searchTerm, setSearchTerm] = useState("")
  const [copied, setCopied] = useState(false)
  const [selectedRawLog, setSelectedRawLog] = useState<OciVcnLog | null>(null)
  
  // Drill-down states for standard cards
  const [activeModalMetric, setActiveModalMetric] = useState<"rejects" | "accepts" | "igw" | "nat" | null>(null)
  const [selectedTimeSlice, setSelectedTimeSlice] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [timeFilter, setTimeFilter] = useState<"all" | "10m" | "30m" | "1h">("all")

  // Drill-down states for matrix, talkers, and gauge
  const [heatmapCellFilter, setHeatmapCellFilter] = useState<{ srcLabel: string; dstLabel: string; srcSubnet: SubnetGroup; dstSubnet: SubnetGroup } | null>(null)
  const [externalTalkerFilter, setExternalTalkerFilter] = useState<string | null>(null)
  const [selectedDateDrilldown, setSelectedDateDrilldown] = useState<{ date: string; actionFilter: "all" | "ACCEPT" | "REJECT" } | null>(null)
  const [dbRejectsFilter, setDbRejectsFilter] = useState<boolean>(false)

  const { data, isLoading, isError, refetch, isFetching } = useQuery<OciLogsResponse>({
    queryKey: ["oci-vcn-logs"],
    queryFn: async () => {
      const res = await fetch("/api/oci-vcn-logs?count=150")
      if (!res.ok) throw new Error("Failed to fetch OCI logs")
      return res.json()
    },
    refetchInterval: 15000
  })

  const rawLogs = data?.logs || []
  const isRealData = data?.isRealData || false

  // Helper to map IPs to their real subnet locations under SSS-yourspeak compartment's oke-vcn
  const getSubnetGroup = (ip: string): SubnetGroup => {
    if (ip.startsWith("10.0.2.")) return "FE" // Load Balancer (oke-lb-subnet)
    if (ip.startsWith("10.0.1.")) return "BE" // Worker compute Nodes (oke-subnet)
    if (ip.startsWith("10.0.3.")) return "DB" // Pod IP space (oke-pod-subnet, DB target 10.0.3.99)
    return "EXT"
  }

  // Apply Global Environment Filter
  const envFilteredLogs = React.useMemo(() => {
    if (envFilter === "all") return rawLogs
    return rawLogs.filter(log => log.env === envFilter)
  }, [rawLogs, envFilter])

  // Apply Search Term Filter
  const searchedLogs = React.useMemo(() => {
    return envFilteredLogs.filter(log => {
      const query = searchTerm.toLowerCase()
      return (
        log.src_ip.includes(query) ||
        log.dst_ip.includes(query) ||
        log.src_port.toString().includes(query) ||
        log.dst_port.toString().includes(query) ||
        log.action.toLowerCase().includes(query) ||
        log.gateway.toLowerCase().includes(query)
      )
    })
  }, [envFilteredLogs, searchTerm])

  const getProtocolLabel = (proto: number) => {
    if (proto === 6) return "TCP"
    if (proto === 17) return "UDP"
    if (proto === 1) return "ICMP"
    return `Proto ${proto}`
  }

  // --- Calculations for ROW 1 ---
  const totalRejectPackets = React.useMemo(() => {
    return envFilteredLogs
      .filter(l => l.action === "REJECT")
      .reduce((sum, log) => sum + log.packets, 0)
  }, [envFilteredLogs])

  const totalAcceptPackets = React.useMemo(() => {
    return envFilteredLogs
      .filter(l => l.action === "ACCEPT")
      .reduce((sum, log) => sum + log.packets, 0)
  }, [envFilteredLogs])

  // Grouped by date for the X-axis, tallying ACCEPT & REJECT packets from external IPs
  const externalTalkersByDate = React.useMemo(() => {
    const dateMap: Record<string, { date: string; accept: number; reject: number }> = {}
    envFilteredLogs.forEach(log => {
      if (getSubnetGroup(log.src_ip) === "EXT" && getSubnetGroup(log.dst_ip) === "FE") {
        const d = new Date(log.iso)
        const dateKey = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        if (!dateMap[dateKey]) dateMap[dateKey] = { date: dateKey, accept: 0, reject: 0 }
        if (log.action === "ACCEPT") dateMap[dateKey].accept += log.packets
        else if (log.action === "REJECT") dateMap[dateKey].reject += log.packets
      }
    })
    return Object.values(dateMap).sort((a, b) => {
      const parseDate = (s: string) => new Date(`${s} ${new Date().getFullYear()}`).getTime()
      return parseDate(a.date) - parseDate(b.date)
    })
  }, [envFilteredLogs])

  // Keep the legacy per-IP talkers list for drilldown modals
  const topExternalTalkers = React.useMemo(() => {
    const talkers: Record<string, { ip: string; packets: number; bytes: number }> = {}
    envFilteredLogs.forEach(log => {
      if (getSubnetGroup(log.src_ip) === "EXT" && getSubnetGroup(log.dst_ip) === "FE") {
        if (!talkers[log.src_ip]) {
          talkers[log.src_ip] = { ip: log.src_ip, packets: 0, bytes: 0 }
        }
        talkers[log.src_ip].packets += log.packets
        talkers[log.src_ip].bytes += log.bytes
      }
    })
    return Object.values(talkers)
      .sort((a, b) => b.packets - a.packets)
      .slice(0, 10)
  }, [envFilteredLogs])

  // --- Calculations for ROW 2 ---
  const gatewayStats = React.useMemo(() => {
    let igwAccept = 0, igwReject = 0
    let natAccept = 0, natReject = 0
    envFilteredLogs.forEach(log => {
      if (log.gateway === "Internet Gateway") {
        if (log.action === "ACCEPT") igwAccept += log.packets
        else if (log.action === "REJECT") igwReject += log.packets
      } else if (log.gateway === "NAT Gateway") {
        if (log.action === "ACCEPT") natAccept += log.packets
        else if (log.action === "REJECT") natReject += log.packets
      }
    })
    return { igwAccept, igwReject, natAccept, natReject }
  }, [envFilteredLogs])

  const dropRateChartData = React.useMemo(() => {
    const timeGrouped: Record<string, { time: string; accept: number; reject: number }> = {}
    const sorted = [...envFilteredLogs].reverse()
    
    sorted.forEach(log => {
      if (getSubnetGroup(log.dst_ip) === "FE") {
        const date = new Date(log.iso)
        const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        
        if (!timeGrouped[timeStr]) {
          timeGrouped[timeStr] = { time: timeStr, accept: 0, reject: 0 }
        }
        
        if (log.action === "ACCEPT") {
          timeGrouped[timeStr].accept += log.packets
        } else if (log.action === "REJECT") {
          timeGrouped[timeStr].reject += log.packets
        }
      }
    })

    return Object.values(timeGrouped).map(pt => {
      const total = pt.accept + pt.reject
      const dropRate = total > 0 ? parseFloat(((pt.reject / total) * 100).toFixed(1)) : 0
      return {
        time: pt.time,
        dropRate,
        accept: pt.accept,
        reject: pt.reject
      }
    }).slice(-15)
  }, [envFilteredLogs])

  // --- Calculations for ROW 3 ---
  const subnetMatrix = React.useMemo(() => {
    const matrix = [
      [0, 0, 0], // Frontend (10.0.2.x) -> [FE, BE, DB]
      [0, 0, 0], // Backend (10.0.1.x) -> [FE, BE, DB]
      [0, 0, 0]  // Database (10.0.3.99) -> [FE, BE, DB]
    ]
    let anomalousConnections = 0

    envFilteredLogs.forEach(log => {
      const srcGroup = getSubnetGroup(log.src_ip)
      const dstGroup = getSubnetGroup(log.dst_ip)

      let srcIdx = -1
      let dstIdx = -1
      
      if (srcGroup === "FE") srcIdx = 0
      else if (srcGroup === "BE") srcIdx = 1
      else if (srcGroup === "DB") srcIdx = 2

      if (dstGroup === "FE") dstIdx = 0
      else if (dstGroup === "BE") dstIdx = 1
      else if (dstGroup === "DB") dstIdx = 2

      if (srcIdx !== -1 && dstIdx !== -1) {
        matrix[srcIdx][dstIdx] += 1
        if (srcIdx === 0 && dstIdx === 2) {
          anomalousConnections += 1
        }
      }
    })
    return { matrix, anomalousConnections }
  }, [envFilteredLogs])

  const postgresRejects = React.useMemo(() => {
    return envFilteredLogs.filter(l => 
      l.action === "REJECT" && 
      getSubnetGroup(l.dst_ip) === "DB" && 
      l.dst_port === 5432
    ).length
  }, [envFilteredLogs])

  const handleCopyPayload = (log: OciVcnLog) => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Apply time window filter
  const timeFilteredLogs = React.useMemo(() => {
    if (timeFilter === "all") return searchedLogs;
    const now = Date.now();
    const limit = timeFilter === "10m"
      ? 10 * 60 * 1000
      : timeFilter === "30m"
        ? 30 * 60 * 1000
        : 60 * 60 * 1000;
    return searchedLogs.filter(log => {
      const logTime = new Date(log.iso).getTime();
      return now - logTime <= limit;
    });
  }, [searchedLogs, timeFilter]);

  // Row 4 triage
  const triageLogs = timeFilteredLogs

  const ITEMS_PER_PAGE = 8
  const totalPages = Math.min(Math.ceil(triageLogs.length / ITEMS_PER_PAGE), 5)

  const paginatedLogs = React.useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return triageLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [triageLogs, currentPage])

  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, envFilter, timeFilter])

  // Core metrics logs modal
  const getModalLogs = () => {
    if (activeModalMetric === "rejects") return envFilteredLogs.filter(l => l.action === "REJECT")
    if (activeModalMetric === "accepts") return envFilteredLogs.filter(l => l.action === "ACCEPT")
    if (activeModalMetric === "igw") return envFilteredLogs.filter(l => l.gateway === "Internet Gateway")
    if (activeModalMetric === "nat") return envFilteredLogs.filter(l => l.gateway === "NAT Gateway")
    return []
  }

  return (
    <div className="p-6 space-y-6 bg-zinc-950 text-zinc-100 min-h-screen animate-in fade-in duration-300">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs tracking-wider uppercase">
            <Shield className="h-4 w-4" />
            OCI Network Observability Engine
          </div>
          <h1 className="text-2xl font-bold mt-1 text-zinc-100 flex items-center gap-2">
            OCI VCN Flow Logs Dashboard
            {isRealData ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 font-mono font-medium flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                VCN Telemetry Ingest Active
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono font-medium flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                Offline Sandbox Logs
              </span>
            )}
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            VCN: SSS-yourspeak/oke-vcn | Subnets: oke-lb-subnet (10.0.2.0/24), oke-subnet (10.0.1.0/24), oke-pod-subnet (10.0.3.0/24).
          </p>
        </div>
        
        {/* Environment Filter Selector */}
        <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2">
          <Filter className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-xs text-zinc-455 font-semibold uppercase tracking-wider">Env Filter:</span>
          <select 
            value={envFilter} 
            onChange={(e) => setEnvFilter(e.target.value as any)}
            className="bg-transparent border-0 outline-none text-xs text-blue-400 font-bold uppercase cursor-pointer focus:ring-0 focus:border-0 p-0"
          >
            <option value="dev" className="bg-zinc-950 text-zinc-300">Development</option>
          </select>
          <button
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 ml-2"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ROW 1: VCN Perimeter Traffic */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ROW 1 CARD 1: Stacked REJECT + ACCEPT stat cards */}
        <div className="flex flex-col gap-4">
          {/* REJECT Card */}
          <div
            onClick={() => setActiveModalMetric("rejects")}
            className="flex-1 bg-zinc-900/30 border border-rose-500/20 p-5 rounded-2xl flex flex-col justify-between cursor-pointer hover:bg-rose-500/[0.03] hover:border-rose-500/35 transition-all shadow-[0_0_15px_rgba(244,63,94,0.02)] group"
          >
            <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Total REJECT Packets
              <AlertTriangle className="h-4 w-4 text-rose-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-extrabold text-rose-500 font-mono tracking-tight">
                {totalRejectPackets.toLocaleString()}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
                Dropped across VCN Security Lists in {envFilter === "all" ? "all tiers" : `${envFilter} tier`}.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-rose-400 font-bold">
              <span>View REJECT logs</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* ACCEPT Card */}
          <div
            onClick={() => setActiveModalMetric("accepts")}
            className="flex-1 bg-zinc-900/30 border border-emerald-500/20 p-5 rounded-2xl flex flex-col justify-between cursor-pointer hover:bg-emerald-500/[0.03] hover:border-emerald-500/35 transition-all shadow-[0_0_15px_rgba(16,185,129,0.02)] group"
          >
            <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Total ACCEPT Packets
              <CheckCircle2 className="h-4 w-4 text-emerald-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <div className="text-3xl font-extrabold text-emerald-500 font-mono tracking-tight">
                {totalAcceptPackets.toLocaleString()}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
                Allowed through VCN Security Lists in {envFilter === "all" ? "all tiers" : `${envFilter} tier`}.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-emerald-400 font-bold">
              <span>View ACCEPT logs</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>

        {/* ROW 1 CARD 2: Bar Chart External Talkers by Date */}
        <div className="bg-zinc-900/20 border border-zinc-800 p-6 rounded-2xl lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-400" />
                External Talkers — Ingress Volume by Date
              </h2>
              <p className="text-[10px] text-zinc-500 mt-0.5">Daily ACCEPT / REJECT packet totals from external IPs hitting public subnets</p>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500 inline-block"></span>
                <span className="text-[10px] font-mono font-semibold text-emerald-400 uppercase tracking-wider">Accept</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-rose-500 inline-block"></span>
                <span className="text-[10px] font-mono font-semibold text-rose-400 uppercase tracking-wider">Reject</span>
              </div>
            </div>
          </div>
          <div className="h-[190px] w-full mt-4">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 font-mono text-xs">Loading chart telemetry...</div>
            ) : externalTalkersByDate.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 font-mono text-xs">No external ingress logs recorded.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={externalTalkersByDate}
                  margin={{ top: 8, right: 10, left: -20, bottom: 0 }}
                  barGap={2}
                  barCategoryGap="28%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#52525b"
                    fontSize={9}
                    fontFamily="monospace"
                    tick={{ fill: "#71717a" }}
                    tickLine={false}
                    axisLine={{ stroke: "#27272a" }}
                  />
                  <YAxis
                    stroke="#52525b"
                    fontSize={9}
                    fontFamily="monospace"
                    tick={{ fill: "#71717a" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", borderRadius: 8, fontSize: 11, fontFamily: "monospace" }}
                    labelStyle={{ color: "#a1a1aa", fontWeight: "bold", marginBottom: 4 }}
                    itemStyle={{ fontFamily: "monospace", fontSize: 11 }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    formatter={(value: number, name: string) => [
                      value.toLocaleString() + " pkts",
                      name === "accept" ? "✓ ACCEPT" : "✕ REJECT"
                    ]}
                  />
                  <Bar
                    dataKey="accept"
                    name="accept"
                    fill="#10b981"
                    radius={[3, 3, 0, 0]}
                    fillOpacity={0.85}
                    className="cursor-pointer"
                    onClick={(data: any) => {
                      if (data?.date) setSelectedDateDrilldown({ date: data.date, actionFilter: "ACCEPT" })
                    }}
                  />
                  <Bar
                    dataKey="reject"
                    name="reject"
                    fill="#f43f5e"
                    radius={[3, 3, 0, 0]}
                    fillOpacity={0.85}
                    className="cursor-pointer"
                    onClick={(data: any) => {
                      if (data?.date) setSelectedDateDrilldown({ date: data.date, actionFilter: "REJECT" })
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ROW 2: OCI Gateways & Ingress Drop Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ROW 2 CARD 1: Gateway Visual Stats */}
        <div className="bg-zinc-900/20 border border-zinc-800 p-6 rounded-2xl flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-400" />
              OCI Gateway Traversed Metrics
            </h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">Ingress/Egress statistics categorized by edge entry gateways</p>
          </div>
          
          <div className="space-y-4">
            <div 
              onClick={() => setActiveModalMetric("igw")}
              className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-850 hover:border-blue-500/30 cursor-pointer transition-colors group"
            >
              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400 uppercase">
                Internet Gateway (IGW)
                <ChevronRight className="h-3 w-3 text-zinc-650 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="flex justify-between items-baseline mt-2">
                <span className="text-[10px] font-mono text-zinc-500">ACCEPT/REJECT ratio:</span>
                <span className="font-mono text-xs text-zinc-200">
                  <span className="text-emerald-400 font-bold">{gatewayStats.igwAccept}</span>
                  <span className="text-zinc-600"> / </span>
                  <span className="text-rose-400 font-bold">{gatewayStats.igwReject}</span>
                </span>
              </div>
            </div>

            <div 
              onClick={() => setActiveModalMetric("nat")}
              className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-850 hover:border-blue-500/30 cursor-pointer transition-colors group"
            >
              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400 uppercase">
                NAT Gateway (NATG)
                <ChevronRight className="h-3 w-3 text-zinc-650 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="flex justify-between items-baseline mt-2">
                <span className="text-[10px] font-mono text-zinc-500">ACCEPT/REJECT ratio:</span>
                <span className="font-mono text-xs text-zinc-200">
                  <span className="text-emerald-400 font-bold">{gatewayStats.natAccept}</span>
                  <span className="text-zinc-600"> / </span>
                  <span className="text-rose-400 font-bold">{gatewayStats.natReject}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2 CARD 2: Public Subnet Drop Rate Chart */}
        <div className="bg-zinc-900/20 border border-zinc-800 p-6 rounded-2xl lg:col-span-2 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-450" />
              Public Subnet Drop Rate (REJECT Ratio over Time)
            </h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">Ratio of REJECT vs ACCEPT logs. Click any data point to drill down into logs.</p>
          </div>
          
          <div className="h-[180px] w-full mt-4">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 font-mono text-xs">Loading chart telemetry...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={dropRateChartData} 
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload[0]) {
                      setSelectedTimeSlice(e.activePayload[0].payload.time);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <defs>
                    <linearGradient id="colorDropRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" vertical={false} />
                  <XAxis dataKey="time" stroke="#71717a" fontSize={8} className="font-mono" />
                  <YAxis stroke="#71717a" fontSize={8} className="font-mono" unit="%" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a" }}
                    labelStyle={{ color: "#a1a1aa", fontFamily: "monospace", fontSize: 10 }}
                    itemStyle={{ fontFamily: "monospace", fontSize: 10 }}
                    formatter={(value) => [`${value}%`, "Drop Rate"]}
                  />
                  <Area type="monotone" dataKey="dropRate" stroke="#f43f5e" fillOpacity={1} fill="url(#colorDropRate)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: East-West Heatmap & Postgres Database Subnet Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ROW 3 CARD 1: Heatmap traffic matrix */}
        <div className="bg-zinc-900/20 border border-zinc-800 p-6 rounded-2xl lg:col-span-2 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-blue-400" />
              East-West Cross-Subnet Heatmap Matrix
            </h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">Click any subnet intersection cell to pop up raw flow metrics</p>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-4 font-mono text-[10px] text-center text-zinc-400">
            <div>Src / Dst</div>
            <div className="font-bold text-zinc-300">FE (10.0.2.x)</div>
            <div className="font-bold text-zinc-300">BE (10.0.1.x)</div>
            <div className="font-bold text-zinc-300">DB (10.0.3.x)</div>

            {/* FE Row */}
            <div className="text-left font-bold text-zinc-300 flex items-center justify-start">FE Subnet</div>
            <div 
              onClick={() => setHeatmapCellFilter({ srcLabel: "Frontend", dstLabel: "Frontend", srcSubnet: "FE", dstSubnet: "FE" })}
              className="bg-zinc-950/40 p-4 rounded border border-zinc-900 flex items-center justify-center font-bold text-zinc-500 cursor-pointer hover:bg-zinc-900/40 hover:text-zinc-300 transition-colors"
            >
              {subnetMatrix.matrix[0][0]}
            </div>
            <div 
              onClick={() => setHeatmapCellFilter({ srcLabel: "Frontend", dstLabel: "Backend", srcSubnet: "FE", dstSubnet: "BE" })}
              className="bg-emerald-500/10 p-4 rounded border border-emerald-500/25 flex items-center justify-center font-bold text-emerald-400 cursor-pointer hover:bg-emerald-500/20 transition-colors"
            >
              {subnetMatrix.matrix[0][1]}
            </div>
            <div 
              onClick={() => setHeatmapCellFilter({ srcLabel: "Frontend", dstLabel: "Database", srcSubnet: "FE", dstSubnet: "DB" })}
              className={`p-4 rounded border flex flex-col items-center justify-center font-bold relative group cursor-pointer transition-all ${subnetMatrix.matrix[0][2] > 0 ? "bg-rose-500/10 border-rose-500/40 text-rose-455 hover:bg-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.05)]" : "bg-zinc-950/40 border-zinc-900 text-zinc-500"}`}
            >
              {subnetMatrix.matrix[0][2]}
              {subnetMatrix.matrix[0][2] > 0 && (
                <span className="absolute -top-1.5 -right-1 px-1.5 py-0.5 text-[8px] bg-rose-600 text-white rounded font-sans font-bold flex items-center gap-0.5">
                  <Zap className="h-2 w-2 animate-bounce" /> Bypass
                </span>
              )}
            </div>

            {/* BE Row */}
            <div className="text-left font-bold text-zinc-300 flex items-center justify-start">BE Subnet</div>
            <div 
              onClick={() => setHeatmapCellFilter({ srcLabel: "Backend", dstLabel: "Frontend", srcSubnet: "BE", dstSubnet: "FE" })}
              className="bg-zinc-950/40 p-4 rounded border border-zinc-900 flex items-center justify-center font-bold text-zinc-500 cursor-pointer hover:bg-zinc-900/40 hover:text-zinc-300 transition-colors"
            >
              {subnetMatrix.matrix[1][0]}
            </div>
            <div 
              onClick={() => setHeatmapCellFilter({ srcLabel: "Backend", dstLabel: "Backend", srcSubnet: "BE", dstSubnet: "BE" })}
              className="bg-zinc-950/40 p-4 rounded border border-zinc-900 flex items-center justify-center font-bold text-zinc-500 cursor-pointer hover:bg-zinc-900/40 hover:text-zinc-300 transition-colors"
            >
              {subnetMatrix.matrix[1][1]}
            </div>
            <div 
              onClick={() => setHeatmapCellFilter({ srcLabel: "Backend", dstLabel: "Database", srcSubnet: "BE", dstSubnet: "DB" })}
              className="bg-blue-500/10 p-4 rounded border border-blue-500/20 flex items-center justify-center font-bold text-blue-400 cursor-pointer hover:bg-blue-500/20 transition-colors"
            >
              {subnetMatrix.matrix[1][2]}
            </div>

            {/* DB Row */}
            <div className="text-left font-bold text-zinc-300 flex items-center justify-start">DB Subnet</div>
            <div 
              onClick={() => setHeatmapCellFilter({ srcLabel: "Database", dstLabel: "Frontend", srcSubnet: "DB", dstSubnet: "FE" })}
              className="bg-zinc-950/40 p-4 rounded border border-zinc-900 flex items-center justify-center font-bold text-zinc-500 cursor-pointer hover:bg-zinc-900/40 hover:text-zinc-300 transition-colors"
            >
              {subnetMatrix.matrix[2][0]}
            </div>
            <div 
              onClick={() => setHeatmapCellFilter({ srcLabel: "Database", dstLabel: "Backend", srcSubnet: "DB", dstSubnet: "BE" })}
              className="bg-zinc-950/40 p-4 rounded border border-zinc-900 flex items-center justify-center font-bold text-zinc-500 cursor-pointer hover:bg-zinc-900/40 hover:text-zinc-300 transition-colors"
            >
              {subnetMatrix.matrix[2][1]}
            </div>
            <div 
              onClick={() => setHeatmapCellFilter({ srcLabel: "Database", dstLabel: "Database", srcSubnet: "DB", dstSubnet: "DB" })}
              className="bg-zinc-950/40 p-4 rounded border border-zinc-900 flex items-center justify-center font-bold text-zinc-500 cursor-pointer hover:bg-zinc-900/40 hover:text-zinc-300 transition-colors"
            >
              {subnetMatrix.matrix[2][2]}
            </div>
          </div>
        </div>

        {/* ROW 3 CARD 2: Private Database Subnet REJECTs Gauge on PostgreSQL Port 5432 */}
        <div 
          onClick={() => setDbRejectsFilter(true)}
          className="bg-zinc-900/20 border border-zinc-800 p-6 rounded-2xl flex flex-col justify-between cursor-pointer hover:bg-zinc-900/30 hover:border-zinc-700 transition-all group"
        >
          <div>
            <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <Database className="h-4 w-4 text-rose-500" />
              Private DB Subnet REJECTs (Postgres)
            </h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">Click gauge to drill down into database rejected logs</p>
          </div>

          <div className="flex flex-col items-center justify-center py-6">
            <div className="relative h-28 w-28 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-full h-full transform -rotate-90">
                <circle 
                  cx="56" cy="56" r="48" 
                  stroke="#18181b" strokeWidth="8" fill="transparent" 
                />
                <circle 
                  cx="56" cy="56" r="48" 
                  stroke="#ef4444" strokeWidth="8" fill="transparent"
                  strokeDasharray="301.6"
                  strokeDashoffset={301.6 - (301.6 * Math.min(postgresRejects, 15)) / 15}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl font-bold font-mono text-rose-455">{postgresRejects}</span>
                <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">Drops</span>
              </div>
            </div>
            {postgresRejects > 5 && (
              <span className="mt-3 text-[9px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> High Probe Rate
              </span>
            )}
          </div>

          <div className="text-[9px] text-zinc-500 font-mono text-center">
            Security Rules Dropped {postgresRejects} attempts. Click to view connections.
          </div>
        </div>
      </div>

      {/* ROW 4: Security Triage Logs Table */}
      <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg flex flex-col">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/40 flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 mr-auto">
            <div className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse"></div>
            <h2 className="text-xs font-bold text-zinc-150 uppercase tracking-wider font-mono">Real-time Security Triage Log</h2>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:max-w-xl">
            {/* Search Input */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 w-full">
              <Search className="h-4 w-4 text-zinc-500 ml-2" />
              <input
                type="text"
                placeholder="Search source/destination IP, port..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-0 outline-none text-xs ml-2 text-zinc-300 w-full font-mono placeholder:text-zinc-600 focus:ring-0 focus:border-0"
              />
            </div>
            
            {/* Time Frame Filter select */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 w-full sm:w-auto">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider whitespace-nowrap mr-2 font-sans">Time:</span>
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as any)}
                className="bg-transparent border-0 outline-none text-xs text-blue-400 font-bold uppercase cursor-pointer focus:ring-0 focus:border-0 p-0 font-mono"
              >
                <option value="all" className="bg-zinc-950 text-zinc-300">All Logs</option>
                <option value="10m" className="bg-zinc-950 text-zinc-300">Last 10 Min</option>
                <option value="30m" className="bg-zinc-950 text-zinc-300">Last 30 Min</option>
                <option value="1h" className="bg-zinc-950 text-zinc-300">Last 1 Hour</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 font-mono text-xs gap-3">
              <div className="h-6 w-6 rounded-full border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
              <span>Querying OCI Logging virtual network flow parameters...</span>
            </div>
          ) : isError ? (
            <div className="text-center py-16 text-rose-455 font-mono text-xs p-6">
              Error connecting to OCI Log endpoints. Check backend configuration.
            </div>
          ) : triageLogs.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 font-mono text-xs p-6">
              No dropped flow logs found matching your filters.
            </div>
          ) : (
            <>
              <table className="w-full text-left font-mono text-xs divide-y divide-zinc-900">
                <thead className="bg-zinc-900/60 text-zinc-400 font-semibold border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-3.5 w-[160px]">Timestamp</th>
                    <th className="px-4 py-3.5">Source Connection (IP:Port)</th>
                    <th className="px-4 py-3.5">Destination Target (IP:Port)</th>
                    <th className="px-4 py-3.5 w-[70px]">Proto</th>
                    <th className="px-4 py-3.5 w-[70px] text-right">Packets</th>
                    <th className="px-4 py-3.5 w-[90px] text-right">Bytes</th>
                    <th className="px-4 py-3.5 w-[80px]">Action</th>
                    <th className="px-4 py-3.5 w-[80px]">Env</th>
                    <th className="px-4 py-3.5 w-[70px] text-center">JSON</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/50 text-zinc-300">
                  {paginatedLogs.map((row) => {
                    const isDbPort = getSubnetGroup(row.dst_ip) === "DB" && row.dst_port === 5432;
                    return (
                      <tr 
                        key={row.id} 
                        className={`hover:bg-zinc-900/40 transition-colors ${isDbPort ? "bg-rose-500/[0.03]" : ""}`}
                      >
                        <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{row.datetime}</td>
                        <td className="px-4 py-3 text-zinc-150 font-bold">{row.src_ip}:{row.src_port}</td>
                        <td className="px-4 py-3 text-zinc-150 font-bold">
                          <div className="flex items-center gap-1.5">
                            {isDbPort && <Database className="h-3.5 w-3.5 text-rose-500" />}
                            {row.dst_ip}:{row.dst_port}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{getProtocolLabel(row.protocol)}</td>
                        <td className="px-4 py-3 text-right text-zinc-250 font-bold">{row.packets}</td>
                        <td className="px-4 py-3 text-right text-zinc-250">
                          {row.bytes > 1024 * 1024 
                            ? `${(row.bytes / (1024 * 1024)).toFixed(1)} MB`
                            : row.bytes > 1024
                              ? `${(row.bytes / 1024).toFixed(1)} KB`
                              : `${row.bytes} B`}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.action === "ACCEPT" 
                              ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/25" 
                              : row.action === "PENDING"
                                ? "bg-amber-500/10 text-amber-455 border border-amber-500/25 animate-pulse"
                                : "bg-rose-500/10 text-rose-455 border border-rose-500/25"
                          }`}>
                            {row.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${row.env === "prod" ? "bg-red-500/10 text-red-400 border border-red-500/20" : row.env === "staging" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>
                            {row.env}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedRawLog(row)}
                            className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
                          >
                            <FileCode className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800/80 bg-zinc-900/10 text-xs">
                  <div className="text-zinc-500 font-mono">
                    Showing {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, triageLogs.length)}-
                    {Math.min(currentPage * ITEMS_PER_PAGE, triageLogs.length)} of {Math.min(triageLogs.length, ITEMS_PER_PAGE * 5)} results 
                    {triageLogs.length > ITEMS_PER_PAGE * 5 && " (capped to 5 pages)"}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none transition-all"
                    >
                      Prev
                    </button>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`px-2.5 py-1 rounded font-bold transition-all ${currentPage === i + 1 ? "bg-rose-500/15 text-rose-455 border border-rose-500/35" : "bg-zinc-950/40 border border-zinc-850 text-zinc-500 hover:text-zinc-300"}`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none transition-all"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Raw JSON Payload Modal */}
      {selectedRawLog && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-850 bg-zinc-900/30">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">OCI Flow Log Record Payload</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">Parsed OCI logging events data schema</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedRawLog(null)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-zinc-950 font-mono text-[11px] text-zinc-300 leading-relaxed">
              <div className="mb-4 p-3 bg-zinc-900 rounded-xl border border-zinc-800/80">
                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Space-separated Message format:</div>
                <div className="text-xs text-blue-300 font-bold whitespace-pre-wrap select-all">
                  {selectedRawLog.raw?.data?.logContent?.data?.message}
                </div>
              </div>
              
              <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Raw JSON payload:</div>
              <pre className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-855 overflow-x-auto">
                {JSON.stringify(selectedRawLog.raw, null, 2)}
              </pre>
            </div>

            <div className="px-6 py-3 border-t border-zinc-850 bg-zinc-900/30 flex items-center justify-between gap-4">
              <span className="text-[10px] font-mono text-zinc-500">ID: {selectedRawLog.id}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyPayload(selectedRawLog)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-zinc-900 hover:bg-zinc-855 text-zinc-300 border border-zinc-800 rounded transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied!" : "Copy Payload"}
                </button>
                <button
                  onClick={() => setSelectedRawLog(null)}
                  className="px-4 py-1.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drilldown modal for ROW 1 Summary statistics cards */}
      {activeModalMetric && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-850 bg-zinc-900/30">
              <div className="flex items-center gap-2.5">
                <Terminal className="h-5 w-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    {activeModalMetric === "rejects" ? "REJECT Flow Packets List" : activeModalMetric === "accepts" ? "ACCEPT Flow Packets List" : `${activeModalMetric.toUpperCase()} Ingress Event Logs`}
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-mono font-medium">OCI VCN Flow Logs segment list</p>
                </div>
              </div>
              <button 
                onClick={() => setActiveModalMetric(null)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-zinc-950">
              {getModalLogs().length === 0 ? (
                <div className="text-center py-12 text-zinc-500 font-mono text-xs">No records found matching subset definitions.</div>
              ) : (
                <div className="border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg">
                  <table className="w-full text-left font-mono text-[11px] divide-y divide-zinc-900">
                    <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800">
                      <tr>
                        <th className="px-4 py-3 w-[170px]">Timestamp</th>
                        <th className="px-4 py-3">Source (IP:Port)</th>
                        <th className="px-4 py-3">Destination (IP:Port)</th>
                        <th className="px-4 py-3 w-[60px] text-right">Packets</th>
                        <th className="px-4 py-3 w-[80px] text-right">Bytes</th>
                        <th className="px-4 py-3 w-[80px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/50 text-zinc-300">
                      {getModalLogs().map((row) => (
                        <tr key={row.id} className="hover:bg-zinc-900/30 transition-colors">
                          <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{row.datetime}</td>
                          <td className="px-4 py-2.5 text-zinc-200">{row.src_ip}:{row.src_port}</td>
                          <td className="px-4 py-2.5 text-zinc-250">{row.dst_ip}:{row.dst_port}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-zinc-150">{row.packets}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-350">{row.bytes.toLocaleString()} B</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${row.action === "ACCEPT" ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20" : "bg-rose-500/10 text-rose-455 border border-rose-500/20"}`}>
                              {row.action}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-zinc-850 bg-zinc-900/30 flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-500">Segment total: {getModalLogs().length} log events</span>
              <button
                onClick={() => setActiveModalMetric(null)}
                className="px-4 py-1.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drilldown modal for AreaChart Time Slice Click callbacks */}
      {selectedTimeSlice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-850 bg-zinc-900/30">
              <div className="flex items-center gap-2.5">
                <Terminal className="h-5 w-5 text-emerald-450" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">OCI Flow Logs at {selectedTimeSlice}</h3>
                  <p className="text-[10px] text-zinc-500 font-mono font-medium">VCN traffic events in selected interval slice</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedTimeSlice(null)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-zinc-950">
              {envFilteredLogs.filter(l => {
                const date = new Date(l.iso);
                const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                return timeStr === selectedTimeSlice;
              }).length === 0 ? (
                <div className="text-center py-12 text-zinc-500 font-mono text-xs">No logs found in this slice timeframe.</div>
              ) : (
                <div className="border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg">
                  <table className="w-full text-left font-mono text-[11px] divide-y divide-zinc-900">
                    <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800">
                      <tr>
                        <th className="px-4 py-3 w-[170px]">Timestamp</th>
                        <th className="px-4 py-3">Source (IP:Port)</th>
                        <th className="px-4 py-3">Destination (IP:Port)</th>
                        <th className="px-4 py-3 w-[60px] text-right">Packets</th>
                        <th className="px-4 py-3 w-[80px] text-right">Bytes</th>
                        <th className="px-4 py-3 w-[80px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/50 text-zinc-300">
                      {envFilteredLogs.filter(l => {
                        const date = new Date(l.iso);
                        const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                        return timeStr === selectedTimeSlice;
                      }).map((row) => (
                        <tr key={row.id} className="hover:bg-zinc-900/30 transition-colors">
                          <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{row.datetime}</td>
                          <td className="px-4 py-2.5 text-zinc-200">{row.src_ip}:{row.src_port}</td>
                          <td className="px-4 py-2.5 text-zinc-250">{row.dst_ip}:{row.dst_port}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-zinc-150">{row.packets}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-350">{row.bytes.toLocaleString()} B</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${row.action === "ACCEPT" ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20" : "bg-rose-500/10 text-rose-455 border border-rose-500/20"}`}>
                              {row.action}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-zinc-850 bg-zinc-900/30 flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-500">
                Slice total: {
                  envFilteredLogs.filter(l => {
                    const date = new Date(l.iso);
                    const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                    return timeStr === selectedTimeSlice;
                  }).length
                } events
              </span>
              <button
                onClick={() => setSelectedTimeSlice(null)}
                className="px-4 py-1.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Close Slice Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drilldown modal for East-West Cross-Subnet Heatmap Cell Click */}
      {heatmapCellFilter && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-850 bg-zinc-900/30">
              <div className="flex items-center gap-2.5">
                <ArrowRightLeft className="h-5 w-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    Cross-Subnet Flows: {heatmapCellFilter.srcLabel} Subnet ➔ {heatmapCellFilter.dstLabel} Subnet
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-mono font-medium">OCI VCN Flow log subnet mapping details</p>
                </div>
              </div>
              <button 
                onClick={() => setHeatmapCellFilter(null)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-6 overflow-y-auto bg-zinc-950">
              {envFilteredLogs.filter(l => 
                getSubnetGroup(l.src_ip) === heatmapCellFilter.srcSubnet && 
                getSubnetGroup(l.dst_ip) === heatmapCellFilter.dstSubnet
              ).length === 0 ? (
                <div className="text-center py-12 text-zinc-500 font-mono text-xs">No active VCN flows recorded between these subnets.</div>
              ) : (
                <div className="border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg">
                  <table className="w-full text-left font-mono text-[11px] divide-y divide-zinc-900">
                    <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800">
                      <tr>
                        <th className="px-4 py-3 w-[170px]">Timestamp</th>
                        <th className="px-4 py-3">Source (IP:Port)</th>
                        <th className="px-4 py-3">Destination (IP:Port)</th>
                        <th className="px-4 py-3 w-[60px] text-right">Packets</th>
                        <th className="px-4 py-3 w-[80px] text-right">Bytes</th>
                        <th className="px-4 py-3 w-[80px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/50 text-zinc-300">
                      {envFilteredLogs.filter(l => 
                        getSubnetGroup(l.src_ip) === heatmapCellFilter.srcSubnet && 
                        getSubnetGroup(l.dst_ip) === heatmapCellFilter.dstSubnet
                      ).map((row) => (
                        <tr key={row.id} className="hover:bg-zinc-900/30 transition-colors">
                          <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{row.datetime}</td>
                          <td className="px-4 py-2.5 text-zinc-200">{row.src_ip}:{row.src_port}</td>
                          <td className="px-4 py-2.5 text-zinc-250">{row.dst_ip}:{row.dst_port}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-zinc-150">{row.packets}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-350">{row.bytes.toLocaleString()} B</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${row.action === "ACCEPT" ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20" : "bg-rose-500/10 text-rose-455 border border-rose-500/20"}`}>
                              {row.action}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-zinc-850 bg-zinc-900/30 flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-500">
                Cell total: {
                  envFilteredLogs.filter(l => 
                    getSubnetGroup(l.src_ip) === heatmapCellFilter.srcSubnet && 
                    getSubnetGroup(l.dst_ip) === heatmapCellFilter.dstSubnet
                  ).length
                } flows
              </span>
              <button
                onClick={() => setHeatmapCellFilter(null)}
                className="px-4 py-1.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drilldown modal for Top 10 External Talkers Bar Click */}
      {externalTalkerFilter && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-850 bg-zinc-900/30">
              <div className="flex items-center gap-2.5">
                <Globe className="h-5 w-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    Ingress Traffic details: {externalTalkerFilter}
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-mono font-medium">Flow logs generated by this external host IP</p>
                </div>
              </div>
              <button 
                onClick={() => setExternalTalkerFilter(null)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-6 overflow-y-auto bg-zinc-950">
              {envFilteredLogs.filter(l => l.src_ip === externalTalkerFilter).length === 0 ? (
                <div className="text-center py-12 text-zinc-500 font-mono text-xs">No active VCN logs recorded for this host.</div>
              ) : (
                <div className="border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg">
                  <table className="w-full text-left font-mono text-[11px] divide-y divide-zinc-900">
                    <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800">
                      <tr>
                        <th className="px-4 py-3 w-[170px]">Timestamp</th>
                        <th className="px-4 py-3">Source (IP:Port)</th>
                        <th className="px-4 py-3">Destination (IP:Port)</th>
                        <th className="px-4 py-3 w-[60px] text-right">Packets</th>
                        <th className="px-4 py-3 w-[80px] text-right">Bytes</th>
                        <th className="px-4 py-3 w-[80px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/50 text-zinc-300">
                      {envFilteredLogs.filter(l => l.src_ip === externalTalkerFilter).map((row) => (
                        <tr key={row.id} className="hover:bg-zinc-900/30 transition-colors">
                          <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{row.datetime}</td>
                          <td className="px-4 py-2.5 text-zinc-200">{row.src_ip}:{row.src_port}</td>
                          <td className="px-4 py-2.5 text-zinc-250">{row.dst_ip}:{row.dst_port}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-zinc-150">{row.packets}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-350">{row.bytes.toLocaleString()} B</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${row.action === "ACCEPT" ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20" : "bg-rose-500/10 text-rose-455 border border-rose-500/20"}`}>
                              {row.action}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-zinc-850 bg-zinc-900/30 flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-500">
                Talker total: {envFilteredLogs.filter(l => l.src_ip === externalTalkerFilter).length} logs
              </span>
              <button
                onClick={() => setExternalTalkerFilter(null)}
                className="px-4 py-1.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Close Host Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drilldown modal for Database Subnet Postgres Port 5432 Gauge Click */}
      {dbRejectsFilter && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-850 bg-zinc-900/30">
              <div className="flex items-center gap-2.5">
                <Database className="h-5 w-5 text-rose-500" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    PostgreSQL Secure Subnet (10.0.3.99:5432) Dropped Connection Attempts
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-mono font-medium">OCI Private Subnet Security List REJECT logs</p>
                </div>
              </div>
              <button 
                onClick={() => setDbRejectsFilter(false)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-6 overflow-y-auto bg-zinc-950">
              {envFilteredLogs.filter(l => 
                l.action === "REJECT" && 
                getSubnetGroup(l.dst_ip) === "DB" && 
                l.dst_port === 5432
              ).length === 0 ? (
                <div className="text-center py-12 text-zinc-500 font-mono text-xs">No dropped database connections in this scope.</div>
              ) : (
                <div className="border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg">
                  <table className="w-full text-left font-mono text-[11px] divide-y divide-zinc-900">
                    <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800">
                      <tr>
                        <th className="px-4 py-3 w-[170px]">Timestamp</th>
                        <th className="px-4 py-3">Attacker Host (IP:Port)</th>
                        <th className="px-4 py-3">Destination DB (IP:Port)</th>
                        <th className="px-4 py-3 w-[60px] text-right">Packets</th>
                        <th className="px-4 py-3 w-[80px] text-right">Bytes</th>
                        <th className="px-4 py-3 w-[150px]">Threat Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/50 text-zinc-300">
                      {envFilteredLogs.filter(l => 
                        l.action === "REJECT" && 
                        getSubnetGroup(l.dst_ip) === "DB" && 
                        l.dst_port === 5432
                      ).map((row) => {
                        const isFrontendBypass = getSubnetGroup(row.src_ip) === "FE";
                        return (
                          <tr key={row.id} className="hover:bg-zinc-900/30 transition-colors">
                            <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{row.datetime}</td>
                            <td className="px-4 py-2.5 font-bold text-zinc-200">{row.src_ip}:{row.src_port}</td>
                            <td className="px-4 py-2.5 text-zinc-250">{row.dst_ip}:{row.dst_port}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-rose-400">{row.packets}</td>
                            <td className="px-4 py-2.5 text-right text-zinc-350">{row.bytes.toLocaleString()} B</td>
                            <td className="px-4 py-2.5">
                              {isFrontendBypass ? (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">
                                  Backend Bypass
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-455 border border-rose-500/20 uppercase">
                                  External Scan
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-zinc-850 bg-zinc-900/30 flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-500">
                Database drops: {postgresRejects} log records
              </span>
              <button
                onClick={() => setDbRejectsFilter(false)}
                className="px-4 py-1.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Close DB Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Drill-Down Modal — External Talkers by Date bar click */}
      {selectedDateDrilldown && (() => {
        const { date, actionFilter } = selectedDateDrilldown
        const allLogsForDate = envFilteredLogs.filter(l => {
          if (getSubnetGroup(l.src_ip) !== "EXT" || getSubnetGroup(l.dst_ip) !== "FE") return false
          const d = new Date(l.iso)
          const dateKey = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          return dateKey === date
        })
        const displayedLogs = actionFilter === "all"
          ? allLogsForDate
          : allLogsForDate.filter(l => l.action === actionFilter)
        const acceptCount = allLogsForDate.filter(l => l.action === "ACCEPT").reduce((s, l) => s + l.packets, 0)
        const rejectCount = allLogsForDate.filter(l => l.action === "REJECT").reduce((s, l) => s + l.packets, 0)

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-850 bg-zinc-900/30">
                <div className="flex items-center gap-2.5">
                  <Globe className="h-5 w-5 text-blue-400" />
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">
                      External Ingress Flows — {date}
                    </h3>
                    <p className="text-[10px] text-zinc-500 font-mono font-medium">
                      All external-to-public-subnet VCN logs for this date
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDateDrilldown(null)}
                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Stats summary bar */}
              <div className="flex items-center gap-6 px-6 py-3 bg-zinc-900/20 border-b border-zinc-800/60">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm bg-emerald-500 inline-block"></span>
                  <span className="text-[11px] font-mono text-zinc-400">ACCEPT packets:</span>
                  <span className="text-[11px] font-mono font-bold text-emerald-400">{acceptCount.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm bg-rose-500 inline-block"></span>
                  <span className="text-[11px] font-mono text-zinc-400">REJECT packets:</span>
                  <span className="text-[11px] font-mono font-bold text-rose-400">{rejectCount.toLocaleString()}</span>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  {/* Action filter tabs */}
                  {(["all", "ACCEPT", "REJECT"] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSelectedDateDrilldown({ date, actionFilter: tab })}
                      className={`px-3 py-1 rounded text-[10px] font-bold font-mono uppercase transition-all ${
                        actionFilter === tab
                          ? tab === "ACCEPT"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/35"
                            : tab === "REJECT"
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/35"
                              : "bg-blue-500/15 text-blue-400 border border-blue-500/35"
                          : "bg-zinc-900/40 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
                      }`}
                    >
                      {tab === "all" ? "All" : tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Log table */}
              <div className="flex-1 overflow-y-auto bg-zinc-950 px-6 py-4">
                {displayedLogs.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 font-mono text-xs">
                    No {actionFilter !== "all" ? actionFilter : ""} logs found for {date}.
                  </div>
                ) : (
                  <div className="border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg">
                    <table className="w-full text-left font-mono text-[11px] divide-y divide-zinc-900">
                      <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800">
                        <tr>
                          <th className="px-4 py-3 w-[170px]">Timestamp</th>
                          <th className="px-4 py-3">Source (IP:Port)</th>
                          <th className="px-4 py-3">Destination (IP:Port)</th>
                          <th className="px-4 py-3 w-[60px]">Proto</th>
                          <th className="px-4 py-3 w-[60px] text-right">Pkts</th>
                          <th className="px-4 py-3 w-[80px] text-right">Bytes</th>
                          <th className="px-4 py-3 w-[80px]">Action</th>
                          <th className="px-4 py-3 w-[80px]">Gateway</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/50 text-zinc-300">
                        {displayedLogs.map(row => (
                          <tr key={row.id} className="hover:bg-zinc-900/30 transition-colors">
                            <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{row.datetime}</td>
                            <td className="px-4 py-2.5 font-bold text-zinc-200">{row.src_ip}:{row.src_port}</td>
                            <td className="px-4 py-2.5 text-zinc-250">{row.dst_ip}:{row.dst_port}</td>
                            <td className="px-4 py-2.5 text-zinc-400">
                              {row.protocol === 6 ? "TCP" : row.protocol === 17 ? "UDP" : row.protocol === 1 ? "ICMP" : `P${row.protocol}`}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-zinc-150">{row.packets}</td>
                            <td className="px-4 py-2.5 text-right text-zinc-350">
                              {row.bytes > 1024 * 1024
                                ? `${(row.bytes / (1024 * 1024)).toFixed(1)}MB`
                                : row.bytes > 1024
                                  ? `${(row.bytes / 1024).toFixed(1)}KB`
                                  : `${row.bytes}B`}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                row.action === "ACCEPT"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}>
                                {row.action}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-zinc-500 text-[9px]">
                              {row.gateway === "Internet Gateway" ? "IGW" : row.gateway === "NAT Gateway" ? "NATG" : row.gateway}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-zinc-850 bg-zinc-900/30 flex items-center justify-between">
                <span className="text-[10px] font-mono text-zinc-500">
                  Showing {displayedLogs.length} of {allLogsForDate.length} logs for {date}
                </span>
                <button
                  onClick={() => setSelectedDateDrilldown(null)}
                  className="px-4 py-1.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
