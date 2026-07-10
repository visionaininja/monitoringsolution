$dockerLines = [System.IO.File]::ReadAllLines((Join-Path (Get-Location) 'src\pages\DockerOverview.tsx'))
$imports = ($dockerLines[0..10]) -join "`n"

$contentLines = [System.IO.File]::ReadAllLines((Join-Path (Get-Location) 'src\pages\OverviewContent.tsx'))

$toLocalDateIdx = 0
$queryEndIdx = 0
$k8sStartIdx = 0
$k8sEndIdx = 0
$vmStartIdx = 0
$vmEndIdx = 0
$githubStartIdx = 0
$githubEndIdx = 0

for ($i = 0; $i -lt $contentLines.Length; $i++) {
    $line = $contentLines[$i]
    if ($line.Contains("const toLocalDate")) { $toLocalDateIdx = $i }
    if ($line.Trim() -eq "return (") {
        if ($queryEndIdx -eq 0) {
            $queryEndIdx = $i - 1
        }
    }
    if ($line.Contains("KUBERNETES OVERVIEW GROUP")) {
        $k8sStartIdx = $i - 1
    }
    if ($line.Contains("VIRTUAL MACHINE OVERVIEW GROUP")) {
        $k8sEndIdx = $i - 2
        $vmStartIdx = $i - 1
    }
    if ($line.Contains("DOCKER OVERVIEW GROUP")) {
        $vmEndIdx = $i - 2
    }
    if ($line.Contains("GITHUB OVERVIEW GROUP")) {
        $githubStartIdx = $i - 1
    }
}
$githubEndIdx = $contentLines.Length - 1
for ($j = $githubStartIdx; $j -lt $contentLines.Length; $j++) {
    if ($contentLines[$j].Trim() -eq "</>") {
        $githubEndIdx = $j - 2
        break
    }
}

function Get-Lines($start, $end) {
  return ($contentLines[$start..$end] -join "`n")
}

$queriesPart1 = Get-Lines $toLocalDateIdx ($toLocalDateIdx + 8)  # const toLocalDate ...
$queriesPart2 = Get-Lines ($toLocalDateIdx + 11) $queryEndIdx # const { environment ...
$queries = $queriesPart1 + "`n" + $queriesPart2

$k8sUi = Get-Lines $k8sStartIdx $k8sEndIdx
$vmUi = Get-Lines $vmStartIdx $vmEndIdx
$githubUi = Get-Lines $githubStartIdx $githubEndIdx

$commonReturn = "`nreturn (`n<div className=`"space-y-6`">`n<DetailOverlay panel={activePanel} onClose={closePanel} />`n"

$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$commonImports = "`nimport { getGitHubToken, fetchGitHubRepos, fetchGitHubCommits, fetchGitHubWorkflowRuns, fetchGitHubPullRequests, fetchGitHubContributors } from '@/lib/github';`nimport { fmtRelative, DetailOverlay, StatCard, DonutStatCard, SpeedometersCard, NodeMiniSpeedo, statusIcon, conclusionColor, ENV_USERNAMES } from '@/components/OverviewHelpers';`nimport type { OverlayPanel } from '@/components/OverviewHelpers';`n"

$k8sFinal = "// @ts-nocheck`n" + $imports + $commonImports + "export default function KubernetesOverview() {`n" + $queries + $commonReturn + $k8sUi + "`n</div>`n)`n}"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'src\pages\KubernetesOverview.tsx'), $k8sFinal, $utf8NoBom)

$vmFinal = "// @ts-nocheck`n" + $imports + $commonImports + "export default function VirtualMachineOverview() {`n" + $queries + $commonReturn + $vmUi + "`n</div>`n)`n}"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'src\pages\VirtualMachineOverview.tsx'), $vmFinal, $utf8NoBom)

$githubFinal = "// @ts-nocheck`n" + $imports + $commonImports + "export default function GithubOverview() {`n" + $queries + $commonReturn + $githubUi + "`n</div>`n)`n}"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'src\pages\GithubOverview.tsx'), $githubFinal, $utf8NoBom)

