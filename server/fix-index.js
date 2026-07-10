const fs = require('fs');
const file = '/mnt/c/Users/rdpubana17/.gemini/antigravity-ide/scratch/devops-dashboard/server/index.js';
const lines = fs.readFileSync(file, 'utf8').split('\n');

const newCode = `    res.json({
      success: true,
      isRealData: isRealData,
      logs: mappedLogs,
      summary: {
        totalFlows: mappedLogs.length,
        acceptedFlows: mappedLogs.filter(f => f.action === "ACCEPT").length,
        rejectedFlows: mappedLogs.filter(f => f.action === "REJECT").length,
        activeAnomalies: mappedLogs.filter(f => f.action === "REJECT" && f.dst_ip === dbIp).length
      }
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Cluster Endpoint ────────────────────────────────────────────────────────
app.get('/api/cluster', async (req, res) => {
  const env = req.query.env;
  if (!env) return res.status(400).json({ error: 'env query param required' });
  const envCfg = (CONFIG.envs || {})[env];
  if (!envCfg) return res.status(400).json({ error: 'unknown env' });

  const host = envCfg.host;
  const username = req.query.username || envCfg.username;
  const sshPort = envCfg.sshPort || 22;
  const keyRel = envCfg.keyPath || envCfg.pemPath;
  if (!host || !username || !keyRel) {
    return res.status(400).json({ error: 'incomplete env config' });
  }
  
  const resolveKeyPath = (p) => require('path').resolve(__dirname, p);
  const keyPath = resolveKeyPath(keyRel);
  if (!fs.existsSync(keyPath)) return res.status(400).json({ error: \`Key not found at \${keyPath}\` });

  let privateKey;
  try { privateKey = fs.readFileSync(keyPath, 'utf8'); } catch (err) { return res.status(400).json({ error: err.message }); }

  const Client = require('ssh2').Client;
  const conn = new Client();
  conn.on('ready', () => {
    conn.exec('kubectl get pods -A -o json', (err, stream) => {
      if (err) {
        conn.end();
        return res.status(500).json({ error: String(err) });
      }
      let data = '';
      stream.on('data', (d) => { data += d; }).on('close', () => {
        conn.end();
        try {
          const results = JSON.parse(data);
          res.json(results);
        } catch (e) {
          res.status(500).json({ error: "Failed to parse JSON: " + e.message });
        }
      }).stderr.on('data', (d) => console.error('SSH STDERR: ' + d));
    });
  }).on('error', (err) => {
    res.status(500).json({ error: String(err) });
  });

  try {
    conn.connect({ host, port: Number(sshPort), username, privateKey });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});`;

// Remove the bad fragment from lines 533 to 560
// In zero-indexed array, lines 533 to 560 is indices 532 to 559.
// So we splice at index 532, and delete 559 - 532 + 1 = 28 lines.
lines.splice(532, 28, newCode);
fs.writeFileSync(file, lines.join('\n'));
console.log('File fixed successfully.');
