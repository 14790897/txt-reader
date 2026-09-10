/**
 * 摸鱼阅读器 (moyu-reader) VS Code 扩展 E2E 测试
 *
 * 通过 CDP 拉起真实 VS Code 开发宿主（extensionDevelopmentPath 加载本扩展），验证：
 *  1. .txt 自动关联 moyu-txt 语言 + 语法高亮分词生效
 *  2. Ctrl+Alt+D 伪装成代码：内容变模板 + 原文嵌入 + 备份生成
 *  3. Ctrl+Alt+X 老板键：还原原文 + 保存 + 切纯文本 + 备份删除
 *
 * Run: npx playwright test --project=vscode --reporter=list
 */
import { test, expect, chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CDP_PORT = 9500 + Math.floor(Math.random() * 400);

const EXT_DIR = path.resolve(__dirname, '..', '..');

const NOVEL = `第一章 风起

　　天刚蒙蒙亮，李四就醒了。他推开窗，外面的世界一片安静。
　　“今天也要好好摸鱼。”他对自己说，2026年9月9日。

第二章 开局

　　https://example.com/novel 链接在此。他说：action！
`;

function findVSCodeCLI(): string {
  const candidates = [
    path.join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      'Microsoft VS Code',
      'bin',
      'code.cmd',
    ),
    'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd',
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('VS Code CLI not found');
  return found;
}

async function waitForCDP(port: number, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`CDP port ${port} not available in ${timeoutMs}ms`);
}

function killProcessTree(proc: ChildProcess): void {
  if (!proc || proc.killed) return;
  const pid = proc.pid;
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
      }, 3000);
    }
  } catch {
    try {
      proc.kill('SIGKILL');
    } catch {}
  }
}

function listBackups(backupsDir: string): string[] {
  try {
    return fs.readdirSync(backupsDir).filter((f) => f.endsWith('.txt'));
  } catch {
    return [];
  }
}

/** VS Code 的 workbench 页面在 CDP 就绪后才创建，轮询所有 context 直到找到 */
async function waitForWorkbenchPage(
  browser: Browser,
  timeoutMs = 90_000,
): Promise<Page> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const context of browser.contexts()) {
      for (const p of context.pages()) {
        try {
          if ((await p.locator('.monaco-workbench').count()) > 0) {
            return p;
          }
        } catch {}
      }
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error('VS Code workbench not found in time');
}

/** 按命令行包含 marker 精确杀掉 Code.exe 进程（不误伤用户实例） */
function killByCmdlineMarker(marker: string): void {
  if (process.platform !== 'win32') return;
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='Code.exe'\\" | Where-Object { $_.CommandLine -like '*${marker}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
      { stdio: 'ignore', timeout: 30_000 },
    );
  } catch {}
}

/** 统计命令行包含 marker 的 Code.exe 数量 */
function countByCmdlineMarker(marker: string): number {
  if (process.platform !== 'win32') return 0;
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name='Code.exe'\\" | Where-Object { $_.CommandLine -like '*${marker}*' }).Count"`,
      { encoding: 'utf8', timeout: 30_000 },
    );
    return parseInt(out.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

test.describe('摸鱼阅读器 E2E', () => {
  let vscodeProcess: ChildProcess | null = null;
  let browser: Browser | null = null;
  let page: Page;
  let novelPath: string;
  let userDataDir: string;
  let backupsDir: string;

  test.beforeAll(async () => {
    const codeCLI = findVSCodeCLI();
    if (!fs.existsSync(codeCLI)) {
      test.skip(true, 'VS Code not installed — skipping');
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moyu-e2e-'));
    userDataDir = path.join(tmpDir, 'user-data');
    fs.mkdirSync(userDataDir, { recursive: true });
    // 关键: 空 extensions-dir 隔离用户真实扩展(重型 AI 扩展会拖慢甚至崩掉扩展宿主)
    const extensionsDir = path.join(tmpDir, 'extensions');
    fs.mkdirSync(extensionsDir, { recursive: true });

    // 清理历史测试泄漏的 VS Code 实例, 并确认清零(防止 CDP 串到旧窗口)
    killByCmdlineMarker('moyu-e2e-');
    await expect
      .poll(() => countByCmdlineMarker('moyu-e2e-'), { timeout: 15_000 })
      .toBe(0);

    const novelDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moyu-novel-'));
    novelPath = path.join(novelDir, 'novel.txt');
    fs.writeFileSync(novelPath, NOVEL, 'utf8');

    backupsDir = path.join(
      userDataDir,
      'User',
      'globalStorage',
      'moyu-dev.moyu-reader',
      'backups',
    );

    // 预置阅读配置: 验证插件把 moyu.* 配置同步为 [moyu-txt] 语言级编辑器设置
    const userDir = path.join(userDataDir, 'User');
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(
      path.join(userDir, 'settings.json'),
      JSON.stringify(
        { 'moyu.reading.fontSize': 24, 'moyu.reading.lineHeight': 2.4 },
        null,
        2,
      ),
      'utf8',
    );

    const args = [
      `--remote-debugging-port=${CDP_PORT}`,
      '--no-sandbox',
      '--disable-gpu',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
      '--disable-telemetry',
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      `--extensionDevelopmentPath=${EXT_DIR}`,
      novelPath,
    ];

    if (process.platform === 'win32') {
      const argStr = args.map((a) => `"${a}"`).join(' ');
      vscodeProcess = spawn(`"${codeCLI}" ${argStr}`, [], {
        stdio: 'pipe',
        shell: true,
      });
    } else {
      vscodeProcess = spawn(codeCLI, args, { stdio: 'pipe' });
    }

    await waitForCDP(CDP_PORT);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    page = await waitForWorkbenchPage(browser);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.monaco-workbench')).toBeVisible({
      timeout: 60_000,
    });
  }, 120_000);

  test.afterAll(async () => {
    await browser?.close().catch(() => {});
    // 按命令行匹配精确杀掉本测试的 VS Code 实例, 然后清理临时目录
    killByCmdlineMarker(userDataDir);
    try {
      fs.rmSync(path.dirname(userDataDir), { recursive: true, force: true });
    } catch {}
  });

  test('1. txt 自动启用代码样式语言并分词高亮', async () => {
    // 原文已打开且可见
    const firstLine = page
      .locator('.monaco-editor .view-line')
      .filter({ hasText: '第一章' })
      .first();
    await expect(firstLine).toBeVisible({ timeout: 60_000 });

    // 状态栏语言模式 = 摸鱼文本（.txt 已被 moyu-txt 语言接管）
    const langItem = page
      .locator('.statusbar-item')
      .filter({ hasText: /摸鱼文本|Moyu Text/ })
      .first();
    await expect(langItem).toBeVisible({ timeout: 30_000 });

    // 语法高亮："2026" 与 "年" 应落在不同 token class 的 span 里
    // (分词在文件打开后异步完成, 用 poll 等待而不是一次性断言)
    const numLine = page
      .locator('.monaco-editor .view-line')
      .filter({ hasText: '2026年' })
      .first();
    await expect(numLine).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const spans = await numLine.locator('span').evaluateAll((els) =>
            els.map((e) => ({
              text: e.textContent || '',
              cls: e.className || '',
            })),
          );
          const numSpan = spans.find(
            (s) => s.text.includes('2026') && !s.text.includes('年'),
          );
          const proseSpan = spans.find((s) => s.text.includes('年'));
          if (!numSpan || !proseSpan) return null;
          return { sameClass: numSpan.cls === proseSpan.cls };
        },
        { timeout: 20_000 },
      )
      .toEqual({ sameClass: false });

    await page.screenshot({ path: 'test-results/01-txt-highlighted.png' });
  });

  test('2. 阅读设置: moyu.* 配置自动应用到 moyu-txt 语言', async () => {
    const settingsPath = path.join(userDataDir, 'User', 'settings.json');

    // 插件激活时应把 moyu.reading.* 同步为 [moyu-txt] 语言级 editor 设置
    await expect
      .poll(
        () => {
          try {
            const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const lang = s['[moyu-txt]'];
            return lang
              ? {
                  fontSize: lang['editor.fontSize'],
                  lineHeight: lang['editor.lineHeight'],
                }
              : null;
          } catch {
            return null;
          }
        },
        { timeout: 20_000 },
      )
      .toEqual({ fontSize: 24, lineHeight: 2.4 });

    // 渲染层验证: 实际行高 ≈ 24 * 2.4 = 57.6px(默认密集行距只有 ~18px)
    // 锚定到包含小说原文的那个 monaco 编辑器(避免命中 Chat 输入框等其他编辑器)
    const mainEditor = page
      .locator('.monaco-editor')
      .filter({ hasText: '第一章' })
      .first();
    const firstLine = mainEditor.locator('.view-line').first();
    await expect(firstLine).toBeVisible({ timeout: 10_000 });
    // 断言此时编辑器仍显示小说原文(伪装不应在阅读设置测试前发生)
    const firstText = await firstLine.textContent();
    console.log(
      `[CONTENT ${new Date().toISOString().slice(11, 23)}] 首行内容: ${firstText}`,
      `backup数: ${listBackups(backupsDir).length}`,
    );
    expect(firstText, '阅读设置测试时编辑器应显示小说原文').toContain(
      '第一章',
    );
    const lineHeightPx = await firstLine.evaluate((el) => {
      const h = parseFloat(getComputedStyle(el).lineHeight);
      return Number.isFinite(h) ? h : 0;
    });
    expect(lineHeightPx, '行高应明显大于默认密集行距').toBeGreaterThan(50);

    // 元素级截图: 保证截图内容与上面断言的是同一个编辑器
    await mainEditor.screenshot({
      path: 'test-results/04-reading-settings.png',
    });
    expect(
      await firstLine.textContent(),
      '截图后编辑器内容不应变化',
    ).toContain('第一章');
  });

  test('3. Ctrl+Alt+D 伪装成代码并生成备份', async () => {
    // 聚焦编辑器后按快捷键
    await page.locator('.monaco-editor .view-lines').first().click();
    await page.keyboard.press('Control+Alt+D');

    // 内容变为 python 代码模板
    const templateLine = page
      .locator('.monaco-editor .view-line')
      .filter({ hasText: '数据清洗与文本分析脚本' })
      .first();
    await expect(templateLine).toBeVisible({ timeout: 30_000 });

    // Ctrl+S 保存
    await page.keyboard.press('Control+S');
    await expect
      .poll(() => fs.readFileSync(novelPath, 'utf8'), { timeout: 15_000 })
      .toContain('# -*- coding: utf-8');

    const saved = fs.readFileSync(novelPath, 'utf8');
    expect(saved).toContain('class TextProcessor');
    expect(saved, '原文应原样嵌入模板').toContain('第一章 风起');

    // 备份文件：恰好 1 个，内容与原文逐字节一致
    const backups = listBackups(backupsDir);
    expect(backups.length).toBe(1);
    expect(
      fs.readFileSync(path.join(backupsDir, backups[0]), 'utf8'),
    ).toBe(NOVEL);

    await page.screenshot({ path: 'test-results/02-disguised.png' });
  });

  test('4. Ctrl+Alt+X 老板键：还原原文+保存+切纯文本', async () => {
    await page.locator('.monaco-editor .view-lines').first().click();
    await page.keyboard.press('Control+Alt+X');

    // 语言模式切回 Plain Text
    await expect(
      page.locator('.statusbar-item').filter({ hasText: 'Plain Text' }).first(),
    ).toBeVisible({ timeout: 30_000 });

    // 磁盘文件逐字节还原
    await expect
      .poll(() => fs.readFileSync(novelPath, 'utf8'), { timeout: 15_000 })
      .toBe(NOVEL);

    // 备份已删除（不留痕迹）
    expect(listBackups(backupsDir).length).toBe(0);

    // 编辑器显示原文第一行
    await expect(
      page.locator('.monaco-editor .view-line').filter({ hasText: '第一章' }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await page.screenshot({ path: 'test-results/03-restored-plain.png' });
  });
});
