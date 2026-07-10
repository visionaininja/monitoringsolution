import React from "react"
import { Headset, ExternalLink, ShieldAlert } from "lucide-react"

export default function SupportChat() {
  const chatUrl = "https://aichat.supportninja.com/settings/integrations"

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] w-full overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30 flex-shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Headset className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Support Chat</h1>
          <p className="text-sm text-muted-foreground">SupportNinja AI Assistant Integration</p>
        </div>
      </div>
      <div className="flex-1 w-full bg-background flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-6 bg-card border border-border rounded-xl p-8 shadow-sm">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
            <ShieldAlert className="h-8 w-8 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Embedding Blocked by Provider</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              For security reasons, SupportNinja prevents its dashboard from being embedded inside other applications to protect against clickjacking.
            </p>
          </div>
          
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-4">
              Click below to securely open the SupportNinja AI Chat in a new browser window.
            </p>
            <a 
              href={chatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Open SupportNinja Dashboard
            </a>
          </div>
          
          <div className="mt-6 rounded-lg bg-blue-500/10 p-4 text-left border border-blue-500/20">
            <p className="text-xs text-blue-400 font-medium mb-1">Looking for a widget instead?</p>
            <p className="text-[11px] text-blue-300/80">
              If SupportNinja provides a specific <code>&lt;script&gt;</code> embed snippet on their integrations page, please paste it in the chat and I can embed the native widget right into this dashboard!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
