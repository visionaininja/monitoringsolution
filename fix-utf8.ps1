$files = Get-ChildItem -Path "src" -Filter "*.tsx" -Recurse
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Encoding UTF8
    $newContent = $content -replace 'Â·', '·'
    Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8
}
