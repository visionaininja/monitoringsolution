function Fix-Encoding($path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    # If it has UTF-16 LE BOM (FF FE)
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        $text = [System.Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2)
        [System.IO.File]::WriteAllText($path, $text, [System.Text.Encoding]::UTF8)
        Write-Output "Fixed UTF-16 for $path"
    }
    # If it has UTF-8 BOM (EF BB BF)
    elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $text = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
        [System.IO.File]::WriteAllText($path, $text, [System.Text.Encoding]::UTF8)
        Write-Output "Fixed UTF-8 BOM for $path"
    }
}

Fix-Encoding "src\pages\GithubOverview.tsx"
Fix-Encoding "src\pages\KubernetesOverview.tsx"
Fix-Encoding "src\pages\VirtualMachineOverview.tsx"
Fix-Encoding "src\pages\DockerOverview.tsx"
