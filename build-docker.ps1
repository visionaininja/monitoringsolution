$imports = Get-Content 'src\pages\DockerOverview.tsx' -Raw
$docker = Get-Content 'src\pages\Overview.tsx' | Select-Object -Skip 281 -First 700 | Out-String
Set-Content -Path 'src\pages\DockerOverview.tsx' -Value ($imports + $docker + "`nexport default function DockerOverview() { const { environment } = useEnvironment(); return <DockerOverviewSection environment={environment} /> }") -Encoding utf8
