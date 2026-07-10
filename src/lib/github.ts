export const GITHUB_TOKEN_KEY = "devops_dashboard_gh_pat";

export const sanitizeToken = (token: string): string => {
  if (!token) return "";
  let clean = token.trim();
  // Remove wrapping quotes if present
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  // Remove Bearer or token prefixes if present
  if (clean.toLowerCase().startsWith("bearer ")) {
    clean = clean.slice(7).trim();
  } else if (clean.toLowerCase().startsWith("token ")) {
    clean = clean.slice(6).trim();
  }
  return clean;
};

export const getGitHubToken = (): string | null => {
  return localStorage.getItem(GITHUB_TOKEN_KEY);
};

export const setGitHubToken = (token: string) => {
  localStorage.setItem(GITHUB_TOKEN_KEY, sanitizeToken(token));
};

export const removeGitHubToken = () => {
  localStorage.removeItem(GITHUB_TOKEN_KEY);
};

// Helper for making a single API request and returning the parsed JSON
const fetchGitHubAPI = async (endpoint: string, token: string | null = null) => {
  const authToken = token || getGitHubToken();
  if (!authToken) {
    throw new Error("No GitHub token provided.");
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://api.github.com${endpoint}`;

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid GitHub token.");
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

// Helper for making a single API request and returning the raw Response (for pagination)
const fetchGitHubRaw = async (endpoint: string, token: string | null = null): Promise<Response> => {
  const authToken = token || getGitHubToken();
  if (!authToken) {
    throw new Error("No GitHub token provided.");
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://api.github.com${endpoint}`;

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid GitHub token.");
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response;
};

/**
 * Parse the GitHub "Link" header to extract a rel URL.
 * Returns null if the rel is not found.
 */
const getLinkUrl = (linkHeader: string | null, rel: string): string | null => {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(new RegExp(`<([^>]+)>;\\s*rel="${rel}"`));
    if (match) return match[1];
  }
  return null;
};

/**
 * Extract the page number from a GitHub pagination URL.
 */
const getPageNumber = (url: string): number => {
  const match = url.match(/[?&]page=(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
};

/**
 * Build a URL for a specific page number, given a template URL.
 */
const buildPageUrl = (templateUrl: string, pageNum: number): string => {
  // Replace existing page param or append it
  if (templateUrl.match(/[?&]page=\d+/)) {
    return templateUrl.replace(/([?&]page=)\d+/, `$1${pageNum}`);
  }
  const separator = templateUrl.includes("?") ? "&" : "?";
  return `${templateUrl}${separator}page=${pageNum}`;
};

/**
 * Fetch ALL pages of a paginated GitHub API endpoint that returns a JSON array.
 * Uses CONCURRENT fetching: fetches page 1 first to discover total pages,
 * then fetches all remaining pages in parallel.
 * maxPages provides a safety limit.
 */
const fetchAllPages = async (
  endpoint: string,
  maxPages: number = 100
): Promise<any[]> => {
  // Fetch the first page to get data + Link header
  const firstResponse = await fetchGitHubRaw(endpoint);
  const firstData = await firstResponse.json();

  if (!Array.isArray(firstData) || firstData.length === 0) {
    return Array.isArray(firstData) ? firstData : [];
  }

  const linkHeader = firstResponse.headers.get("Link");
  const lastUrl = getLinkUrl(linkHeader, "last");

  // If no "last" link, everything fit on one page
  if (!lastUrl) return firstData;

  const lastPage = Math.min(getPageNumber(lastUrl), maxPages);

  // If only 1 page total, return immediately
  if (lastPage <= 1) return firstData;

  // Build URLs for pages 2..lastPage and fetch them in small batches to prevent 403 secondary rate limits
  const remainingPages = [];
  const batchSize = 3;
  for (let i = 2; i <= lastPage; i += batchSize) {
    const batchPromises = [];
    for (let p = i; p < i + batchSize && p <= lastPage; p++) {
      batchPromises.push(
        fetchGitHubRaw(buildPageUrl(lastUrl, p))
          .then(r => r.json())
          .then(data => (Array.isArray(data) ? data : []))
          .catch(() => []) // gracefully skip failed pages
      );
    }
    const batchResults = await Promise.all(batchPromises);
    remainingPages.push(...batchResults);
  }

  return firstData.concat(...remainingPages);
};

/**
 * Fetch ALL pages of a paginated GitHub API endpoint that returns a JSON object
 * with items nested under a key (e.g., workflow_runs, workflows).
 * Uses concurrent fetching.
 */
const fetchAllPagesNested = async (
  endpoint: string,
  itemsKey: string,
  maxPages: number = 100
): Promise<{ totalCount: number; items: any[] }> => {
  // Fetch the first page
  const firstResponse = await fetchGitHubRaw(endpoint);
  const firstData = await firstResponse.json();

  const totalCount = firstData.total_count ?? 0;
  const firstItems = Array.isArray(firstData[itemsKey]) ? firstData[itemsKey] : [];

  if (firstItems.length === 0) {
    return { totalCount, items: firstItems };
  }

  const linkHeader = firstResponse.headers.get("Link");
  const lastUrl = getLinkUrl(linkHeader, "last");

  if (!lastUrl) return { totalCount, items: firstItems };

  const lastPage = Math.min(getPageNumber(lastUrl), maxPages);
  if (lastPage <= 1) return { totalCount, items: firstItems };

  // Fetch remaining pages in small batches to prevent 403 secondary rate limits
  const remainingPages = [];
  const batchSize = 3;
  for (let i = 2; i <= lastPage; i += batchSize) {
    const batchPromises = [];
    for (let p = i; p < i + batchSize && p <= lastPage; p++) {
      batchPromises.push(
        fetchGitHubRaw(buildPageUrl(lastUrl, p))
          .then(r => r.json())
          .then(data => (Array.isArray(data[itemsKey]) ? data[itemsKey] : []))
          .catch(() => [])
      );
    }
    const batchResults = await Promise.all(batchPromises);
    remainingPages.push(...batchResults);
  }

  return { totalCount, items: firstItems.concat(...remainingPages) };
};

const getItemDate = (item: any): Date | null => {
  if (!item) return null;
  const dateStr = 
    item.commit?.committer?.date ||
    item.commit?.author?.date ||
    item.created_at ||
    item.updated_at ||
    item.run_started_at;
  return dateStr ? new Date(dateStr) : null;
};

const getFourMonthsAgoDate = (): Date => {
  const d = new Date();
  d.setMonth(d.getMonth() - 4);
  return d;
};

/**
 * Fetch pages from a paginated GitHub API endpoint until the oldest item is older than the target date.
 * Supports both direct arrays and nested structures (e.g. data[itemsKey]).
 */
const fetchPagesUntilDate = async (
  endpoint: string,
  itemsKey: string | null,
  targetDate: Date,
  maxPages: number = 30
): Promise<any[]> => {
  const allItems: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    try {
      const separator = endpoint.includes("?") ? "&" : "?";
      const url = `${endpoint}${separator}page=${page}`;
      const res = await fetchGitHubRaw(url);
      const data = await res.json();

      const items = itemsKey ? (Array.isArray(data[itemsKey]) ? data[itemsKey] : []) : (Array.isArray(data) ? data : []);

      if (items.length === 0) {
        break;
      }

      allItems.push(...items);

      // Check the date of the last item in this page (since they are typically in descending order)
      const lastItem = items[items.length - 1];
      const lastItemDate = getItemDate(lastItem);

      if (lastItemDate && lastItemDate < targetDate) {
        break;
      }

      const linkHeader = res.headers.get("Link");
      const nextUrl = linkHeader ? getLinkUrl(linkHeader, "next") : null;
      if (!nextUrl) {
        break;
      }

      page++;
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      break;
    }
  }

  return allItems;
};

export const validateGitHubToken = async (token: string) => {
  try {
    const cleanToken = sanitizeToken(token);
    const user = await fetchGitHubAPI("/user", cleanToken);
    return { valid: true, username: user.login };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
};

export const fetchGitHubEvents = async () => {
  // First get the user's most recently updated repository
  const repos = await fetchGitHubAPI("/user/repos?sort=updated&per_page=1");
  
  if (!repos || repos.length === 0) {
    return [];
  }
  
  const latestRepo = repos[0];
  
  // Then fetch events for that specific repository
  const events = await fetchGitHubAPI(`/repos/${latestRepo.owner.login}/${latestRepo.name}/events`);
  return events;
};

/** Fetch recently updated user repositories (paginated, max 300) */
export const fetchGitHubRepos = async () => {
  return fetchAllPages("/user/repos?sort=updated&per_page=100", 3);
};

/** Fetch branches for a repository (paginated, all pages) */
export const fetchGitHubBranches = async (owner: string, repo: string) => {
  return fetchAllPages(`/repos/${owner}/${repo}/branches?per_page=100`, 30);
};

/**
 * Fetch branches AND resolve the GitHub login + name of the author of each
 * branch's head commit. Commits are fetched in parallel batches of 5 to
 * stay well within GitHub's secondary rate limits.
 *
 * Returns an array of branch objects enriched with:
 *   branch.headAuthorLogin  – GitHub login (may be empty for bots / unlinked users)
 *   branch.headAuthorName   – git committer name
 *   branch.headAuthorAvatar – avatar URL
 */
export const fetchGitHubBranchesWithAuthors = async (
  owner: string,
  repo: string
): Promise<any[]> => {
  const branches = await fetchGitHubBranches(owner, repo);
  if (!branches.length) return branches;

  const BATCH = 5;
  const enriched: any[] = [...branches];

  for (let i = 0; i < branches.length; i += BATCH) {
    const slice = branches.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (branch: any, idx: number) => {
        const sha = branch.commit?.sha;
        if (!sha) return;
        try {
          const commitDetail = await fetchGitHubAPI(
            `/repos/${owner}/${repo}/commits/${sha}`
          );
          enriched[i + idx] = {
            ...branch,
            headAuthorLogin: commitDetail.author?.login || "",
            headAuthorName:
              commitDetail.commit?.author?.name ||
              commitDetail.committer?.login ||
              "",
            headAuthorAvatar: commitDetail.author?.avatar_url || "",
          };
        } catch {
          // gracefully leave branch without author enrichment
        }
      })
    );
  }

  return enriched;
};

/**
 * Fetch pull requests for a repository.
 * Fetches open and closed PRs separately to guarantee accurate open counts.
 * Open PRs fetch all pages (up to 20); closed PRs fetch until they go back 4 months.
 */
export const fetchGitHubPullRequests = async (owner: string, repo: string) => {
  const targetDate = getFourMonthsAgoDate();
  const [openPRs, closedPRs] = await Promise.all([
    fetchAllPages(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`, 20),
    fetchPagesUntilDate(`/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`, null, targetDate, 20),
  ]);

  return [...openPRs, ...closedPRs];
};

/** Fetch workflows configuration (not paginated — typically small lists) */
export const fetchGitHubWorkflows = async (owner: string, repo: string) => {
  try {
    return await fetchGitHubAPI(`/repos/${owner}/${repo}/actions/workflows`);
  } catch (e) {
    console.warn("Could not fetch workflows:", e);
    return { workflows: [] };
  }
};

/** Fetch recent workflow runs (paginated, going back at least 4 months) */
export const fetchGitHubWorkflowRuns = async (owner: string, repo: string) => {
  try {
    const targetDate = getFourMonthsAgoDate();
    const items = await fetchPagesUntilDate(
      `/repos/${owner}/${repo}/actions/runs?per_page=100`,
      "workflow_runs",
      targetDate,
      20
    );
    return { total_count: items.length, workflow_runs: items };
  } catch (e) {
    console.warn("Could not fetch workflow runs:", e);
    return { workflow_runs: [] };
  }
};

/** Fetch commits (paginated, going back at least 4 months) */
export const fetchGitHubCommits = async (owner: string, repo: string) => {
  const targetDate = getFourMonthsAgoDate();
  return fetchPagesUntilDate(`/repos/${owner}/${repo}/commits?per_page=100`, null, targetDate, 20);
};

/** Fetch detailed information for a single commit including modified files and diff patches */
export const fetchGitHubCommitDetails = async (owner: string, repo: string, sha: string) => {
  return fetchGitHubAPI(`/repos/${owner}/${repo}/commits/${sha}`);
};

/** Fetch jobs (with steps) for a specific workflow run */
export const fetchGitHubWorkflowRunJobs = async (owner: string, repo: string, runId: number) => {
  try {
    const result = await fetchAllPagesNested(
      `/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`,
      "jobs",
      10
    );
    return { total_count: result.totalCount, jobs: result.items };
  } catch (e) {
    console.warn("Could not fetch workflow run jobs:", e);
    return { total_count: 0, jobs: [] };
  }
};

/** Fetch raw text logs for a specific job (used for deep error analysis) */
export const fetchGitHubJobLogs = async (owner: string, repo: string, jobId: number): Promise<string> => {
  const authToken = getGitHubToken();
  if (!authToken) throw new Error("No GitHub token provided.");

  const response = await fetch(
    `/api/github-logs?owner=${owner}&repo=${repo}&jobId=${jobId}`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch job logs (Proxy): ${response.status} ${await response.text()}`);
  }

  const text = await response.text();
  return text;
};

/** Fetch Dependabot vulnerability alerts (all pages) enriched with commit authors of the manifest files */
export const fetchGitHubVulnerabilities = async (owner: string, repo: string) => {
  try {
    const alerts = await fetchAllPages(`/repos/${owner}/${repo}/dependabot/alerts?per_page=100`, 10);
    if (!Array.isArray(alerts) || alerts.length === 0) {
      return { alerts: [], isMock: false };
    }

    // Get unique manifest paths
    const manifestPaths = Array.from(new Set(
      alerts
        .map((alert: any) => alert.dependency?.manifest_path)
        .filter(Boolean)
    )) as string[];

    // Fetch commits for each manifest path to discover who modified it
    const manifestAuthorsMap = new Map<string, Set<string>>();

    await Promise.all(
      manifestPaths.map(async (path) => {
        try {
          const commits = await fetchGitHubAPI(
            `/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=100`
          );
          const authorSet = new Set<string>();
          if (Array.isArray(commits)) {
            commits.forEach((c: any) => {
              const login = c.author?.login;
              const name = c.commit?.author?.name;
              if (login) authorSet.add(login.toLowerCase());
              if (name) authorSet.add(name.toLowerCase());
            });
          }
          manifestAuthorsMap.set(path, authorSet);
        } catch {
          // ignore error for a specific manifest path
        }
      })
    );

    // Enrich alerts with manifestAuthors
    const enrichedAlerts = alerts.map((alert: any) => {
      const path = alert.dependency?.manifest_path;
      const authorSet = path ? manifestAuthorsMap.get(path) : null;
      return {
        ...alert,
        manifestAuthors: authorSet ? Array.from(authorSet) : []
      };
    });

    return { alerts: enrichedAlerts, isMock: false };
  } catch (error) {
    console.warn("Could not fetch real Dependabot alerts, returning empty:", error);
    return {
      isMock: false,
      error: (error as Error).message,
      alerts: []
    };
  }
};

/** Fetch contributors (paginated, all pages) */
export const fetchGitHubContributors = async (owner: string, repo: string) => {
  try {
    return await fetchAllPages(`/repos/${owner}/${repo}/contributors?per_page=100`, 10);
  } catch (error) {
    console.warn("Could not fetch contributors:", error);
    return [];
  }
};

/** Fetch collaborators (paginated, all pages) */
export const fetchGitHubCollaborators = async (owner: string, repo: string) => {
  try {
    return await fetchAllPages(`/repos/${owner}/${repo}/collaborators?per_page=100`, 10);
  } catch (error) {
    console.warn("Could not fetch collaborators (might lack repository push/admin scopes):", error);
    return [];
  }
};



