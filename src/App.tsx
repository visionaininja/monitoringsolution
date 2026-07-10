import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { DashboardLayout } from "./layouts/DashboardLayout"
import Overview from "./pages/Overview"
import KubernetesOverview from "./pages/KubernetesOverview"
import VirtualMachineOverview from "./pages/VirtualMachineOverview"
import DockerOverview from "./pages/DockerOverview"
import GithubOverview from "./pages/GithubOverview"
import OciGatewayOverview from "./pages/OciGatewayOverview"
import K8sMonitoring from "./pages/K8sMonitoring"
import GitHubMonitoring from "./pages/GitHubMonitoring"
import NetworkMonitoring from "./pages/NetworkMonitoring"
import DatabaseMonitoring from "./pages/DatabaseMonitoring"
import AIAssistant from "./pages/AIAssistant"
import SupportChat from "./pages/SupportChat"
import Settings from "./pages/Settings"
import Login from "./pages/Login"
import { useAuth } from "./context/AuthContext"

function App() {
  const { user } = useAuth();

  if (!user) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Navigate to="/overview/kubernetes" replace />} />
          <Route path="/overview/kubernetes" element={<KubernetesOverview />} />
          <Route path="/overview/vm" element={<VirtualMachineOverview />} />
          <Route path="/overview/docker" element={<DockerOverview />} />
          <Route path="/overview/github" element={<GithubOverview />} />
          <Route path="/overview/oci-gateway" element={<OciGatewayOverview />} />
          <Route path="/k8s" element={<K8sMonitoring />} />
          <Route path="/github" element={<GitHubMonitoring />} />
          <Route path="/network" element={<NetworkMonitoring />} />
          <Route path="/database" element={<DatabaseMonitoring />} />
          <Route path="/ai" element={<AIAssistant />} />
          <Route path="/support-chat" element={<SupportChat />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
