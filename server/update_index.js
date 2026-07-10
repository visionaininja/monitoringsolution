const fs = require('fs');
const file = '/mnt/c/Users/rdpubana17/.gemini/antigravity-ide/scratch/devops-dashboard/server/index.js';
let content = fs.readFileSync(file, 'utf8');

// Find the start of /api/metrics and the end
const startTag = `app.get('/api/metrics', async (req, res) => {`;
const startIndex = content.indexOf(startTag);

const nextEndpoint = `app.get('/api/cluster-summary'`;
let endIndex = content.indexOf(nextEndpoint);

const newMetrics = `app.get('/api/metrics', async (req, res) => {
  const env = req.query.env
  if (!env) return res.status(400).json({ error: 'env query param required' })
  const envCfg = (CONFIG.envs || {})[env]
  if (!envCfg) return res.status(400).json({ error: 'unknown env' })

  const host = envCfg.host
  const username = req.query.username || envCfg.username
  const sshPort = envCfg.sshPort || 22
  const keyRel = envCfg.keyPath || envCfg.pemPath
  if (!host || !username || !keyRel) {
    return res.status(400).json({ error: 'incomplete env config' })
  }
  const keyPath = resolveKeyPath(keyRel)
  if (!fs.existsSync(keyPath)) return res.status(400).json({ error: \`Key not found at \${keyPath}\` })

  let privateKey
  try { privateKey = loadPrivateKey(keyPath) } catch (err) { return res.status(400).json({ error: err.message }) }

  const conn = new Client()
  conn.on('ready', async () => {
    try {
      const targetNamespaces = [
        \`yourspeak-be-\${env}-v2\`,
        \`yourspeak-fe-\${env}-v2\`,
        \`yourspeak-ms-\${env}-v2\`
      ]

      const parsePodTop = (lines) => {
        const result = {}
        for (const line of lines) {
          const parts = line.trim().split(/\\s+/)
          if (parts.length >= 3 && parts[0] !== 'NAME') {
            const name = parts[0]
            const cpuRaw = parts[1]
            const memRaw = parts[2]
            let cpuPct = 0
            if (cpuRaw.endsWith('m')) cpuPct = Math.min(100, Math.round(parseInt(cpuRaw) / 10))
            else if (!isNaN(Number(cpuRaw))) cpuPct = Math.min(100, Math.round(Number(cpuRaw) * 100))
            let memPct = 0
            const memBytes = parseMemToBytes(memRaw)
            if (memBytes > 0) memPct = Math.min(100, Math.round((memBytes / (2 * 1024 * 1024 * 1024)) * 100))
            result[name] = { cpu: cpuPct, memory: memPct, cpuRaw, memRaw }
          }
        }
        return result
      }

      const parseNodeTop = (lines) => {
        const result = {}
        for (const line of lines) {
          const parts = line.trim().split(/\\s+/)
          if (parts.length >= 5 && parts[0] !== 'NAME') {
            const name = parts[0]
            const cpuPct = parseInt(parts[2]) || 0
            const memPct = parseInt(parts[4]) || 0
            result[name] = { cpu: cpuPct, memory: memPct, cpuRaw: parts[1], memRaw: parts[3] }
          }
        }
        return result
      }

      let nodeMetrics = {}
      try {
        const nodeTopLines = await sshExecText(conn, 'kubectl top nodes --no-headers')
        nodeMetrics = parseNodeTop(nodeTopLines)
      } catch (e) { console.error('kubectl top nodes failed:', e.message) }

      try {
        const nodesJsonStr = await sshExecText(conn, 'kubectl get nodes -o json')
        const nodesJson = JSON.parse(nodesJsonStr)
        nodesJson.items.forEach(item => {
          const name = item.metadata.name
          if (nodeMetrics[name]) {
            nodeMetrics[name].capacity = item.status?.capacity?.['ephemeral-storage'] || '0Ki'
            nodeMetrics[name].allocatable = item.status?.allocatable?.['ephemeral-storage'] || '0Ki'
          }
        })
      } catch (e) { console.error('kubectl get nodes JSON failed:', e.message) }

      const podMetrics = {}
      const podTopPromises = targetNamespaces.map(ns =>
        sshExecText(conn, \`kubectl top pods -n \${ns} --no-headers\`).then(lines => {
          const parsed = parsePodTop(lines)
          Object.assign(podMetrics, parsed)
        }).catch(e => console.error(\`kubectl top pods -n \${ns} failed:\`, e.message))
      )
      await Promise.all(podTopPromises)

      conn.end()
      res.json({ podMetrics, nodeMetrics })
    } catch (err) {
      conn.end()
      res.status(500).json({ error: String(err) })
    }
  }).on('error', (err) => res.status(500).json({ error: String(err) }))

  try { conn.connect({ host, port: Number(sshPort), username, privateKey }) }
  catch (err) { res.status(400).json({ error: err.message }) }
})

// ─── Cluster Summary (for Overview page) ──────────────────────────────────────
`;

// Replace from startIndex to endIndex
const finalContent = content.substring(0, startIndex) + newMetrics + content.substring(endIndex + `// ─── Cluster Summary (for Overview page) ──────────────────────────────────────\n`.length);

fs.writeFileSync(file, finalContent);
console.log('Fixed index.js!');
