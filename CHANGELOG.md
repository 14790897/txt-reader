# 更新日志

## [0.5.1] - 2026-09-12

- 新增 `moyu.dialogue.ai.provider`：`anthropic`（默认）与 `openai` 两种接口格式
- OpenAI 兼容模式走 `/v1/chat/completions`，支持 OpenAI、DeepSeek、Kimi、通义及各类中转代理；API Key 可读环境变量 `OPENAI_API_KEY`
- baseUrl 兼容带/不带版本号的写法（如 `https://api.openai.com/v1` 或 `https://api.deepseek.com`）
- E2E 新增 OpenAI 兼容接口用例（mock 双格式响应），9 条全绿

## [0.5.0] - 2026-09-12

- 新增「循环配色对话」：每段对话轮换不同颜色（无需 AI）
- 新增「AI 识别说话人」：Claude 分析每句话是谁说的，按人固定配色；结果缓存到扩展私有目录，同文档自动生效
- 新设置：`moyu.dialogue.speakerColors`（off/cycle/ai）、`moyu.dialogue.ai.model`（默认 claude-opus-5）、`apiKey`、`baseUrl`
- 说话人配色与对话样式（加粗/字符串色）可叠加
- E2E 新增两条用例（mock Claude API 端到端验证），8 条全绿

## [0.4.0] - 2026-09-10

- 新增「摸鱼: 切换对话引号样式」命令（快捷键 Ctrl+Alt+S / 命令面板输入 Dialogue / 右键菜单）
- 下拉选择器可视化切换：橙红色 / 加粗（与正文同色）/ 纯文本，选完立即生效
- 对话字符串色按明暗主题自适应（暗色 #CE9178，亮色 #A31515）
- E2E 新增可视化切换用例（命令面板 → 下拉选择 → 渲染断言），6 条全绿

## [0.3.1] - 2026-09-10

- 对话字符串色按明暗主题自适应（暗色 #CE9178，亮色 #A31515），主题切换时自动重应用

## [0.3.0] - 2026-09-10

- 新增 `moyu.highlight.dialogueStyle` 配置项：对话引号（“”「」）样式可选 `string`（默认字符串色）/ `bold`（加粗、与正文同色，不刺眼）/ `plain`（纯文本）
- 对话样式改用 Decoration API 实时渲染，改设置立即生效，不再写入用户设置
- E2E 新增对话样式用例（5 条全绿）：加粗生效且颜色与正文一致

## [0.2.0] - 2026-09-10

- 新增阅读舒适排版：txt 自动应用大字号 + 宽行距（默认 20 / 2.2）
- 新增配置项：`moyu.reading.enabled` / `fontSize` / `lineHeight` / `fontFamily`，实时同步到 `[moyu-txt]` 语言级设置，不影响其他语言
- 新增命令「摸鱼: 应用阅读设置」
- 老板键还原后阅读排版随语言切回普通密集样式
- E2E 新增阅读设置用例（4 条全绿），并记录 VS Code 更新互斥量干扰的规避脚本

## [0.1.0] - 2026-09-09

- 初始版本
- .txt 代码样式语法高亮（章节标题 / 标点 / 数字 / 英文 / 中文引号对话）
- 代码模板伪装：Python / C++ / Node.js 三种模板，伪装前自动备份
- 老板键 Ctrl+Alt+X 紧急还原（还原 + 保存 + 切纯文本）
- 大纲伪装：章节以函数符号显示在侧边栏
- 附赠 Moyu Dark 暗色主题
- 状态栏指示器
