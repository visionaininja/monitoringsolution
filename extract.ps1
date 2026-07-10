$content = Get-Content -Path "src\pages\Overview.tsx" -Raw
$lines = $content -split "`r`n"
if ($lines.Length -eq 1) {
  $lines = $content -split "`n"
}

$markers = @{}
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match "// ─── Helpers") { $markers.helpers = $i }
  if ($lines[$i] -match "// ─── Detail Overlay") { $markers.detailOverlay = $i }
  if ($lines[$i] -match "// ─── Stat Card") { $markers.statCard = $i }
  if ($lines[$i] -match "// ─── Docker Overview Section") { $markers.docker = $i }
  if ($lines[$i] -match "// ─── Main Overview Component") { $markers.main = $i }
}

$markers | ConvertTo-Json
