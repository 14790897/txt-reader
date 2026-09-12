# 📖 TXT 阅读器 (TXT Reader)

把 txt 阅读变得像代码一样舒适：代码风格语法高亮、大字号宽行距排版、按说话人对话配色，支持 AI 识别说话人，一键伪装与还原。

## 功能

- **语法高亮**：`.txt` 打开即自动启用代码配色 —— 章节标题像函数名、句号问号像运算符、数字像常量、英文像变量、对话样式可配（字符串色 / 加粗 / 纯文本）
- **对话按人配色**：循环配色模式每条对话不同颜色；**AI 识别说话人**模式由 Claude 判断每句话是谁说的，按人固定配色（结果自动缓存）
- **阅读舒适排版**：txt 自动应用大字号 + 宽行距（默认 20 / 2.2，普通代码约 13 / 1.4），看小说不费眼；字号、行距、字体全部可配置
- **代码模板伪装**：一键把全文包进 Python / C++ / Node.js 代码模板，一眼看去就是代码
- **紧急还原**：`Ctrl+Alt+X` 瞬间还原原文、保存、并切回纯文本显示（阅读排版也会随语言切回密集的普通代码样式）
- **大纲**：侧边栏大纲/面包屑里，章节显示为函数符号，模板里的 class/def 照常显示
- **Moyu Dark 主题**：附赠一套暗色主题，txt 高亮更协调（同时也是一套正常可用的通用主题）

## 效果截图

**txt 代码样式高亮**（语言模式：TXT 阅读）

![](https://github.com/14790897/moyu-reader/releases/download/_gh-imgup/81ad7327902bed3b.png)

**伪装成代码**（Ctrl+Alt+D，小说嵌入 Python 模板）

![](https://github.com/14790897/moyu-reader/releases/download/_gh-imgup/935480530ed14bc3.png)

**阅读舒适排版**（默认字号 20 / 行距 2.2，对话加粗样式，全部可配置）

![](https://github.com/14790897/moyu-reader/releases/download/_gh-imgup/6f56fd667c884c63.png)

**紧急还原**（Ctrl+Alt+X，原文逐字节恢复 + 切回 Plain Text）

![](https://github.com/14790897/moyu-reader/releases/download/_gh-imgup/a7f4727cb84b9f43.png)

## 安装

### 方式一：扩展商店

VS Code 扩展面板（Ctrl+Shift+X）搜索「TXT 阅读器」或「moyu」即可安装。

### 方式二：开发调试

1. 用 VS Code 打开本文件夹（`moyu-reader`）
2. 按 `F5`，会弹出一个新的 VS Code 窗口（扩展开发宿主）
3. 在新窗口里打开任意 `.txt` 文件即可看到效果

### 方式三：打包成 VSIX 安装

```bash
npm install -g @vscode/vsce
vsce package
```

然后在 VS Code 里：扩展面板 → `...` → 从 VSIX 安装，选择生成的 `.vsix` 文件。

## 使用

| 命令 | 快捷键 | 说明 |
| --- | --- | --- |
| 伪装成代码 | `Ctrl+Alt+D` | 将当前 txt 全文包进代码模板（Python/C++/JS 可选） |
| 还原原文 | - | 从备份完整恢复原文并保存 |
| 紧急还原 | `Ctrl+Alt+X` | 还原原文 + 切回纯文本显示 |
| 切换 代码样式/纯文本 | - | 只切换高亮样式，**不改动文件内容** |
| 切换对话引号样式 | `Ctrl+Alt+S` | 下拉选择 橙红色/加粗/纯文本，选完立即生效 |
| 循环配色对话 | - | 每段对话轮换不同颜色（无需 AI，命令面板输入 Cycle） |
| AI 识别说话人 | - | Claude 分析每句话是谁说的，按人固定配色并缓存（命令面板输入 Analyze） |
| 启用 Moyu Dark 主题 | - | 应用 Moyu Dark 主题 |

状态栏右侧有 `👁 伪装中` 指示器，点击即触发紧急还原。右键菜单里也有全部命令。

伪装效果大概是这样的：

```python
# -*- coding: utf-8 -*-
# 数据清洗与文本分析脚本  v2.3.1

import re
import json
from collections import defaultdict

CONFIG = {"mode": "offline", "batch_size": 256, "verbose": True}


class TextProcessor:
    """文本预处理与特征提取模块"""

    def __init__(self, config=None):
        self.config = config or CONFIG
        self.cache = defaultdict(list)

    @staticmethod
    def _load_data(raw):
        payload = """
第一章 风起

　　天刚蒙蒙亮，李四就醒了。他推开窗，外面的世界一片安静。
　　“今天也要好好读书。”他对自己说。
"""
        return payload.strip()
```

## 安全机制

- 伪装前自动把原文备份到 **VS Code 扩展私有目录**（`globalStorage`），工作目录不留任何痕迹
- 还原 = 用备份完整覆盖 + 自动保存，逐字节恢复原文
- 伪装只是编辑器内的一次编辑操作，`Ctrl+Z` 也能随时撤销

## 自定义

- `moyu.template` 设置项：切换 `python` / `cpp` / `js` 三种伪装模板
- 想加自己的模板：改 `templates.js` 里的 `TEMPLATES`
- 想改高亮颜色：改 `themes/moyu-dark.json` 里的 `tokenColors`

## 设置（配置项）

打开 `文件 → 首选项 → 设置`，搜索 `moyu` 即可看到全部配置项：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `moyu.reading.enabled` | `true` | 是否自动为「TXT 阅读」应用舒适阅读排版（只影响 .txt） |
| `moyu.reading.fontSize` | `20` | 阅读字号（普通代码约 13） |
| `moyu.reading.lineHeight` | `2.2` | 行距倍率（普通代码约 1.4 的密集行距） |
| `moyu.reading.fontFamily` | `""` | 阅读字体，留空跟随全局字体 |
| `moyu.highlight.dialogueStyle` | `string` | 对话引号样式：`string` 字符串色 / `bold` 加粗（与正文同色）/ `plain` 纯文本 |
| `moyu.dialogue.speakerColors` | `off` | 按说话人配色：`off` 关闭 / `cycle` 循环配色 / `ai` AI 识别后按人配色（自动应用缓存结果） |
| `moyu.dialogue.ai.provider` | `anthropic` | 接口格式：`anthropic`（默认 Claude）/ `openai`（OpenAI 兼容，支持 DeepSeek、Kimi、通义、各类中转） |
| `moyu.dialogue.ai.model` | `claude-opus-5` | AI 识别说话人使用的模型（OpenAI 模式留空默认 `gpt-4o-mini`） |
| `moyu.dialogue.ai.apiKey` | `""` | API Key（留空读取环境变量 ANTHROPIC_API_KEY / OPENAI_API_KEY） |
| `moyu.dialogue.ai.baseUrl` | `""` | API 地址（留空用官方，可填代理/中继地址） |
| `moyu.template` | `python` | 伪装模板：`python` / `cpp` / `js` |

修改后立即生效（插件会实时同步到 `[moyu-txt]` 语言级设置，**不会**影响其他语言文件）。也可以手动执行命令「应用阅读设置」。

> 💡 紧急还原 `Ctrl+Alt+X` 会把语言切回纯文本，阅读排版随之消失、变回普通密集的代码样式——从字号到行距都看不出异常。

## E2E 测试

仓库内 `e2e/` 目录包含完整的 Playwright E2E 测试（真实 VS Code + CDP 驱动）：

```bash
cd e2e
npm install   # 已安装过可跳过
npx playwright test --project=vscode --reporter=list
```

覆盖九条用例：txt 自动启用代码样式语言并分词高亮、阅读配置自动应用、对话引号样式、可视化切换、循环配色、AI 识别说话人（Anthropic + OpenAI 兼容两种接口，mock 服务端到端验证）、伪装成代码、紧急还原。测试自动使用临时 user-data-dir 和空 extensions-dir 隔离环境，结束后按命令行标记精确清理 VS Code 实例。`test-grammar.js` 是语法高亮的单元级回归测试，改 grammar 后先跑它。

> ⚠️ 如果 VS Code 有排队中的自动更新，更新安装器会占住 `vscode-updating` 互斥量，导致开发宿主无法启动（报 "Code is currently being updated"）。可以先跑 `e2e/clear-pending-update.ps1` 把排队中的更新包移出安装目录再测。

## 发版流程（自动发布）

1. 改代码，把 `package.json` 的 `version` 改成新版本号（如 `0.6.0`），提交推送
2. 打 tag 并推送：`git tag v0.6.0 && git push origin v0.6.0`
3. GitHub Actions 自动完成：版本校验 → 打包验证 → 发布 VS Code 市场 → 创建 GitHub Release（附 VSIX）
4. 也可在 Actions → Publish Extension 手动触发

## FAQ

- **伪装后保存了，还能还原吗？** 能。备份在扩展私有目录里，只要不重装插件就能还原。
- **模板里原文会被改动吗？** 不会。原文原样嵌入模板，还原按备份恢复。
- **一些极端情况**：原文里出现 Python 的 `"""`、C++ 的 `)"`、JS 的反引号时，模板结构可能被破坏（视觉上）。换一种模板即可。
- **之前已经打开过的 txt 没变色？** 关闭重新打开，或用「切换 代码样式/纯文本」命令切一下。
- **快捷键冲突？** 在 VS Code 键盘快捷方式里搜索 `moyu` 自行修改。
