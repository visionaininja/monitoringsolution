$lines = Get-Content 'src\pages\OverviewContent.tsx'
for($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match 'activePanel') {
    Write-Output $i
  }
}
