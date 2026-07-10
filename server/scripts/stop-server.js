const { execSync } = require('child_process')

const port = process.env.PORT || 4000

function killPort(p) {
  let pids = []
  try {
    pids = execSync(`lsof -ti :${p}`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(Number)
  } catch {
    console.log(`Port ${p} is free`)
    return
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // already exited
    }
  }
  console.log(`Stopped ${pids.length} process(es) on port ${p}`)
}

killPort(port)
