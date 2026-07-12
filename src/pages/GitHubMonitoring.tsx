import { useState, useEffect, useMemo } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { 
  GitBranch, 
  PlayCircle, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  GitPullRequest,
  ShieldAlert,
  Clock,
  User,
  ExternalLink,
  RefreshCw,
  Search,
  Key,
  ChevronRight,
  Settings,
  AlertCircle,
  ShieldCheck,
  Code2
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  getGitHubToken, 
  fetchGitHubRepos, 
  fetchGitHubBranchesWithAuthors,
  fetchGitHubPullRequests, 
  fetchGitHubWorkflows, 
  fetchGitHubWorkflowRuns, 
  fetchGitHubCommits, 
  fetchGitHubVulnerabilities,
  fetchGitHubContributors,
  fetchGitHubCollaborators
} from "@/lib/github"

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (isNaN(diffInSeconds)) return "unknown time";
  if (diffInSeconds < 0) return "just now";
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
};

const formatDuration = (startedAt: string, updatedAt: string) => {
  const start = new Date(startedAt);
  const end = new Date(updatedAt);
  const diffInMs = end.getTime() - start.getTime();
  if (isNaN(diffInMs) || diffInMs < 0) return "N/A";
  const diffInSecs = Math.floor(diffInMs / 1000);
  if (diffInSecs < 60) return `${diffInSecs}s`;
  const mins = Math.floor(diffInSecs / 60);
  const secs = diffInSecs % 60;
  return `${mins}m ${secs}s`;
};

type TabType = "activities";
type SubTabType = "commits" | "prs" | "workflows" | "branches" | "vulnerabilities";

const PAGE_SIZE = 15;

// ─── Pagination helpers ─────────────────────────────────────────────────────────────────────
function PaginationBar({ page, totalItems, onPageChange }: {
  page: number;
  totalItems: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  if (totalItems === 0) return null;

  // Build range labels: "1-15", "16-30", ...
  const rangeOptions: { label: string; page: number }[] = [];
  for (let i = 0; i < totalPages; i++) {
    const start = i * PAGE_SIZE + 1;
    const end = Math.min((i + 1) * PAGE_SIZE, totalItems);
    rangeOptions.push({ label: `${start}-${end}`, page: i + 1 });
  }

  const currentStart = (page - 1) * PAGE_SIZE + 1;
  const currentEnd = Math.min(page * PAGE_SIZE, totalItems);

  return (
    <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
      <span className="text-xs text-muted-foreground font-mono">
        Showing <span className="font-semibold text-foreground">{currentStart}–{currentEnd}</span> of{" "}
        <span className="font-semibold text-foreground">{totalItems}</span> items
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="h-7 px-2.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >← Prev</button>
        <select
          value={page}
          onChange={(e) => onPageChange(Number(e.target.value))}
          className="h-7 px-2 rounded-md border border-border bg-card text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
        >
          {rangeOptions.map(opt => (
            <option key={opt.page} value={opt.page}>{opt.label}</option>
          ))}
        </select>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="h-7 px-2.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >Next →</button>
      </div>
    </div>
  );
}

export default function GitHubMonitoring() {
  const navigate = useNavigate()
  const token = getGitHubToken()

  const [selectedRepo, setSelectedRepo] = useState<string>("")
  const [activeTab, setActiveTab] = useState<TabType>("activities")
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>("commits")
  const [selectedAuthor, setSelectedAuthor] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [isAuthorDropdownOpen, setIsAuthorDropdownOpen] = useState<boolean>(false)
  const [authorSearchInput, setAuthorSearchInput] = useState<string>("")

  // ── Pagination state (1-indexed) ─────────────────────────────────────────────────────────────
  const [activitiesPage, setActivitiesPage] = useState(1)
  const [prsPage, setPrsPage] = useState(1)
  const [runsPage, setRunsPage] = useState(1)
  const [branchesPage, setBranchesPage] = useState(1)
  const [vulnsPage, setVulnsPage] = useState(1)

  // Shared query options — stale data stays cached for 5 seconds;
  // placeholderData shows previous data instantly while refreshing (no blank flash)
  const queryDefaults = {
    staleTime: 5000,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  }

  // Fetch all user repositories
  const reposQuery = useQuery({
    queryKey: ["github-repos"],
    queryFn: fetchGitHubRepos,
    enabled: !!token,
    ...queryDefaults,
  })

  // Determine owner & repo name from selectedRepo full name (e.g. "owner/repo")
  const { owner, repoName } = useMemo(() => {
    if (!selectedRepo) return { owner: "", repoName: "" }
    const parts = selectedRepo.split("/")
    return { owner: parts[0] || "", repoName: parts[1] || "" }
  }, [selectedRepo])

  // Set the default selected repository once repos are loaded
  useEffect(() => {
    if (reposQuery.data && Array.isArray(reposQuery.data) && reposQuery.data.length > 0 && !selectedRepo) {
      // Find default repository or fallback to first
      setSelectedRepo(reposQuery.data[0].full_name)
    }
  }, [reposQuery.data, selectedRepo])

  // Close author dropdown when clicking outside
  useEffect(() => {
    if (!isAuthorDropdownOpen) return
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest(".author-select-container")) {
        setIsAuthorDropdownOpen(false)
      }
    }
    document.addEventListener("click", handleOutsideClick)
    return () => document.removeEventListener("click", handleOutsideClick)
  }, [isAuthorDropdownOpen])

  const isRepoActive = !!token && !!owner && !!repoName

  // ── Core queries (always load — needed for summary cards & author list) ──
  const branchesQuery = useQuery({
    queryKey: ["github-branches", owner, repoName],
    queryFn: () => fetchGitHubBranchesWithAuthors(owner, repoName),
    enabled: isRepoActive,
    ...queryDefaults,
  })

  const commitsQuery = useQuery({
    queryKey: ["github-commits", owner, repoName],
    queryFn: () => fetchGitHubCommits(owner, repoName),
    enabled: isRepoActive,
    ...queryDefaults,
  })

  const prsQuery = useQuery({
    queryKey: ["github-prs", owner, repoName],
    queryFn: () => fetchGitHubPullRequests(owner, repoName),
    enabled: isRepoActive,
    ...queryDefaults,
  })

  const workflowsQuery = useQuery({
    queryKey: ["github-workflows", owner, repoName],
    queryFn: () => fetchGitHubWorkflows(owner, repoName),
    enabled: isRepoActive,
    ...queryDefaults,
  })

  const runsQuery = useQuery({
    queryKey: ["github-runs", owner, repoName],
    queryFn: () => fetchGitHubWorkflowRuns(owner, repoName),
    enabled: isRepoActive,
    ...queryDefaults,
  })

  const vulnsQuery = useQuery({
    queryKey: ["github-vulns", owner, repoName],
    queryFn: () => fetchGitHubVulnerabilities(owner, repoName),
    enabled: isRepoActive,
    ...queryDefaults,
  })

  const contributorsQuery = useQuery({
    queryKey: ["github-contributors", owner, repoName],
    queryFn: () => fetchGitHubContributors(owner, repoName),
    enabled: isRepoActive,
    ...queryDefaults,
  })

  const collaboratorsQuery = useQuery({
    queryKey: ["github-collaborators", owner, repoName],
    queryFn: () => fetchGitHubCollaborators(owner, repoName),
    enabled: isRepoActive,
    ...queryDefaults,
  })

  // Extract unique authors list from collaborators API, contributors API and activity logs
  const authorsList = useMemo(() => {
    const authorsMap = new Map<string, { login: string; avatarUrl?: string; name: string }>()

    // 1. Add from Collaborators API
    if (collaboratorsQuery.data && Array.isArray(collaboratorsQuery.data)) {
      collaboratorsQuery.data.forEach((item: any) => {
        const login = item.login
        if (login) {
          authorsMap.set(login.toLowerCase(), {
            login,
            name: login,
            avatarUrl: item.avatar_url
          })
        }
      })
    }

    // 2. Add from Contributors API
    if (contributorsQuery.data && Array.isArray(contributorsQuery.data)) {
      contributorsQuery.data.forEach((item: any) => {
        const login = item.login
        if (login) {
          const key = login.toLowerCase()
          const existing = authorsMap.get(key)
          authorsMap.set(key, {
            login: existing?.login || login,
            name: existing?.name || login,
            avatarUrl: existing?.avatarUrl || item.avatar_url
          })
        }
      })
    }

    // 3. Add from Commits API (to catch names and local committers)
    if (commitsQuery.data && Array.isArray(commitsQuery.data)) {
      commitsQuery.data.forEach((item: any) => {
        const login = item.author?.login || item.commit?.author?.name || "Unknown Author"
        const name = item.commit?.author?.name || item.author?.login || "Unknown"
        const avatarUrl = item.author?.avatar_url
        const key = login.toLowerCase()
        if (login) {
          const existing = authorsMap.get(key)
          authorsMap.set(key, {
            login: existing?.login || login,
            name: name !== login ? name : (existing?.name || name),
            avatarUrl: existing?.avatarUrl || avatarUrl
          })
        }
      })
    }

    // 4. Add from Pull Requests API
    if (prsQuery.data && Array.isArray(prsQuery.data)) {
      prsQuery.data.forEach((pr: any) => {
        const login = pr.user?.login
        const avatarUrl = pr.user?.avatar_url
        if (login) {
          const key = login.toLowerCase()
          const existing = authorsMap.get(key)
          authorsMap.set(key, {
            login: existing?.login || login,
            name: existing?.name || login,
            avatarUrl: existing?.avatarUrl || avatarUrl
          })
        }
      })
    }

    // 5. Add from Workflow Runs API
    if (runsQuery.data?.workflow_runs && Array.isArray(runsQuery.data.workflow_runs)) {
      runsQuery.data.workflow_runs.forEach((run: any) => {
        const login = run.actor?.login
        const avatarUrl = run.actor?.avatar_url
        if (login) {
          const key = login.toLowerCase()
          const existing = authorsMap.get(key)
          authorsMap.set(key, {
            login: existing?.login || login,
            name: existing?.name || login,
            avatarUrl: existing?.avatarUrl || avatarUrl
          })
        }
      })
    }

    return Array.from(authorsMap.values())
  }, [collaboratorsQuery.data, contributorsQuery.data, commitsQuery.data, prsQuery.data, runsQuery.data])

  // Filter unique authors list by search term
  const filteredAuthors = useMemo(() => {
    if (!authorsList) return []
    return authorsList.filter(a => 
      a.login.toLowerCase().includes(authorSearchInput.toLowerCase()) ||
      a.name.toLowerCase().includes(authorSearchInput.toLowerCase())
    )
  }, [authorsList, authorSearchInput])

  // Aggregate author stats (commits, pull requests, runs, latest commits)
  const authorsStatsList = useMemo(() => {
    if (!authorsList) return []
    return authorsList.map(author => {
      // Commits count
      const authorCommits = (commitsQuery.data || []).filter((c: any) => {
        const login = c.author?.login || c.commit?.author?.name || ""
        return login.toLowerCase() === author.login.toLowerCase()
      })
      
      // Pull Requests count
      const authorPRs = (prsQuery.data || []).filter((pr: any) => {
        return (pr.user?.login || "").toLowerCase() === author.login.toLowerCase()
      })

      // Workflow Runs count
      const authorRuns = (runsQuery.data?.workflow_runs || []).filter((run: any) => {
        return (run.actor?.login || "").toLowerCase() === author.login.toLowerCase()
      })

      // Latest Activity
      const latestCommit = authorCommits[0]

      return {
        ...author,
        commitsCount: authorCommits.length,
        prsCount: authorPRs.length,
        runsCount: authorRuns.length,
        latestActivity: latestCommit ? {
          message: latestCommit.commit?.message?.split("\n")[0] || "",
          date: latestCommit.commit?.author?.date || ""
        } : null
      }
    })
  }, [authorsList, commitsQuery.data, prsQuery.data, runsQuery.data])

  // Filter authors stats by search text (reusing global searchQuery)
  const filteredAuthorsStats = useMemo(() => {
    if (!authorsStatsList) return []
    if (!searchQuery) return authorsStatsList
    const q = searchQuery.toLowerCase()
    return authorsStatsList.filter(author => 
      author.login.toLowerCase().includes(q) ||
      (author.name || "").toLowerCase().includes(q)
    )
  }, [authorsStatsList, searchQuery])

  // Filter activities / commits
  const filteredCommits = useMemo(() => {
    if (!commitsQuery.data || !Array.isArray(commitsQuery.data)) return []
    let result = commitsQuery.data

    if (selectedAuthor) {
      // Find all known aliases for the selected author (login + git name)
      const authorEntry = authorsList.find(
        a => a.login.toLowerCase() === selectedAuthor.toLowerCase()
      )
      const aliases = new Set<string>(
        [selectedAuthor, authorEntry?.name, authorEntry?.login]
          .filter(Boolean)
          .map(s => s!.toLowerCase())
      )
      result = result.filter((c: any) => {
        const login = (c.author?.login || "").toLowerCase()
        const name = (c.commit?.author?.name || "").toLowerCase()
        return aliases.has(login) || aliases.has(name)
      })
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((c: any) => 
        (c.commit?.message || "").toLowerCase().includes(q) ||
        (c.sha || "").toLowerCase().includes(q)
      )
    }

    return result
  }, [commitsQuery.data, selectedAuthor, searchQuery, authorsList])

  // Filter PRs
  const filteredPRs = useMemo(() => {
    if (!prsQuery.data || !Array.isArray(prsQuery.data)) return []
    let result = prsQuery.data

    if (selectedAuthor) {
      const authorEntry = authorsList.find(
        a => a.login.toLowerCase() === selectedAuthor.toLowerCase()
      )
      const aliases = new Set<string>(
        [selectedAuthor, authorEntry?.name, authorEntry?.login]
          .filter(Boolean)
          .map(s => s!.toLowerCase())
      )
      result = result.filter((pr: any) => 
        aliases.has((pr.user?.login || "").toLowerCase())
      )
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((pr: any) => 
        String(pr.number).includes(q) ||
        (pr.title || "").toLowerCase().includes(q) ||
        (pr.user?.login || "").toLowerCase().includes(q)
      )
    }
    return result
  }, [prsQuery.data, selectedAuthor, searchQuery, authorsList])

  // Filter workflow runs
  const filteredRuns = useMemo(() => {
    if (!runsQuery.data?.workflow_runs || !Array.isArray(runsQuery.data.workflow_runs)) return []
    let result = runsQuery.data.workflow_runs

    if (selectedAuthor) {
      const authorEntry = authorsList.find(
        a => a.login.toLowerCase() === selectedAuthor.toLowerCase()
      )
      const aliases = new Set<string>(
        [selectedAuthor, authorEntry?.name, authorEntry?.login]
          .filter(Boolean)
          .map(s => s!.toLowerCase())
      )
      result = result.filter((run: any) => 
        aliases.has((run.actor?.login || "").toLowerCase())
      )
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((run: any) => 
        (run.name || "").toLowerCase().includes(q) ||
        (run.head_branch || "").toLowerCase().includes(q) ||
        (run.conclusion || "").toLowerCase().includes(q)
      )
    }
    return result
  }, [runsQuery.data, selectedAuthor, searchQuery, authorsList])

  // Build branch-author map from enriched branch data (headAuthorLogin / headAuthorName)
  const branchAuthorMap = useMemo(() => {
    const map = new Map<string, { login: string; name: string }>()
    if (branchesQuery.data && Array.isArray(branchesQuery.data)) {
      branchesQuery.data.forEach((b: any) => {
        const sha = b.commit?.sha
        if (sha) {
          map.set(sha, {
            login: b.headAuthorLogin || "",
            name: b.headAuthorName || "",
          })
        }
      })
    }
    return map
  }, [branchesQuery.data])

  // Filter branches
  const filteredBranches = useMemo(() => {
    if (!branchesQuery.data || !Array.isArray(branchesQuery.data)) return []
    let result = branchesQuery.data

    if (selectedAuthor) {
      const authorEntry = authorsList.find(
        a => a.login.toLowerCase() === selectedAuthor.toLowerCase()
      )
      const aliases = new Set<string>(
        [selectedAuthor, authorEntry?.name, authorEntry?.login]
          .filter(Boolean)
          .map(s => s!.toLowerCase())
      )
      result = result.filter((b: any) => {
        const authorInfo = branchAuthorMap.get(b.commit?.sha)
        if (!authorInfo) return false
        return (
          aliases.has(authorInfo.login.toLowerCase()) ||
          aliases.has(authorInfo.name.toLowerCase())
        )
      })
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((b: any) => 
        (b.name || "").toLowerCase().includes(q) ||
        (b.commit?.sha || "").toLowerCase().includes(q)
      )
    }

    return result
  }, [branchesQuery.data, selectedAuthor, searchQuery, branchAuthorMap, authorsList])

  // Filter vulnerabilities by selectedAuthor
  const filteredVulns = useMemo(() => {
    if (!vulnsQuery.data?.alerts) return []
    let result = vulnsQuery.data.alerts

    if (selectedAuthor) {
      const authorEntry = authorsList.find(
        a => a.login.toLowerCase() === selectedAuthor.toLowerCase()
      )
      const aliases = new Set<string>(
        [selectedAuthor, authorEntry?.name, authorEntry?.login]
          .filter(Boolean)
          .map(s => s!.toLowerCase())
      )

      result = result.filter((alert: any) => {
        // 1. Check if the author is listed under manifestAuthors (who touched the manifest file)
        const manifestAuthors = alert.manifestAuthors || []
        const hasManifestMatch = manifestAuthors.some((auth: string) => aliases.has(auth.toLowerCase()))
        if (hasManifestMatch) return true

        // Heuristics:
        // 2. Check if the author has commits containing package name
        const packageName = (alert.dependency?.package?.name || "").toLowerCase()
        const manifestPath = (alert.dependency?.manifest_path || "").toLowerCase()

        const hasMatchingCommit = filteredCommits.some((c: any) => {
          const msg = (c.commit?.message || "").toLowerCase()
          return msg.includes(packageName) || msg.includes(manifestPath)
        })
        if (hasMatchingCommit) return true

        // 3. Check if the author has PRs containing package name
        const hasMatchingPR = filteredPRs.some((pr: any) => {
          const title = (pr.title || "").toLowerCase()
          const body = (pr.body || "").toLowerCase()
          return title.includes(packageName) || body.includes(packageName) || title.includes(manifestPath)
        })
        return hasMatchingPR
      })
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((alert: any) => 
        (alert.dependency?.package?.name || "").toLowerCase().includes(q) ||
        (alert.security_advisory?.summary || "").toLowerCase().includes(q) ||
        (alert.security_advisory?.cve_id || "").toLowerCase().includes(q) ||
        (alert.security_advisory?.ghsa_id || "").toLowerCase().includes(q)
      )
    }

    return result
  }, [vulnsQuery.data, selectedAuthor, searchQuery, filteredCommits, filteredPRs, authorsList])

  // Reset pages when filters change
  useEffect(() => { setActivitiesPage(1) }, [filteredCommits])
  useEffect(() => { setPrsPage(1) }, [filteredPRs])
  useEffect(() => { setRunsPage(1) }, [filteredRuns])
  useEffect(() => { setBranchesPage(1) }, [filteredBranches])
  useEffect(() => { setVulnsPage(1) }, [filteredVulns])

  // Paginated slices
  const pagedCommits = filteredCommits.slice((activitiesPage - 1) * PAGE_SIZE, activitiesPage * PAGE_SIZE)
  const pagedPRs = filteredPRs.slice((prsPage - 1) * PAGE_SIZE, prsPage * PAGE_SIZE)
  const pagedRuns = filteredRuns.slice((runsPage - 1) * PAGE_SIZE, runsPage * PAGE_SIZE)
  const pagedBranches = filteredBranches.slice((branchesPage - 1) * PAGE_SIZE, branchesPage * PAGE_SIZE)
  const pagedVulns = filteredVulns.slice((vulnsPage - 1) * PAGE_SIZE, vulnsPage * PAGE_SIZE)

  // Count open alerts among filtered vulnerabilities
  const activeAlerts = useMemo(() => {
    return filteredVulns.filter((alert: any) => alert.state === "open")
  }, [filteredVulns])

  // Severity statistics
  const vulnStats = useMemo(() => {
    const stats = { critical: 0, high: 0, medium: 0, low: 0 }
    if (!activeAlerts) return stats
    activeAlerts.forEach((alert: any) => {
      const sev = alert.security_advisory?.severity?.toLowerCase()
      if (sev === "critical") stats.critical++
      else if (sev === "high") stats.high++
      else if (sev === "medium") stats.medium++
      else if (sev === "low") stats.low++
    })
    return stats
  }, [activeAlerts])

  // If no token is configured
  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6 max-w-md mx-auto text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 shadow-md">
          <Key className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">GitHub Token Required</h2>
          <p className="text-muted-foreground text-sm">
            To query repositories, pull requests, actions, security alerts and branches, please supply a GitHub Personal Access Token (PAT).
          </p>
        </div>
        <Button onClick={() => navigate("/settings")} className="w-full flex items-center justify-center gap-2">
          <Settings className="h-4 w-4" /> Go to Integration Settings <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">GitHub Monitoring</h1>
          <p className="text-muted-foreground">Monitor commits, pull requests, branches, workflows and vulnerabilities.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {reposQuery.isLoading ? (
            <Skeleton className="h-10 w-[200px]" />
          ) : reposQuery.error ? (
            <Badge variant="destructive" className="py-1 px-3">Repo fetch failed</Badge>
          ) : (
            <select
              value={selectedRepo}
              onChange={(e) => {
                setSelectedRepo(e.target.value)
                setSelectedAuthor("")
                setSearchQuery("")
              }}
              className="bg-card hover:bg-accent/40 transition-colors border border-border text-foreground rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-w-[220px]"
            >
              {Array.isArray(reposQuery.data) && reposQuery.data.map((repo: any) => (
                <option key={repo.id} value={repo.full_name}>
                  {repo.full_name}
                </option>
              ))}
            </select>
          )}

        </div>
      </div>

      {/* Overview stats cards grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Branches Summary Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Branches</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {branchesQuery.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : branchesQuery.error ? (
              <span className="text-xs text-destructive">Error</span>
            ) : (
              <div className="text-2xl font-bold">
                {branchesQuery.data?.length || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Configured branches in repository</p>
          </CardContent>
        </Card>

        {/* PRs Summary Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pull Requests</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {prsQuery.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : prsQuery.error ? (
              <span className="text-xs text-destructive">Error</span>
            ) : (
              <div className="text-2xl font-bold flex items-baseline gap-2">
                <span>{prsQuery.data?.filter((p: any) => p.state === "open").length || 0} Open</span>
                <span className="text-xs font-normal text-muted-foreground">/ {prsQuery.data?.length || 0} Total</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Open vs overall pull requests</p>
          </CardContent>
        </Card>

        {/* Workflows Runs Summary Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Action Workflows</CardTitle>
            <PlayCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {workflowsQuery.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : workflowsQuery.error ? (
              <span className="text-xs text-destructive">Error</span>
            ) : (
              <div className="text-2xl font-bold">
                {workflowsQuery.data?.workflows?.length || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Actions workflows configured</p>
          </CardContent>
        </Card>

        {/* Vulnerabilities Summary Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vulnerabilities</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {vulnsQuery.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : vulnsQuery.error ? (
              <span className="text-xs text-destructive">Error</span>
            ) : (
              <div className="text-2xl font-bold flex items-baseline gap-2">
                <span className={activeAlerts.length > 0 ? "text-amber-500" : "text-emerald-500"}>
                  {activeAlerts.length} Active
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Dependabot alerts detected</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-border gap-1 overflow-x-auto">
        <button
          onClick={() => {
            setActiveTab("activities")
            setSearchQuery("")
          }}
          className="pb-3 px-1 text-sm font-semibold border-b-2 transition-none capitalize whitespace-nowrap border-primary text-primary"
        >
          Activities
        </button>
      </div>

      {/* TAB CONTENT CARDS */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Activities</CardTitle>
              <CardDescription>
                Recent commits, pull requests, workflow runs, branches and security vulnerabilities for the repository.
              </CardDescription>
            </div>

            {/* General Filter / Search Input */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="author-select-container relative">
                <button
                  type="button"
                  onClick={() => setIsAuthorDropdownOpen(!isAuthorDropdownOpen)}
                  className="flex items-center gap-2 bg-background border border-border text-foreground rounded-md px-3 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary min-w-[160px] justify-between transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const selectedProfile = authorsList.find(a => a.login.toLowerCase() === selectedAuthor.toLowerCase());
                      return selectedProfile?.avatarUrl ? (
                        <img src={selectedProfile.avatarUrl} alt={selectedAuthor} className="h-4 w-4 rounded-full" />
                      ) : (
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      );
                    })()}
                    <span className="truncate max-w-[100px]">{selectedAuthor ? selectedAuthor : "All Authors"}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground ml-1">▼</span>
                </button>

                {isAuthorDropdownOpen && (
                  <div className="absolute right-0 mt-1.5 z-50 w-56 rounded-md border border-border bg-card p-2 shadow-md animate-in fade-in duration-100">
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-2.5 h-3 w-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search author..."
                        value={authorSearchInput}
                        onChange={(e) => setAuthorSearchInput(e.target.value)}
                        className="w-full bg-background border border-border rounded-md pl-7 pr-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAuthor("")
                          setIsAuthorDropdownOpen(false)
                          setAuthorSearchInput("")
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors hover:bg-accent flex items-center gap-2 ${!selectedAuthor ? 'bg-primary/15 text-primary font-semibold' : 'text-foreground'}`}
                      >
                        <User className="h-3.5 w-3.5" />
                        <span>All Authors</span>
                      </button>
                      {filteredAuthors.map((author) => (
                        <button
                          key={author.login}
                          type="button"
                          onClick={() => {
                            setSelectedAuthor(author.login)
                            setIsAuthorDropdownOpen(false)
                            setAuthorSearchInput("")
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center gap-2 transition-colors hover:bg-accent ${selectedAuthor.toLowerCase() === author.login.toLowerCase() ? 'bg-primary/15 text-primary font-semibold' : 'text-foreground'}`}
                        >
                          {author.avatarUrl ? (
                            <img src={author.avatarUrl} alt={author.login} className="h-4 w-4 rounded-full" />
                          ) : (
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <div className="truncate flex-1">
                            <span className="font-medium">{author.login}</span>
                            {author.name && author.name !== author.login && (
                              <span className="text-[10px] text-muted-foreground ml-1">({author.name})</span>
                            )}
                          </div>
                        </button>
                      ))}
                      {filteredAuthors.length === 0 && (
                        <div className="text-[10px] text-muted-foreground p-3 text-center">No authors found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search commits, PRs, branches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs min-w-[200px]"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Focused View profile card when author is selected */}
          {selectedAuthor && (
            <div className="mb-5 p-4 rounded-xl border border-primary/25 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-3">
                {(() => {
                  const aut = authorsList.find(a => a.login.toLowerCase() === selectedAuthor.toLowerCase());
                  return aut?.avatarUrl ? (
                    <img src={aut.avatarUrl} alt={selectedAuthor} className="h-10 w-10 rounded-full border border-primary/30 shadow-md ring-2 ring-primary/10" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 shadow-md">
                      <User className="h-5 w-5" />
                    </div>
                  );
                })()}
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    Focused View: {selectedAuthor}
                    <Badge variant="success" className="h-5 py-0 px-2 font-normal text-[10px]">Active Filter</Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Filtered workspace showing all activities, commits, PRs, runs, and branches associated with this user.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div className="flex items-center gap-4 bg-background/50 border border-border/60 rounded-lg py-1 px-3">
                  <div className="text-center">
                    <span className="font-semibold text-foreground">{filteredCommits.length}</span>
                    <span className="text-[10px] text-muted-foreground block">Commits</span>
                  </div>
                  <div className="h-6 w-px bg-border/60" />
                  <div className="text-center">
                    <span className="font-semibold text-foreground">{filteredPRs.length}</span>
                    <span className="text-[10px] text-muted-foreground block">PRs</span>
                  </div>
                  <div className="h-6 w-px bg-border/60" />
                  <div className="text-center">
                    <span className="font-semibold text-foreground">{filteredRuns.length}</span>
                    <span className="text-[10px] text-muted-foreground block">Runs</span>
                  </div>
                  <div className="h-6 w-px bg-border/60" />
                  <div className="text-center">
                    <span className="font-semibold text-foreground">{filteredBranches.length}</span>
                    <span className="text-[10px] text-muted-foreground block">Branches</span>
                  </div>
                  <div className="h-6 w-px bg-border/60" />
                  <div className="text-center">
                    <span className="font-semibold text-foreground">{filteredVulns.length}</span>
                    <span className="text-[10px] text-muted-foreground block">Vulns</span>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => setSelectedAuthor("")}
                  className="h-8 px-2.5 text-muted-foreground hover:text-foreground text-xs font-medium border border-border hover:bg-accent/40"
                >
                  Clear filter
                </Button>
              </div>
            </div>
          )}

          {/* TAB 1: ACTIVITIES — with inner sub-tabs */}
          {activeTab === "activities" && (
            <div className="space-y-4">
              {/* Inner sub-tab bar */}
              <div className="flex gap-1 border-b border-border overflow-x-auto">
                {([
                  { key: "commits",         label: "Commits" },
                  { key: "prs",             label: "Pull Requests" },
                  { key: "workflows",       label: "Workflows & Runs" },
                  { key: "branches",        label: "Branches" },
                  { key: "vulnerabilities", label: "Vulnerabilities" },
                ] as { key: SubTabType; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setActiveSubTab(key); setSearchQuery("") }}
                    className={`pb-2.5 px-1 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                      activeSubTab === key
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Commits ── */}
              {activeSubTab === "commits" && (
                <div className="space-y-4">
                  {commitsQuery.isLoading ? (
                    <div className="space-y-4 py-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex gap-4 items-center">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-3 w-1/4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : commitsQuery.error ? (
                    <div className="text-sm text-destructive py-4">Error loading repository commits.</div>
                  ) : filteredCommits.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-8 text-center flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="h-8 w-8 text-muted-foreground/50" /> No commits found matching your search.
                    </div>
                  ) : (
                    <div className="relative border-l border-border ml-4 pl-6 space-y-6 py-2">
                      {pagedCommits.map((c: any) => {
                        const commitAuthor = c.commit?.author?.name || c.author?.login || "Unknown"
                        const authorLogin = c.author?.login
                        const commitMsg = (c.commit?.message || "").split("\n")[0]
                        const shaShort = (c.sha || "").substring(0, 7)
                        const timeString = c.commit?.author?.date ? formatTimeAgo(c.commit.author.date) : ""
                        return (
                          <div key={c.sha} className="relative group">
                            <div className="absolute -left-[35px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card overflow-hidden shadow-sm">
                              {c.author?.avatar_url ? (
                                <img src={c.author.avatar_url} alt={commitAuthor} className="h-full w-full object-cover" />
                              ) : (
                                <User className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <span className="text-sm font-semibold hover:text-primary transition-colors">{commitMsg}</span>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  {authorLogin ? (
                                    <a href={`https://github.com/${authorLogin}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline text-foreground flex items-center gap-1">
                                      {commitAuthor} <ExternalLink className="h-2 w-2" />
                                    </a>
                                  ) : (
                                    <span className="font-medium text-foreground">{commitAuthor}</span>
                                  )}
                                  <span>committed</span>
                                  <span className="font-mono bg-muted text-foreground px-1 py-0.5 rounded text-[10px]">
                                    <a href={c.html_url} target="_blank" rel="noopener noreferrer">{shaShort}</a>
                                  </span>
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground whitespace-nowrap self-start sm:self-center mt-1 sm:mt-0">{timeString}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <PaginationBar page={activitiesPage} totalItems={filteredCommits.length} onPageChange={setActivitiesPage} />
                </div>
              )}

              {/* ── Pull Requests ── */}
              {activeSubTab === "prs" && (
                <div className="overflow-x-auto">
                  {prsQuery.isLoading ? (
                    <div className="space-y-3 py-2">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : prsQuery.error ? (
                    <div className="text-sm text-destructive py-4">Error loading repository pull requests.</div>
                  ) : filteredPRs.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-8 text-center flex flex-col items-center justify-center gap-2">
                      <GitPullRequest className="h-8 w-8 text-muted-foreground/50" /> No pull requests found.
                    </div>
                  ) : (
                    <>
                      <div className="mobile-scroll-x">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[80px]">PR No.</TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Author</TableHead>
                            <TableHead>Updated</TableHead>
                            <TableHead className="text-right">Link</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedPRs.map((pr: any) => {
                            const isMerged = !!pr.merged_at
                            const prStatus = pr.state === "open" ? "open" : (isMerged ? "merged" : "closed")
                            const statusVariant = prStatus === "open" ? "info" : prStatus === "merged" ? "success" : "destructive"
                            return (
                              <TableRow key={pr.id}>
                                <TableCell className="font-mono text-xs font-semibold text-muted-foreground">#{pr.number}</TableCell>
                                <TableCell className="font-medium">
                                  <div className="max-w-[400px] truncate" title={pr.title}>{pr.title}</div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={statusVariant} className="capitalize">{prStatus}</Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {pr.user?.avatar_url ? <img src={pr.user.avatar_url} alt={pr.user.login} className="h-5 w-5 rounded-full" /> : <User className="h-3 w-3 text-muted-foreground" />}
                                    <span className="text-xs font-medium">{pr.user?.login}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{formatTimeAgo(pr.updated_at || pr.created_at)}</TableCell>
                                <TableCell className="text-right">
                                  <a href={pr.html_url} target="_blank" rel="noopener noreferrer" title="View PR on GitHub" className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                      </div>
                      <PaginationBar page={prsPage} totalItems={filteredPRs.length} onPageChange={setPrsPage} />
                    </>
                  )}
                </div>
              )}

              {/* ── Workflows & Runs ── */}
              {activeSubTab === "workflows" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Code2 className="h-4 w-4 text-primary" /> Configured Workflows</h3>
                    {workflowsQuery.isLoading ? (
                      <Skeleton className="h-10 w-full" />
                    ) : workflowsQuery.error ? (
                      <p className="text-xs text-destructive">Could not fetch workflows list.</p>
                    ) : !workflowsQuery.data?.workflows || workflowsQuery.data.workflows.length === 0 ? (
                      <p className="text-xs text-muted-foreground border rounded-md p-3 bg-secondary/20">No workflows configured.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {workflowsQuery.data.workflows.map((wf: any) => (
                          <Badge key={wf.id} variant="outline" className="flex items-center gap-1.5 py-1 px-2.5">
                            <PlayCircle className="h-3.5 w-3.5 text-primary" />
                            <span className="font-medium">{wf.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">({wf.path.split("/").pop()})</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Recent Execution Runs</h3>
                    {runsQuery.isLoading ? (
                      <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : runsQuery.error ? (
                      <p className="text-xs text-destructive">Could not fetch recent workflow runs.</p>
                    ) : filteredRuns.length === 0 ? (
                      <p className="text-xs text-muted-foreground border rounded-md p-3 bg-secondary/20">No workflow run histories.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="mobile-scroll-x">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Run</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Event</TableHead>
                              <TableHead>Branch</TableHead>
                              <TableHead>Duration</TableHead>
                              <TableHead>Completed</TableHead>
                              <TableHead className="text-right">Details</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagedRuns.map((run: any) => {
                              const isSuccess = run.conclusion === "success"
                              const isFailed = run.conclusion === "failure" || run.conclusion === "timed_out"
                              const isPending = run.status === "in_progress" || run.status === "queued"
                              let statusIcon = <Clock className="h-4 w-4 text-muted-foreground" />
                              let statusVar: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" = "secondary"
                              if (isSuccess) { statusIcon = <CheckCircle2 className="h-4 w-4 text-emerald-500" />; statusVar = "success" }
                              else if (isFailed) { statusIcon = <XCircle className="h-4 w-4 text-destructive" />; statusVar = "destructive" }
                              else if (isPending) { statusIcon = <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />; statusVar = "warning" }
                              return (
                                <TableRow key={run.id}>
                                  <TableCell className="font-semibold">
                                    <div className="max-w-[250px] truncate" title={run.name || `Run #${run.run_number}`}>{run.name || `Run #${run.run_number}`}</div>
                                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">#{run.run_number}</div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1.5">
                                      {statusIcon}
                                      <Badge variant={statusVar} className="capitalize py-0 px-1.5 text-[10px]">{run.conclusion || run.status}</Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell className="capitalize text-xs font-mono">{run.event}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="font-mono text-[10px] max-w-[120px] truncate">
                                      <GitBranch className="h-3 w-3 mr-1" />{run.head_branch}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs">{formatDuration(run.run_started_at || run.created_at, run.updated_at)}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{formatTimeAgo(run.updated_at || run.created_at)}</TableCell>
                                  <TableCell className="text-right">
                                    <a href={run.html_url} target="_blank" rel="noopener noreferrer" title="Open Run page" className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                        </div>
                        <PaginationBar page={runsPage} totalItems={filteredRuns.length} onPageChange={setRunsPage} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Branches ── */}
              {activeSubTab === "branches" && (
                <div className="overflow-x-auto">
                  {branchesQuery.isLoading ? (
                    <div className="space-y-3 py-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : branchesQuery.error ? (
                    <div className="text-sm text-destructive py-4">Error loading repository branches.</div>
                  ) : !filteredBranches || filteredBranches.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">No branches found.</div>
                  ) : (
                    <>
                      <div className="mobile-scroll-x">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Branch Name</TableHead>
                            <TableHead>Head Commit SHA</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedBranches.map((branch: any) => (
                            <TableRow key={branch.name}>
                              <TableCell className="font-semibold">
                                <div className="flex items-center gap-1.5 text-foreground font-mono">
                                  <GitBranch className="h-4 w-4 text-primary" />{branch.name}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                <div className="flex flex-col">
                                  <span>{branch.commit?.sha ? branch.commit.sha.substring(0, 7) : ""}</span>
                                  {(() => {
                                    const authorInfo = branchAuthorMap.get(branch.commit?.sha);
                                    if (!authorInfo) return null;
                                    const displayName = authorInfo.login || authorInfo.name;
                                    if (!displayName) return null;
                                    return (
                                      <span className="text-[10px] text-muted-foreground">
                                        by {displayName}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <a href={`https://github.com/${owner}/${repoName}/tree/${branch.name}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3">
                                  Explore <ExternalLink className="h-3 w-3 ml-1" />
                                </a>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      </div>
                      <PaginationBar page={branchesPage} totalItems={filteredBranches.length} onPageChange={setBranchesPage} />
                    </>
                  )}
                </div>
              )}

              {/* ── Vulnerabilities ── */}
              {activeSubTab === "vulnerabilities" && (
                <div className="space-y-6">
                  {selectedAuthor && (
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-secondary/30 text-xs text-muted-foreground">
                      <AlertCircle className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      <span>Vulnerabilities filtered by author <strong className="text-foreground">{selectedAuthor}</strong> (showing alerts affecting manifest files they modified or package upgrades they worked on).</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/10 bg-red-500/5">
                      <span className="text-xs text-muted-foreground font-medium">Critical</span>
                      <Badge variant="destructive" className="h-6 min-w-6 px-1 flex items-center justify-center font-bold">{vulnStats.critical}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-orange-500/10 bg-orange-500/5">
                      <span className="text-xs text-muted-foreground font-medium">High</span>
                      <Badge variant="warning" className="h-6 min-w-6 px-1 flex items-center justify-center font-bold bg-orange-500/15 text-orange-500">{vulnStats.high}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-yellow-500/10 bg-yellow-500/5">
                      <span className="text-xs text-muted-foreground font-medium">Medium</span>
                      <Badge variant="warning" className="h-6 min-w-6 px-1 flex items-center justify-center font-bold bg-yellow-500/15 text-yellow-500">{vulnStats.medium}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-blue-500/10 bg-blue-500/5">
                      <span className="text-xs text-muted-foreground font-medium">Low</span>
                      <Badge variant="info" className="h-6 min-w-6 px-1 flex items-center justify-center font-bold bg-blue-500/15 text-blue-500">{vulnStats.low}</Badge>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    {vulnsQuery.isLoading ? (
                      <div className="space-y-3 py-2">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : !filteredVulns || filteredVulns.length === 0 ? (
                      <div className="text-center py-10 border rounded-lg bg-card text-muted-foreground flex flex-col items-center gap-2 justify-center">
                        <ShieldCheck className="h-10 w-10 text-emerald-500" />
                        <div>
                          <p className="font-semibold text-foreground">All Clear!</p>
                          <p className="text-xs text-muted-foreground">No open Dependabot vulnerability alerts detected.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[80px]">Alert</TableHead>
                              <TableHead>Package</TableHead>
                              <TableHead>Severity</TableHead>
                              <TableHead>Advisory/Summary</TableHead>
                              <TableHead>State</TableHead>
                              <TableHead>Reported</TableHead>
                              <TableHead className="text-right">Advisory</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagedVulns.map((alert: any) => {
                              const sev = alert.security_advisory?.severity?.toLowerCase() || "low"
                              const sevVariant = sev === "critical" || sev === "high" ? "destructive" : sev === "medium" ? "warning" : "info"
                              const stateVariant = alert.state === "open" ? "destructive" : "success"
                              return (
                                <TableRow key={alert.id || alert.number}>
                                  <TableCell className="font-mono text-xs font-semibold text-muted-foreground">#{alert.number}</TableCell>
                                  <TableCell>
                                    <div className="font-medium text-foreground">{alert.dependency?.package?.name || "unknown"}</div>
                                    <div className="text-[10px] text-muted-foreground font-mono">Ecosystem: {alert.dependency?.package?.ecosystem || "N/A"}</div>
                                  </TableCell>
                                  <TableCell><Badge variant={sevVariant} className="capitalize">{sev}</Badge></TableCell>
                                  <TableCell>
                                    <div className="font-medium text-sm text-foreground max-w-[300px] truncate" title={alert.security_advisory?.summary}>{alert.security_advisory?.summary || "Advisory warning"}</div>
                                    <div className="text-xs text-muted-foreground font-mono mt-0.5">{alert.security_advisory?.cve_id || alert.security_advisory?.ghsa_id}</div>
                                  </TableCell>
                                  <TableCell><Badge variant={stateVariant} className="capitalize">{alert.state}</Badge></TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{formatTimeAgo(alert.created_at)}</TableCell>
                                  <TableCell className="text-right">
                                    <a href={alert.html_url} target="_blank" rel="noopener noreferrer" title="View advisory description on GitHub" className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                        <PaginationBar page={vulnsPage} totalItems={filteredVulns.length} onPageChange={setVulnsPage} />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}


        </CardContent>
      </Card>
    </div>
  )
}
