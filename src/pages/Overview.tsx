import React from 'react'
import { Outlet } from 'react-router-dom'

export default function Overview() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold tracking-tight mb-4">DevOps Command Center</h1>
      <p className="text-muted-foreground mb-8">
        Please select a specific overview from the sidebar to view metrics.
      </p>
    </div>
  )
}
