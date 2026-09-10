"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { wrap } = require("./templates");

const LANG_ID = "moyu-txt";
const DISGUISED_CTX = "moyu.isDisguised";
const THEME_LABEL = "Moyu Dark (摸鱼暗色)";

let ctx;
let statusBar;

// ---------- 辅助函数 ----------

function backupsDir() {
  return vscode.Uri.joinPath(ctx.globalStorageUri, "backups");
}

function backupUriFor(doc) {
  const hash = crypto
    .createHash("sha1")
    .update(doc.uri.fsPath)
    .digest("hex")
    .slice(0, 16);
  return vscode.Uri.joinPath(backupsDir(), `${hash}.txt`);
}

function hasBackup(doc) {
  if (!doc || doc.isUntitled) return false;
  try {
    return fs.existsSync(backupUriFor(doc).fsPath);
  } catch {
    return false;
  }
}

function fullRange(doc) {
  const lastLine = doc.lineAt(doc.lineCount - 1);
  return new vscode.Range(0, 0, doc.lineCount - 1, lastLine.text.length);
}

async function applyFullReplace(doc, text) {
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === doc.uri.toString()
  );
  if (editor) {
    return editor.edit((builder) => builder.replace(fullRange(doc), text));
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, fullRange(doc), text);
  return vscode.workspace.applyEdit(edit);
}

async function refreshStatusBar() {
  const editor = vscode.window.activeTextEditor;
  const doc = editor && editor.document;
  const disguised = hasBackup(doc);
  await vscode.commands.executeCommand("setContext", DISGUISED_CTX, disguised);

  if (disguised) {
    statusBar.text = "$(eye) 摸鱼中";
    statusBar.tooltip = "该文件已伪装。点击紧急还原（Ctrl+Alt+X）";
    statusBar.command = "moyu.panic";
    statusBar.show();
  } else if (
    doc &&
    doc.uri.scheme === "file" &&
    path.extname(doc.fileName).toLowerCase() === ".txt"
  ) {
    statusBar.text = "$(file-code) 代码样式";
    statusBar.tooltip = "txt 代码样式已启用，点击切换为纯文本";
    statusBar.command = "moyu.toggleStyle";
    statusBar.show();
  } else {
    statusBar.hide();
  }
}

// ---------- 命令实现 ----------

async function disguise(doc) {
  if (doc.isUntitled) {
    vscode.window.showWarningMessage("请先把文件保存为 .txt，再执行伪装");
    return;
  }
  if (path.extname(doc.fileName).toLowerCase() !== ".txt") {
    vscode.window.showWarningMessage("只支持对 .txt 文件进行伪装");
    return;
  }
  if (hasBackup(doc)) {
    vscode.window.showWarningMessage(
      "该文件已在伪装状态。如需更换模板，请先「还原原文」"
    );
    return;
  }

  const original = doc.getText();
  if (!original.trim()) {
    vscode.window.showWarningMessage("文件是空的，没什么好伪装的");
    return;
  }

  try {
    fs.mkdirSync(backupsDir().fsPath, { recursive: true });
    fs.writeFileSync(backupUriFor(doc).fsPath, original, "utf8");
  } catch (err) {
    vscode.window.showErrorMessage(`备份原文失败：${err.message}`);
    return;
  }

  const template = vscode.workspace
    .getConfiguration("moyu")
    .get("template", "python");
  const wrapped = wrap(template, original);

  if (doc.languageId !== LANG_ID) {
    await vscode.languages.setTextDocumentLanguage(doc, LANG_ID);
  }

  const ok = await applyFullReplace(doc, wrapped);
  if (!ok) {
    vscode.window.showErrorMessage("应用伪装失败");
    return;
  }

  await refreshStatusBar();
  vscode.window.showInformationMessage(
    "已伪装成代码 ✅  按 Ctrl+S 保存生效；老板来了按 Ctrl+Alt+X 一键还原",
    "知道了"
  );
}

async function restore(doc, options = {}) {
  if (!hasBackup(doc)) {
    vscode.window.showWarningMessage(
      "没有找到该文件的备份。如果是刚刚伪装，可以直接 Ctrl+Z 撤销"
    );
    return false;
  }

  let original;
  try {
    original = fs.readFileSync(backupUriFor(doc).fsPath, "utf8");
  } catch (err) {
    vscode.window.showErrorMessage(`读取备份失败：${err.message}`);
    return false;
  }

  const ok = await applyFullReplace(doc, original);
  if (!ok) {
    vscode.window.showErrorMessage("还原失败");
    return false;
  }

  try {
    fs.unlinkSync(backupUriFor(doc).fsPath);
  } catch {
    // 备份删除失败不影响还原结果
  }

  try {
    await doc.save();
  } catch (err) {
    vscode.window.showWarningMessage(`原文已还原，但保存失败：${err.message}`);
  }

  if (options.toPlaintext) {
    await vscode.languages.setTextDocumentLanguage(doc, "plaintext");
  }

  await refreshStatusBar();
  return true;
}

async function panic() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const doc = editor.document;
  if (hasBackup(doc)) {
    await restore(doc, { toPlaintext: true });
    vscode.window.showInformationMessage("🔒 已紧急还原为原文");
  } else if (doc.languageId === LANG_ID) {
    await vscode.languages.setTextDocumentLanguage(doc, "plaintext");
    await refreshStatusBar();
    vscode.window.showInformationMessage("🔒 已切换为纯文本显示");
  } else {
    vscode.window.showInformationMessage("当前没有需要还原的内容 🙂");
  }
}

async function toggleStyle() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const isTxt =
    doc.uri.scheme === "file" &&
    path.extname(doc.fileName).toLowerCase() === ".txt";
  if (!isTxt) return;

  if (doc.languageId === LANG_ID) {
    await vscode.languages.setTextDocumentLanguage(doc, "plaintext");
    vscode.window.showInformationMessage("已切换为纯文本显示");
  } else {
    await vscode.languages.setTextDocumentLanguage(doc, LANG_ID);
    vscode.window.showInformationMessage("已启用代码样式显示");
  }
  await refreshStatusBar();
}

async function applyTheme() {
  await vscode.workspace
    .getConfiguration()
    .update("workbench.colorTheme", THEME_LABEL, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`已切换到「${THEME_LABEL}」主题`);
}

/** 把 moyu.reading.* 同步为 [moyu-txt] 语言级编辑器设置(只影响 txt, 不碰其他语言) */
async function applyReadingSettings(showMessage = false) {
  const conf = vscode.workspace.getConfiguration("moyu");
  const enabled = conf.get("reading.enabled", true);
  if (!enabled) {
    if (showMessage) {
      vscode.window.showInformationMessage(
        "阅读设置未启用（moyu.reading.enabled = false）"
      );
    }
    return false;
  }

  const fontSize = conf.get("reading.fontSize", 20);
  const lineHeight = conf.get("reading.lineHeight", 2.2);
  const fontFamily = conf.get("reading.fontFamily", "");

  const editorConf = vscode.workspace.getConfiguration("editor", {
    languageId: LANG_ID,
  });
  // 第 4 个参数 overrideInLanguage=true: 写入 [moyu-txt] 语言级覆盖, 而不是全局设置
  await editorConf.update(
    "fontSize",
    fontSize,
    vscode.ConfigurationTarget.Global,
    true
  );
  await editorConf.update(
    "lineHeight",
    lineHeight,
    vscode.ConfigurationTarget.Global,
    true
  );
  await editorConf.update(
    "fontFamily",
    fontFamily || undefined,
    vscode.ConfigurationTarget.Global,
    true
  );

  if (showMessage) {
    vscode.window.showInformationMessage(
      `已应用阅读设置：字号 ${fontSize}、行距 ${lineHeight}${fontFamily ? `、字体 ${fontFamily}` : ""}`
    );
  }
  return true;
}

// ---------- 大纲伪装 ----------

class MoyuDocumentSymbolProvider {
  provideDocumentSymbols(document) {
    const symbols = [];
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = line.text.trim();
      if (!text) continue;

      let kind;
      if (/^(def|class|function|func|fn|struct|interface|enum)\b/.test(text)) {
        kind = vscode.SymbolKind.Class;
      } else if (
        /^(import|from|require|#include|const|let|var|using|public|private|if|for|while|return)\b/.test(
          text
        )
      ) {
        kind = vscode.SymbolKind.Module;
      } else if (
        /^(第.{0,12}[章节卷部回]|Chapter\s+\d+|序章|楔子|尾声|番外|后记)/.test(
          text
        )
      ) {
        kind = vscode.SymbolKind.Method;
      } else {
        continue;
      }

      const range = new vscode.Range(i, 0, i, line.text.length);
      symbols.push(
        new vscode.DocumentSymbol(text.slice(0, 40), "", kind, range, range)
      );
    }
    return symbols;
  }
}

// ---------- 生命周期 ----------

function activate(context) {
  ctx = context;

  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    1000
  );
  context.subscriptions.push(statusBar);

  const activeDoc = () => {
    const editor = vscode.window.activeTextEditor;
    return editor && editor.document;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("moyu.disguise", async () => {
      const doc = activeDoc();
      if (doc) await disguise(doc);
    }),
    vscode.commands.registerCommand("moyu.restore", async () => {
      const doc = activeDoc();
      if (doc) await restore(doc);
    }),
    vscode.commands.registerCommand("moyu.panic", panic),
    vscode.commands.registerCommand("moyu.toggleStyle", toggleStyle),
    vscode.commands.registerCommand("moyu.applyTheme", applyTheme),
    vscode.commands.registerCommand("moyu.applyReadingSettings", () =>
      applyReadingSettings(true)
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("moyu.reading")) {
        applyReadingSettings().catch(() => {});
      }
    }),
    vscode.languages.registerDocumentSymbolProvider(
      { language: LANG_ID },
      new MoyuDocumentSymbolProvider()
    ),
    vscode.window.onDidChangeActiveTextEditor(() => refreshStatusBar())
  );

  applyReadingSettings().catch((err) =>
    console.error("[moyu] applyReadingSettings failed:", err)
  );
  refreshStatusBar();
}

function deactivate() {}

module.exports = { activate, deactivate };
