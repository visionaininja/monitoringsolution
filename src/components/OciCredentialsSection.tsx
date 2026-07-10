import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Save, Cloud, CheckCircle2, Loader2, Key, Activity, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useQueryClient } from "@tanstack/react-query"

export function OciCredentialsSection() {
  const queryClient = useQueryClient()
  
  const [tenancyId, setTenancyId] = useState("")
  const [userId, setUserId] = useState("")
  const [region, setRegion] = useState("")
  const [fingerprint, setFingerprint] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle")
  const [testMessage, setTestMessage] = useState("")
  const [resources, setResources] = useState<{id: string, displayName: string, type: string}[]>([])

  useEffect(() => {
    // Load existing from localStorage
    setTenancyId(localStorage.getItem("oci_tenancyId") || "")
    setUserId(localStorage.getItem("oci_userId") || "")
    setRegion(localStorage.getItem("oci_region") || "")
    setFingerprint(localStorage.getItem("oci_fingerprint") || "")
    setPrivateKey(localStorage.getItem("oci_privateKey") || "")
  }, [])

  const handleSave = async () => {
    setSaveStatus("saving")
    try {
      const resp = await fetch("/api/oci-credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenancyId, userId, region, fingerprint, privateKey }),
      })
      if (resp.ok) {
        localStorage.setItem("oci_tenancyId", tenancyId)
        localStorage.setItem("oci_userId", userId)
        localStorage.setItem("oci_region", region)
        localStorage.setItem("oci_fingerprint", fingerprint)
        localStorage.setItem("oci_privateKey", privateKey)
        
        setSaveStatus("saved")
        queryClient.invalidateQueries({ queryKey: ["oci-metrics"] })
        setTimeout(() => setSaveStatus("idle"), 2500)
      } else {
        setSaveStatus("idle")
      }
    } catch {
      // Fallback
      localStorage.setItem("oci_tenancyId", tenancyId)
      localStorage.setItem("oci_userId", userId)
      localStorage.setItem("oci_region", region)
      localStorage.setItem("oci_fingerprint", fingerprint)
      localStorage.setItem("oci_privateKey", privateKey)
      setSaveStatus("saved")
      queryClient.invalidateQueries({ queryKey: ["oci-metrics"] })
      setTimeout(() => setSaveStatus("idle"), 2500)
    }
  }

  const handleTestConnection = async () => {
    setTestStatus("testing")
    setTestMessage("")
    try {
      const resp = await fetch("/api/oci-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenancyId, userId, region, fingerprint, privateKey }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setTestStatus("success")
        setTestMessage(data.message || "Connection successful!")
        
        // Remove fetching resources for dropdown here since we no longer display it in settings
      } else {
        setTestStatus("error")
        setTestMessage(data.error || "Failed to connect to Oracle Cloud")
      }
    } catch (err: any) {
      setTestStatus("error")
      setTestMessage(err.message || "Network error")
    }
    setTimeout(() => {
      if (testStatus === "success") setTestStatus("idle")
    }, 5000)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
          <Cloud className="h-4 w-4 text-orange-500" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Oracle Cloud Infrastructure (OCI)</h2>
          <p className="text-sm text-muted-foreground">
            Configure your OCI API Key to pull API Gateway metrics directly from the Oracle Cloud Telemetry API.
          </p>
        </div>
      </div>

      <Card className="border-orange-500/20 bg-orange-500/5 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <Cloud className="w-32 h-32 text-orange-500" />
        </div>
        <CardContent className="p-6 relative z-10 grid gap-6 md:grid-cols-2">
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Tenancy OCID
              </label>
              <Input value={tenancyId} onChange={e => setTenancyId(e.target.value)} placeholder="ocid1.tenancy.oc1..." className="font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                User OCID
              </label>
              <Input value={userId} onChange={e => setUserId(e.target.value)} placeholder="ocid1.user.oc1..." className="font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Region
              </label>
              <Input value={region} onChange={e => setRegion(e.target.value)} placeholder="us-chicago-1" className="font-mono text-sm" />
            </div>
          </div>

          <div className="flex flex-col h-full gap-4 pb-2">
            <div className="space-y-1.5 flex-shrink-0">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Fingerprint
              </label>
              <Input value={fingerprint} onChange={e => setFingerprint(e.target.value)} placeholder="12:34:56:78..." className="font-mono text-sm" />
            </div>
            <div className="space-y-1.5 flex flex-col flex-1 min-h-[120px]">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Private Key (PEM Format)
              </label>
              <textarea 
                value={privateKey} 
                onChange={e => setPrivateKey(e.target.value)} 
                placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"} 
                className="flex-1 min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono resize-none"
              />
            </div>
          </div>
          
          <div className="md:col-span-2 pt-4 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 border-t border-orange-500/10">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
               <Key className="w-3 h-3 text-orange-400 flex-shrink-0" /> Metrics will be grouped by 1-minute intervals.
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto justify-end">
              <div className="flex-1 flex justify-end min-w-0 mr-2 w-full sm:w-auto order-last sm:order-first">
                {testStatus === "success" && <span className="text-sm text-emerald-500 flex items-center gap-1 truncate"><CheckCircle2 className="w-4 h-4 flex-shrink-0"/> <span className="truncate">{testMessage}</span></span>}
                {testStatus === "error" && <span className="text-sm text-rose-500 flex items-center gap-1 truncate" title={testMessage}><AlertCircle className="w-4 h-4 flex-shrink-0"/> <span className="truncate">{testMessage}</span></span>}
              </div>
              
              <Button 
                onClick={handleTestConnection} 
                variant="outline"
                disabled={testStatus === "testing" || !tenancyId || !userId || !region || !fingerprint || !privateKey}
                className="w-40 border-orange-500/30 text-orange-600 hover:bg-orange-500/10"
              >
                {testStatus === "testing" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
                {testStatus === "testing" ? "Testing..." : "Test Connection"}
              </Button>
              
              <Button 
                onClick={handleSave} 
                disabled={saveStatus === "saving" || !tenancyId || !userId || !region || !fingerprint || !privateKey}
                className={cn(
                  "w-40 transition-all",
                  saveStatus === "saved" ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-orange-500 hover:bg-orange-600 text-white"
                )}
              >
                {saveStatus === "saving" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 
                 saveStatus === "saved" ? <CheckCircle2 className="w-4 h-4 mr-2" /> : 
                 <Save className="w-4 h-4 mr-2" />}
                {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : "Save Configuration"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
