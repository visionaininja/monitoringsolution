import { NavLink } from "react-router-dom"
import { useState } from "react"
import { LayoutDashboard, Server, Github, Bot, Settings, TerminalSquare, LogOut, ChevronDown, ChevronRight, Headset, Network, Database } from "lucide-react"
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

export function Sidebar() {
  const queryClient = useQueryClient()
  const { environment } = useEnvironment()
  const { user, logout } = useAuth()
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(true)

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

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card px-3 py-4">
      <div className="mb-6 flex items-center px-3">
        <img src="/logo.svg" alt="Yourspeak Logo" className="h-10 w-10 object-contain drop-shadow-md" />
        <span className="ml-3 text-lg font-bold tracking-tight text-foreground">Yourspeak Monitoring Hub</span>
      </div>

      <nav className="flex-1 space-y-1">
        {navigation.map((item) => {
          const Icon = item.icon

          if (item.children) {
            return (
              <div key={item.name}>
                <button
                  onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                  className="w-full group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors text-muted-foreground hover:bg-accent/50 hover:text-foreground"
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
                            "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
                    "group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
      
      <div className="mt-auto px-3 py-4 border-t border-border mt-4">
        {user ? (
          <div className="flex items-center gap-3">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="h-8 w-8 rounded-full border border-border" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
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
    </div>
  )
}
