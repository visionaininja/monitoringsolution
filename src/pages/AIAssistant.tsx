import { useState, useEffect, useMemo, useRef } from "react"
import { Bot, Sparkles, Key, Settings, ChevronRight, ChevronDown, GitCommit, PlayCircle, CheckCircle2, XCircle, Clock, Terminal, Eye, EyeOff } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  getGitHubToken,
  fetchGitHubRepos,
  fetchGitHubCommits,
  fetchGitHubCommitDetails,
  fetchGitHubWorkflowRuns,
  fetchGitHubWorkflowRunJobs,
  fetchGitHubJobLogs,
} from "@/lib/github"
import {
  getGeminiApiKey, setGeminiApiKey, removeGeminiApiKey,
  getAnthropicApiKey, setAnthropicApiKey, removeAnthropicApiKey,
  isGeminiModel, isClaudeModel,
  buildPipelinePrompt, buildCommitPrompt,
  streamAIResponse,
  type PipelineContext, type CommitContext,
} from "@/lib/ai"

// ─── Markdown Renderer ───────────────────────────────────────────────────────

const parseInline = (text: string): string => {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong class='text-foreground font-semibold'>$1</strong>")
    .replace(/`(.*?)`/g, "<code class='bg-secondary text-primary font-mono px-1.5 py-0.5 rounded text-[11px] border border-border/40'>$1</code>")
}

const renderMarkdown = (text: string) => {
  const lines = text.split("\n")
  let inCodeBlock = false
  let codeBlockLang = ""
  let codeLines: string[] = []
  const elements: React.ReactNode[] = []

  const flushCodeBlock = (key: number) => {
    if (codeLines.length > 0) {
      elements.push(
        <div key={`code-${key}`} className="my-2 rounded-lg border border-border/50 overflow-hidden">
          {codeBlockLang && (
            <div className="px-3 py-1 bg-secondary/60 border-b border-border/40 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              {codeBlockLang}
            </div>
          )}
          <pre className="p-3 bg-background/80 overflow-x-auto text-xs font-mono leading-relaxed">
            <code>{codeLines.join("\n")}</code>
          </pre>
        </div>
      )
      codeLines = []
      codeBlockLang = ""
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith("```")) {
      if (inCodeBlock) { flushCodeBlock(i); inCodeBlock = false }
      else { inCodeBlock = true; codeBlockLang = line.substring(3).trim() }
      continue
    }

    if (inCodeBlock) { codeLines.push(line); continue }
    if (line.trim() === "") { elements.push(<br key={i} />); continue }

    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-xl font-bold mt-4 mb-2 text-foreground border-b pb-1 border-border/40">{line.substring(2)}</h1>)
      continue
    }
    if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-base font-bold mt-4 mb-2 text-foreground">{line.substring(3)}</h2>)
      continue
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-sm font-semibold mt-4 mb-1 text-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> {line.substring(4)}
        </h3>
      )
      continue
    }
    if (line.startsWith("#### ")) {
      elements.push(<h4 key={i} className="text-xs font-bold mt-3 mb-1 text-foreground">{line.substring(5)}</h4>)
      continue
    }
    if (line.startsWith("---")) {
      elements.push(<hr key={i} className="my-3 border-border/40" />)
      continue
    }
    if (line.match(/^[*-]\s/)) {
      elements.push(
        <li key={i} className="list-disc list-inside text-xs text-muted-foreground my-1 pl-2"
          dangerouslySetInnerHTML={{ __html: parseInline(line.replace(/^[*-]\s/, "")) }}
        />
      )
      continue
    }
    if (line.match(/^\d+\.\s/)) {
      elements.push(
        <li key={i} className="list-decimal list-inside text-xs text-muted-foreground my-1 pl-2"
          dangerouslySetInnerHTML={{ __html: parseInline(line.replace(/^\d+\.\s/, "")) }}
        />
      )
      continue
    }
    elements.push(
      <p key={i} className="text-xs text-muted-foreground my-1 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: parseInline(line) }}
      />
    )
  }
  if (inCodeBlock) flushCodeBlock(lines.length)
  return <div className="space-y-1">{elements}</div>
}

// ─── API Key Settings Component ──────────────────────────────────────────────

function ApiKeySettings() {
  const [expanded, setExpanded] = useState(false)
  const [geminiKey, setGeminiKey] = useState(getGeminiApiKey() || "")
  const [anthropicKey, setAnthropicKey] = useState(getAnthropicApiKey() || "")
  const [showGemini, setShowGemini] = useState(false)
  const [showAnthropic, setShowAnthropic] = useState(false)
  const [saved, setSaved] = useState(false)

  const hasGemini = !!getGeminiApiKey()
  const hasAnthropic = !!getAnthropicApiKey()

  const handleSave = () => {
    if (geminiKey.trim()) setGeminiApiKey(geminiKey.trim())
    else removeGeminiApiKey()
    if (anthropicKey.trim()) setAnthropicApiKey(anthropicKey.trim())
    else removeAnthropicApiKey()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputClass = "flex h-8 w-full rounded-md border border-input bg-card px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground font-mono"

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Key className="h-3 w-3" />
          API Keys
          {hasGemini && <Badge variant="success" className="text-[9px] px-1 py-0">Gemini ✓</Badge>}
          {hasAnthropic && <Badge variant="success" className="text-[9px] px-1 py-0">Claude ✓</Badge>}
          {!hasGemini && !hasAnthropic && <Badge variant="destructive" className="text-[9px] px-1 py-0">Not Set</Badge>}
        </span>
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/40">
          <div className="space-y-1.5 pt-2">
            <label className="text-[11px] font-medium text-muted-foreground">Gemini API Key</label>
            <div className="relative">
              <input
                type={showGemini ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIza..."
                className={inputClass}
              />
              <button onClick={() => setShowGemini(!showGemini)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showGemini ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Anthropic API Key</label>
            <div className="relative">
              <input
                type={showAnthropic ? "text" : "password"}
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-..."
                className={inputClass}
              />
              <button onClick={() => setShowAnthropic(!showAnthropic)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showAnthropic ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
          </div>

          <Button size="sm" onClick={handleSave} className="w-full h-7 text-xs">
            {saved ? "✓ Saved" : "Save API Keys"}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

type AnalysisMode = "commit" | "pipeline"

export default function AIAssistant() {
  const token = getGitHubToken()
  const navigate = useNavigate()
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("pipeline")
  const [selectedRepo, setSelectedRepo] = useState<string>("")
  const [selectedCommit, setSelectedCommit] = useState<string>("")
  const [selectedRunId, setSelectedRunId] = useState<string>("")
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.5-flash")
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [analysisStep, setAnalysisStep] = useState<string>("")
  const abortRef = useRef<AbortController | null>(null)
  const resultContainerRef = useRef<HTMLDivElement>(null)

  const queryDefaults = { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false as const }

  // Auto-scroll on result update
  useEffect(() => {
    if (resultContainerRef.current && analyzing) {
      resultContainerRef.current.scrollTop = resultContainerRef.current.scrollHeight
    }
  }, [result, analyzing])

  const reposQuery = useQuery({
    queryKey: ["github-repos"],
    queryFn: fetchGitHubRepos,
    enabled: !!token,
    ...queryDefaults,
  })

  useEffect(() => {
    if (reposQuery.data && Array.isArray(reposQuery.data) && reposQuery.data.length > 0 && !selectedRepo)
      setSelectedRepo(reposQuery.data[0].full_name)
  }, [reposQuery.data, selectedRepo])

  const { owner, repoName } = useMemo(() => {
    if (!selectedRepo) return { owner: "", repoName: "" }
    const [o, r] = selectedRepo.split("/")
    return { owner: o || "", repoName: r || "" }
  }, [selectedRepo])

  const isRepoActive = !!token && !!owner && !!repoName

  const commitsQuery = useQuery({
    queryKey: ["github-commits", owner, repoName],
    queryFn: () => fetchGitHubCommits(owner, repoName),
    enabled: isRepoActive,
    ...queryDefaults,
  })

  const runsQuery = useQuery({
    queryKey: ["github-runs", owner, repoName],
    queryFn: () => fetchGitHubWorkflowRuns(owner, repoName),
    enabled: isRepoActive,
    ...queryDefaults,
  })

  useEffect(() => {
    if (commitsQuery.data && Array.isArray(commitsQuery.data) && commitsQuery.data.length > 0)
      setSelectedCommit(commitsQuery.data[0].sha)
    else setSelectedCommit("")
  }, [commitsQuery.data])

  useEffect(() => {
    const runs = runsQuery.data?.workflow_runs
    if (runs && Array.isArray(runs) && runs.length > 0) setSelectedRunId(String(runs[0].id))
    else setSelectedRunId("")
  }, [runsQuery.data])

  const selectedRun = useMemo(() => {
    if (!selectedRunId || !runsQuery.data?.workflow_runs) return null
    return runsQuery.data.workflow_runs.find((r: any) => String(r.id) === selectedRunId) || null
  }, [selectedRunId, runsQuery.data])

  // Check if the right API key is set for the selected model
  const hasRequiredApiKey = useMemo(() => {
    if (isGeminiModel(selectedModel)) return !!getGeminiApiKey()
    if (isClaudeModel(selectedModel)) return !!getAnthropicApiKey()
    return false
  }, [selectedModel])

  // ── Cancel handler ──
  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setAnalyzing(false)
    setAnalysisStep("")
  }

  // ── Pipeline Analysis ──
  const handlePipelineAnalyze = async () => {
    if (!selectedRun || !owner || !repoName) return
    abortRef.current = new AbortController()
    setAnalyzing(true); setResult(null)

    try {
      // Step 1: Fetch jobs
      setAnalysisStep("Fetching workflow jobs and steps...")
      const jobsData = await fetchGitHubWorkflowRunJobs(owner, repoName, selectedRun.id)

      // Step 2: Fetch triggering commit
      setAnalysisStep("Fetching triggering commit details...")
      let commitDetails: any = null
      if (selectedRun.head_sha) {
        try { commitDetails = await fetchGitHubCommitDetails(owner, repoName, selectedRun.head_sha) } catch {}
      }

      // Step 3: Fetch logs from failed jobs
      setAnalysisStep("Fetching pipeline error logs...")
      let errorLogs: string | null = null
      const failedJobs = (jobsData.jobs || []).filter((j: any) => j.conclusion === "failure")
      if (failedJobs.length > 0) {
        const logParts: string[] = []
        for (const job of failedJobs) {
          try {
            setAnalysisStep(`Reading logs for job: ${job.name}...`)
            const log = await fetchGitHubJobLogs(owner, repoName, job.id)
            logParts.push(log)
          } catch (e) {
            console.warn(`Could not fetch logs for job ${job.id}:`, e)
          }
        }
        if (logParts.length > 0) errorLogs = logParts.join("\n\n---\n\n")
      }

      // Step 4: Build context and call AI
      setAnalysisStep("Sending context to AI model for deep analysis...")

      const pipelineCtx: PipelineContext = {
        repoName: selectedRepo,
        workflowName: selectedRun.name || `Run #${selectedRun.run_number}`,
        runNumber: selectedRun.run_number,
        runConclusion: selectedRun.conclusion || selectedRun.status,
        event: selectedRun.event || "unknown",
        branch: selectedRun.head_branch || "unknown",
        actor: selectedRun.actor?.login || "Unknown",
        headSha: selectedRun.head_sha || "",
        runUrl: selectedRun.html_url || "",
        createdAt: selectedRun.created_at || "",
        jobs: (jobsData.jobs || []).map((job: any) => ({
          name: job.name || "Unnamed",
          conclusion: job.conclusion || job.status || "unknown",
          duration: (() => {
            const s = job.started_at ? new Date(job.started_at) : null
            const e = job.completed_at ? new Date(job.completed_at) : null
            return s && e ? Math.round((e.getTime() - s.getTime()) / 1000) : 0
          })(),
          steps: (job.steps || []).map((step: any) => ({
            name: step.name || "Unnamed",
            conclusion: step.conclusion || step.status || "unknown",
            number: step.number || 0,
          }))
        })),
        errorLogs,
        commitMessage: commitDetails?.commit?.message?.split("\n")[0] || null,
        commitAuthor: commitDetails?.commit?.author?.name || commitDetails?.author?.login || null,
        commitFiles: (commitDetails?.files || []).map((f: any) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions || 0,
          deletions: f.deletions || 0,
          patch: f.patch || undefined,
        })),
      }

      const prompt = buildPipelinePrompt(pipelineCtx)

      setAnalysisStep("AI is analyzing — streaming response...")
      setResult("") // Start with empty so the terminal shows the streaming cursor

      await streamAIResponse(
        selectedModel,
        prompt,
        (fullText) => setResult(fullText),
        abortRef.current.signal
      )

    } catch (err: any) {
      if (err.name === "AbortError") {
        // User cancelled
      } else {
        setResult(`# Analysis Failed\n\n\`${err.message}\``)
      }
    } finally {
      setAnalyzing(false); setAnalysisStep("")
    }
  }

  // ── Commit Analysis ──
  const handleCommitAnalyze = async () => {
    if (!selectedCommit || !owner || !repoName) return
    abortRef.current = new AbortController()
    setAnalyzing(true); setResult(null)

    try {
      setAnalysisStep("Fetching commit details and patches...")
      const details = await fetchGitHubCommitDetails(owner, repoName, selectedCommit)

      setAnalysisStep("Sending context to AI model for audit...")

      const commitCtx: CommitContext = {
        repoName: selectedRepo,
        sha: details.sha || selectedCommit,
        author: details.commit?.author?.name || details.author?.login || "Unknown",
        message: details.commit?.message || "No message",
        date: details.commit?.author?.date || "Unknown",
        files: (details.files || []).map((f: any) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions || 0,
          deletions: f.deletions || 0,
          patch: f.patch || undefined,
        })),
      }

      const prompt = buildCommitPrompt(commitCtx)

      setAnalysisStep("AI is analyzing — streaming response...")
      setResult("")

      await streamAIResponse(
        selectedModel,
        prompt,
        (fullText) => setResult(fullText),
        abortRef.current.signal
      )

    } catch (err: any) {
      if (err.name === "AbortError") {
        // User cancelled
      } else {
        setResult(`# Analysis Failed\n\n\`${err.message}\``)
      }
    } finally {
      setAnalyzing(false); setAnalysisStep("")
    }
  }

  // ── No Token Guard ──
  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6 max-w-md mx-auto text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 shadow-md animate-pulse">
          <Key className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">GitHub Token Required</h2>
          <p className="text-muted-foreground text-sm">The AI Assistant needs GitHub access to fetch pipeline logs and commit details.</p>
        </div>
        <Button onClick={() => navigate("/settings")} className="w-full flex items-center justify-center gap-2">
          <Settings className="h-4 w-4" /> Go to Integration Settings <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    )
  }

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AI Assistant</h1>
        <p className="text-muted-foreground">AI-powered pipeline analysis and commit auditing with real-time streaming.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* ─── Parameters Panel ─── */}
        <Card className="md:col-span-1 h-fit border-border/80">
          <CardHeader className="pb-3">
            <CardTitle>Analysis Parameters</CardTitle>
            <CardDescription>Configure AI model and analysis target.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* API Key Settings */}
            <ApiKeySettings />

            {/* Mode Toggle */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Analysis Mode</label>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-secondary/50 border border-border/50">
                <button
                  onClick={() => { setAnalysisMode("pipeline"); setResult(null) }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${
                    analysisMode === "pipeline" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <PlayCircle className="h-3.5 w-3.5" /> Pipeline
                </button>
                <button
                  onClick={() => { setAnalysisMode("commit"); setResult(null) }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${
                    analysisMode === "commit" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <GitCommit className="h-3.5 w-3.5" /> Commit
                </button>
              </div>
            </div>

            {/* Repository */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Repository</label>
              {reposQuery.isLoading ? <Skeleton className="h-9 w-full" /> : reposQuery.error ? (
                <div className="text-xs text-destructive">Failed to load repositories.</div>
              ) : (
                <select value={selectedRepo} onChange={(e) => { setSelectedRepo(e.target.value); setResult(null) }} className={selectClass}>
                  {Array.isArray(reposQuery.data) && reposQuery.data.map((repo: any) => (
                    <option key={repo.id} value={repo.full_name}>{repo.full_name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Mode-specific selector */}
            {analysisMode === "commit" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Target Commit</label>
                {commitsQuery.isLoading ? <Skeleton className="h-9 w-full" /> : commitsQuery.error ? (
                  <div className="text-xs text-destructive">Failed to load commits.</div>
                ) : !commitsQuery.data || commitsQuery.data.length === 0 ? (
                  <select disabled className={`${selectClass} opacity-50`}><option>No commits found</option></select>
                ) : (
                  <select value={selectedCommit} onChange={(e) => { setSelectedCommit(e.target.value); setResult(null) }}
                    className={`${selectClass} text-xs font-mono`}>
                    {commitsQuery.data.map((c: any) => (
                      <option key={c.sha} value={c.sha}>
                        {c.sha.substring(0, 7)} - {(c.commit?.message || "").split("\n")[0].substring(0, 50)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Workflow Run</label>
                {runsQuery.isLoading ? <Skeleton className="h-9 w-full" /> : runsQuery.error ? (
                  <div className="text-xs text-destructive">Failed to load workflow runs.</div>
                ) : !runsQuery.data?.workflow_runs || runsQuery.data.workflow_runs.length === 0 ? (
                  <select disabled className={`${selectClass} opacity-50`}><option>No runs found</option></select>
                ) : (
                  <>
                    <select value={selectedRunId} onChange={(e) => { setSelectedRunId(e.target.value); setResult(null) }}
                      className={`${selectClass} text-xs font-mono`}>
                      {runsQuery.data.workflow_runs.map((run: any) => {
                        const icon = run.conclusion === "success" ? "✅" : run.conclusion === "failure" ? "❌" : run.conclusion === "cancelled" ? "⚪" : "⏳"
                        return (
                          <option key={run.id} value={String(run.id)}>
                            {icon} #{run.run_number} — {run.name || "Run"} ({run.conclusion || run.status})
                          </option>
                        )
                      })}
                    </select>
                    {selectedRun && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border/50 bg-secondary/30 text-xs">
                        {selectedRun.conclusion === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : selectedRun.conclusion === "failure" ? <XCircle className="h-4 w-4 text-destructive" />
                          : <Clock className="h-4 w-4 text-muted-foreground" />}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate">{selectedRun.name}</div>
                          <div className="text-muted-foreground text-[10px]">
                            {selectedRun.event} → {selectedRun.head_branch} • {(selectedRun.head_sha || "").substring(0, 7)}
                          </div>
                        </div>
                        <Badge
                          variant={selectedRun.conclusion === "success" ? "success" : selectedRun.conclusion === "failure" ? "destructive" : "secondary"}
                          className="text-[10px] capitalize"
                        >
                          {selectedRun.conclusion || selectedRun.status}
                        </Badge>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Model */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">AI Model</label>
              <select value={selectedModel} onChange={(e) => { setSelectedModel(e.target.value); setResult(null) }} className={selectClass}>
                <optgroup label="Gemini Models">
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                </optgroup>
                <optgroup label="Claude Models">
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="claude-3-opus">Claude 3 Opus</option>
                  <option value="claude-3-5-haiku">Claude 3.5 Haiku</option>
                </optgroup>
              </select>

              {!hasRequiredApiKey && (
                <div className="text-[11px] text-destructive flex items-center gap-1">
                  <Key className="h-3 w-3" />
                  {isGeminiModel(selectedModel) ? "Gemini" : "Anthropic"} API key required. Set it above.
                </div>
              )}
            </div>

          </CardContent>
          <CardFooter className="flex gap-2">
            {analyzing ? (
              <Button variant="destructive" onClick={handleCancel} className="w-full">
                Stop Analysis
              </Button>
            ) : (
              <Button
                onClick={analysisMode === "commit" ? handleCommitAnalyze : handlePipelineAnalyze}
                disabled={!hasRequiredApiKey || (analysisMode === "commit" ? !selectedCommit : !selectedRunId)}
                className="w-full"
              >
                {analysisMode === "pipeline" ? (
                  <><PlayCircle className="mr-2 h-4 w-4" /> Analyze Pipeline</>
                ) : (
                  <><GitCommit className="mr-2 h-4 w-4" /> Audit Commit</>
                )}
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* ─── Output Terminal ─── */}
        <Card className="md:col-span-2 border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Bot className="h-5 w-5 text-primary" />
              AI Output Terminal
              {analyzing && (
                <Badge variant="secondary" className="text-[10px] animate-pulse">
                  <Sparkles className="h-3 w-3 mr-1 animate-spin" />
                  Streaming...
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={resultContainerRef} className="rounded-md bg-secondary/35 p-5 min-h-[480px] border border-border/60 font-mono text-sm shadow-inner overflow-y-auto max-h-[700px]">
              {!result && !analyzing && (
                <div className="flex h-full items-center justify-center text-muted-foreground opacity-60 flex-col gap-3 pt-24 text-center">
                  <Bot className="h-14 w-14 text-muted-foreground/60 animate-bounce duration-1000" />
                  <div>
                    <p className="font-semibold text-foreground">
                      {analysisMode === "pipeline" ? "Pipeline Analysis Ready" : "Commit Audit Ready"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[320px]">
                      {analysisMode === "pipeline"
                        ? "Select a workflow run. The AI will fetch error logs, analyze the triggering commit, and provide deep root cause analysis with actionable solutions."
                        : "Select a commit. The AI will analyze code patches and provide a security review, impact assessment, and quality analysis."
                      }
                    </p>
                    {!hasRequiredApiKey && (
                      <p className="text-xs text-destructive mt-3 flex items-center justify-center gap-1">
                        <Key className="h-3 w-3" /> Set your {isGeminiModel(selectedModel) ? "Gemini" : "Anthropic"} API key to get started.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {analyzing && !result && (
                <div className="space-y-4 pt-12">
                  <div className="flex items-center gap-2.5 text-primary text-sm font-semibold">
                    <Sparkles className="h-4 w-4 animate-spin" />
                    <span>Connecting to {selectedRepo} ...</span>
                  </div>

                  {analysisMode === "pipeline" ? (
                    <>
                      <div className={`flex items-center gap-2.5 text-xs ${analysisStep.includes("jobs") ? "text-primary font-medium" : "text-muted-foreground"}`}>
                        <PlayCircle className="h-4 w-4" />
                        <span>Fetching workflow jobs and steps ...</span>
                      </div>
                      <div className={`flex items-center gap-2.5 text-xs ${analysisStep.includes("commit") ? "text-primary font-medium" : "text-muted-foreground"}`}>
                        <GitCommit className="h-4 w-4" />
                        <span>Fetching triggering commit details ...</span>
                      </div>
                      <div className={`flex items-center gap-2.5 text-xs ${analysisStep.includes("logs") || analysisStep.includes("Reading") ? "text-primary font-medium" : "text-muted-foreground"}`}>
                        <Terminal className="h-4 w-4" />
                        <span>Fetching pipeline error logs ...</span>
                      </div>
                      <div className={`flex items-center gap-2.5 text-xs ${analysisStep.includes("AI") || analysisStep.includes("Sending") ? "text-primary font-medium" : "text-muted-foreground"}`}>
                        <Bot className="h-4 w-4" />
                        <span>Sending to AI for deep analysis ...</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5 text-muted-foreground text-xs animate-pulse">
                        <GitCommit className="h-4 w-4" />
                        <span>Fetching commit patches ...</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-muted-foreground text-xs animate-pulse">
                        <Bot className="h-4 w-4" />
                        <span>Sending to AI for audit ...</span>
                      </div>
                    </>
                  )}

                  {analysisStep && (
                    <div className="mt-4 p-2 rounded-md bg-background/60 border border-border/40 text-[11px] text-muted-foreground font-mono">
                      → {analysisStep}
                    </div>
                  )}
                </div>
              )}

              {result && (
                <div className="max-w-none text-foreground leading-normal">
                  {renderMarkdown(result)}
                  {analyzing && (
                    <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
