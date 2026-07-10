import { useState, useEffect, useRef } from "react"
import { Terminal, Key, Shield, Wifi } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function KubernetesCluster() {
  const [logs, setLogs] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const handleConnect = () => {
    setLogs(["Initializing secure connection..."])
    setIsConnected(false)
    
    const sequence = [
      "Loading SSH public key from ~/.ssh/id_rsa.pub",
      "Authenticating with Bastion Host (192.168.1.100)...",
      "Bastion authentication successful. Tunnel established.",
      "Routing traffic to Target Cluster (10.0.0.50)...",
      "Retrieving kubeconfig via secure channel...",
      "Validating certificates...",
      "Connection to Kubernetes Cluster Established Successfully."
    ]

    let i = 0
    const interval = setInterval(() => {
      if (i < sequence.length) {
        setLogs(prev => [...prev, sequence[i]])
        if (i === sequence.length - 1) setIsConnected(true)
        i++
      } else {
        clearInterval(interval)
      }
    }, 600)
  }

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kubernetes Cluster</h1>
        <p className="text-muted-foreground">Manage secure access to your core infrastructure.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Bastion Configuration
            </CardTitle>
            <CardDescription>Secure SSH tunnel settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Bastion IP</label>
              <Input defaultValue="192.168.1.100" readOnly className="bg-muted/50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Target Cluster IP</label>
              <Input defaultValue="10.0.0.50" readOnly className="bg-muted/50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">SSH Key Ref</label>
              <div className="relative">
                <Key className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input defaultValue="~/.ssh/id_rsa.pub" type="password" readOnly className="pl-9 bg-muted/50 font-mono text-xs" />
              </div>
            </div>
            
            <Button onClick={handleConnect} disabled={isConnected || logs.length > 0 && !isConnected} className="w-full mt-4">
              {isConnected ? (
                 <><Wifi className="mr-2 h-4 w-4 text-emerald-500" /> Connected</>
              ) : (
                "Establish Connection"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Connection Log
            </CardTitle>
          </CardHeader>
          <CardContent>
             <div className="rounded-md bg-zinc-950 p-4 h-[350px] border overflow-y-auto font-mono text-xs text-zinc-300 shadow-inner">
               {logs.length === 0 ? (
                 <div className="flex h-full items-center justify-center opacity-30 text-zinc-500">
                    No active connection stream.
                 </div>
               ) : (
                 <div className="space-y-2">
                   <div className="text-emerald-500">user@devops-hub:~$ connect-cluster --verbose</div>
                   {logs.map((log, i) => (
                     <div key={i} className={`${i === logs.length - 1 && isConnected ? 'text-emerald-400 font-bold' : ''}`}>
                       <span className="text-zinc-600 mr-2">[{new Date().toISOString().split('T')[1].substring(0,8)}]</span>
                       {log}
                     </div>
                   ))}
                   {logs.length > 0 && !isConnected && (
                     <div className="animate-pulse">_</div>
                   )}
                   <div ref={logsEndRef} />
                 </div>
               )}
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
