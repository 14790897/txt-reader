"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { wrap } = require("./templates");
const speakers = require("./speakers");

const LANG_ID = "txt-reader";
const DISGUISED_CTX = "txtreader.isDisguised";
const THEME_LABEL = "TXT Dark";

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
    statusBar.text = "$(eye) 伪装中";
    statusBar.tooltip = "该文件已伪装。点击紧急还原（Ctrl+Alt+X）";
    statusBar.command = "txtreader.panic";
    statusBar.show();
  } else if (
    doc &&
    doc.uri.scheme === "file" &&
    path.extname(doc.fileName).toLowerCase() === ".txt"
  ) {
    statusBar.text = "$(file-code) 代码样式";
    statusBar.tooltip = "txt 代码样式已启用，点击切换为纯文本";
    statusBar.command = "txtreader.toggleStyle";
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
    .getConfiguration("txtreader")
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
    "已伪装成代码 ✅  按 Ctrl+S 保存生效；按 Ctrl+Alt+X 一键还原",
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

/** 切换 TXT Dark 主题: 应用后再次执行可恢复之前的主题 */
async function toggleTheme() {
  const conf = vscode.workspace.getConfiguration();
  const current = conf.get("workbench.colorTheme");
  if (current === THEME_LABEL) {
    // 已是 TXT Dark: 恢复之前记住的主题
    const prev = ctx.globalState.get("previousColorTheme", "");
    if (prev && prev !== THEME_LABEL) {
      await conf.update(
        "workbench.colorTheme",
        prev,
        vscode.ConfigurationTarget.Global
      );
      vscode.window.showInformationMessage(`已恢复主题「${prev}」`);
    } else {
      vscode.window.showInformationMessage(
        "没有记录到之前的主题，可在 文件 → 首选项 → 主题 → 颜色主题 手动切换"
      );
    }
    return;
  }
  await ctx.globalState.update("previousColorTheme", current);
  await conf.update(
    "workbench.colorTheme",
    THEME_LABEL,
    vscode.ConfigurationTarget.Global
  );
  vscode.window.showInformationMessage(
    `已切换到「${THEME_LABEL}」。再次执行本命令可恢复「${current}」`
  );
}

/** 可视化选择对话引号样式: 下拉选择, 选完立即生效 */
async function pickDialogueStyle() {
  const conf = vscode.workspace.getConfiguration("txtreader");
  const current = conf.get("highlight.dialogueStyle", "string");
  const options = [
    {
      label: "橙红色（默认）",
      description: "string · 与其他语言字符串一致",
      value: "string",
    },
    {
      label: "加粗（与正文同色）",
      description: "bold · 不刺眼",
      value: "bold",
    },
    {
      label: "纯文本",
      description: "plain · 不特殊处理",
      value: "plain",
    },
  ];
  const picked = await vscode.window.showQuickPick(options, {
    placeHolder: `选择对话引号（“”「」）的显示样式（当前: ${current}）`,
  });
  if (!picked) return;
  await conf.update(
    "highlight.dialogueStyle",
    picked.value,
    vscode.ConfigurationTarget.Global
  );
  vscode.window.showInformationMessage(`对话样式已切换为「${picked.label}」`);
}

/** 把 txtreader.reading.* 同步为 [txt-reader] 语言级编辑器设置(只影响 txt, 不碰其他语言) */
async function applyReadingSettings(showMessage = false) {
  const conf = vscode.workspace.getConfiguration("txtreader");
  const enabled = conf.get("reading.enabled", true);
  if (!enabled) {
    if (showMessage) {
      vscode.window.showInformationMessage(
        "阅读设置未启用（txtreader.reading.enabled = false）"
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
  // 第 4 个参数 overrideInLanguage=true: 写入 [txt-reader] 语言级覆盖, 而不是全局设置
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

/**
 * 对话装饰: Decoration API 实现(运行时写入 textMateRules 在本版本 VS Code
 * 不会生效, decorations 则实时刷新且不污染用户设置)
 * - dialogueDecorationType: 基础样式(string 色 / bold / plain)
 * - speakerDecorationTypes: 按说话人/循环的配色, 每色一个 DecorationType
 */
let dialogueDecorationType = undefined;
const speakerDecorationTypes = []; // { type, color }
let speakerAssignments = []; // 每段对话引号的配色索引, null = 未分配

const DARK_SPEAKER_PALETTE = [
  "#4EC9B0", "#DCDCAA", "#569CD6", "#C586C0",
  "#B5CEA8", "#D7BA7D", "#9CDCFE", "#F48771",
];

// 亮色主题专用: 深色高对比配色(白底上清晰可读)
const LIGHT_SPEAKER_PALETTE = [
  "#00695C", "#7B1FA2", "#B45309", "#1450A0",
  "#9A3412", "#4D7C0F", "#8E24AA", "#B91C1C",
];

function speakerPalette() {
  const isLight =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light;
  return isLight ? LIGHT_SPEAKER_PALETTE : DARK_SPEAKER_PALETTE;
}

function dialogueStyleIsBold() {
  return (
    vscode.workspace.getConfiguration("txtreader").get("highlight.dialogueStyle", "string") ===
    "bold"
  );
}

function disposeSpeakerDecorations() {
  for (const d of speakerDecorationTypes) d.type.dispose();
  speakerDecorationTypes.length = 0;
  // 注意: 只释放装饰类型, 保留 speakerAssignments(配色分配)与引号数量解耦,
  // 这样主题/样式切换重建类型后, 已有的说话人配色不丢
}

function rebuildSpeakerDecorationTypes() {
  disposeSpeakerDecorations();
  const bold = dialogueStyleIsBold();
  for (const color of speakerPalette()) {
    const opts = { color };
    if (bold) opts.fontWeight = "bold";
    speakerDecorationTypes.push({
      type: vscode.window.createTextEditorDecorationType(opts),
      color,
    });
  }
}

function updateDialogueDecoration() {
  const conf = vscode.workspace.getConfiguration("txtreader");
  const style = conf.get("highlight.dialogueStyle", "string");

  // 先用旧类型清空装饰, 再释放
  const editor = vscode.window.activeTextEditor;
  if (dialogueDecorationType) {
    if (editor && editor.document.languageId === LANG_ID) {
      editor.setDecorations(dialogueDecorationType, []);
    }
    dialogueDecorationType.dispose();
    dialogueDecorationType = undefined;
  }

  let opts;
  if (style === "string") {
    // 按明暗主题自适应: 暗色用 #CE9178, 亮色用 #A31515(经典字符串色)
    const isLight =
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light;
    opts = { color: isLight ? "#A31515" : "#CE9178" };
  } else if (style === "bold") {
    // 只加粗不设色: 与正文同色, 不刺眼
    opts = { fontWeight: "bold" };
  }
  if (opts) {
    dialogueDecorationType = vscode.window.createTextEditorDecorationType(opts);
  }
  rebuildSpeakerDecorationTypes();
  refreshDialogueDecorations();
}

/** 收集当前文档的所有对话引号范围(按出现顺序) */
function collectDialogueRanges() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== LANG_ID) return [];
  const text = editor.document.getText();
  const ranges = [];
  const re = /“[^”\n]*”|「[^」\n]*」/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    ranges.push(
      new vscode.Range(
        editor.document.positionAt(m.index),
        editor.document.positionAt(m.index + m[0].length)
      )
    );
  }
  return ranges;
}

function refreshDialogueDecorations() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== LANG_ID) return;
  const ranges = collectDialogueRanges();
  // 基础样式: 只装饰没有说话人配色的引号
  if (dialogueDecorationType) {
    const base = ranges.filter((_, i) => speakerAssignments[i] == null);
    editor.setDecorations(dialogueDecorationType, base);
  }
  // 说话人配色: 每个色系单独一个 DecorationType
  for (let c = 0; c < speakerDecorationTypes.length; c++) {
    const assigned = ranges.filter((_, i) => speakerAssignments[i] === c);
    editor.setDecorations(speakerDecorationTypes[c].type, assigned);
  }
}

/** 命令: 循环配色对话(每条对话轮换不同颜色) */
async function cycleDialogueColors() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== LANG_ID) {
    vscode.window.showWarningMessage("请先打开一个 .txt 文件");
    return;
  }
  const ranges = collectDialogueRanges();
  if (!ranges.length) {
    vscode.window.showInformationMessage("没有找到对话引号（“”「」）");
    return;
  }
  speakerAssignments = ranges.map((_, i) => i % speakerPalette().length);
  refreshDialogueDecorations();
  vscode.window.showInformationMessage(
    `已为 ${ranges.length} 段对话应用循环配色（每条不同颜色）`
  );
}

/** 说话人分析缓存目录 */
function speakersCacheDir() {
  return vscode.Uri.joinPath(ctx.globalStorageUri, "speakers");
}

async function loadCachedSpeakers(quotes) {
  const key = speakers.cacheKeyFor(quotes);
  const uri = vscode.Uri.joinPath(speakersCacheDir(), `${key}.json`);
  try {
    const raw = await vscode.workspace.fs.readFile(uri);
    const data = JSON.parse(Buffer.from(raw).toString("utf8"));
    return data; // { assignments: number[] , speakers: string[] }
  } catch {
    return null;
  }
}

async function saveCachedSpeakers(quotes, assignments, speakerNames) {
  const key = speakers.cacheKeyFor(quotes);
  const uri = vscode.Uri.joinPath(speakersCacheDir(), `${key}.json`);
  await vscode.workspace.fs.createDirectory(speakersCacheDir());
  await vscode.workspace.fs.writeFile(
    uri,
    Buffer.from(
      JSON.stringify({ assignments, speakers: speakerNames }, null, 2),
      "utf8"
    )
  );
}

/** 按 txtreader.dialogue.speakerColors 设置自动应用(打开文件/设置变化时) */
async function applySpeakerMode() {
  const mode = vscode.workspace
    .getConfiguration("txtreader")
    .get("dialogue.speakerColors", "off");
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== LANG_ID) return;
  if (mode === "off") {
    speakerAssignments = [];
    refreshDialogueDecorations();
    return;
  }
  const quotes = speakers.extractQuotes(editor.document.getText());
  if (mode === "cycle") {
    speakerAssignments = quotes.map((_, i) => i % speakerPalette().length);
    refreshDialogueDecorations();
    return;
  }
  if (mode === "ai") {
    const cached = await loadCachedSpeakers(quotes);
    if (cached && Array.isArray(cached.assignments)) {
      speakerAssignments = cached.assignments;
      refreshDialogueDecorations();
    }
    // 无缓存时保持现状, 用户运行「AI 识别说话人」命令后生效
  }
}

/** 命令内配置引导: 选择接口 -> 输入 Key -> 保存到设置 */
async function setupAIInteraction() {
  const conf = vscode.workspace.getConfiguration("txtreader");
  const providers = [
    {
      label: "DeepSeek（推荐，只填 Key）",
      description: "自动配置 baseUrl 与模型",
      value: "deepseek",
    },
    {
      label: "Anthropic Claude",
      description: "官方 SDK，默认 claude-opus-5",
      value: "anthropic",
    },
    {
      label: "OpenAI 兼容",
      description: "OpenAI / Kimi / 通义 / 中转 / 本地模型",
      value: "openai",
    },
  ];
  const picked = await vscode.window.showQuickPick(providers, {
    placeHolder: "选择 AI 接口（随时可在设置中更改）",
    ignoreFocusOut: true,
  });
  if (!picked) return null;
  await conf.update(
    "dialogue.ai.provider",
    picked.value,
    vscode.ConfigurationTarget.Global
  );

  const envName =
    picked.value === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const key = await vscode.window.showInputBox({
    prompt: `粘贴 ${picked.label} 的 API Key（留空则使用环境变量 ${envName}）`,
    placeHolder: "sk-... 或你的 API Key",
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) return null; // 用户取消
  if (key.trim()) {
    await conf.update(
      "dialogue.ai.apiKey",
      key.trim(),
      vscode.ConfigurationTarget.Global
    );
  }
  return { provider: picked.value, apiKey: key.trim() };
}

/** 命令: AI 识别说话人(Claude 分析 + 按人配色 + 缓存) */
async function analyzeSpeakersCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== LANG_ID) {
    vscode.window.showWarningMessage("请先打开一个 .txt 文件");
    return;
  }
  let conf = vscode.workspace.getConfiguration("txtreader");
  let provider = conf.get("dialogue.ai.provider", "anthropic");
  let apiKey = conf.get("dialogue.ai.apiKey", "");
  const isOpenAIFamily = provider === "openai" || provider === "deepseek";
  const hasKey =
    !!apiKey || (isOpenAIFamily
      ? !!process.env.OPENAI_API_KEY
      : !!process.env.ANTHROPIC_API_KEY);

  if (!hasKey) {
    // 无 Key: 命令内引导配置(选择接口 + 输入 Key)
    const setup = await setupAIInteraction();
    if (!setup) return;
    conf = vscode.workspace.getConfiguration("txtreader");
    provider = conf.get("dialogue.ai.provider", "anthropic");
    apiKey = conf.get("dialogue.ai.apiKey", "");
    const family = provider === "openai" || provider === "deepseek";
    if (
      !apiKey &&
      !(family ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY)
    ) {
      vscode.window.showWarningMessage(
        `未填写 Key 且环境变量 ${family ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} 不存在，已跳过分析`
      );
      return;
    }
  }

  let baseUrl = conf.get("dialogue.ai.baseUrl", "");
  let model = conf.get("dialogue.ai.model", "");
  // DeepSeek 官方预设: 用户只填 Key, baseUrl 与模型自动填好(可覆盖)
  if (provider === "deepseek") {
    if (!baseUrl) baseUrl = "https://api.deepseek.com";
    if (!model) model = "deepseek-flash";
  }

  const quotes = speakers.extractQuotes(editor.document.getText());
  if (!quotes.length) {
    vscode.window.showInformationMessage("没有找到对话引号（“”「」）");
    return;
  }

  // 全文上下文: 1M 上下文模型(Claude/DeepSeek 等)可直接容纳整篇, 判断最准;
  // 超过 maxContextChars(默认 70 万字符, 0=不限制)回退为片段上下文并明确告知
  const fullTextRaw = editor.document.getText();
  const contextLimit = Number(
    conf.get("dialogue.ai.maxContextChars", 700000)
  );
  let contextText = fullTextRaw;
  if (contextLimit > 0 && fullTextRaw.length > contextLimit) {
    contextText = null;
    vscode.window.showWarningMessage(
      `文档过大(${(fullTextRaw.length / 1000).toFixed(0)}K 字符，上限 ${(contextLimit / 1000).toFixed(0)}K)，AI 分析改用片段上下文`
    );
  }

  let result;
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `AI 正在分析 ${quotes.length} 段对话的说话人…`,
      },
      async () => {
        result = isOpenAIFamily
          ? await speakers.analyzeSpeakersOpenAI(
              { apiKey, baseUrl, model },
              quotes,
              contextText
            )
          : await speakers.analyzeSpeakers(
              { apiKey, baseUrl, model },
              quotes,
              contextText
            );
      }
    );
  } catch (err) {
    const detail =
      err && err.message ? err.message.slice(0, 300) : String(err);
    vscode.window.showErrorMessage(`AI 分析失败: ${detail}`);
    return;
  }

  // 说话人 -> 配色索引(按首次出现顺序, 颜色稳定)
  const speakerColor = new Map();
  let next = 0;
  for (const r of result) {
    if (!speakerColor.has(r.speaker)) speakerColor.set(r.speaker, next++);
  }
  const assignments = quotes.map((q, i) => {
    const r = result.find((x) => x.index === i);
    return r ? speakerColor.get(r.speaker) : null;
  });
  speakerAssignments = assignments;
  refreshDialogueDecorations();
  await saveCachedSpeakers(quotes, assignments, [...speakerColor.keys()]);

  const names = [...speakerColor.keys()].join("、");
  vscode.window.showInformationMessage(
    `识别出 ${speakerColor.size} 个说话人: ${names}（结果已缓存，打开同类文档自动生效）`
  );
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
    vscode.commands.registerCommand("txtreader.disguise", async () => {
      const doc = activeDoc();
      if (doc) await disguise(doc);
    }),
    vscode.commands.registerCommand("txtreader.restore", async () => {
      const doc = activeDoc();
      if (doc) await restore(doc);
    }),
    vscode.commands.registerCommand("txtreader.panic", panic),
    vscode.commands.registerCommand("txtreader.toggleStyle", toggleStyle),
    vscode.commands.registerCommand("txtreader.applyTheme", toggleTheme),
    vscode.commands.registerCommand("txtreader.applyReadingSettings", () =>
      applyReadingSettings(true)
    ),
    vscode.commands.registerCommand("txtreader.pickDialogueStyle", pickDialogueStyle),
    vscode.commands.registerCommand("txtreader.cycleDialogueColors", cycleDialogueColors),
    vscode.commands.registerCommand("txtreader.analyzeSpeakers", analyzeSpeakersCommand),
    vscode.commands.registerCommand("txtreader.setupAI", async () => {
      const setup = await setupAIInteraction();
      if (setup) {
        vscode.window.showInformationMessage(
          `AI 配置已保存：接口 ${setup.provider}${setup.apiKey ? "" : "（使用环境变量 Key）"}`
        );
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("txtreader.reading")) {
        applyReadingSettings().catch(() => {});
      }
      if (e.affectsConfiguration("txtreader.highlight")) {
        updateDialogueDecoration();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      refreshStatusBar();
      refreshDialogueDecorations();
      applySpeakerMode().catch(() => {});
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === LANG_ID) {
        refreshDialogueDecorations();
      }
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      updateDialogueDecoration();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("txtreader.dialogue")) {
        applySpeakerMode().catch(() => {});
      }
    }),
    vscode.languages.registerDocumentSymbolProvider(
      { language: LANG_ID },
      new MoyuDocumentSymbolProvider()
    )
  );

  applyReadingSettings().catch((err) =>
    console.error("[txtreader] applyReadingSettings failed:", err)
  );
  updateDialogueDecoration();
  applySpeakerMode().catch(() => {});
  // 编辑器初始化晚于 onLanguage 激活, 延迟重应用确保装饰生效
  setTimeout(() => refreshDialogueDecorations(), 1000);
  refreshStatusBar();
}

function deactivate() {}

module.exports = { activate, deactivate };
