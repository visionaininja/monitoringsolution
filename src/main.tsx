import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EnvironmentProvider } from './context/EnvironmentContext.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <EnvironmentProvider>
          <App />
        </EnvironmentProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
