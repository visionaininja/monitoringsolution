import { createContext, useContext, useState, ReactNode } from "react"

export type Environment = "dev" | "staging" | "production"

export interface K8sEnvConfig {
  host: string
  username: string
  pemPath: string
  sshPort: string
}

export const DEFAULT_ENV_CONFIG: K8sEnvConfig = {
  host: "",
  username: "",
  pemPath: "",
  sshPort: "22",
}

export interface EnvironmentContextType {
  environment: Environment
  setEnvironment: (env: Environment) => void
  getEnvConfig: (env: Environment) => K8sEnvConfig
  setEnvConfig: (env: Environment, config: K8sEnvConfig) => void
  currentEnvConfig: K8sEnvConfig
}

const EnvironmentContext = createContext<EnvironmentContextType | null>(null)

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironmentState] = useState<Environment>(() => {
    const saved = localStorage.getItem("k8s_selected_env")
    return (saved === "dev" ? "dev" : "dev")
  })

  const [configs, setConfigs] = useState<Record<Environment, K8sEnvConfig>>(() => {
    const load = (env: Environment): K8sEnvConfig => {
      try {
        const raw = localStorage.getItem(`k8s_env_${env}`)
        return raw ? JSON.parse(raw) : { ...DEFAULT_ENV_CONFIG }
      } catch {
        return { ...DEFAULT_ENV_CONFIG }
      }
    }
    return {
      dev: load("dev"),
      staging: load("staging"),
      production: load("production"),
    }
  })

  const setEnvironment = (env: Environment) => {
    setEnvironmentState(env)
    localStorage.setItem("k8s_selected_env", env)
  }

  const getEnvConfig = (env: Environment): K8sEnvConfig => configs[env]

  const setEnvConfig = (env: Environment, config: K8sEnvConfig) => {
    setConfigs((prev) => ({ ...prev, [env]: config }))
    localStorage.setItem(`k8s_env_${env}`, JSON.stringify(config))
  }

  return (
    <EnvironmentContext.Provider
      value={{
        environment,
        setEnvironment,
        getEnvConfig,
        setEnvConfig,
        currentEnvConfig: configs[environment],
      }}
    >
      {children}
    </EnvironmentContext.Provider>
  )
}

export function useEnvironment() {
  const ctx = useContext(EnvironmentContext)
  if (!ctx) throw new Error("useEnvironment must be used inside EnvironmentProvider")
  return ctx
}
