$lines = Get-Content 'src\pages\OverviewContent.tsx'
for($i=0; $i -lt $lines.Length; $i++) {
  if($lines[$i] -match 'KUBERNETES OVERVIEW GROUP') { Write-Output "K8S: $i" }
  if($lines[$i] -match 'VIRTUAL MACHINE OVERVIEW GROUP') { Write-Output "VM: $i" }
  if($lines[$i] -match '<DockerOverviewSection') { Write-Output "DOCKER: $i" }
  if($lines[$i] -match 'GITHUB OVERVIEW GROUP') { Write-Output "GITHUB: $i" }
}
