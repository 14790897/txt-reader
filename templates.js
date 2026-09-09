"use strict";

// 伪装模板：把原文包进一段看起来正经的代码里。
// {content} 会被原文替换；模板本身不修改原文任何字符，还原时按备份完整恢复。

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureTrailingNewline(s) {
  return s.endsWith("\n") ? s : s + "\n";
}

const TEMPLATES = {
  python: (content) => `# -*- coding: utf-8 -*-
# 数据清洗与文本分析脚本  v2.3.1
# 更新日期: ${today()}
# 依赖: python3.10+ / re / json / collections

import re
import json
import hashlib
from collections import defaultdict

CONFIG = {"mode": "offline", "batch_size": 256, "verbose": True, "worker": 4}


class TextProcessor:
    """文本预处理与特征提取模块"""

    def __init__(self, config=None):
        self.config = config or CONFIG
        self.cache = defaultdict(list)
        self._init_pipeline()

    def _init_pipeline(self):
        self.steps = [self._load_data, self._normalize, self._extract]

    @staticmethod
    def _load_data(raw):
        payload = """\n${ensureTrailingNewline(content)}"""
        return payload.strip()

    @staticmethod
    def _normalize(text):
        return re.sub(r"[ \\t]+", " ", text)

    def _extract(self, text):
        sentences = re.split(r"[。！？!?]", text)
        for s in sentences:
            self.cache["sent"].append(len(s))
        return self.cache

    def process(self, raw=""):
        data = self._load_data(raw)
        for step in self.steps:
            data = step(data)
        return data


if __name__ == "__main__":
    processor = TextProcessor()
    result = processor.process()
    print(json.dumps(result, ensure_ascii=False, indent=2))
`,

  cpp: (content) => `// main.cpp - 文本分析引擎
// 更新日期: ${today()}
// 编译: g++ -std=c++17 -O2 main.cpp -o analyzer

#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <sstream>
#include <algorithm>

using namespace std;

static const string RAW_TEXT = R"(
${ensureTrailingNewline(content)})";

vector<string> splitLines(const string& text) {
    vector<string> lines;
    stringstream ss(text);
    string line;
    while (getline(ss, line)) {
        if (!line.empty()) lines.push_back(line);
    }
    return lines;
}

struct Stats {
    size_t totalLines = 0;
    size_t totalChars = 0;
};

Stats analyze(const string& text) {
    Stats st;
    for (const auto& line : splitLines(text)) {
        st.totalLines++;
        st.totalChars += line.size();
    }
    return st;
}

int main() {
    Stats st = analyze(RAW_TEXT);
    cout << "lines: " << st.totalLines
         << ", chars: " << st.totalChars << endl;
    return 0;
}
`,

  js: (content) => `// index.js - 文本处理工具
// 更新日期: ${today()}
// 运行: node index.js

const fs = require("fs");
const path = require("path");

const RAW_TEXT = \`${ensureTrailingNewline(content)}\`;

const pipeline = [
  (t) => t.trim(),
  (t) => t.split(/\\r?\\n/).filter(Boolean),
  (lines) => lines.map((l) => l.trim()),
];

function process(raw = RAW_TEXT) {
  return pipeline.reduce((acc, fn) => fn(acc), raw);
}

function stats(lines) {
  return {
    lines: lines.length,
    chars: lines.reduce((n, l) => n + l.length, 0),
  };
}

if (require.main === module) {
  const lines = process();
  console.log(JSON.stringify(stats(lines), null, 2));
}

module.exports = { process, stats };
`,
};

function wrap(name, content) {
  const fn = TEMPLATES[name] || TEMPLATES.python;
  return fn(content);
}

module.exports = { wrap, TEMPLATES };
