import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Activity, Cloud, Database, Network, ArrowRightLeft, Clock, Server, Layers, X, FileCode, Table as TableIcon, ExternalLink, CheckCircle2, Copy, Check, Terminal, Loader2 } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { useQuery } from '@tanstack/react-query'

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function StatCard({ title, value, icon: Icon, description, trend, trendUp, colorClass = "text-orange-500", onClick }: any) {
  return (
    <Card 
      onClick={onClick}
      className={`relative overflow-hidden border-${colorClass.split('-')[1]}-500/20 bg-card cursor-pointer hover:border-${colorClass.split('-')[1]}-500/60 hover:scale-[1.01] transition-all duration-200 group shadow-sm`}
    >
      <div className={`absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none group-hover:opacity-[0.07] transition-opacity`}>
        <Icon className={`w-32 h-32 ${colorClass}`} />
      </div>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 z-10 relative">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700">ACCESS LOGS ↗</span>
          <Icon className={`h-4 w-4 ${colorClass}`} />
        </div>
      </CardHeader>
      <CardContent className="z-10 relative">
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
          <span>{description}</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 bg-zinc-900 rounded text-zinc-500 border border-zinc-800">OCI Gateway</span>
        </p>
      </CardContent>
    </Card>
  )
}

export default function OciGatewayOverview() {
  const [selectedResourceId, setSelectedResourceId] = useState<string>('')
  const [activePointQuery, setActivePointQuery] = useState<{ ts: number; count: number; title: string; timeStr?: string } | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: resourcesData } = useQuery({
    queryKey: ['oci-resources'],
    queryFn: async () => {
      const res = await fetch('/api/oci-resources')
      if (!res.ok) throw new Error('Failed to fetch resources')
      return res.json()
    }
  })

  const resources = React.useMemo(() => {
    if (!resourcesData) return []
    const gw = (resourcesData.gateways || []).map((g: any) => ({ id: g.id, displayName: g.displayName, type: 'Gateway' }))
    const dep = (resourcesData.deployments || []).map((d: any) => ({ id: d.id, displayName: d.displayName, type: 'Deployment' }))
    return [...gw, ...dep]
  }, [resourcesData])

  const [timeRange, setTimeRange] = React.useState('1h')

  const { data: ociData } = useQuery({
    queryKey: ['oci-metrics', selectedResourceId, timeRange],
    queryFn: async () => {
      let url = `/api/oci-metrics?timeRange=${timeRange}`
      if (selectedResourceId) {
        url += `&resourceId=${encodeURIComponent(selectedResourceId)}`
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    refetchInterval: 15000
  })

  const { data: specificLogsData, isFetching: isFetchingLogs } = useQuery({
    queryKey: ['oci-access-logs', activePointQuery?.ts, activePointQuery?.count],
    queryFn: async () => {
      if (!activePointQuery) return { logs: [] }
      const res = await fetch(`/api/oci-access-logs?timestamp=${activePointQuery.ts}&count=${activePointQuery.count}`)
      if (!res.ok) throw new Error('Failed to fetch point access logs')
      return res.json()
    },
    enabled: !!activePointQuery,
    refetchInterval: 10000
  })

  // Format real chart data
  const chartData = React.useMemo(() => {
    if (!ociData) return []

    const dataMap = new Map<number, any>()
    
    const processMetric = (metricArray: any[], key: string) => {
      if (!metricArray || metricArray.length === 0) return
      metricArray.forEach((metricObj: any) => {
        if (!metricObj.aggregatedDatapoints) return
        metricObj.aggregatedDatapoints.forEach((dp: any) => {
          const t = new Date(dp.timestamp).getTime()
          if (!dataMap.has(t)) {
            const dateObj = new Date(dp.timestamp)
            const timeString = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            dataMap.set(t, { 
              time: timeString,
              requests: 0, latency: 0, bytesIn: 0, bytesOut: 0, responses: 0, timestamp: t
            })
          }
          const pt = dataMap.get(t)
          pt[key] += (key === 'latency' && pt[key] > 0) ? dp.value / 2 : dp.value
        })
      })
    }

    processMetric(ociData.requests, 'requests')
    processMetric(ociData.responses, 'responses')
    processMetric(ociData.latency, 'latency')
    processMetric(ociData.bytesReceived, 'bytesIn')
    processMetric(ociData.bytesSent, 'bytesOut')

    return Array.from(dataMap.values()).sort((a: any, b: any) => a.timestamp - b.timestamp)
  }, [ociData])

  const totalRequests = chartData.reduce((acc, curr) => acc + curr.requests, 0)
  const avgLatency = chartData.length > 0 ? Math.round(chartData.reduce((acc, curr) => acc + curr.latency, 0) / chartData.length) : 0
  const totalBytesIn = chartData.reduce((acc, curr) => acc + curr.bytesIn, 0)
  const totalBytesOut = chartData.reduce((acc, curr) => acc + curr.bytesOut, 0)

  const openPointLogs = (timeStr: string, ts: number, count: number) => {
    setExpandedRow(null)
    setActivePointQuery({
      ts: ts || Date.now(),
      count: count || 25,
      title: `OCI Gateway Access Logs • ${timeStr || 'Current'} (${count || 25} API Responses)`,
      timeStr: timeStr || 'Current'
    })
    setViewMode('table')
  }

  const activeLogs = specificLogsData?.logs || []

  const rawJsonPayload = {
    apiGatewayLogSearchEndpoint: `https://logging.${ociData?.region || 'us-chicago-1'}.oraclecloud.com/20190909/actions/searchLogs`,
    httpMethod: "POST",
    statusCode: 200,
    ociSDKHeaders: {
      "content-type": "application/json",
      "opc-request-id": `oci-log-${Math.random().toString(36).substring(2, 11)}`,
      "date": new Date().toUTCString(),
      "user-agent": "Oracle-TypeScript-SDK/LogSearchClient"
    },
    searchQuerySpecification: {
      searchQuery: `search "${selectedResourceId || ociData?.gatewayId || 'ocid1.apigateway...'}" | where type = 'apigateway.apideployment.access' | sort by datetime desc | limit ${activePointQuery?.count || 30}`,
      timeSliceStart: new Date((activePointQuery?.ts || Date.now()) - 60000).toISOString(),
      timeSliceEnd: new Date((activePointQuery?.ts || Date.now()) + 60000).toISOString(),
      isReturnFieldInfo: false
    },
    returnedAccessLogRecords: activeLogs.map((l: any) => l.raw || l)
  }

  const copyRawJson = () => {
    navigator.clipboard.writeText(JSON.stringify(rawJsonPayload, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 relative">
      {/* ─── Real OCI API Gateway Specific Point Access Logs Modal ─────────────── */}
      {activePointQuery && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-orange-500/35 rounded-2xl max-w-5xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-gradient-to-r from-orange-500/15 via-zinc-900 to-zinc-950">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-inner">
                  <Terminal className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2 font-mono">
                    {activePointQuery.title}
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-semibold">HTTP 200 OK • OCI LOGS</span>
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono">Real Oracle Cloud Infrastructure API Gateway Access Logs Stream</p>
                </div>
              </div>
              <button 
                onClick={() => setActivePointQuery(null)}
                className="p-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Sub-bar */}
            <div className="flex flex-wrap items-center justify-between px-6 py-3 bg-zinc-900/60 border-b border-zinc-800/80 text-xs font-mono text-zinc-400 gap-2">
              <div className="flex items-center gap-5">
                <span>Region: <strong className="text-orange-400">{ociData?.region || 'us-chicago-1'}</strong></span>
                <span>Target Slice Count: <strong className="text-zinc-200">{activeLogs.length} responses</strong></span>
                {isFetchingLogs && <span className="text-amber-400 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Querying OCI Log Search...</span>}
              </div>
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${viewMode === 'table' ? 'bg-orange-500/20 text-orange-300 font-semibold border border-orange-500/30' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <TableIcon className="h-3.5 w-3.5" /> Access Logs Table
                </button>
                <button
                  onClick={() => setViewMode('json')}
                  className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${viewMode === 'json' ? 'bg-orange-500/20 text-orange-300 font-semibold border border-orange-500/30' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <FileCode className="h-3.5 w-3.5" /> Equivalent API Response (JSON)
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-950">
              {viewMode === 'table' ? (
                isFetchingLogs && activeLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-400 font-mono text-xs gap-3">
                    <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                    <span>Pulling specific API telemetry for clicked timestamp...</span>
                  </div>
                ) : activeLogs.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 font-mono text-xs">No API Gateway access log events recorded for this exact minute.</div>
                ) : (
                  <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900/10 shadow-lg">
                    <table className="w-full text-left font-mono text-xs divide-y divide-zinc-900">
                      <thead className="bg-zinc-900/90 text-zinc-400 font-semibold border-b border-zinc-800">
                        <tr>
                          <th className="px-4 py-3.5 w-[220px]">datetime</th>
                          <th className="px-4 py-3.5 w-[270px]">type</th>
                          <th className="px-4 py-3.5">data.message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/70 text-zinc-300">
                        {activeLogs.map((row: any, i: number) => {
                          const isExpanded = expandedRow === i
                          return (
                            <React.Fragment key={i}>
                              <tr 
                                onClick={() => setExpandedRow(isExpanded ? null : i)}
                                className="hover:bg-zinc-900/60 transition-colors cursor-pointer group"
                              >
                                <td className="px-4 py-3 text-zinc-400 flex items-center gap-2.5 whitespace-nowrap">
                                  <span className="text-[10px] text-orange-500 group-hover:scale-125 transition-transform inline-block font-bold select-none">
                                    {isExpanded ? '▼' : '►'}
                                  </span>
                                  <span className="font-medium group-hover:text-zinc-200 transition-colors">{row.datetime}</span>
                                </td>
                                <td className="px-4 py-3 text-zinc-400 select-all font-medium whitespace-nowrap">{row.type}</td>
                                <td className="px-4 py-3 font-semibold text-zinc-200 group-hover:text-orange-300 transition-colors truncate max-w-[400px]">
                                  {row.message}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-zinc-900/90 border-y border-orange-500/20">
                                  <td colSpan={3} className="px-6 py-4">
                                    <div className="space-y-2 font-mono text-xs">
                                      <div className="flex items-center justify-between text-zinc-400">
                                        <span className="uppercase text-[10px] tracking-wider font-bold text-orange-400 flex items-center gap-1.5">
                                          <Terminal className="h-3 w-3" /> Raw Oracle Cloud Access Log Event
                                        </span>
                                        <span className="text-[10px] text-zinc-500">HTTP/2.0 • Status {row.message.startsWith("OPTIONS") ? "204 No Content" : "200 OK"}</span>
                                      </div>
                                      <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400 overflow-x-auto leading-relaxed shadow-inner text-[11px]">
                                        {JSON.stringify(row.raw || row, null, 2)}
                                      </pre>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="relative group">
                  <div className="sticky top-0 flex justify-end pb-3 z-10">
                    <button
                      onClick={copyRawJson}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-mono text-xs transition-all shadow-lg"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied JSON Payload" : "Copy Equivalent Payload"}
                    </button>
                  </div>
                  <pre className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed shadow-inner">
                    {JSON.stringify(rawJsonPayload, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-zinc-900 border-t border-zinc-800 flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400 gap-2">
              <span>Time Slice: <span className="text-zinc-300">{activePointQuery.timeStr} ± 60s</span></span>
              <span>Authentication: <strong className="text-emerald-400">SimpleAuthenticationDetailsProvider</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Cloud className="w-8 h-8 text-orange-500" />
            OCI API Overview
          </h1>
          <p className="text-muted-foreground mt-1">Real-time telemetry and traffic analytics for your Oracle Cloud Infrastructure.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm bg-orange-500/10 text-orange-500 px-3 py-1.5 rounded-full border border-orange-500/20 font-medium">
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            {ociData?.region || 'us-chicago-1'}
          </div>
          {resources.length > 0 && (
            <select 
              value={selectedResourceId || ociData?.gatewayId || ''}
              onChange={(e) => setSelectedResourceId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm font-mono max-w-[300px] truncate focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="" disabled>Select API Gateway / Deployment...</option>
              {resources.map((r: any) => (
                <option key={r.id} value={r.id}>
                  [{r.type}] {r.displayName}
                </option>
              ))}
            </select>
          )}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-muted-foreground shadow-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="1m">Last 1 Minute</option>
            <option value="5m">Last 5 Minutes</option>
            <option value="1h">Last 1 Hour</option>
            <option value="24h">Last 24 Hours</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title={`Total Requests (${timeRange})`} value={totalRequests.toLocaleString()} icon={Activity} description="Incoming API Calls" trend={undefined} colorClass="text-emerald-500" onClick={() => openPointLogs("Total Time Slice", Date.now(), totalRequests || 45)} />
        <StatCard title="Avg Latency" value={`${avgLatency} ms`} icon={Clock} description="Response Time" trend={undefined} colorClass="text-amber-500" onClick={() => openPointLogs("Current Window", Date.now(), 30)} />
        <StatCard title="Bytes Received" value={formatBytes(totalBytesIn)} icon={ArrowRightLeft} description="Ingress Traffic" trend={undefined} colorClass="text-blue-500" onClick={() => openPointLogs("Ingress Window", Date.now(), 25)} />
        <StatCard title="Bytes Sent" value={formatBytes(totalBytesOut)} icon={Network} description="Egress Traffic" trend={undefined} colorClass="text-purple-500" onClick={() => openPointLogs("Egress Window", Date.now(), 25)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50 shadow-sm bg-card/50 backdrop-blur-sm relative overflow-hidden group/card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="w-5 h-5 text-emerald-500" />
                API Request Volume
              </CardTitle>
              <CardDescription>Total requests processed per minute</CardDescription>
            </div>
            <button
              onClick={() => openPointLogs("Latest Minute Slice", chartData[chartData.length-1]?.timestamp || Date.now(), chartData[chartData.length-1]?.requests || 40)}
              className="text-[11px] font-mono px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-all flex items-center gap-1.5 shadow-sm font-semibold"
            >
              <TableIcon className="h-3.5 w-3.5" /> Display Access Logs List
            </button>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={chartData}
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload[0]) {
                      const pt = e.activePayload[0].payload
                      openPointLogs(pt.time, pt.timestamp, pt.requests || pt.responses || 35)
                    }
                  }}
                  className="cursor-pointer"
                >
                  <defs>
                    <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="time" stroke="#888" fontSize={12} tickMargin={10} minTickGap={30} />
                  <YAxis stroke="#888" fontSize={12} tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', borderColor: '#374151', borderRadius: '8px' }}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Area type="monotone" dataKey="requests" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorReq)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono text-center pt-2">Click any point on the line chart to display its list of API calls</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm bg-card/50 backdrop-blur-sm relative overflow-hidden group/card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="w-5 h-5 text-amber-500" />
                Gateway Latency
              </CardTitle>
              <CardDescription>Average response time (milliseconds)</CardDescription>
            </div>
            <button
              onClick={() => openPointLogs("Latest Minute Slice", chartData[chartData.length-1]?.timestamp || Date.now(), 30)}
              className="text-[11px] font-mono px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all flex items-center gap-1.5 shadow-sm font-semibold"
            >
              <TableIcon className="h-3.5 w-3.5" /> Display Access Logs List
            </button>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={chartData}
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload[0]) {
                      const pt = e.activePayload[0].payload
                      openPointLogs(pt.time, pt.timestamp, pt.requests || 25)
                    }
                  }}
                  className="cursor-pointer"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="time" stroke="#888" fontSize={12} tickMargin={10} minTickGap={30} />
                  <YAxis stroke="#888" fontSize={12} tickFormatter={(val) => `${val}ms`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', borderColor: '#374151', borderRadius: '8px' }}
                    itemStyle={{ color: '#f59e0b' }}
                  />
                  <Line type="monotone" dataKey="latency" stroke="#f59e0b" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "#f59e0b" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono text-center pt-2">Click any point on the line chart to display its list of API calls</div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
