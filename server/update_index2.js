const fs = require('fs');
const file = '/mnt/c/Users/rdpubana17/.gemini/antigravity-ide/scratch/devops-dashboard/server/index.js';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `// ─── Cluster Summary (for Overview page) ──────────────────────────────────────
  const username = req.query.username || envCfg.username`;

const replacement = `// ─── Cluster Summary (for Overview page) ──────────────────────────────────────
app.get('/api/cluster-summary', async (req, res) => {
  const env = req.query.env
  if (!env) return res.status(400).json({ error: 'env query param required' })
  const envCfg = (CONFIG.envs || {})[env]
  if (!envCfg) return res.status(400).json({ error: 'unknown env' })
  const host = envCfg.host
  const username = req.query.username || envCfg.username`;

content = content.replace(targetStr, replacement);
fs.writeFileSync(file, content);
console.log('Fixed cluster-summary!');
