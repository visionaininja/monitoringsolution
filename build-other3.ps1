$lines = [System.IO.File]::ReadAllLines((Join-Path (Get-Location) 'src\pages\OverviewContent.tsx'))
$imports = ($lines[0..13]) -join "`n"

function Get-Lines($start, $end) {
  return ($lines[$start..$end] -join "`n")
}

$queries = Get-Lines 16 644
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
