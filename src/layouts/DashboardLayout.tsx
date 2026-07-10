import { Outlet } from "react-router-dom"
import { Sidebar } from "@/components/Sidebar"

export function DashboardLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
        <div className="container mx-auto p-8 max-w-7xl flex-1">
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
