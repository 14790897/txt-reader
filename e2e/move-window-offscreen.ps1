param(
  [Parameter(Mandatory=$true)][string]$Marker,
  [int]$WatchSeconds = 0,
  [switch]$ExitAfterMove
)

# 把命令行包含 $Marker 的 Code.exe 窗口移到屏幕外(-32000,-32000)
# 仅移动窗口位置, 不隐藏/最小化, 保证 VS Code 渲染与 CDP 驱动不受影响。
# WatchSeconds > 0 时进入守护模式: 在指定时间内持续轮询, 窗口一出现就移走,
# 把启动瞬间的"闪现"降到最低。

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Move {
  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter,
    int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$SWP_NOSIZE = 0x0001
$SWP_NOZORDER = 0x0004
$movedIds = @{}

function Move-MatchingWindows {
  $count = 0
  $procs = Get-CimInstance Win32_Process -Filter "Name='Code.exe'" |
    Where-Object { $_.CommandLine -like "*$Marker*" }
  foreach ($p in $procs) {
    $proc = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
    if ($proc -and $proc.MainWindowHandle -ne 0) {
      $rect = New-Object Win32Move+RECT
      [Win32Move]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
      if ($rect.Left -ne -32000 -or $rect.Top -ne -32000) {
        [Win32Move]::SetWindowPos($proc.MainWindowHandle, [IntPtr]::Zero,
          -32000, -32000, 0, 0, ($SWP_NOSIZE -bor $SWP_NOZORDER)) | Out-Null
        $count++
      }
    }
  }
  return $count
}

if ($WatchSeconds -le 0) {
  $n = Move-MatchingWindows
  Write-Host "moved $n window(s) offscreen"
  exit 0
}

$deadline = (Get-Date).AddSeconds($WatchSeconds)
while ((Get-Date) -lt $deadline) {
  $n = Move-MatchingWindows
  if ($ExitAfterMove -and $n -gt 0) {
    Write-Host "moved window offscreen, exiting watcher"
    exit 0
  }
  Start-Sleep -Milliseconds 200
}
Write-Host "watch ended after $WatchSeconds s"
