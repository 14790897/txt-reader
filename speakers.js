"use strict";

// 对话说话人分析: 引号提取 / 提示词构建 / Claude 调用 / 结果解析 / 缓存

const crypto = require("crypto");
const AnthropicModule = require("@anthropic-ai/sdk");
const Anthropic = AnthropicModule.default || AnthropicModule;

const QUOTE_RE = /“([^”\n]{1,300}?)”|「([^」\n]{1,300}?)」/g;

/** 提取文档中的对话引号, 附带引号前的上下文(80字符)用于判断说话人 */
function extractQuotes(text) {
  const quotes = [];
  let m;
  while ((m = QUOTE_RE.exec(text)) !== null) {
    const inner = (m[1] || m[2] || "").trim();
    const ctxStart = Math.max(0, m.index - 80);
    const context = text
      .slice(ctxStart, m.index + m[0].length)
      .replace(/\s+/g, " ")
      .trim();
    quotes.push({ index: quotes.length, text: inner, context });
  }
  return quotes;
}

function buildPrompt(quotes) {
  const lines = quotes.map(
    (q) => `${q.index}. 对话: ${q.text}\n   上文: ${q.context}`
  );
  return [
    "你是中文小说对话分析助手。下面是按顺序提取的对话及其上下文。",
    "请判断每句对话是谁说的，用说话人的姓名或称呼表示（如“李四”“王五”）。",
    "同一个说话人在整个文档中必须使用完全相同的名字。",
    "如果上下文无法判断说话人，填“未知”。",
    "",
    ...lines,
  ].join("\n");
}

/** 解析模型返回的说话人 JSON, 兼容代码围栏与前后杂讯 */
function parseSpeakers(raw, quoteCount) {
  let text = String(raw || "");
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("模型返回中未找到 JSON");
  }
  const data = JSON.parse(text.slice(start, end + 1));
  const list = Array.isArray(data) ? data : data.speakers;
  if (!Array.isArray(list)) {
    throw new Error("返回缺少 speakers 数组");
  }
  const result = [];
  for (const item of list) {
    const i = Number(item && item.index);
    if (Number.isInteger(i) && i >= 0 && i < quoteCount) {
      result.push({ index: i, speaker: String(item.speaker || "未知") });
    }
  }
  return result;
}

/** 调用 Claude 分析说话人 (structured outputs 返回 JSON) */
async function analyzeSpeakers({ apiKey, baseUrl, model }, quotes) {
  const opts = { timeout: 120_000, maxRetries: 2 };
  if (apiKey) opts.apiKey = apiKey;
  if (baseUrl) opts.baseURL = baseUrl;
  const client = new Anthropic(opts);

  const response = await client.beta.messages.create({
    model: model || "claude-opus-5",
    max_tokens: 16000,
    // claude-opus-5 的服务端拒绝回退: 内容被安全策略拒绝时自动换模型重试
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            speakers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  index: { type: "integer" },
                  speaker: { type: "string" },
                },
                required: ["index", "speaker"],
                additionalProperties: false,
              },
            },
          },
          required: ["speakers"],
          additionalProperties: false,
        },
      },
    },
    system: "你只输出符合 schema 的 JSON，不输出任何其他内容。",
    messages: [{ role: "user", content: buildPrompt(quotes) }],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseSpeakers(raw, quotes.length);
}

/**
 * 调用 OpenAI 兼容接口(/v1/chat/completions)分析说话人。
 * 适用于 OpenAI、DeepSeek、Kimi、通义、各类中转代理等 OpenAI 格式端点。
 */
async function analyzeSpeakersOpenAI({ apiKey, baseUrl, model }, quotes) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "未提供 API Key（设置 txtreader.dialogue.ai.apiKey 或环境变量 OPENAI_API_KEY）"
    );
  }
  let endpoint;
  if (baseUrl) {
    endpoint = baseUrl.replace(/\/+$/, "");
    // 兼容两种写法: 带版本号的 base(https://api.openai.com/v1) 与不带版本号的
    // (https://api.deepseek.com), 都拼到 /v1/chat/completions
    endpoint = /\/v\d+$/.test(endpoint)
      ? `${endpoint}/chat/completions`
      : `${endpoint}/v1/chat/completions`;
  } else {
    endpoint = "https://api.openai.com/v1/chat/completions";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            '你只输出 JSON，格式 {"speakers":[{"index":0,"speaker":"名字"}]}，不输出任何其他内容。',
        },
        { role: "user", content: buildPrompt(quotes) },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const snippet = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`OpenAI 接口返回 ${response.status}: ${snippet}`);
  }
  const data = await response.json();
  const content =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;
  if (!content) {
    throw new Error("OpenAI 接口返回缺少 choices[0].message.content");
  }
  return parseSpeakers(content, quotes.length);
}

/** 缓存键: 由引号文本+上下文构成, 内容变化即失效 */
function cacheKeyFor(quotes) {
  const payload = quotes.map((q) => `${q.text}${q.context}`).join("");
  return crypto.createHash("sha1").update(payload).digest("hex").slice(0, 16);
}

module.exports = {
  extractQuotes,
  buildPrompt,
  parseSpeakers,
  analyzeSpeakers,
  analyzeSpeakersOpenAI,
  cacheKeyFor,
};
