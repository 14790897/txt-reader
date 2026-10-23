// E2E 入口: 先启动"窗口移出屏幕"守护(完成 PowerShell 预热), 再运行 Playwright。
// 这样 VS Code 开发宿主窗口一出现就会被移到屏幕外, 不遮挡用户屏幕。
const { spawn } = require('node:child_process');
const path = require('node:path');

const isWin = process.platform === 'win32';

if (isWin) {
  const scriptPath = path.join(__dirname, 'move-window-offscreen.ps1');
  const watcher = spawn(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Marker',
      'txtreader-e2e-',
      '-WatchSeconds',
      '600',
      '-ExitAfterMove',
    ],
    { detached: true, stdio: 'ignore', windowsHide: true },
  );
  watcher.unref();
}

const extraArgs = process.argv.slice(2);
const pw = spawn(
  isWin ? 'npx.cmd' : 'npx',
  ['playwright', 'test', '--project=vscode', '--reporter=list', ...extraArgs],
  { stdio: 'inherit', shell: isWin },
);
pw.on('exit', (code) => process.exit(code ?? 0));
