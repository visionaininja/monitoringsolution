import { useState } from "react"
import { Outlet } from "react-router-dom"
import { Sidebar, MobileTopBar } from "@/components/Sidebar"

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar — desktop: always visible; mobile: drawer overlay */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col min-w-0">
        {/* Mobile top bar with hamburger */}
        <MobileTopBar onToggle={() => setSidebarOpen(prev => !prev)} />

        <div className="w-full mx-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 max-w-7xl flex-1">
          <Outlet />
        </div>
        <footer className="w-full py-4 border-t border-white/5">
          <p className="text-xs text-zinc-500 text-center font-mono tracking-wide">
            Copyright &copy; 2026 Ryan Danielle Ubana
          </p>
        </footer>
      </main>
    </div>
  )
}
