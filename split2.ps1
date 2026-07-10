$content = Get-Content -Path "src\pages\Overview.tsx" -Raw
$lines = $content -split "`n"
$lines = $lines | ForEach-Object { $_.TrimEnd("`r") }

function Get-Lines {
  param([int]$start, [int]$end)
  return ($lines[$start..$end] -join "`n")
}

$importsAndHelpers = Get-Lines 0 279
$dockerSection = Get-Lines 280 980
$overviewStart = Get-Lines 981 1690 # main component start, queries, etc.
# Actually, this is too fragile.
