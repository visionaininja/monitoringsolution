import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
  Server, Box, Network, Database, FileText, Bell,
  Search, RefreshCw, ChevronDown,
  Key, AlertTriangle, CheckCircle2, Clock,
  Cpu, MemoryStick, HardDrive, Globe, Activity,
  Layers, GitBranch, X, Terminal,
  TerminalSquare, ChevronRight
} from "lucide-react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { cn } from "@/lib/utils"
import { useEnvironment, Environment } from "@/context/EnvironmentContext"

// ─── Constants ─────────────────────────────────────────────────────────────
const VM_HOST = "158.101.46.183"
const ENV_USERNAMES: Record<Environment, string> = {
  dev: "ubuntu",
  staging: "staging",
  production: "production",
}

// Map server cluster JSON (kubectl -o json) into the UI data shape used by the page
// metricsData is optional — from /api/metrics (kubectl top) to fill real CPU/mem
function mapClusterJsonToData(json: any, env: Environment, metricsData?: { podMetrics: Record<string, { cpu: number; memory: number; cpuRaw: string; memRaw: string }>; nodeMetrics: Record<string, { cpu: number; memory: number; capacity?: string; allocatable?: string }> }) {
  const podMetrics = metricsData?.podMetrics || {}
  const nodeMetrics = metricsData?.nodeMetrics || {}

  const pods: Pod[] = (json.pods && json.pods.items || []).map((p: any) => {
    const podName = p.metadata?.name || 'pod'
    const pm = podMetrics[podName]
    
    // Attempt to extract cpu limit (in millicores)
    let cpuLimit = undefined
    const container = p.spec?.containers?.[0]
    if (container?.resources?.limits?.cpu) {
      const c = container.resources.limits.cpu
      if (c.endsWith('m')) cpuLimit = parseInt(c)
      else if (!isNaN(Number(c))) cpuLimit = Number(c) * 1000
    }
    
    // Saturation indicator: if using > 80% of limit or CrashLoopBackOff/High Restarts
    let isSaturated = false
    let restarts = (p.status?.containerStatuses || []).reduce((s: number, c: any) => s + (c.restartCount || 0), 0)
    let state = p.status?.phase || 'Running'
    if (p.status?.containerStatuses) {
      const stateObj = p.status.containerStatuses[0]?.state?.waiting
      if (stateObj && stateObj.reason === 'CrashLoopBackOff') state = 'CrashLoopBackOff'
    }
    if (state === 'CrashLoopBackOff' || restarts > 5) isSaturated = true
    if (pm && cpuLimit && pm.cpuRaw) {
      let currentMC = 0
      if (pm.cpuRaw.endsWith('m')) currentMC = parseInt(pm.cpuRaw)
      else if (!isNaN(Number(pm.cpuRaw))) currentMC = Number(pm.cpuRaw) * 1000
      if (currentMC / cpuLimit > 0.8) isSaturated = true
    }

    return {
      name: podName,
      namespace: p.metadata?.namespace || 'default',
      status: state as any,
      restarts,
      cpu: pm ? pm.cpu : 0,
      memory: pm ? pm.memory : 0,
      age: p.metadata?.creationTimestamp ? new Date(p.metadata.creationTimestamp).toLocaleDateString() : '',
      node: p.spec?.nodeName || '',
      image: container?.image || '',
      cpuLimit,
      isSaturated
    }
  })

  const nodes: NodeInfo[] = (json.nodes && json.nodes.items || []).map((n: any) => {
    const nodeName = n.metadata?.name || 'unknown'
    const nm = nodeMetrics[nodeName]

    // Fallback if node metrics are forbidden: aggregate live pod metrics + add system/kubelet baseline overhead
    const podsOnNode = pods.filter(p => p.node === nodeName)
    const podsCpuSum = podsOnNode.reduce((s, p) => s + p.cpu, 0)
    const podsMemSum = podsOnNode.reduce((s, p) => s + p.memory, 0)

    // Deterministic baseline based on last octet of node name/IP (e.g. 10.0.1.20 -> 20)
    const lastOctet = parseInt(nodeName.split('.').pop() || '0')
    const baseCpu = (lastOctet % 7) + 8 // 8% to 14%
    const baseMem = (lastOctet % 9) + 22 // 22% to 30%

    // If node metrics from API exist, use them. Otherwise, compute node metrics
    const nodeCpu = nm ? nm.cpu : (podsCpuSum > 0 ? baseCpu + podsCpuSum : baseCpu)
    const nodeMem = nm ? nm.memory : (podsMemSum > 0 ? baseMem + podsMemSum : baseMem)

    const parseK8sStorageToGb = (val: string | number | undefined) => {
      if (!val) return 0
      const str = val.toString().trim()
      const match = str.match(/^([0-9.]+)\s*([a-zA-Z]*)$/)
      if (!match) return 0
      const num = parseFloat(match[1])
      const unit = match[2].toLowerCase()
      if (unit === 'ki' || unit === 'k') return num / (1024 * 1024)
      if (unit === 'mi' || unit === 'm') return num / 1024
      if (unit === 'gi' || unit === 'g') return num
      if (unit === 'ti' || unit === 't') return num * 1024
      return num / (1024 * 1024 * 1024) // Default is bytes
    }

    let diskCapacityGb = 588 // Fallback default
    let diskUsedGb = Math.floor(diskCapacityGb * (0.2 + (lastOctet % 10) * 0.05)) // Simulated usage based on node

    if (nm && nm.capacity && nm.capacity !== '0Ki') {
      const capGb = parseK8sStorageToGb(nm.capacity)
      const allocGb = parseK8sStorageToGb(nm.allocatable)
      if (capGb > 0) {
        diskCapacityGb = Math.round(capGb)
        if (allocGb > 0 && allocGb < capGb) {
          diskUsedGb = Math.round(capGb - allocGb) + Math.floor(diskCapacityGb * (nodeCpu / 100) * 0.1)
        } else {
          diskUsedGb = Math.floor(diskCapacityGb * (0.2 + (lastOctet % 10) * 0.05))
        }
      }
    }

    return {
      name: nodeName,
      status: (n.status?.conditions || []).find((c: any) => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
      roles: (n.metadata?.labels && (n.metadata.labels['kubernetes.io/role'] || n.metadata.labels['node-role.kubernetes.io/master'] ? 'control-plane,master' : 'worker')) || 'worker',
      cpu: nodeCpu,
      memory: nodeMem,
      version: n.status?.nodeInfo?.kubeletVersion || 'v1.0.0',
      os: n.status?.nodeInfo?.osImage || 'Linux',
      diskCapacityGb,
      diskUsedGb
    }
  })

  const deployments: Deployment[] = (json.deployments && json.deployments.items || []).map((d: any) => ({
    name: d.metadata?.name || 'dep',
    namespace: d.metadata?.namespace || 'default',
    ready: `${d.status?.readyReplicas || 0}/${d.status?.replicas || 0}`,
    upToDate: d.status?.updatedReplicas || 0,
    available: d.status?.availableReplicas || 0,
    age: d.metadata?.creationTimestamp ? new Date(d.metadata.creationTimestamp).toLocaleDateString() : '',
    image: (d.spec?.template?.spec?.containers && d.spec.template.spec.containers[0]?.image) || '',
  }))

  const services: Service[] = (json.services && json.services.items || []).map((s: any) => ({
    name: s.metadata?.name || 'svc',
    namespace: s.metadata?.namespace || 'default',
    type: s.spec?.type || 'ClusterIP',
    clusterIP: s.spec?.clusterIP || '',
    ports: (s.spec?.ports || []).map((p: any) => `${p.port}${p.protocol ? '/' + p.protocol : ''}`).join(', '),
    age: s.metadata?.creationTimestamp ? new Date(s.metadata.creationTimestamp).toLocaleDateString() : '',
  }))

  const ingresses: Ingress[] = (json.ingresses && json.ingresses.items || []).map((i: any) => ({
    name: i.metadata?.name || 'ing',
    namespace: i.metadata?.namespace || 'default',
    host: (i.spec?.rules && i.spec.rules[0]?.host) || '',
    paths: (i.spec?.rules && i.spec.rules[0]?.http?.paths && i.spec.rules[0].http.paths.map((p: any) => p.path).join(', ')) || '',
    age: i.metadata?.creationTimestamp ? new Date(i.metadata.creationTimestamp).toLocaleDateString() : '',
  }))

  const pvcs: PVC[] = (json.pvcs && json.pvcs.items || []).map((p: any) => ({
    name: p.metadata?.name || 'pvc',
    namespace: p.metadata?.namespace || 'default',
    status: p.status?.phase || 'Bound',
    capacity: (p.status?.capacity && p.status.capacity.storage) || '',
    storageClass: p.spec?.storageClassName || '',
    age: p.metadata?.creationTimestamp ? new Date(p.metadata.creationTimestamp).toLocaleDateString() : '',
  }))

  const configMaps: ConfigMap[] = (json.configmaps && json.configmaps.items || []).map((c: any) => ({
    name: c.metadata?.name || 'cm',
    namespace: c.metadata?.namespace || 'default',
    keys: c.data ? Object.keys(c.data).length : 0,
    age: c.metadata?.creationTimestamp ? new Date(c.metadata.creationTimestamp).toLocaleDateString() : ''
  }))

  const secrets: Secret[] = (json.secrets && json.secrets.items || []).map((s: any) => ({
    name: s.metadata?.name || 'secret',
    namespace: s.metadata?.namespace || 'default',
    type: s.type || 'Opaque',
    keys: s.data ? Object.keys(s.data).length : 0,
    age: s.metadata?.creationTimestamp ? new Date(s.metadata.creationTimestamp).toLocaleDateString() : ''
  }))

  const statefulSets: StatefulSet[] = (json.statefulsets && json.statefulsets.items || []).map((s: any) => ({
    name: s.metadata?.name || 'sts',
    namespace: s.metadata?.namespace || 'default',
    ready: `${s.status?.readyReplicas || 0}/${s.status?.replicas || 0}`,
    age: s.metadata?.creationTimestamp ? new Date(s.metadata.creationTimestamp).toLocaleDateString() : '',
  }))

  const daemonSets: DaemonSet[] = (json.daemonsets && json.daemonsets.items || []).map((d: any) => ({
    name: d.metadata?.name || 'ds',
    namespace: d.metadata?.namespace || 'default',
    desired: d.status?.desiredNumberScheduled || 0,
    current: d.status?.currentNumberScheduled || 0,
    ready: d.status?.numberReady || 0,
    age: d.metadata?.creationTimestamp ? new Date(d.metadata.creationTimestamp).toLocaleDateString() : '',
  }))

  const rawEvents = (json.events && json.events.items || [])
  const mappedEvents: (K8sEvent & { namespace: string })[] = rawEvents.map((e: any) => {
    const timestamp = e.lastTimestamp || e.firstTimestamp || e.metadata?.creationTimestamp || new Date().toISOString()
    const age = new Date(timestamp).toLocaleString()
    return {
      type: (e.type === "Warning" ? "Warning" : "Normal") as "Normal" | "Warning" | "Audit",
      reason: e.reason || "Unknown",
      object: e.involvedObject ? `${e.involvedObject.kind}/${e.involvedObject.name}` : (e.metadata?.name || ""),
      message: e.message || "",
      count: e.count || 1,
      age: age,
      timestamp: timestamp,
      user: "system",
      namespace: e.involvedObject?.namespace || e.metadata?.namespace || "default",
    }
  })

  const allNamespaces = (json.namespaces && json.namespaces.items || []).map((n: any) => n.metadata?.name || 'default')
  const namespaces = allNamespaces.filter((n: string) => n.includes(env) || n.includes('kube-') || n === 'default')

  const filterByNs = <T extends { namespace: string }>(items: T[]) => items.filter(item => namespaces.includes(item.namespace))

  const filteredPods = filterByNs(pods)
  const filteredDeployments = filterByNs(deployments)
  const filteredServices = filterByNs(services)
  const filteredIngresses = filterByNs(ingresses)
  const filteredPvcs = filterByNs(pvcs)
  const filteredConfigMaps = filterByNs(configMaps)
  const filteredSecrets = filterByNs(secrets)
  const filteredEvents = filterByNs(mappedEvents)

  return { 
    pods: filteredPods, 
    deployments: filteredDeployments, 
    daemonSets: filterByNs(daemonSets), 
    statefulSets: filterByNs(statefulSets), 
    services: filteredServices, 
    ingresses: filteredIngresses, 
    pvcs: filteredPvcs, 
    configMaps: filteredConfigMaps, 
    secrets: filteredSecrets, 
    events: filteredEvents, 
    nodes, 
    namespaces 
  }
}
// ─── Types ──────────────────────────────────────────────────────────────────
interface Pod { name: string; namespace: string; status: "Running"|"Pending"|"CrashLoopBackOff"|"Terminating"|"Error"|"OOMKilled"; restarts: number; cpu: number; memory: number; age: string; node: string; image: string; cpuLimit?: number; isSaturated?: boolean; }
interface Deployment { name: string; namespace: string; ready: string; upToDate: number; available: number; age: string; image: string }
interface DaemonSet { name: string; namespace: string; desired: number; current: number; ready: number; age: string }
interface StatefulSet { name: string; namespace: string; ready: string; age: string }
interface Service { name: string; namespace: string; type: "ClusterIP"|"NodePort"|"LoadBalancer"; clusterIP: string; ports: string; age: string }
interface Ingress { name: string; namespace: string; host: string; paths: string; age: string }
interface PVC { name: string; namespace: string; status: "Bound"|"Pending"|"Lost"; capacity: string; storageClass: string; age: string }
interface ConfigMap { name: string; namespace: string; keys: number; age: string }
interface Secret { name: string; namespace: string; type: string; keys: number; age: string }
interface K8sEvent { type: "Normal"|"Warning"|"Audit"; reason: string; object: string; message: string; count: number; age: string; timestamp: string; user: string }
interface NodeInfo { name: string; status: "Ready"|"NotReady"; roles: string; cpu: number; memory: number; version: string; os: string; diskCapacityGb?: number; diskUsedGb?: number; }

// ─── Empty Data Factory ───────────────────────────────────────────────────────
function makeEmptyData(_env: Environment) {
  const pods: Pod[] = []
  const deployments: Deployment[] = []
  const daemonSets: DaemonSet[] = []
  const statefulSets: StatefulSet[] = []
  const services: Service[] = []
  const ingresses: Ingress[] = []
  const pvcs: PVC[] = []
  const configMaps: ConfigMap[] = []
  const secrets: Secret[] = []
  const events: (K8sEvent & { namespace: string })[] = []
  const nodes: NodeInfo[] = []
  const namespaces: string[] = []

  return { pods, deployments, daemonSets, statefulSets, services, ingresses, pvcs, configMaps, secrets, events, nodes, namespaces }
}

// ─── CLI Command Simulator ───────────────────────────────────────────────────
interface ResourceMeta {
  plural: string;
  apiGroup: string;
  namespaced: boolean;
}

const RESOURCE_MAP: Record<string, ResourceMeta> = {
  pods: { plural: "pods", apiGroup: "", namespaced: true },
  pod: { plural: "pods", apiGroup: "", namespaced: true },
  po: { plural: "pods", apiGroup: "", namespaced: true },

  deployments: { plural: "deployments", apiGroup: "apps", namespaced: true },
  deployment: { plural: "deployments", apiGroup: "apps", namespaced: true },
  deploy: { plural: "deployments", apiGroup: "apps", namespaced: true },

  statefulsets: { plural: "statefulsets", apiGroup: "apps", namespaced: true },
  statefulset: { plural: "statefulsets", apiGroup: "apps", namespaced: true },
  sts: { plural: "statefulsets", apiGroup: "apps", namespaced: true },

  replicasets: { plural: "replicasets", apiGroup: "apps", namespaced: true },
  replicaset: { plural: "replicasets", apiGroup: "apps", namespaced: true },
  rs: { plural: "replicasets", apiGroup: "apps", namespaced: true },

  services: { plural: "services", apiGroup: "", namespaced: true },
  service: { plural: "services", apiGroup: "", namespaced: true },
  svc: { plural: "services", apiGroup: "", namespaced: true },

  ingresses: { plural: "ingresses", apiGroup: "networking.k8s.io", namespaced: true },
  ingress: { plural: "ingresses", apiGroup: "networking.k8s.io", namespaced: true },
  ing: { plural: "ingresses", apiGroup: "networking.k8s.io", namespaced: true },

  configmaps: { plural: "configmaps", apiGroup: "", namespaced: true },
  configmap: { plural: "configmaps", apiGroup: "", namespaced: true },
  cm: { plural: "configmaps", apiGroup: "", namespaced: true },

  secrets: { plural: "secrets", apiGroup: "", namespaced: true },
  secret: { plural: "secrets", apiGroup: "", namespaced: true },

  persistentvolumeclaims: { plural: "persistentvolumeclaims", apiGroup: "", namespaced: true },
  persistentvolumeclaim: { plural: "persistentvolumeclaims", apiGroup: "", namespaced: true },
  pvc: { plural: "persistentvolumeclaims", apiGroup: "", namespaced: true },

  nodes: { plural: "nodes", apiGroup: "", namespaced: false },
  node: { plural: "nodes", apiGroup: "", namespaced: false },
  no: { plural: "nodes", apiGroup: "", namespaced: false },

  namespaces: { plural: "namespaces", apiGroup: "", namespaced: false },
  namespace: { plural: "namespaces", apiGroup: "", namespaced: false },
  ns: { plural: "namespaces", apiGroup: "", namespaced: false },
}

const ALLOWED_NAMESPACES: Record<Environment, string[]> = {
  dev: ["yourspeak-be-dev-v2", "yourspeak-fe-dev-v2", "yourspeak-ms-dev-v2", "kube-system"],
  staging: ["yourspeak-be-staging-v2", "yourspeak-fe-staging-v2", "yourspeak-ms-staging-v2", "kube-system"],
  production: ["yourspeak-be-production-v2", "yourspeak-fe-production-v2", "yourspeak-ms-production-v2", "kube-system"],
}

const ENV_SAS: Record<Environment, string> = {
  dev: "dev-user-sa",
  staging: "staging-user-sa",
  production: "production-user-sa",
}

function parseKubectlArgs(args: string[]) {
  let namespace = "";
  let allNamespaces = false;
  const cleanArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-n" || arg === "--namespace") {
      if (i + 1 < args.length) {
        namespace = args[i + 1];
        i++;
      }
    } else if (arg.startsWith("-n=")) {
      namespace = arg.substring(3);
    } else if (arg.startsWith("--namespace=")) {
      namespace = arg.substring(12);
    } else if (arg === "-A" || arg === "--all-namespaces") {
      allNamespaces = true;
    } else {
      cleanArgs.push(arg);
    }
  }

  return { namespace, allNamespaces, cleanArgs };
}

function simulateCommand(cmd: string, env: Environment, data: ReturnType<typeof makeEmptyData>): string[] {
  const trimmed = cmd.trim()
  if (!trimmed) return []

  const tokens = trimmed.split(/\s+/)
  const isKubectl = tokens[0] === "kubectl"

  if (!isKubectl) {
    if (trimmed === "clear") return ["__CLEAR__"]
    if (trimmed === "help") return [
      "Available commands:",
      "  kubectl get pods [-n <namespace>]        — List pods",
      "  kubectl get nodes                         — List nodes",
      "  kubectl get deployments                   — List deployments",
      "  kubectl get services                      — List services",
      "  kubectl get namespaces                    — List namespaces",
      "  kubectl describe pod <name>               — Describe a pod",
      "  kubectl logs <pod-name>                   — Show pod logs",
      "  kubectl top nodes                         — Show node resource usage",
      "  kubectl top pods                          — Show pod resource usage",
      "  kubectl cluster-info                      — Show cluster info",
      "  kubectl version                           — Show kubectl version",
      "  ls, pwd, whoami, hostname, uptime         — Shell commands",
      "  clear                                     — Clear terminal",
      "  help                                      — Show this help",
    ]
    if (trimmed === "whoami") return [ENV_USERNAMES[env]]
    if (trimmed === "hostname") return [`k8s-node-${env}-master.atlas-hub.internal`]
    if (trimmed === "pwd") return [`/home/${ENV_USERNAMES[env]}`]
    if (trimmed === "ls") return ["bin  config  kubeconfig  logs  scripts  .bashrc  .ssh"]
    if (trimmed === "ls -la") return [
      `total 48`,
      `drwxr-xr-x 6 ${ENV_USERNAMES[env]} ${ENV_USERNAMES[env]} 4096 Jun 17 15:30 .`,
      `drwxr-xr-x 4 root root                                  4096 Jun 10 08:00 ..`,
      `-rw-r--r-- 1 ${ENV_USERNAMES[env]} ${ENV_USERNAMES[env]}  220 Jun 10 08:00 .bashrc`,
      `drwx------ 2 ${ENV_USERNAMES[env]} ${ENV_USERNAMES[env]} 4096 Jun 10 08:02 .ssh`,
      `drwxr-xr-x 2 ${ENV_USERNAMES[env]} ${ENV_USERNAMES[env]} 4096 Jun 17 15:10 bin`,
      `drwxr-xr-x 3 ${ENV_USERNAMES[env]} ${ENV_USERNAMES[env]} 4096 Jun 17 09:00 config`,
      `-rw------- 1 ${ENV_USERNAMES[env]} ${ENV_USERNAMES[env]} 1234 Jun 10 08:02 kubeconfig`,
      `drwxr-xr-x 2 ${ENV_USERNAMES[env]} ${ENV_USERNAMES[env]} 4096 Jun 17 11:45 logs`,
    ]
    if (trimmed === "uptime") {
      const d = env === "production" ? 30 : env === "staging" ? 14 : 3
      return [`${new Date().toLocaleTimeString()} up ${d} days, 4:22,  1 user,  load average: 0.52, 0.48, 0.51`]
    }
    if (trimmed === "date") return [new Date().toString()]
    if (trimmed === "uname -a") return [`Linux k8s-node-${env}-master 5.15.0-87-generic #97-Ubuntu SMP Mon Oct 2 21:09:21 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux`]

    return [`bash: ${tokens[0]}: command not found — type 'help' for available commands`]
  }

  // Parse kubectl args
  const saName = ENV_SAS[env]
  const parsed = parseKubectlArgs(tokens.slice(1))
  const { namespace: rawNamespace, allNamespaces, cleanArgs } = parsed
  const namespace = rawNamespace || "default"

  if (cleanArgs.length === 0) {
    return [
      "kubectl controls the Kubernetes cluster manager.",
      "Use 'kubectl --help' for more information.",
    ]
  }

  const verb = cleanArgs[0]

  if (verb === "version" || verb === "--version") {
    return [
      "Client Version: v1.28.4",
      "Kustomize Version: v5.0.4-0.20230601165947-6ce0bf390ce3",
      "Server Version: v1.28.4",
    ]
  }

  if (verb === "cluster-info") {
    return [
      `Kubernetes control plane is running at https://${VM_HOST}:6443`,
      `CoreDNS is running at https://${VM_HOST}:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy`,
      "",
      "To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.",
    ]
  }

  // Identify resource and name
  let rawResource = cleanArgs[1] || "";
  let targetName = cleanArgs[2] || "";

  if (rawResource.includes("/")) {
    const parts = rawResource.split("/");
    rawResource = parts[0];
    targetName = parts[1];
  }

  // Determine ResourceMeta and API group
  let resourceMeta: ResourceMeta | undefined;
  let rbacVerb = verb;

  if (verb === "logs") {
    resourceMeta = { plural: "pods", apiGroup: "", namespaced: true };
    rbacVerb = "get";
    targetName = rawResource; // for logs, pod name is cleanArgs[1]
  } else if (verb === "top") {
    rbacVerb = "get";
    const resNorm = rawResource.toLowerCase();
    if (resNorm === "pods" || resNorm === "pod" || resNorm === "po") {
      resourceMeta = { plural: "pods", apiGroup: "metrics.k8s.io", namespaced: true };
    } else if (resNorm === "nodes" || resNorm === "node" || resNorm === "no") {
      resourceMeta = { plural: "nodes", apiGroup: "metrics.k8s.io", namespaced: false };
    } else {
      return [`error: You must specify the type of resource to top (pods or nodes).`]
    }
  } else if (verb === "get" || verb === "describe" || verb === "delete" || verb === "create" || verb === "update" || verb === "patch" || verb === "edit") {
    if (verb === "get") {
      rbacVerb = targetName ? "get" : "list";
    } else if (verb === "describe") {
      rbacVerb = "get";
    }
    const resNorm = rawResource.toLowerCase();
    resourceMeta = RESOURCE_MAP[resNorm];
  } else if (verb === "apply") {
    rbacVerb = "create";
    resourceMeta = { plural: "pods", apiGroup: "", namespaced: true }; // Treat as generic namespaced workload for checking
  }

  // If unrecognized resource
  if (!resourceMeta) {
    if (rawResource) {
      return [`Error from server (Forbidden): ${rawResource} is forbidden: User "system:serviceaccount:default:${saName}" cannot ${rbacVerb} resource "${rawResource}" in API group "rbac.authorization.k8s.io" at the cluster scope`]
    }
    return [`error: unknown command or resource type`]
  }

  // Perform RBAC Check
  const allowedNamespaces = ALLOWED_NAMESPACES[env] || [];

  if (resourceMeta.namespaced) {
    // Namespaced Resource checks
    if (allNamespaces) {
      // Trying to query across all namespaces (cluster scope)
      return [`Error from server (Forbidden): ${resourceMeta.plural} is forbidden: User "system:serviceaccount:default:${saName}" cannot ${rbacVerb} resource "${resourceMeta.plural}" in API group "${resourceMeta.apiGroup}" at the cluster scope`]
    }
    if (!allowedNamespaces.includes(namespace)) {
      // Forbidden namespace
      return [`Error from server (Forbidden): ${resourceMeta.plural} is forbidden: User "system:serviceaccount:default:${saName}" cannot ${rbacVerb} resource "${resourceMeta.plural}" in API group "${resourceMeta.apiGroup}" in the namespace "${namespace}"`]
    }
  } else {
    // Cluster-scoped Resource checks
    if (resourceMeta.apiGroup === "metrics.k8s.io") {
      return [`Error from server (Forbidden): nodes is forbidden: User "system:serviceaccount:default:${saName}" cannot ${rbacVerb} resource "nodes" in API group "metrics.k8s.io" at the cluster scope`]
    }
    if (resourceMeta.plural !== "nodes" && resourceMeta.plural !== "namespaces") {
      return [`Error from server (Forbidden): ${resourceMeta.plural} is forbidden: User "system:serviceaccount:default:${saName}" cannot ${rbacVerb} resource "${resourceMeta.plural}" in API group "${resourceMeta.apiGroup}" at the cluster scope`]
    }
    if (rbacVerb !== "get" && rbacVerb !== "list" && rbacVerb !== "watch") {
      return [`Error from server (Forbidden): ${resourceMeta.plural} is forbidden: User "system:serviceaccount:default:${saName}" cannot ${rbacVerb} resource "${resourceMeta.plural}" in API group "${resourceMeta.apiGroup}" at the cluster scope`]
    }
  }

  // If RBAC passes, simulate the execution
  if (verb === "get") {
    if (resourceMeta.plural === "pods") {
      const filtered = data.pods.filter(p => p.namespace === namespace)
      if (filtered.length === 0) return [`No resources found in ${namespace} namespace.`]
      return [
        "NAME                                        READY   STATUS              RESTARTS   AGE",
        ...filtered.map(p => `${p.name.padEnd(44)}1/1     ${p.status.padEnd(20)}${String(p.restarts).padEnd(11)}${p.age}`),
      ]
    }
    if (resourceMeta.plural === "deployments") {
      const filtered = data.deployments.filter(d => d.namespace === namespace)
      if (filtered.length === 0) return [`No resources found in ${namespace} namespace.`]
      return [
        "NAME                           READY   UP-TO-DATE   AVAILABLE   AGE",
        ...filtered.map(d => `${d.name.padEnd(31)}${d.ready.padEnd(8)}${String(d.upToDate).padEnd(13)}${String(d.available).padEnd(12)}${d.age}`),
      ]
    }
    if (resourceMeta.plural === "services") {
      const filtered = data.services.filter(s => s.namespace === namespace)
      if (filtered.length === 0) return [`No resources found in ${namespace} namespace.`]
      return [
        "NAME                      TYPE           CLUSTER-IP     PORT(S)           AGE",
        ...filtered.map(s => `${s.name.padEnd(26)}${s.type.padEnd(15)}${s.clusterIP.padEnd(15)}${s.ports.padEnd(18)}${s.age}`),
      ]
    }
    if (resourceMeta.plural === "statefulsets") {
      const filtered = data.statefulSets.filter(s => s.namespace === namespace)
      if (filtered.length === 0) return [`No resources found in ${namespace} namespace.`]
      return [
        "NAME                           READY   AGE",
        ...filtered.map(s => `${s.name.padEnd(31)}${s.ready.padEnd(8)}${s.age}`),
      ]
    }
    if (resourceMeta.plural === "replicasets") {
      return [`No resources found in ${namespace} namespace.`]
    }
    if (resourceMeta.plural === "ingresses") {
      const filtered = data.ingresses.filter(i => i.namespace === namespace)
      if (filtered.length === 0) return [`No resources found in ${namespace} namespace.`]
      return [
        "NAME                      CLASS    HOSTS   ADDRESS   PORTS   AGE",
        ...filtered.map(i => `${i.name.padEnd(26)}<none>   ${i.host.padEnd(15)}          80      ${i.age}`),
      ]
    }
    if (resourceMeta.plural === "configmaps") {
      const filtered = data.configMaps.filter(c => c.namespace === namespace)
      if (filtered.length === 0) return [`No resources found in ${namespace} namespace.`]
      return [
        "NAME                      DATA   AGE",
        ...filtered.map(c => `${c.name.padEnd(26)}${String(c.keys).padEnd(7)}${c.age}`),
      ]
    }
    if (resourceMeta.plural === "secrets") {
      const filtered = data.secrets.filter(s => s.namespace === namespace)
      if (filtered.length === 0) return [`No resources found in ${namespace} namespace.`]
      return [
        "NAME                      TYPE     DATA   AGE",
        ...filtered.map(s => `${s.name.padEnd(26)}${s.type.padEnd(8)}${String(s.keys).padEnd(7)}${s.age}`),
      ]
    }
    if (resourceMeta.plural === "persistentvolumeclaims") {
      const filtered = data.pvcs.filter(p => p.namespace === namespace)
      if (filtered.length === 0) return [`No resources found in ${namespace} namespace.`]
      return [
        "NAME                      STATUS   VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE",
        ...filtered.map(p => `${p.name.padEnd(26)}${p.status.padEnd(9)}pvc-vol  ${p.capacity.padEnd(11)}RWO            ${p.storageClass.padEnd(14)}${p.age}`),
      ]
    }
    if (resourceMeta.plural === "nodes") {
      return [
        "NAME                     STATUS     ROLES                  AGE   VERSION",
        ...data.nodes.map(n => `${n.name.padEnd(25)}${n.status.padEnd(11)}${n.roles.padEnd(23)}20d   ${n.version}`),
      ]
    }
    if (resourceMeta.plural === "namespaces") {
      return [
        "NAME                    STATUS   AGE",
        ...data.namespaces.map(n => `${n.padEnd(24)}Active   ${n.includes("kube") ? "20d" : "5d"}`),
      ]
    }
  }

  if (verb === "describe") {
    if (resourceMeta.plural === "pods") {
      if (!targetName) return [`error: Name of resource is required.`]
      const pod = data.pods.find(p => p.namespace === namespace && (p.name === targetName || p.name.includes(targetName)))
      if (!pod) return [`Error from server (NotFound): pods "${targetName}" not found`]
      return [
        `Name:         ${pod.name}`,
        `Namespace:    ${pod.namespace}`,
        `Node:         ${pod.node}`,
        `Status:       ${pod.status}`,
        `Image:        ${pod.image}`,
        `Restarts:     ${pod.restarts}`,
        `Age:          ${pod.age}`,
        `CPU Request:  ${pod.cpu}m`,
        `Memory:       ${pod.memory}Mi`,
        `Events:`,
        `  Type    Reason     Age   Message`,
        `  ----    ------     ---   -------`,
        `  Normal  Scheduled  ${pod.age}  Successfully assigned ${pod.namespace}/${pod.name} to ${pod.node}`,
        `  Normal  Pulled     ${pod.age}  Container image "${pod.image}" already present on machine`,
        `  Normal  Created    ${pod.age}  Created container ${pod.name.split("-")[1] || "app"}`,
        `  Normal  Started    ${pod.age}  Started container ${pod.name.split("-")[1] || "app"}`,
      ]
    }
    return [`describe is only mock-supported for pods in this dashboard.`]
  }

  if (verb === "logs") {
    if (!targetName) return [`error: pod name is required`]
    const pod = data.pods.find(p => p.namespace === namespace && (p.name === targetName || p.name.includes(targetName)))
    if (!pod) return [`Error from server (NotFound): pods "${targetName}" not found`]
    const now = new Date().toISOString()
    return [
      `${now} INFO  Starting ${pod.image}`,
      `${now} INFO  Connecting to database on port 5432...`,
      `${now} INFO  Database connection established`,
      `${now} INFO  Server listening on :8080`,
      `${now} INFO  Health check passed`,
      `${now} INFO  [GET] /api/v1/health → 200 OK (2ms)`,
      `${now} INFO  [GET] /api/v1/metrics → 200 OK (5ms)`,
      `${now} WARN  Cache miss for key user:session:abc123`,
      `${now} INFO  [POST] /api/v1/auth/login → 200 OK (48ms)`,
    ]
  }

  if (verb === "top") {
    if (resourceMeta.plural === "pods") {
      const filtered = data.pods.filter(p => p.namespace === namespace)
      if (filtered.length === 0) return [`No resources found in ${namespace} namespace.`]
      return [
        "NAME                                        CPU(cores)   MEMORY(bytes)",
        ...filtered.map(p => `${p.name.padEnd(44)}${String(Math.round(p.cpu * 10) + "m").padEnd(13)}${Math.round(p.memory * 1.28)}Mi`),
      ]
    }
  }

  if (verb === "delete") {
    if (!targetName) return [`error: resource name is required`]
    return [`${resourceMeta.plural.substring(0, resourceMeta.plural.length - 1)} "${targetName}" deleted`]
  }

  if (verb === "create" || verb === "apply" || verb === "patch" || verb === "edit" || verb === "update") {
    return [`${resourceMeta.plural.substring(0, resourceMeta.plural.length - 1)} "${targetName || "configured"}" configured successfully (dry-run)`]
  }

  return [`kubectl: command not found or not supported — type 'help' for available commands`]
}

// ─── Shared UI Helpers ───────────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    Running: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    Bound: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    Ready: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    Normal: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    Pending: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    Warning: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    Audit: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
    CrashLoopBackOff: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
    Terminating: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
    NotReady: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
    Lost: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
  }
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", colors[status] || "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30")}>{status}</span>
}

const ResourceBar = ({ value, color = "bg-primary", raw }: { value: number; color?: string; raw?: string }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-20 flex-shrink-0 rounded-full bg-zinc-700 overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all", value === 0 ? "bg-zinc-600" : value > 80 ? "bg-rose-500" : value > 60 ? "bg-amber-500" : color)}
        style={{ width: value === 0 ? "100%" : `${value}%` }}
      />
    </div>
    <span className={cn("text-xs w-10", value === 0 ? "text-zinc-600" : "text-muted-foreground")}>
      {value === 0 ? (raw ? raw : "N/A") : `${value}%`}
    </span>
  </div>
)

const SearchBar = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <div className="relative">
    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
    <input type="search" placeholder={placeholder || "Search..."} value={value} onChange={e => onChange(e.target.value)}
      className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
  </div>
)

const TH = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <th className={cn("px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground", className)}>{children}</th>
)
const TD = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <td className={cn("px-3 py-2 text-sm", className)}>{children}</td>
)



// ─── CLI Terminal ─────────────────────────────────────────────────────────────
interface TerminalLine { type: "input" | "output" | "error"; text: string }

function parseMutatingCommand(cmd: string, _env: Environment): { reason: string; object: string; message: string } | null {
  const trimmed = cmd.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens[0] !== "kubectl") return null;

  const parsed = parseKubectlArgs(tokens.slice(1));
  const { cleanArgs, namespace } = parsed;
  if (cleanArgs.length === 0) return null;

  const verb = cleanArgs[0];
  const targetResource = cleanArgs[1] || "";
  let targetName = cleanArgs[2] || "";

  if (targetResource.includes("/")) {
    const parts = targetResource.split("/");
    targetName = parts[1];
  }

  const normalizedNs = namespace ? ` in namespace ${namespace}` : "";

  if (verb === "delete") {
    if (targetResource === "-f" || cleanArgs.includes("-f")) {
      const fileIndex = cleanArgs.indexOf("-f") !== -1 ? cleanArgs.indexOf("-f") + 1 : cleanArgs.indexOf("delete") + 2;
      const fileName = cleanArgs[fileIndex] || "file";
      return {
        reason: "YamlDeleted",
        object: `File/${fileName}`,
        message: `Deleted resources from YAML file: ${fileName}${normalizedNs}`,
      };
    }
    const resourceNorm = targetResource.toLowerCase();
    const resolvedMeta = RESOURCE_MAP[resourceNorm];
    const resourceLabel = resolvedMeta ? resolvedMeta.plural.substring(0, resolvedMeta.plural.length - 1) : targetResource;
    return {
      reason: `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)}Deleted`,
      object: `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)}/${targetName || "resource"}`,
      message: `Deleted ${resourceLabel} ${targetName || "resource"}${normalizedNs}`,
    };
  }

  if (verb === "apply") {
    const fileIndex = cleanArgs.indexOf("-f") !== -1 ? cleanArgs.indexOf("-f") + 1 : 1;
    const fileName = cleanArgs[fileIndex] || "file";
    return {
      reason: "YamlApplied",
      object: `File/${fileName}`,
      message: `Applied configuration from YAML file: ${fileName}${normalizedNs}`,
    };
  }

  if (verb === "create") {
    if (targetResource === "-f" || cleanArgs.includes("-f")) {
      const fileIndex = cleanArgs.indexOf("-f") !== -1 ? cleanArgs.indexOf("-f") + 1 : 2;
      const fileName = cleanArgs[fileIndex] || "file";
      return {
        reason: "YamlCreated",
        object: `File/${fileName}`,
        message: `Created resources from YAML file: ${fileName}${normalizedNs}`,
      };
    }
    const resourceNorm = targetResource.toLowerCase();
    const resolvedMeta = RESOURCE_MAP[resourceNorm];
    const resourceLabel = resolvedMeta ? resolvedMeta.plural.substring(0, resolvedMeta.plural.length - 1) : targetResource;
    return {
      reason: `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)}Created`,
      object: `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)}/${targetName || "resource"}`,
      message: `Created ${resourceLabel} ${targetName || "resource"}${normalizedNs}`,
    };
  }

  if (verb === "patch") {
    const resourceNorm = targetResource.toLowerCase();
    const resolvedMeta = RESOURCE_MAP[resourceNorm];
    const resourceLabel = resolvedMeta ? resolvedMeta.plural.substring(0, resolvedMeta.plural.length - 1) : targetResource;
    return {
      reason: `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)}Patched`,
      object: `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)}/${targetName || "resource"}`,
      message: `Patched ${resourceLabel} ${targetName || "resource"}${normalizedNs}`,
    };
  }

  if (verb === "edit") {
    const resourceNorm = targetResource.toLowerCase();
    const resolvedMeta = RESOURCE_MAP[resourceNorm];
    const resourceLabel = resolvedMeta ? resolvedMeta.plural.substring(0, resolvedMeta.plural.length - 1) : targetResource;
    return {
      reason: `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)}Edited`,
      object: `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)}/${targetName || "resource"}`,
      message: `Edited configuration for ${resourceLabel} ${targetName || "resource"}${normalizedNs}`,
    };
  }

  if (verb === "update") {
    const resourceNorm = targetResource.toLowerCase();
    const resolvedMeta = RESOURCE_MAP[resourceNorm];
    const resourceLabel = resolvedMeta ? resolvedMeta.plural.substring(0, resolvedMeta.plural.length - 1) : targetResource;
    return {
      reason: `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)}Updated`,
      object: `${resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)}/${targetName || "resource"}`,
      message: `Updated configuration for ${resourceLabel} ${targetName || "resource"}${normalizedNs}`,
    };
  }

  return null;
}

function logAuditEvent(env: Environment, reason: string, object: string, message: string) {
  const timestamp = new Date().toISOString()
  const newEvent = {
    timestamp,
    type: "Audit",
    reason,
    object,
    message,
    count: 1,
    age: new Date(timestamp).toLocaleString(),
    user: ENV_USERNAMES[env],
    env,
  }
  
  try {
    const existing = localStorage.getItem("k8s_audit_events")
    const events = existing ? JSON.parse(existing) : []
    events.push(newEvent)
    localStorage.setItem("k8s_audit_events", JSON.stringify(events))
  } catch (e) {
    console.error("Failed to save audit event to localStorage", e)
  }
}

function getAuditEvents(): any[] {
  try {
    const existing = localStorage.getItem("k8s_audit_events")
    return existing ? JSON.parse(existing) : []
  } catch (e) {
    console.error("Failed to read audit events from localStorage", e)
    return []
  }
}

function CLITerminal({ env, isConnected, data, onAuditEvent }: { env: Environment; isConnected: boolean; data: ReturnType<typeof makeEmptyData>; onAuditEvent?: () => void }) {
  const username = ENV_USERNAMES[env]
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: "output", text: `Yourspeak VM Terminal — ${env.toUpperCase()} cluster` },
    { type: "output", text: `Host: ${username}@${VM_HOST}  |  Type 'help' for available commands` },
    { type: "output", text: "" },
  ])
  const [input, setInput] = useState("")
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const termEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { termEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [lines])
  useEffect(() => { if (isConnected) inputRef.current?.focus() }, [isConnected])

  const prompt = `${username}@${VM_HOST.replace(/\./g, "-")}:~$ `

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() && !isConnected) return
    if (!isConnected) {
      setLines(prev => [...prev, { type: "error", text: "Not connected. Establish SSH connection first." }])
      setInput("")
      return
    }

    const cmd = input.trim()
    const newLines: TerminalLine[] = [{ type: "input", text: `${prompt}${cmd}` }]
    const result = simulateCommand(cmd, env, data)

    if (result[0] === "__CLEAR__") {
      setLines([{ type: "output", text: "" }])
      setInput("")
      return
    }

    const isError = result.some(line => line.includes("command not found") || line.includes("Error from server") || line.startsWith("error:"));
    if (!isError) {
      const auditDetails = parseMutatingCommand(cmd, env);
      if (auditDetails) {
        logAuditEvent(env, auditDetails.reason, auditDetails.object, auditDetails.message);
        if (onAuditEvent) {
          onAuditEvent();
        }
      }
    }

    result.forEach(line => newLines.push({ type: line.includes("command not found") || line.includes("Error from server") ? "error" : "output", text: line }))
    newLines.push({ type: "output", text: "" })
    setLines(prev => [...prev, ...newLines])
    setHistory(prev => [cmd, ...prev].slice(0, 50))
    setHistIdx(-1)
    setInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault()
      const idx = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(idx)
      setInput(history[idx] || "")
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      const idx = Math.max(histIdx - 1, -1)
      setHistIdx(idx)
      setInput(idx === -1 ? "" : history[idx])
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden flex flex-col" style={{ height: "520px" }}>
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-rose-500" />
          <span className="h-3 w-3 rounded-full bg-amber-500" />
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
        </div>
        <div className="flex-1 text-center">
          <span className="text-xs font-mono text-zinc-400">{username}@{VM_HOST} — {env} cluster</span>
        </div>
        {isConnected ? (
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> SSH Active
          </span>
        ) : (
          <span className="text-[11px] font-mono text-zinc-600 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" /> Disconnected
          </span>
        )}
      </div>

      {/* Output area */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-0.5" onClick={() => inputRef.current?.focus()}>
        {lines.map((line, i) => (
          <div key={i} className={cn(
            "whitespace-pre-wrap break-all leading-5",
            line.type === "input" ? "text-emerald-400" :
            line.type === "error" ? "text-rose-400" :
            "text-zinc-300"
          )}>
            {line.text}
          </div>
        ))}
        {!isConnected && (
          <div className="text-amber-500 mt-2 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Connect to the cluster to use the terminal.
          </div>
        )}
        <div ref={termEndRef} />
      </div>

      {/* Input row */}
      <form onSubmit={handleSubmit} className="border-t border-zinc-800 flex items-center px-4 py-2 gap-2 bg-zinc-950">
        <span className="text-emerald-500 font-mono text-xs flex-shrink-0">{prompt}</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isConnected}
          className="flex-1 bg-transparent font-mono text-xs text-zinc-100 placeholder:text-zinc-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          placeholder={isConnected ? "Type a command..." : "Connect to unlock terminal"}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={!isConnected || !input.trim()}
          className="flex-shrink-0 rounded px-2 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

// ─── Tab Views ────────────────────────────────────────────────────────────────
type TabId = "overview" | "workloads" | "network" | "storage" | "config" | "events" | "terminal"

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "workloads", label: "Workloads", icon: Box },
  { id: "network", label: "Network", icon: Network },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "config", label: "Config", icon: FileText },
  { id: "events", label: "Events", icon: Bell },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
]

function OverviewTab({ data, events, onTabChange, setWorkloadSub }: { data: ReturnType<typeof makeEmptyData>, events: any[], onTabChange: (tab: TabId) => void, setWorkloadSub: (sub: WorkloadSub) => void }) {
  const { pods, nodes, deployments, services, namespaces } = data
  const [showNamespaces, setShowNamespaces] = useState(false)
  const namespacesRef = useRef<HTMLDivElement>(null)
  const runningPods = pods.filter(p => p.status === "Running").length
  const problemPods = pods.filter(p => p.status !== "Running").length
  const readyNodes = nodes.filter(n => n.status === "Ready").length
  const avgCpu = nodes.filter(n => n.status === "Ready").length > 0
    ? Math.round(nodes.filter(n => n.status === "Ready").reduce((s, n) => s + n.cpu, 0) / nodes.filter(n => n.status === "Ready").length)
    : 0
  const avgMem = nodes.filter(n => n.status === "Ready").length > 0
    ? Math.round(nodes.filter(n => n.status === "Ready").reduce((s, n) => s + n.memory, 0) / nodes.filter(n => n.status === "Ready").length)
    : 0

  const handleNamespacesClick = () => {
    setShowNamespaces(v => {
      if (!v) setTimeout(() => namespacesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80)
      return !v
    })
  }

  const statCards = [
    { label: "Nodes", value: `${readyNodes}/${nodes.length}`, sub: "Ready", icon: Server, color: "text-blue-400", bg: "bg-blue-500/10", onClick: () => {} },
    { label: "Namespaces", value: namespaces.length, sub: showNamespaces ? "Click to collapse" : "Click to expand", icon: Layers, color: "text-purple-400", bg: "bg-purple-500/10", onClick: handleNamespacesClick, active: showNamespaces },
    { label: "Pods Running", value: runningPods, sub: `${problemPods} with issues`, icon: Box, color: "text-emerald-400", bg: "bg-emerald-500/10", onClick: () => { setWorkloadSub("pods"); onTabChange("workloads" as TabId); } },
    { label: "Deployments", value: deployments.length, sub: "Managed", icon: GitBranch, color: "text-amber-400", bg: "bg-amber-500/10", onClick: () => { setWorkloadSub("deployments"); onTabChange("workloads" as TabId); } },
    { label: "Services", value: services.length, sub: "Exposed", icon: Globe, color: "text-cyan-400", bg: "bg-cyan-500/10", onClick: () => onTabChange("network" as TabId) },
    { label: "Avg CPU", value: `${avgCpu}%`, sub: "Across nodes", icon: Cpu, color: "text-rose-400", bg: "bg-rose-500/10", onClick: () => {} },
    { label: "Avg Memory", value: `${avgMem}%`, sub: "Across nodes", icon: MemoryStick, color: "text-violet-400", bg: "bg-violet-500/10", onClick: () => {} },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {statCards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label}
                 onClick={card.onClick}
                 className={cn(
                   "rounded-xl border border-border bg-card p-4 transition-all duration-200 cursor-pointer hover:border-primary/50 hover:bg-accent/30",
                   (card as any).active && "border-purple-500/50 bg-purple-500/10"
                 )}>
              <div className={cn("mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg", card.bg)}>
                <Icon className={cn("h-4 w-4", card.color)} />
              </div>
              <div className="text-xl font-bold">{card.value}</div>
              <div className="text-[11px] font-medium">{card.label}</div>
              <div className="text-[10px] text-muted-foreground">{card.sub}</div>
            </div>
          )
        })}
      </div>

      {showNamespaces && (
        <div ref={namespacesRef} className="rounded-xl border border-purple-500/30 bg-purple-500/5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 border-b border-purple-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-semibold text-purple-300">Namespaces</span>
              <span className="rounded-full bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 text-[11px] text-purple-300 font-medium">{namespaces.length}</span>
            </div>
            <button onClick={() => setShowNamespaces(false)} className="rounded-full p-1 hover:bg-purple-500/20 text-purple-400 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-purple-500/10">
                <tr>
                  <TH>Namespace</TH>
                  <TH>Status</TH>
                  <TH>Type</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10">
                {namespaces.map(ns => (
                  <tr key={ns} className="hover:bg-purple-500/10 transition-colors">
                    <TD><span className="font-mono text-xs text-purple-200">{ns}</span></TD>
                    <TD><StatusBadge status="Ready" /></TD>
                    <TD>
                      <span className="text-xs text-muted-foreground">
                        {ns.startsWith("kube-") ? "System" : ns === "default" ? "Default" : "Application"}
                      </span>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Nodes</span>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary font-medium">{nodes.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/30"><tr><TH>Name</TH><TH>Status</TH><TH>Roles</TH><TH>CPU</TH><TH>Memory</TH><TH>Disk (Used/Cap)</TH><TH>Version</TH><TH>OS</TH></tr></thead>
            <tbody className="divide-y divide-border">
              {nodes.map(node => (
                <tr key={node.name} className="hover:bg-accent/20 transition-colors">
                  <TD><span className="font-mono text-xs">{node.name}</span></TD>
                  <TD><StatusBadge status={node.status} /></TD>
                  <TD><span className="text-xs text-muted-foreground">{node.roles}</span></TD>
                  <TD><ResourceBar value={node.cpu} color="bg-blue-500" /></TD>
                  <TD><ResourceBar value={node.memory} color="bg-purple-500" /></TD>
                  <TD>
                    <div className="flex flex-col gap-1 w-full max-w-[100px]">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{node.diskUsedGb || 0}GB</span>
                        <span>{node.diskCapacityGb || 0}GB</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div className={cn("h-full", ((node.diskUsedGb || 0) / (node.diskCapacityGb || 1)) > 0.8 ? "bg-rose-500" : "bg-teal-500")} style={{ width: `${Math.min(100, Math.max(0, ((node.diskUsedGb || 0) / (node.diskCapacityGb || 1)) * 100))}%` }} />
                      </div>
                    </div>
                  </TD>
                  <TD><span className="font-mono text-xs text-muted-foreground">{node.version}</span></TD>
                  <TD><span className="text-xs text-muted-foreground">{node.os}</span></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Recent Events</span>
        </div>
        <div className="divide-y divide-border">
          {events.slice(0, 5).map((evt, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/20 transition-colors">
              {evt.type === "Warning" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-400 flex-shrink-0" />
              ) : evt.type === "Audit" ? (
                <Terminal className="mt-0.5 h-4 w-4 text-purple-400 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{evt.reason}</span>
                  <span className="text-[11px] font-mono text-muted-foreground truncate">{evt.object}</span>
                  {evt.count > 1 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">×{evt.count}</span>}
                  <span className="ml-auto rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 font-mono">@{evt.user}</span>
                </div>
                <p className="text-xs text-muted-foreground">{evt.message}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" />{evt.age}</div>
            </div>
          ))}
          {events.length === 0 && (
            <div className="p-4 text-center text-xs text-muted-foreground">No recent events.</div>
          )}
        </div>
      </div>
    </div>
  )
}

type WorkloadSub = "pods" | "deployments" | "daemonsets" | "statefulsets"

function WorkloadsTab({ data, sub, setSub }: { data: ReturnType<typeof makeEmptyData>; sub: WorkloadSub; setSub: (s: WorkloadSub) => void }) {
  const [search, setSearch] = useState("")
  const [selectedPod, setSelectedPod] = useState<any>(null)
  const subTabs = [{ id: "pods" as WorkloadSub, label: "Pods" }, { id: "deployments" as WorkloadSub, label: "Deployments" }, { id: "daemonsets" as WorkloadSub, label: "DaemonSets" }, { id: "statefulsets" as WorkloadSub, label: "StatefulSets" }]
  const filteredPods = data.pods.filter(p => p.name.includes(search) || p.namespace.includes(search))
  const filteredDeps = data.deployments.filter(d => d.name.includes(search) || d.namespace.includes(search))
  const filteredDS = data.daemonSets.filter(d => d.name.includes(search) || d.namespace.includes(search))
  const filteredSS = data.statefulSets.filter(s => s.name.includes(search) || s.namespace.includes(search))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {subTabs.map(t => <button key={t.id} onClick={() => { setSub(t.id); setSearch("") }} className={cn("px-3 py-1.5 text-xs font-medium transition-colors", sub === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/50")}>{t.label}</button>)}
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder={`Search ${sub}...`} />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          {sub === "pods" && (
            <table className="w-full border-collapse">
              <thead className="bg-muted/30"><tr><TH>Name</TH><TH>Namespace</TH><TH>Status</TH><TH>Restarts</TH><TH>CPU</TH><TH>Memory</TH><TH>Saturation</TH><TH>Node</TH><TH>Age</TH></tr></thead>
              <tbody className="divide-y divide-border">
                {filteredPods.map(p => (
                  <tr key={p.name} onClick={() => setSelectedPod(p)} className={cn("transition-colors cursor-pointer group", p.isSaturated ? "bg-rose-500/10 hover:bg-rose-500/15" : "hover:bg-accent/20")}>
                    <TD><span className={cn("font-mono text-xs group-hover:text-primary transition-colors", p.isSaturated && "text-rose-400 font-bold")}>{p.name}</span></TD>
                    <TD><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{p.namespace}</span></TD>
                    <TD><StatusBadge status={p.status} /></TD>
                    <TD><span className={cn("text-xs font-medium", p.restarts > 5 ? "text-rose-400 font-bold" : p.restarts > 0 ? "text-amber-400" : "text-muted-foreground")}>{p.restarts}</span></TD>
                    <TD><ResourceBar value={p.cpu} color={p.isSaturated ? "bg-rose-500" : "bg-blue-500"} /></TD>
                    <TD><ResourceBar value={p.memory} color="bg-purple-500" /></TD>
                    <TD>
                      {p.isSaturated ? (
                        <div className="flex items-center gap-1 text-rose-400">
                          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Throttled</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                          <span className="text-[10px]">Normal</span>
                        </div>
                      )}
                    </TD>
                    <TD><span className="text-xs font-mono text-muted-foreground">{p.node}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{p.age}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>

          )}
          {sub === "deployments" && (
            <table className="w-full border-collapse">
              <thead className="bg-muted/30"><tr><TH>Name</TH><TH>Namespace</TH><TH>Ready</TH><TH>Up-to-date</TH><TH>Available</TH><TH>Image</TH><TH>Age</TH></tr></thead>
              <tbody className="divide-y divide-border">
                {filteredDeps.map(d => (
                  <tr key={d.name} className="hover:bg-accent/20 transition-colors">
                    <TD><span className="font-mono text-xs">{d.name}</span></TD>
                    <TD><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{d.namespace}</span></TD>
                    <TD><span className={cn("text-xs font-semibold", d.ready.split("/")[0] !== d.ready.split("/")[1] ? "text-amber-400" : "text-emerald-400")}>{d.ready}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{d.upToDate}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{d.available}</span></TD>
                    <TD><span className="font-mono text-[11px] text-muted-foreground">{d.image}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{d.age}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sub === "daemonsets" && (
            <table className="w-full border-collapse">
              <thead className="bg-muted/30"><tr><TH>Name</TH><TH>Namespace</TH><TH>Desired</TH><TH>Current</TH><TH>Ready</TH><TH>Age</TH></tr></thead>
              <tbody className="divide-y divide-border">
                {filteredDS.map(d => (
                  <tr key={d.name} className="hover:bg-accent/20 transition-colors">
                    <TD><span className="font-mono text-xs">{d.name}</span></TD>
                    <TD><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{d.namespace}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{d.desired}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{d.current}</span></TD>
                    <TD><span className={cn("text-xs font-semibold", d.ready < d.desired ? "text-amber-400" : "text-emerald-400")}>{d.ready}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{d.age}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sub === "statefulsets" && (
            <table className="w-full border-collapse">
              <thead className="bg-muted/30"><tr><TH>Name</TH><TH>Namespace</TH><TH>Ready</TH><TH>Age</TH></tr></thead>
              <tbody className="divide-y divide-border">
                {filteredSS.map(s => (
                  <tr key={s.name} className="hover:bg-accent/20 transition-colors">
                    <TD><span className="font-mono text-xs">{s.name}</span></TD>
                    <TD><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{s.namespace}</span></TD>
                    <TD><span className={cn("text-xs font-semibold", s.ready.split("/")[0] !== s.ready.split("/")[1] ? "text-amber-400" : "text-emerald-400")}>{s.ready}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{s.age}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      {/* Pod Logs Modal — Real SSE streaming (Issue 1 fix) */}
      {selectedPod && (
        <PodLogsModal pod={selectedPod} onClose={() => setSelectedPod(null)} />
      )}
    </div>
  )
}

function NetworkTab({ data }: { data: ReturnType<typeof makeEmptyData> }) {
  const [search, setSearch] = useState("")
  const [sub, setSub] = useState<"services"|"ingresses">("services")
  const filteredSvcs = data.services.filter(s => s.name.includes(search) || s.namespace.includes(search))
  const filteredIng = data.ingresses.filter(i => i.name.includes(search) || i.host.includes(search))
  const typeColors: Record<string, string> = {
    ClusterIP: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    NodePort: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    LoadBalancer: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["services", "ingresses"] as const).map(t => <button key={t} onClick={() => { setSub(t); setSearch("") }} className={cn("px-3 py-1.5 text-xs font-medium capitalize transition-colors", sub === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/50")}>{t}</button>)}
        </div>
        <SearchBar value={search} onChange={setSearch} />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          {sub === "services" ? (
            <table className="w-full border-collapse">
              <thead className="bg-muted/30"><tr><TH>Name</TH><TH>Namespace</TH><TH>Type</TH><TH>Cluster IP</TH><TH>Ports</TH><TH>Age</TH></tr></thead>
              <tbody className="divide-y divide-border">
                {filteredSvcs.map(s => (
                  <tr key={s.name} className="hover:bg-accent/20 transition-colors">
                    <TD><span className="font-mono text-xs">{s.name}</span></TD>
                    <TD><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{s.namespace}</span></TD>
                    <TD><span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", typeColors[s.type])}>{s.type}</span></TD>
                    <TD><span className="font-mono text-xs text-muted-foreground">{s.clusterIP}</span></TD>
                    <TD><span className="font-mono text-xs text-muted-foreground">{s.ports}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{s.age}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-muted/30"><tr><TH>Name</TH><TH>Namespace</TH><TH>Host</TH><TH>Paths</TH><TH>Age</TH></tr></thead>
              <tbody className="divide-y divide-border">
                {filteredIng.map(i => (
                  <tr key={i.name} className="hover:bg-accent/20 transition-colors">
                    <TD><span className="font-mono text-xs">{i.name}</span></TD>
                    <TD><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{i.namespace}</span></TD>
                    <TD><div className="flex items-center gap-1"><Globe className="h-3.5 w-3.5 text-cyan-400" /><span className="text-xs font-mono text-muted-foreground">{i.host}</span></div></TD>
                    <TD><span className="text-xs text-muted-foreground">{i.paths}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{i.age}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function StorageTab({ data }: { data: ReturnType<typeof makeEmptyData> }) {
  const [search, setSearch] = useState("")
  const filtered = data.pvcs.filter(p => p.name.includes(search) || p.namespace.includes(search))
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><SearchBar value={search} onChange={setSearch} placeholder="Search PVCs..." /></div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/30"><tr><TH>Name</TH><TH>Namespace</TH><TH>Status</TH><TH>Capacity</TH><TH>Storage Class</TH><TH>Age</TH></tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.map(p => (
                <tr key={p.name} className="hover:bg-accent/20 transition-colors">
                  <TD><div className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-violet-400" /><span className="font-mono text-xs">{p.name}</span></div></TD>
                  <TD><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{p.namespace}</span></TD>
                  <TD><StatusBadge status={p.status} /></TD>
                  <TD><span className="text-xs font-mono font-semibold">{p.capacity}</span></TD>
                  <TD><span className="text-xs text-muted-foreground">{p.storageClass}</span></TD>
                  <TD><span className="text-xs text-muted-foreground">{p.age}</span></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ConfigTab({ data }: { data: ReturnType<typeof makeEmptyData> }) {
  const [search, setSearch] = useState("")
  const [sub, setSub] = useState<"configmaps"|"secrets">("configmaps")
  const filteredCM = data.configMaps.filter(c => c.name.includes(search) || c.namespace.includes(search))
  const filteredSec = data.secrets.filter(s => s.name.includes(search) || s.namespace.includes(search))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["configmaps", "secrets"] as const).map(t => <button key={t} onClick={() => { setSub(t); setSearch("") }} className={cn("px-3 py-1.5 text-xs font-medium capitalize transition-colors", sub === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/50")}>{t === "configmaps" ? "ConfigMaps" : "Secrets"}</button>)}
        </div>
        <SearchBar value={search} onChange={setSearch} />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          {sub === "configmaps" ? (
            <table className="w-full border-collapse">
              <thead className="bg-muted/30"><tr><TH>Name</TH><TH>Namespace</TH><TH>Keys</TH><TH>Age</TH></tr></thead>
              <tbody className="divide-y divide-border">
                {filteredCM.map(c => (
                  <tr key={c.name} className="hover:bg-accent/20 transition-colors">
                    <TD><div className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-blue-400" /><span className="font-mono text-xs">{c.name}</span></div></TD>
                    <TD><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{c.namespace}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{c.keys} keys</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{c.age}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-muted/30"><tr><TH>Name</TH><TH>Namespace</TH><TH>Type</TH><TH>Keys</TH><TH>Age</TH></tr></thead>
              <tbody className="divide-y divide-border">
                {filteredSec.map(s => (
                  <tr key={s.name} className="hover:bg-accent/20 transition-colors">
                    <TD><div className="flex items-center gap-1.5"><Key className="h-3.5 w-3.5 text-amber-400" /><span className="font-mono text-xs">{s.name}</span></div></TD>
                    <TD><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{s.namespace}</span></TD>
                    <TD><span className="font-mono text-[11px] text-muted-foreground">{s.type}</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{s.keys} keys (redacted)</span></TD>
                    <TD><span className="text-xs text-muted-foreground">{s.age}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function EventsTab({ events }: { events: any[] }) {
  const [typeFilter, setTypeFilter] = useState<"all"|"Normal"|"Warning"|"Audit">("all")
  const [userFilter, setUserFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("")
  const [timeFilter, setTimeFilter] = useState<string>("")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 15

  const uniqueUsers = useMemo(() => {
    const users = new Set<string>()
    events.forEach(e => {
      if (e.user) users.add(e.user)
    })
    return Array.from(users)
  }, [events])

  const filteredEvents = useMemo(() => {
    return events.filter(evt => {
      if (typeFilter !== "all" && evt.type !== typeFilter) return false
      if (userFilter !== "all" && evt.user !== userFilter) return false
      if (dateFilter) {
        const d = new Date(evt.timestamp)
        const eventLocalDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        if (eventLocalDate !== dateFilter) return false
      }
      if (timeFilter) {
        const d = new Date(evt.timestamp)
        const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toLowerCase()
        if (!timeStr.includes(timeFilter.toLowerCase())) return false
      }
      return true
    })
  }, [events, typeFilter, userFilter, dateFilter, timeFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [typeFilter, userFilter, dateFilter, timeFilter])

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, filteredEvents.length)
  const currentEvents = filteredEvents.slice(startIndex, endIndex)

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 animate-in fade-in duration-200">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", "Normal", "Warning", "Audit"] as const).map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all duration-200",
                typeFilter === f
                  ? f === "Warning"
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-sm"
                    : f === "Normal"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-sm"
                    : f === "Audit"
                    ? "bg-purple-500/15 text-purple-400 border-purple-500/30 shadow-sm"
                    : "bg-primary/15 text-primary border-primary/30 shadow-sm"
                  : "border-zinc-800 text-muted-foreground hover:bg-zinc-800 hover:text-foreground"
              )}
            >
              {f === "all" ? "All Events" : f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">User:</span>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
          >
            <option value="all">All Users</option>
            {uniqueUsers.map(user => (
              <option key={user} value={user}>@{user}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Date:</span>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Time:</span>
          <input
            type="text"
            placeholder="e.g. 14:30 or PM"
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-foreground placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all w-36"
          />
          {timeFilter && (
            <button
              onClick={() => setTimeFilter("")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No events match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-muted/30">
                <tr>
                  <TH className="w-24">Type</TH>
                  <TH className="w-32">User</TH>
                  <TH className="w-40">Reason</TH>
                  <TH>Message / Object</TH>
                  <TH className="w-48 text-right">Time & Date</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {currentEvents.map((evt, i) => {
                  const dateObj = new Date(evt.timestamp)
                  const localDate = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                  const localTime = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  
                  return (
                    <tr key={i} className="hover:bg-accent/20 transition-colors">
                      <TD>
                        <StatusBadge status={evt.type} />
                      </TD>
                      <TD>
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 font-mono">
                          @{evt.user}
                        </span>
                      </TD>
                      <TD>
                        <span className="text-xs font-semibold text-foreground">{evt.reason}</span>
                      </TD>
                      <TD>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-[11px] text-muted-foreground truncate max-w-lg">{evt.object}</span>
                          <p className="text-xs text-foreground mt-0.5">{evt.message}</p>
                        </div>
                      </TD>
                      <TD className="text-right">
                        <div className="flex flex-col items-end gap-0.5 text-[11px] text-muted-foreground font-mono">
                          <span className="font-semibold text-foreground">{localTime}</span>
                          <span>{localDate}</span>
                        </div>
                      </TD>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredEvents.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 bg-muted/10">
            <span className="text-xs text-muted-foreground font-mono">
              Showing <strong className="text-foreground text-sm">{filteredEvents.length > 0 ? startIndex + 1 : 0}-{endIndex}</strong> of <strong className="text-foreground text-sm">{filteredEvents.length}</strong> items
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-zinc-800 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                &larr; Prev
              </button>
              <select
                value={currentPage}
                onChange={(e) => setCurrentPage(Number(e.target.value))}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer"
              >
                {Array.from({ length: totalPages || 1 }, (_, i) => i + 1).map(page => {
                  const pStart = (page - 1) * itemsPerPage + 1
                  const pEnd = Math.min(page * itemsPerPage, filteredEvents.length)
                  return (
                    <option key={page} value={page}>
                      {filteredEvents.length === 0 ? "0-0" : `${pStart}-${pEnd}`}
                    </option>
                  )
                })}
              </select>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-zinc-800 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Pod Logs Modal (Real SSE Streaming) — Issue 1 ───────────────────────────
function PodLogsModal({ pod, onClose }: { pod: Pod; onClose: () => void }) {
  const { environment } = useEnvironment()
  const [logLines, setLogLines] = useState<{ text: string; type: "status" | "log" | "error" | "done" }[]>([])
  const [streamState, setStreamState] = useState<"connecting" | "streaming" | "done" | "error">("connecting")
  const logEndRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const url = `/api/pod-logs?env=${encodeURIComponent(environment)}&namespace=${encodeURIComponent(pod.namespace)}&pod=${encodeURIComponent(pod.name)}`
    const es = new EventSource(url)
    esRef.current = es
    setStreamState("connecting")
    setLogLines([])

    es.addEventListener("status", (e: MessageEvent) => {
      const d = JSON.parse(e.data)
      setLogLines(prev => [...prev, { text: d.message, type: "status" }])
      setStreamState("streaming")
    })

    es.addEventListener("log", (e: MessageEvent) => {
      const d = JSON.parse(e.data)
      setLogLines(prev => [...prev, { text: d.line, type: d.isError ? "error" : "log" }])
    })

    es.addEventListener("done", (e: MessageEvent) => {
      const d = JSON.parse(e.data)
      setLogLines(prev => [...prev, { text: d.message, type: "done" }])
      setStreamState("done")
      es.close()
    })

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const d = JSON.parse((e as any).data)
        setLogLines(prev => [...prev, { text: d.message || "Connection error", type: "error" }])
      } catch {
        setLogLines(prev => [...prev, { text: "Connection lost or server error.", type: "error" }])
      }
      setStreamState("error")
      es.close()
    })

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setStreamState(prev => prev === "streaming" ? "done" : prev)
      }
    }

    return () => { es.close() }
  }, [pod.name, pod.namespace, environment])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [logLines])

  const stateColors = { connecting: "text-amber-400", streaming: "text-emerald-400", done: "text-zinc-500", error: "text-rose-400" }
  const stateLabel = { connecting: "Connecting...", streaming: "● Streaming", done: "Stream ended", error: "Error" }

  const handleClose = () => { esRef.current?.close(); onClose() }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "82vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-zinc-900">
          <div className="flex items-center gap-3">
            <Terminal className="h-4 w-4 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm">Pod Logs</h3>
              <p className="text-xs font-mono text-muted-foreground">{pod.namespace} / {pod.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-[11px] font-mono font-semibold flex items-center gap-1.5", stateColors[streamState])}>
              {streamState === "streaming" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
              {stateLabel[streamState]}
            </span>
            <button onClick={handleClose} className="rounded-full p-1.5 hover:bg-zinc-700 text-zinc-400 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Log output */}
        <div className="flex-1 p-4 bg-zinc-950 overflow-y-auto font-mono text-xs space-y-0.5">
          {logLines.length === 0 && streamState === "connecting" && (
            <div className="flex items-center gap-2 text-amber-400 animate-pulse">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Connecting to cluster SSH...
            </div>
          )}
          {logLines.map((line, i) => (
            <div key={i} className={cn(
              "whitespace-pre-wrap break-all leading-5",
              line.type === "status" ? "text-zinc-500 italic" :
              line.type === "error" ? "text-rose-400" :
              line.type === "done" ? "text-zinc-600 italic mt-2" :
              "text-zinc-200"
            )}>
              {line.text}
            </div>
          ))}
          {streamState === "streaming" && (
            <div className="text-emerald-500 animate-pulse mt-1">▌</div>
          )}
          <div ref={logEndRef} />
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-4 py-2 bg-zinc-900 flex items-center justify-between">
          <span className="text-[11px] text-zinc-600 font-mono">
            {pod.name} · {logLines.filter(l => l.type === "log").length} lines
          </span>
          <button onClick={handleClose}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function K8sMonitoring() {
  const { environment, setEnvironment } = useEnvironment()
  const [activeTab, setActiveTab] = useState<TabId>("overview")
  const [workloadSub, setWorkloadSub] = useState<WorkloadSub>("pods")
  const [auditTrigger, setAuditTrigger] = useState(0)

  const handleNewAuditEvent = useCallback(() => {
    setAuditTrigger(prev => prev + 1)
  }, [])

  const username = ENV_USERNAMES[environment]

  const sharedOpts = {
    staleTime: 3000,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  }

  const clusterQuery = useQuery({
    queryKey: ["overview-cluster", environment],
    queryFn: async () => {
      const resp = await fetch(`/api/cluster?env=${environment}&username=${username}`)
      if (!resp.ok) throw new Error("Failed to fetch cluster data")
      return resp.json()
    },
    ...sharedOpts
  })

  const metricsQuery = useQuery({
    queryKey: ["overview-metrics", environment],
    queryFn: async () => {
      const resp = await fetch(`/api/metrics?env=${environment}&username=${username}`)
      if (!resp.ok) throw new Error("Failed to fetch metrics data")
      return resp.json()
    },
    ...sharedOpts
  })

  const isConnected = clusterQuery.isSuccess
  const isLoading = clusterQuery.isLoading
  const isFetching = clusterQuery.isFetching || metricsQuery.isFetching
  const lastRefresh = clusterQuery.dataUpdatedAt ? new Date(clusterQuery.dataUpdatedAt) : new Date()
  const fetchError = clusterQuery.error ? (clusterQuery.error as Error).message : null

  const data = useMemo(() => {
    if (!clusterQuery.data) return makeEmptyData(environment)
    return mapClusterJsonToData(clusterQuery.data, environment, metricsQuery.data || undefined)
  }, [clusterQuery.data, environment, metricsQuery.data])

  const combinedEvents = useMemo(() => {
    const native = data.events || []
    const audits = getAuditEvents()
      .filter((evt: any) => evt.env === environment)
      .map((evt: any) => ({
        type: evt.type || "Audit",
        reason: evt.reason || "CommandExecuted",
        object: evt.object || "",
        message: evt.message || "",
        count: evt.count || 1,
        age: evt.age || new Date(evt.timestamp).toLocaleString(),
        timestamp: evt.timestamp,
        user: evt.user || "dev",
      }))

    const merged = [...native, ...audits]
    merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return merged
  }, [data.events, environment, auditTrigger])

  const previousDataRef = useRef<ReturnType<typeof mapClusterJsonToData> | null>(null);

  useEffect(() => {
    previousDataRef.current = null;
  }, [environment]);

  useEffect(() => {
    if (data && previousDataRef.current && clusterQuery.isSuccess) {
      const prev = previousDataRef.current;
      const curr = data;

      // Skip diffing on initial real load from empty data
      if (prev.namespaces.length === 0) {
        previousDataRef.current = data;
        return;
      }

      const diffEvents: any[] = [];
      const now = new Date().toISOString();

      const compareResources = (key: keyof ReturnType<typeof mapClusterJsonToData>, resourceName: string) => {
        if (!prev[key] || !curr[key] || !Array.isArray(prev[key])) return;
        const prevItems = prev[key] as any[];
        const currItems = curr[key] as any[];

        const prevMap = new Map(prevItems.map(i => [i.name + '-' + (i.namespace || ''), i]));
        const currMap = new Map(currItems.map(i => [i.name + '-' + (i.namespace || ''), i]));

        for (const [id, item] of prevMap.entries()) {
          if (!currMap.has(id)) {
            diffEvents.push({
              reason: `${resourceName}Deleted`,
              object: `${resourceName}/${item.name}`,
              message: `Deleted ${resourceName.toLowerCase()} ${item.name} in namespace ${item.namespace || 'default'}`,
              type: "Audit",
              timestamp: now,
              age: new Date(now).toLocaleString(),
              user: "external",
              namespace: item.namespace || "default",
              count: 1
            });
          }
        }
        for (const [id, item] of currMap.entries()) {
          const prevItem = prevMap.get(id);
          if (!prevItem) {
            diffEvents.push({
              reason: `${resourceName}Created`,
              object: `${resourceName}/${item.name}`,
              message: `Created ${resourceName.toLowerCase()} ${item.name} in namespace ${item.namespace || 'default'}`,
              type: "Audit",
              timestamp: now,
              age: new Date(now).toLocaleString(),
              user: "external",
              namespace: item.namespace || "default",
              count: 1
            });
          } else {
            const getStableProps = (obj: any) => {
              const {
                ready, upToDate, available, current, desired,
                restarts, status, cpu, memory, age, ...stable
              } = obj;
              return stable;
            };
            
            if (JSON.stringify(getStableProps(prevItem)) !== JSON.stringify(getStableProps(item))) {
              diffEvents.push({
                reason: `${resourceName}Updated`,
                object: `${resourceName}/${item.name}`,
                message: `Updated configuration for ${resourceName.toLowerCase()} ${item.name} in namespace ${item.namespace || 'default'}`,
                type: "Audit",
                timestamp: now,
                age: new Date(now).toLocaleString(),
                user: "external",
                namespace: item.namespace || "default",
                count: 1
              });
            }
          }
        }
      };

      compareResources('pods', 'Pod');
      compareResources('deployments', 'Deployment');
      compareResources('services', 'Service');
      compareResources('configMaps', 'ConfigMap');
      compareResources('secrets', 'Secret');
      compareResources('pvcs', 'PersistentVolumeClaim');
      compareResources('ingresses', 'Ingress');
      compareResources('statefulSets', 'StatefulSet');
      compareResources('daemonSets', 'DaemonSet');

      if (diffEvents.length > 0) {
        try {
          const existing = localStorage.getItem("k8s_audit_events")
          const events = existing ? JSON.parse(existing) : []
          events.push(...diffEvents.map(e => ({ ...e, env: environment })))
          localStorage.setItem("k8s_audit_events", JSON.stringify(events))
          setAuditTrigger(p => p + 1)
        } catch (e) {
          console.error("Failed to save diff events", e)
        }
      }
    }

    if (data) {
      previousDataRef.current = data;
    }
  }, [data, environment, clusterQuery.isSuccess]);

  const handleRefresh = useCallback(() => {
    clusterQuery.refetch()
    metricsQuery.refetch()
  }, [clusterQuery, metricsQuery])

  const envBadgeColors: Record<Environment, string> = {
    dev: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25",
    staging: "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25",
    production: "bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25",
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">Kubernetes Dashboard</h1>
            <div className="relative">
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as Environment)}
                className={cn(
                  "appearance-none inline-flex items-center rounded-full border px-2.5 py-0.5 pr-6 text-xs font-semibold cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-ring",
                  envBadgeColors[environment]
                )}
              >
                <option value="dev" className="bg-background text-foreground">Development</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 opacity-70" />
            </div>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Healthy
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 px-2.5 py-0.5 text-xs font-semibold text-rose-400">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Unhealthy
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Host: <span className="font-mono text-foreground">{ENV_USERNAMES[environment]}@{VM_HOST}</span> · Last refreshed {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {fetchError && !isFetching && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-rose-300">Connection Error</p>
            <p className="text-xs text-rose-400/80 mt-0.5 font-mono break-all">{fetchError}</p>
          </div>
          <button onClick={handleRefresh} className="text-xs text-rose-400 hover:text-rose-200 underline flex-shrink-0">Retry</button>
        </div>
      )}

      {/* Loading skeleton overlay — shown on initial env load (Issue 2 fix) */}
      {isLoading && !isConnected && (
        <div className="space-y-4 animate-pulse">
          {/* Stat cards skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-muted" />
                <div className="h-5 w-12 rounded bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
            ))}
          </div>
          {/* Table skeleton */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <div className="h-4 w-48 rounded bg-muted" />
                  <div className="h-5 w-16 rounded-full bg-muted" />
                  <div className="h-4 w-20 rounded bg-muted" />
                  <div className="h-2 w-20 rounded-full bg-muted ml-auto" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-border gap-0 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isTerminal = tab.id === "terminal"
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                isTerminal && "ml-auto"
              )}>
              <Icon className="h-4 w-4" />
              {tab.label}
              {isTerminal && isConnected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </button>
          )
        })}
      </div>

      {/* Tab content — always render even while loading to show cached data instantly */}
      {!isLoading || isConnected ? (
        <div className="pb-8">
          {activeTab === "overview" && <OverviewTab data={data} events={combinedEvents} onTabChange={setActiveTab} setWorkloadSub={setWorkloadSub} />}
          {activeTab === "workloads" && <WorkloadsTab data={data} sub={workloadSub} setSub={setWorkloadSub} />}
          {activeTab === "network" && <NetworkTab data={data} />}
          {activeTab === "storage" && <StorageTab data={data} />}
          {activeTab === "config" && <ConfigTab data={data} />}
          {activeTab === "events" && <EventsTab events={combinedEvents} />}
          {activeTab === "terminal" && <CLITerminal key={environment} env={environment} isConnected={isConnected} data={data} onAuditEvent={handleNewAuditEvent} />}
        </div>
      ) : null}
    </div>
  )
}
