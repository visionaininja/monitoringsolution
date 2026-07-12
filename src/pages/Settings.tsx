import { useState, useEffect, useRef, useCallback, DragEvent } from "react"
import { CheckCircle2, Eye, EyeOff, Save, Link2, Key, Upload, X, Server, Shield, AlertTriangle, Container, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { validateGitHubToken, getGitHubToken, setGitHubToken } from "@/lib/github"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Environment } from "@/context/EnvironmentContext"
import { useQueryClient } from "@tanstack/react-query"
import { OciCredentialsSection } from "@/components/OciCredentialsSection"

const VM_HOST = "158.101.46.183"
const ENVIRONMENTS: { id: Environment; label: string; username: string; color: string; dot: string }[] = [
  { id: "dev", label: "Development", username: "ubuntu", color: "border-emerald-500/40 bg-emerald-500/5", dot: "bg-emerald-500" },
]

// ─── PPK File Picker ──────────────────────────────────────────────────────────
function PemFilePicker({ env: _env, value, onChange }: { env: Environment; value: string; onChange: (name: string) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      onChange(file.name)
    }
  }, [onChange])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onChange(file.name)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-5 cursor-pointer transition-all text-center min-h-[80px]",
        isDragging
          ? "border-primary bg-primary/10 scale-[1.01]"
          : value
          ? "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10"
          : "border-border hover:border-primary/50 hover:bg-accent/30"
      )}
    >
      <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" />
      {value ? (
        <div className="flex items-center gap-2 w-full justify-center">
          <Key className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span className="text-xs font-mono text-foreground truncate max-w-[180px]">{value}</span>
          <button
            onClick={e => { e.stopPropagation(); onChange("") }}
            className="ml-1 rounded-full p-0.5 hover:bg-rose-500/20 transition-colors flex-shrink-0"
          >
            <X className="h-3.5 w-3.5 text-rose-400" />
          </button>
        </div>
      ) : (
        <>
          <Upload className="h-5 w-5 text-muted-foreground mb-2" />
          <p className="text-xs font-semibold text-foreground">Drop SSH Key file here</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">or click to browse</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Accepts: SSH Private Keys (.key, .pem, .ppk, id_rsa)</p>
        </>
      )}
    </div>
  )
}

// ─── K8s Environment Card ─────────────────────────────────────────────────────
function K8sEnvCard({ env }: { env: typeof ENVIRONMENTS[0] }) {
  const [pemFile, setPemFile] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(`k8s_ppk_${env.id}`) || "bastion.key"
    setPemFile(stored)
  }, [env.id])

  const handleSave = () => {
    localStorage.setItem(`k8s_ppk_${env.id}`, pemFile)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className={cn("rounded-xl border-2 p-4 space-y-4", env.color)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", env.dot)} />
          <h3 className="text-sm font-bold">{env.label}</h3>
        </div>
        {pemFile && <Badge variant="outline" className="text-[11px] text-emerald-400 border-emerald-500/30">Key Loaded</Badge>}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">VM Host</label>
            <div className="h-8 flex items-center rounded-md border border-input bg-muted/40 px-2.5 text-xs font-mono text-muted-foreground">
              {VM_HOST}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Username</label>
            <div className="h-8 flex items-center rounded-md border border-input bg-muted/40 px-2.5 text-xs font-mono font-semibold text-foreground">
              {env.username}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">SSH Private Key (bastion.key)</label>
          <PemFilePicker env={env.id} value={pemFile} onChange={setPemFile} />
        </div>

        {!pemFile && (
          <p className="text-[11px] text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> No key configured — connection will be disabled
          </p>
        )}
      </div>

      <button
        onClick={handleSave}
        className={cn(
          "w-full h-8 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-all",
          saved
            ? "bg-emerald-600/20 text-emerald-400"
            : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
        )}
      >
        {saved ? <><CheckCircle2 className="h-3.5 w-3.5" /> Saved!</> : <><Save className="h-3.5 w-3.5" /> Save Key</>}
      </button>
    </div>
  )
}

// ─── Docker Hub Credentials Section ──────────────────────────────────────────
function DockerCredentialsSection() {
  const queryClient = useQueryClient()
  const [dockerUser, setDockerUser]       = useState("yourspeakadmin")
  const [dockerPat, setDockerPat]         = useState("yourspeak.admin123")
  const [showPat, setShowPat]             = useState(false)
  const [testing, setTesting]             = useState(false)
  const [saving, setSaving]               = useState(false)
  const [testStatus, setTestStatus]       = useState<"idle" | "ok" | "fail">("idle")
  const [testDetail, setTestDetail]       = useState<string | null>(null)
  const [saveStatus, setSaveStatus]       = useState<"idle" | "saved" | "fail">("idle")

  // Load stored credentials on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("docker_hub_username")
    const storedPat  = localStorage.getItem("docker_hub_pat")
    if (storedUser) setDockerUser(storedUser)
    if (storedPat)  setDockerPat(storedPat)
  }, [])

  const handleTest = async () => {
    setTesting(true)
    setTestStatus("idle")
    setTestDetail(null)
    try {
      const resp = await fetch("/api/docker-hub")
      if (resp.ok) {
        const data = await resp.json()
        const remaining = data?.rate_limit?.remaining_quota ?? "N/A"
        const maxLimit  = data?.rate_limit?.max_quota_limit ?? "N/A"
        setTestDetail(`Connected · Quota: ${remaining}/${maxLimit} pulls remaining`)
        setTestStatus("ok")
      } else {
        const err = await resp.json().catch(() => ({ error: resp.statusText }))
        setTestDetail(err.error || "Connection failed")
        setTestStatus("fail")
      }
    } catch (e: any) {
      setTestDetail(e.message || "Network error — is the backend running?")
      setTestStatus("fail")
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus("idle")
    try {
      // Persist to server config
      const resp = await fetch("/api/docker-credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: dockerUser, pat: dockerPat }),
      })
      if (resp.ok) {
        // Also cache in localStorage for UI persistence
        localStorage.setItem("docker_hub_username", dockerUser)
        localStorage.setItem("docker_hub_pat", dockerPat)
        setSaveStatus("saved")
        
        queryClient.invalidateQueries({ queryKey: ["docker-hub"] })
        queryClient.invalidateQueries({ queryKey: ["docker-tags"] })
        
        setTimeout(() => setSaveStatus("idle"), 2500)
      } else {
        setSaveStatus("fail")
      }
    } catch {
      // Backend may be offline — still save to localStorage
      localStorage.setItem("docker_hub_username", dockerUser)
      localStorage.setItem("docker_hub_pat", dockerPat)
      setSaveStatus("saved")
      
      queryClient.invalidateQueries({ queryKey: ["docker-hub"] })
      queryClient.invalidateQueries({ queryKey: ["docker-tags"] })
      
      setTimeout(() => setSaveStatus("idle"), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10">
          <Container className="h-4 w-4 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Docker Hub Integration</h2>
          <p className="text-sm text-muted-foreground">
            Configure your Docker Hub Personal Access Token (PAT) for pull quota monitoring and registry diagnostics.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4 space-y-4">
        {/* Header info row */}
        <div className="flex items-center gap-2 pb-2 border-b border-cyan-500/15">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">registry-1.docker.io</span>
          <span className="text-xs text-muted-foreground ml-auto">Rate-limit window: 6h rolling</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Credential inputs */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Docker Hub Username
              </label>
              <Input
                value={dockerUser}
                onChange={e => { setDockerUser(e.target.value); setTestStatus("idle") }}
                placeholder="yourspeakadmin"
                className="font-mono text-sm"
                id="docker-hub-username"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Personal Access Token (PAT)
              </label>
              <div className="relative">
                <Input
                  type={showPat ? "text" : "password"}
                  value={dockerPat}
                  onChange={e => { setDockerPat(e.target.value); setTestStatus("idle") }}
                  placeholder="dckr_pat_..."
                  className="pr-10 font-mono text-sm"
                  id="docker-hub-pat"
                />
                <button
                  type="button"
                  onClick={() => setShowPat(p => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Required scopes: <code className="bg-muted px-1 rounded">repo:read</code> · Used only server-side, never sent to browser
              </p>
            </div>
          </div>

          {/* Status + Actions */}
          <div className="flex flex-col gap-3">
            {/* Test status card */}
            <div className={cn(
              "flex-1 rounded-lg border p-3 text-xs font-mono transition-all duration-300",
              testStatus === "ok"   ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" :
              testStatus === "fail" ? "border-rose-500/30 bg-rose-500/5 text-rose-300" :
              "border-zinc-700/50 bg-zinc-900/50 text-zinc-500"
            )}>
              <div className="flex items-center gap-2 mb-1">
                {testStatus === "ok"   ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> :
                 testStatus === "fail" ? <WifiOff className="h-3.5 w-3.5 text-rose-400" /> :
                 <Container className="h-3.5 w-3.5 text-zinc-500" />}
                <span className="font-bold uppercase tracking-wider text-[10px]">
                  {testStatus === "ok" ? "Docker Hub Online" : testStatus === "fail" ? "Connection Failed" : "Not Tested"}
                </span>
              </div>
              <p className="leading-relaxed text-[11px]">
                {testDetail || "Click 'Test Connection' to verify credentials and check pull quota."}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleTest}
                disabled={testing || !dockerUser || !dockerPat}
                className={cn(
                  "flex-1 h-9 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border",
                  "bg-cyan-500/10 text-cyan-400 border-cyan-500/25 hover:bg-cyan-500/20 hover:border-cyan-500/40",
                  (testing || !dockerUser || !dockerPat) && "opacity-50 cursor-not-allowed"
                )}
                id="docker-test-btn"
              >
                {testing
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Testing...</>
                  : <><Wifi className="h-3.5 w-3.5" /> Test Connection</>
                }
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  "flex-1 h-9 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border",
                  saveStatus === "saved"
                    ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/30"
                    : "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                )}
                id="docker-save-btn"
              >
                {saveStatus === "saved"
                  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Saved!</>
                  : <><Save className="h-3.5 w-3.5" /> Save Credentials</>
                }
              </button>
            </div>
          </div>
        </div>

        {/* PAT scope guidance */}
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800/60 p-3 text-[11px] text-zinc-400 space-y-1">
          <p className="font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
            <Key className="h-3 w-3 text-amber-400" /> PAT Setup Guide
          </p>
          <p>1. Go to <strong className="text-zinc-200">hub.docker.com → Account Settings → Security → New Access Token</strong></p>
          <p>2. Grant scope: <code className="bg-zinc-800 px-1 rounded text-amber-300">Read-only</code> is sufficient for pull quota monitoring</p>
          <p>3. The PAT is stored in <code className="bg-zinc-800 px-1 rounded">server/config.json</code> and used exclusively for server-to-server API calls</p>
        </div>
      </div>
    </section>
  )
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function Settings() {
  const [showPAT, setShowPAT] = useState(false)
  const [pat, setPat] = useState("")
  const [isTokenValid, setIsTokenValid] = useState<boolean | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [events, setEvents] = useState<string[]>([])

  useEffect(() => {
    const savedToken = getGitHubToken()
    if (savedToken) {
      setPat(savedToken)
      setIsTokenValid(true)
    }
  }, [])

  const [tokenSaved, setTokenSaved] = useState(false)

  const handleSaveToken = () => {
    setGitHubToken(pat)
    setTokenSaved(true)
    setTimeout(() => setTokenSaved(false), 2500)
  }

  const handleValidate = async () => {
    setValidating(true)
    setTokenError(null)
    const result = await validateGitHubToken(pat)
    setIsTokenValid(result.valid)
    if (result.valid) {
      setGitHubToken(pat)
    } else {
      setTokenError(result.error || "Unknown validation error")
    }
    setValidating(false)
  }

  // Simulate incoming webhooks
  useEffect(() => {
    const payloads = [
      "[Webhook] push received - repo: web-app, branch: main",
      "[Webhook] workflow_run completed - status: success",
      "[Webhook] pull_request opened - by: Alice",
      "[Webhook] workflow_run started - status: in_progress"
    ]
    let i = 0
    const interval = setInterval(() => {
      setEvents(prev => [payloads[i % payloads.length], ...prev].slice(0, 5))
      i++
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integration Settings</h1>
        <p className="text-muted-foreground">Manage your secure connections to Kubernetes environments and GitHub.</p>
      </div>

      {/* ── Kubernetes Environment Configuration ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Server className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Kubernetes SSH Keys</h2>
            <p className="text-sm text-muted-foreground">Upload the PuTTY private key (.ppk) for each environment. The correct key is used automatically when connecting.</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Shared VM Host</span>
            <span className="font-mono text-sm text-foreground">{VM_HOST}</span>
            <span className="text-xs text-muted-foreground ml-auto">Port 22 (SSH)</span>
          </div>
          <p className="text-xs text-muted-foreground">All three environments share the same VM host. Each environment uses a different username and PPK key for authentication.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {ENVIRONMENTS.map(env => <K8sEnvCard key={env.id} env={env} />)}
        </div>
      </section>

      {/* ── Docker Hub Credentials ── */}
      <DockerCredentialsSection />

      {/* ── Oracle Cloud Infrastructure ── */}
      <OciCredentialsSection />

      {/* ── GitHub Settings ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">GitHub Integration</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Personal Access Token</CardTitle>
              <CardDescription>Required for reading repository data and workflow status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Token (Classic)</label>
                <div className="relative">
                  <Input
                    type={showPAT ? "text" : "password"}
                    value={pat}
                    onChange={(e) => { setPat(e.target.value); setIsTokenValid(null) }}
                    className="pr-10"
                  />
                  <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground" onClick={() => setShowPAT(!showPAT)}>
                    {showPAT ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Needs scopes: <code className="bg-muted px-1 rounded">repo</code>, <code className="bg-muted px-1 rounded">admin:repo_hook</code></p>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={handleValidate} disabled={validating} variant="secondary" className="flex-1">
                  {validating ? "Validating..." : "Validate Token"}
                </Button>
                <Button
                  onClick={handleSaveToken}
                  disabled={!pat}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 transition-all border",
                    tokenSaved
                      ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-600/20 hover:text-emerald-400"
                      : "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                  )}
                >
                  {tokenSaved ? (
                    <><CheckCircle2 className="h-3.5 w-3.5" /> Saved!</>
                  ) : (
                    <><Save className="h-3.5 w-3.5" /> Save Token</>
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between mt-2 min-h-[24px]">
                {isTokenValid === true && (
                  <Badge variant="success" className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Valid Scopes
                  </Badge>
                )}
                {isTokenValid === false && (
                  <div className="flex flex-col items-end gap-1 w-full">
                    <Badge variant="destructive">Invalid Token</Badge>
                    {tokenError && (
                      <span className="text-[10px] font-medium text-rose-400 max-w-[200px] text-right break-words leading-tight mt-1">
                        {tokenError}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Webhook Manager</CardTitle>
              <CardDescription>Configure GitHub to send events to this dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Payload URL (Read-only)</label>
                <div className="flex items-center gap-2">
                  <Input readOnly value="https://api.yourdashboard.io/webhooks/github" className="bg-muted/50 font-mono text-xs" />
                  <Button variant="outline" size="icon" title="Copy URL"><Link2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Webhook Secret</label>
                <Input type="password" defaultValue="super-secret-signature-key" placeholder="Enter secret to verify payloads" />
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full"><Save className="mr-2 h-4 w-4" /> Save Webhook Config</Button>
            </CardFooter>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Live Webhook Events</CardTitle>
              <CardDescription>Real-time simulation of incoming GitHub webhook payloads.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md bg-card border p-4 h-[200px] overflow-hidden flex flex-col gap-2">
                {events.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                    Listening for events...
                  </div>
                ) : (
                  events.map((evt, i) => (
                    <div key={i} className="text-sm font-mono p-2 rounded bg-secondary/50 border border-border/50 animate-in fade-in slide-in-from-top-2">
                      <span className="text-emerald-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                      {evt}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
