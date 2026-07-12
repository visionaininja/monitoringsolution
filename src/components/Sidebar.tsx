import { NavLink, useLocation } from "react-router-dom"
import { useState, useEffect } from "react"
import { LayoutDashboard, Server, Github, Bot, Settings, LogOut, ChevronDown, ChevronRight, Headset, Network, Database, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { useEnvironment } from "@/context/EnvironmentContext"
import { useAuth } from "@/context/AuthContext"
import {
  getGitHubToken,
  fetchGitHubRepos,
  fetchGitHubBranches,
  fetchGitHubPullRequests,
  fetchGitHubWorkflows,
  fetchGitHubWorkflowRuns,
  fetchGitHubCommits,
  fetchGitHubVulnerabilities,
  fetchGitHubContributors,
  fetchGitHubCollaborators
} from "@/lib/github"

const navigation = [
  { 
    name: "Overview", 
    href: "/", 
    icon: LayoutDashboard,
    children: [
      { name: "Kubernetes Overview", href: "/overview/kubernetes" },
      { name: "Virtual Machine Overview", href: "/overview/vm" },
      { name: "Docker Overview", href: "/overview/docker" },
      { name: "Github Overview", href: "/overview/github" },
      { name: "OCI API Overview", href: "/overview/oci-gateway" },
    ]
  },
  { name: "Kubernetes Dashboard", href: "/k8s", icon: Server },
  { name: "GitHub Monitoring", href: "/github", icon: Github },
  { name: "Network Monitoring", href: "/network", icon: Network },
  { name: "Database Monitoring", href: "/database", icon: Database },
  { name: "AI Assistant", href: "/ai", icon: Bot },
  { name: "Support Chat", href: "/support-chat", icon: Headset },
  { name: "Settings", href: "/settings", icon: Settings },
]

const ENV_USERNAMES: Record<string, string> = {
  dev: "ubuntu",
  staging: "staging",
  production: "production",
}

// ─── Mobile Top Bar ─────────────────────────────────────────────────
export function MobileTopBar({ onToggle }: { onToggle: () => void }) {
  return (
    <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-[100] safe-top">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-accent/50 text-foreground transition-colors touch-target flex items-center justify-center"
          aria-label="Toggle navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center">
          <img src="/logo.svg" alt="Yourspeak Logo" className="h-7 w-7 object-contain drop-shadow-md" />
          <span className="ml-2 text-sm font-bold tracking-tight text-foreground">Yourspeak Hub</span>
        </div>
      </div>
    </div>
  )
}

// ─── Sidebar Component ──────────────────────────────────────────────
export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const queryClient = useQueryClient()
  const { environment } = useEnvironment()
  const { user, logout } = useAuth()
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(true)
  const location = useLocation()

  // Auto-close sidebar on route change (mobile)
  useEffect(() => {
    if (onClose) {
      onClose()
    }
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrefetch = async (href: string) => {
    const sharedOpts = { staleTime: 2 * 60 * 1000 }
    
    if (href === "/k8s") {
      const username = ENV_USERNAMES[environment] || "dev"
      queryClient.prefetchQuery({
        queryKey: ["overview-cluster", environment],
        queryFn: async () => {
          const resp = await fetch(`/api/cluster?env=${environment}&username=${username}`)
          if (!resp.ok) throw new Error("Failed to fetch cluster data")
          return resp.json()
        },
        ...sharedOpts
      })
      queryClient.prefetchQuery({
        queryKey: ["overview-metrics", environment],
        queryFn: async () => {
          const resp = await fetch(`/api/metrics?env=${environment}&username=${username}`)
          if (!resp.ok) throw new Error("Failed to fetch metrics data")
          return resp.json()
        },
        ...sharedOpts
      })
    } else if (href === "/network") {
      queryClient.prefetchQuery({
        queryKey: ["oci-vcn-logs"],
        queryFn: async () => {
          const res = await fetch("/api/oci-vcn-logs?count=50")
          if (!res.ok) throw new Error("Failed to fetch OCI VCN flow logs")
          return res.json()
        },
        ...sharedOpts
      })
    } else if (href === "/github") {
      const token = getGitHubToken()
      if (!token) return
      try {
        const repos = await queryClient.ensureQueryData({
          queryKey: ["github-repos"],
          queryFn: fetchGitHubRepos,
          ...sharedOpts
        })
        if (Array.isArray(repos) && repos.length > 0) {
          const defaultRepo = repos[0].full_name
          const parts = defaultRepo.split("/")
          const owner = parts[0] || ""
          const repoName = parts[1] || ""
          if (owner && repoName) {
            queryClient.prefetchQuery({ queryKey: ["github-branches", owner, repoName], queryFn: () => fetchGitHubBranches(owner, repoName), ...sharedOpts })
            queryClient.prefetchQuery({ queryKey: ["github-commits", owner, repoName], queryFn: () => fetchGitHubCommits(owner, repoName), ...sharedOpts })
            queryClient.prefetchQuery({ queryKey: ["github-prs", owner, repoName], queryFn: () => fetchGitHubPullRequests(owner, repoName), ...sharedOpts })
            queryClient.prefetchQuery({ queryKey: ["github-workflows", owner, repoName], queryFn: () => fetchGitHubWorkflows(owner, repoName), ...sharedOpts })
            queryClient.prefetchQuery({ queryKey: ["github-runs", owner, repoName], queryFn: () => fetchGitHubWorkflowRuns(owner, repoName), ...sharedOpts })
            queryClient.prefetchQuery({ queryKey: ["github-vulns", owner, repoName], queryFn: () => fetchGitHubVulnerabilities(owner, repoName), ...sharedOpts })
            queryClient.prefetchQuery({ queryKey: ["github-contributors", owner, repoName], queryFn: () => fetchGitHubContributors(owner, repoName), ...sharedOpts })
            queryClient.prefetchQuery({ queryKey: ["github-collaborators", owner, repoName], queryFn: () => fetchGitHubCollaborators(owner, repoName), ...sharedOpts })
          }
        }
      } catch (err) {
        console.error("GitHub prefetch failed:", err)
      }
    } else if (href === "/") {
      // Prefetch Overview queries
      const username = ENV_USERNAMES[environment] || "dev"
      queryClient.prefetchQuery({
        queryKey: ["overview-cluster", environment],
        queryFn: async () => {
          const resp = await fetch(`/api/cluster?env=${environment}&username=${username}`)
          if (!resp.ok) throw new Error("Failed to fetch cluster data")
          return resp.json()
        },
        ...sharedOpts
      })
      queryClient.prefetchQuery({
        queryKey: ["overview-metrics", environment],
        queryFn: async () => {
          const resp = await fetch(`/api/metrics?env=${environment}&username=${username}`)
          if (!resp.ok) throw new Error("Failed to fetch metrics data")
          return resp.json()
        },
        ...sharedOpts
      })
      const token = getGitHubToken()
      if (token) {
        try {
          const repos = await queryClient.ensureQueryData({
            queryKey: ["overview-repos"],
            queryFn: fetchGitHubRepos,
            ...sharedOpts
          })
          if (Array.isArray(repos) && repos.length > 0) {
            // Find most recently pushed repo
            const primaryRepo = repos.reduce((a: any, b: any) => new Date(b.pushed_at) > new Date(a.pushed_at) ? b : a)
            const owner = primaryRepo?.owner?.login || ""
            const repoName = primaryRepo?.name || ""
            if (owner && repoName) {
              queryClient.prefetchQuery({ queryKey: ["overview-commits", owner, repoName], queryFn: () => fetchGitHubCommits(owner, repoName), ...sharedOpts })
              queryClient.prefetchQuery({ queryKey: ["overview-runs", owner, repoName], queryFn: () => fetchGitHubWorkflowRuns(owner, repoName), ...sharedOpts })
              queryClient.prefetchQuery({ queryKey: ["overview-prs", owner, repoName], queryFn: () => fetchGitHubPullRequests(owner, repoName), ...sharedOpts })
              queryClient.prefetchQuery({ queryKey: ["overview-contributors", owner, repoName], queryFn: () => fetchGitHubContributors(owner, repoName), ...sharedOpts })
            }
          }
        } catch (err) {
          console.error("Overview GitHub prefetch failed:", err)
        }
      }
    }
  }

  const sidebarContent = (
    <>
      {/* Logo section — hidden on mobile (shown in MobileTopBar instead) */}
      <div className="mb-6 flex items-center px-3">
        <img src="/logo.svg" alt="Yourspeak Logo" className="h-10 w-10 object-contain drop-shadow-md" />
        <span className="ml-3 text-lg font-bold tracking-tight text-foreground">Yourspeak Monitoring Hub</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-hide">
        {navigation.map((item) => {
          const Icon = item.icon

          if (item.children) {
            return (
              <div key={item.name}>
                <button
                  onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                  className="w-full group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors text-muted-foreground hover:bg-accent/50 hover:text-foreground touch-target"
                >
                  <div className="flex items-center">
                    <Icon className="mr-3 h-5 w-5 flex-shrink-0" aria-hidden="true" />
                    {item.name}
                  </div>
                  <div className="p-0.5 rounded text-zinc-400 group-hover:text-zinc-100 transition-colors">
                    {isOverviewExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </button>
                {isOverviewExpanded && (
                  <div className="ml-6 mt-1 space-y-1 border-l border-border pl-3">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.name}
                        to={child.href}
                        className={({ isActive }) =>
                          cn(
                            "block rounded-md px-3 py-2 text-sm font-medium transition-colors touch-target",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          )
                        }
                      >
                        {child.name}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <div key={item.name}>
              <NavLink
                to={item.href}
                onMouseEnter={() => handlePrefetch(item.href)}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors touch-target",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )
                }
              >
                <div className="flex items-center">
                  <Icon className="mr-3 h-5 w-5 flex-shrink-0" aria-hidden="true" />
                  {item.name}
                </div>
              </NavLink>
            </div>
          )
        })}
      </nav>
      
      <div className="mt-auto px-3 py-4 border-t border-border mt-4 safe-bottom">
        {user ? (
          <div className="flex items-center gap-3">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="h-8 w-8 rounded-full border border-border flex-shrink-0" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                {user.name?.charAt(0) || user.email?.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
            </div>
            <button 
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-colors flex-shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Hub Version 1.0.0</p>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* ── Desktop Sidebar (always visible on lg+) ── */}
      <div className="hidden lg:flex h-screen w-64 flex-col border-r bg-card px-3 py-4 flex-shrink-0">
        {sidebarContent}
      </div>

      {/* ── Mobile/Tablet Sidebar Drawer Overlay ── */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-[150] flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
            onClick={onClose}
            aria-label="Close navigation"
          />
          {/* Drawer */}
          <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col bg-card border-r border-border shadow-2xl animate-in slide-in-from-left duration-300 safe-top">
            {/* Close button */}
            <div className="flex items-center justify-end px-3 pt-3">
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors touch-target flex items-center justify-center"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
