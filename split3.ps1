$content = Get-Content -Path "src\pages\Overview.tsx" -Raw
$lines = $content -split "`r`n"
if ($lines.Length -eq 1) {
  $lines = $content -split "`n"
}

function Get-Lines($start, $end) {
  return ($lines[$start..$end] -join "`n")
}

$helpers = Get-Lines 0 280
Set-Content -Path "src\components\OverviewHelpers.tsx" -Value $helpers -Encoding utf8

$docker = Get-Lines 281 980
Set-Content -Path "src\pages\DockerOverview.tsx" -Value $docker -Encoding utf8

$overview = Get-Lines 981 2213
Set-Content -Path "src\pages\OverviewContent.tsx" -Value $overview -Encoding utf8
