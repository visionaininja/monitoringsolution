$imports = Get-Content 'src\pages\DockerOverview.tsx' | Select-Object -First 13 | Out-String

$content = Get-Content 'src\pages\OverviewContent.tsx' -Raw
$lines = $content -split "`r`n"
if ($lines.Length -eq 1) {
  $lines = $content -split "`n"
}

function Get-Lines($start, $end) {
  return ($lines[$start..$end] -join "`n")
}

$queries = Get-Lines 1 645
$k8sUi = Get-Lines 701 810
$vmUi = Get-Lines 811 973
$githubUi = Get-Lines 977 1229

$commonReturn = "`nreturn (`n<div className=`"space-y-6`">`n<DetailOverlay panel={activePanel} onClose={closePanel} />`n"

$k8sFinal = $imports + "`nimport { getGitHubToken } from '@/lib/github';`nexport default function KubernetesOverview() {`n" + $queries + $commonReturn + $k8sUi + "`n</div>`n)`n}"
Set-Content -Path 'src\pages\KubernetesOverview.tsx' -Value $k8sFinal -Encoding utf8

$vmFinal = $imports + "`nimport { getGitHubToken } from '@/lib/github';`nexport default function VirtualMachineOverview() {`n" + $queries + $commonReturn + $vmUi + "`n</div>`n)`n}"
Set-Content -Path 'src\pages\VirtualMachineOverview.tsx' -Value $vmFinal -Encoding utf8

$githubFinal = $imports + "`nimport { getGitHubToken } from '@/lib/github';`nexport default function GithubOverview() {`n" + $queries + $commonReturn + $githubUi + "`n</div>`n)`n}"
Set-Content -Path 'src\pages\GithubOverview.tsx' -Value $githubFinal -Encoding utf8
