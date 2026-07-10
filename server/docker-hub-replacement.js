// ─── Docker Hub — Quota + Pull Counts ────────────────────────────────────────
// GET /api/docker-hub
// Proxies Docker Hub API calls server-side so the PAT never reaches the browser.
// Rate-limit is checked via hub.docker.com/v2/ratelimit/ — does NOT consume a pull.
app.get('/api/docker-hub', async (req, res) => {
  const https = require('https')

  const dockerCfg = CONFIG.docker || {}
  const username = process.env.DOCKER_HUB_USERNAME || dockerCfg.username || ''
  const pat      = process.env.DOCKER_HUB_PAT      || dockerCfg.pat      || ''

  if (!username || !pat) {
    return res.status(400).json({ error: 'Docker Hub credentials not configured.' })
  }

  const basicAuth = 'Basic ' + Buffer.from(`${username}:${pat}`).toString('base64')

  function httpsRequest(url, opts = {}) {
    return new Promise((resolve, reject) => {
      const method = opts.method || 'GET'
      const headers = opts.headers || {}
      const u = new URL(url)
      const reqOpts = { hostname: u.hostname, path: u.pathname + u.search, method, headers }
      const req2 = https.request(reqOpts, (resp) => {
        if (method === 'HEAD') {
          resp.resume()
          resp.on('end', () => resolve({ statusCode: resp.statusCode, headers: resp.headers, body: '' }))
        } else {
          let data = ''
          resp.on('data', d => data += d)
          resp.on('end', () => resolve({ statusCode: resp.statusCode, headers: resp.headers, body: data }))
        }
      })
      req2.setTimeout(12000, () => { req2.destroy(new Error('timeout')) })
      req2.on('error', reject)
      req2.end()
    })
  }

  try {
    // ── Step 1: Fetch repositories from hub.docker.com (most reliable) ──────
    const hubUrl = `https://hub.docker.com/v2/repositories/${username}/?page_size=100&ordering=pull_count`
    const hubResp = await httpsRequest(hubUrl, { headers: { Authorization: basicAuth } })
    if (hubResp.statusCode !== 200) {
      return res.status(hubResp.statusCode).json({
        error: `Docker Hub API returned ${hubResp.statusCode}`,
        hint: 'Check credentials in Settings page'
      })
    }
    const hubData = JSON.parse(hubResp.body)
    const results = hubData.results || []
    const repos = results.map(r => ({
      name:         `${username}/${r.name}`,
      pull_count:   r.pull_count || 0,
      star_count:   r.star_count || 0,
      last_updated: r.last_updated || '',
      is_private:   r.is_private || false,
    }))
    const totalPulls = repos.reduce((s, r) => s + r.pull_count, 0)

    // ── Step 2: Get pull quota WITHOUT consuming a pull ──────────────────────
    let maxQuotaLimit = 0
    let remainingQuota = 0
    let resetSeconds = 21600
    let quotaSource = 'none'

    // In-memory cache keyed by credential hash
    if (!app._dockerQuotaCache) app._dockerQuotaCache = {}
    const cacheKey = Buffer.from(`${username}:${pat}`).toString('base64').slice(0, 16)
    const now = Date.now()
    const cached = app._dockerQuotaCache[cacheKey]

    if (cached && (now - cached.fetchedAt) < (cached.resetSeconds * 1000 * 0.9)) {
      maxQuotaLimit  = cached.maxQuotaLimit
      remainingQuota = cached.remainingQuota
      resetSeconds   = Math.max(0, cached.resetSeconds - Math.round((now - cached.fetchedAt) / 1000))
      quotaSource    = cached.source + '-cached'
    } else {
      try {
        const rlResp = await httpsRequest('https://hub.docker.com/v2/ratelimit/', {
          headers: { Authorization: basicAuth }
        })

        const parseRlHeader = (raw) => {
          if (!raw) return { val: 0, window: 21600 }
          const val    = parseInt(raw.split(';')[0]) || 0
          const wMatch = raw.match(/w=(\d+)/)
          return { val, window: wMatch ? parseInt(wMatch[1]) : 21600 }
        }

        const limitHdr     = rlResp.headers['ratelimit-limit']    || ''
        const remainingHdr = rlResp.headers['ratelimit-remaining'] || ''

        if (limitHdr || remainingHdr) {
          const limitParsed     = parseRlHeader(limitHdr)
          const remainingParsed = parseRlHeader(remainingHdr)
          maxQuotaLimit  = limitParsed.val
          remainingQuota = remainingParsed.val
          resetSeconds   = limitParsed.window || remainingParsed.window || 21600
          quotaSource    = 'hub-ratelimit-api'
        } else if (rlResp.statusCode === 200) {
          maxQuotaLimit  = -1
          remainingQuota = -1
          quotaSource    = 'authenticated-unlimited'
        } else {
          throw new Error(`hub ratelimit API returned ${rlResp.statusCode}`)
        }

        app._dockerQuotaCache[cacheKey] = {
          maxQuotaLimit, remainingQuota, resetSeconds,
          source: quotaSource, fetchedAt: now
        }
      } catch (rlErrA) {
        // Fallback: registry manifest HEAD (consumes 1 pull)
        try {
          const imageToCheck = repos.length > 0
            ? `${username}/${repos[0].name.replace(`${username}/`, '')}`
            : 'library/hello-world'

          const scope = `repository:${imageToCheck}:pull`
          const tokenUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=${encodeURIComponent(scope)}`
          const tokenResp = await httpsRequest(tokenUrl, { headers: { Authorization: basicAuth } })
          const tokenData = JSON.parse(tokenResp.body)
          const registryToken = tokenData.token || tokenData.access_token || ''

          if (registryToken) {
            const manifestUrl = `https://registry-1.docker.io/v2/${imageToCheck}/manifests/latest`
            const manifestResp = await httpsRequest(manifestUrl, {
              method: 'HEAD',
              headers: {
                Authorization: `Bearer ${registryToken}`,
                Accept: 'application/vnd.docker.distribution.manifest.v2+json',
              }
            })

            const parseRlHeader = (raw) => {
              if (!raw) return { val: 0, window: 21600 }
              const val    = parseInt(raw.split(';')[0]) || 0
              const wMatch = raw.match(/w=(\d+)/)
              return { val, window: wMatch ? parseInt(wMatch[1]) : 21600 }
            }

            const limitHdr     = manifestResp.headers['ratelimit-limit']    || ''
            const remainingHdr = manifestResp.headers['ratelimit-remaining'] || ''

            if (limitHdr || remainingHdr) {
              const limitParsed     = parseRlHeader(limitHdr)
              const remainingParsed = parseRlHeader(remainingHdr)
              maxQuotaLimit  = limitParsed.val
              remainingQuota = remainingParsed.val
              resetSeconds   = limitParsed.window || remainingParsed.window || 21600
              quotaSource    = 'manifest-head-fallback'
            } else {
              maxQuotaLimit  = -1
              remainingQuota = -1
              quotaSource    = 'authenticated-unlimited'
            }

            app._dockerQuotaCache[cacheKey] = {
              maxQuotaLimit, remainingQuota, resetSeconds,
              source: quotaSource, fetchedAt: now
            }
          }
        } catch (rlErrC) {
          quotaSource = 'error'
        }
      }
    }

    res.json({
      timestamp:        new Date().toISOString(),
      scraper_version:  '1.2.0',
      username,
      rate_limit: {
        max_quota_limit:  maxQuotaLimit,
        remaining_quota:  remainingQuota,
        reset_seconds:    resetSeconds,
        source:           quotaSource,
      },
      repositories:     repos,
      repository_count: hubData.count || repos.length,
      total_pulls:      totalPulls,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
