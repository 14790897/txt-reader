$ErrorActionPreference = 'SilentlyContinue'
$vsDir = "$env:LOCALAPPDATA\Programs\Microsoft VS Code"
$stash = "$env:TEMP\vscode-update-stash-20260910"
New-Item -ItemType Directory -Force -Path $stash | Out-Null

# 1. 结束等待中的安装器
Get-Process -Name 'CodeSetup*' | Stop-Process -Force
Write-Host "setup killed"

# 2. 把排队中的更新包移出安装目录(同盘移动=秒级), 让更新服务无新版本可装
$items = @('new_Code.exe', 'new_Code.VisualElementsManifest.xml', 'updating_version')
$folders = Get-ChildItem $vsDir -Directory | Where-Object { $_.Name -match '^[0-9a-f]{40}$' }
foreach ($f in $folders) {
  if ($f.Name -ne '88e44fa0e0') {   # 保留当前正在运行的版本目录
    Move-Item $f.FullName "$stash\" -Force
    Write-Host ("moved folder: {0}" -f $f.Name)
  }
}
foreach ($i in $items) {
  $p = Join-Path $vsDir $i
  if (Test-Path $p) {
    Move-Item $p "$stash\" -Force
    Write-Host ("moved: {0}" -f $i)
  }
}
Write-Host "--- install dir now ---"
Get-ChildItem $vsDir | Where-Object { $_.Name -match 'new_Code|updat' } | Select-Object -ExpandProperty Name
Write-Host "--- stash ---"
Get-ChildItem $stash | Select-Object -ExpandProperty Name
