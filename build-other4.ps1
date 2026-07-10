$dockerLines = [System.IO.File]::ReadAllLines((Join-Path (Get-Location) 'src\pages\DockerOverview.tsx'))
$imports = ($dockerLines[0..12]) -join "`n"

$contentLines = [System.IO.File]::ReadAllLines((Join-Path (Get-Location) 'src\pages\OverviewContent.tsx'))

function Get-Lines($start, $end) {
  return ($contentLines[$start..$end] -join "`n")
}

# The queries start at line 18 in OverviewContent.tsx (const toLocalDate = ...)
# up to line 644 (}), [serviceItems, environment]) )
# But I must remove `export default function Overview() {` which is at line 28.
$queriesPart1 = Get-Lines 17 26  # (from toLocalDate up to before export default...)
$queriesPart2 = Get-Lines 28 644 # (from const {environment} ... to the end of queries)
$queries = $queriesPart1 + "`n" + $queriesPart2

$k8sUi = Get-Lines 701 810
$vmUi = Get-Lines 811 973
$githubUi = Get-Lines 977 1229

$commonReturn = "`nreturn (`n<div className=`"space-y-6`">`n<DetailOverlay panel={activePanel} onClose={closePanel} />`n"

$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$k8sFinal = $imports + "`nimport { DonutStatCard, SpeedometersCard, NodeMiniSpeedo, DetailOverlay } from '@/components/OverviewHelpers';`nexport default function KubernetesOverview() {`n" + $queries + $commonReturn + $k8sUi + "`n</div>`n)`n}"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'src\pages\KubernetesOverview.tsx'), $k8sFinal, $utf8NoBom)

$vmFinal = $imports + "`nimport { StatCard, DetailOverlay } from '@/components/OverviewHelpers';`nexport default function VirtualMachineOverview() {`n" + $queries + $commonReturn + $vmUi + "`n</div>`n)`n}"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'src\pages\VirtualMachineOverview.tsx'), $vmFinal, $utf8NoBom)

$githubFinal = $imports + "`nimport { statusIcon, conclusionColor, DetailOverlay } from '@/components/OverviewHelpers';`nimport { getGitHubToken } from '@/lib/github';`nexport default function GithubOverview() {`n" + $queries + $commonReturn + $githubUi + "`n</div>`n)`n}"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'src\pages\GithubOverview.tsx'), $githubFinal, $utf8NoBom)
