// 用 vscode-textmate 单元测试 grammar, 精确定位数字分词失败原因
const fs = require('node:fs');
const path = require('node:path');
const vsctm = require('vscode-textmate');
const onig = require('vscode-oniguruma');

(async () => {
  const wasmPath = path.join(
    path.dirname(require.resolve('vscode-oniguruma')),
    'onig.wasm',
  );
  const wasmBin = fs.readFileSync(wasmPath).buffer;
  const onigLib = onig.loadWASM(wasmBin).then(() => ({
    createOnigScanner(patterns) {
      return new onig.OnigScanner(patterns);
    },
    createOnigString(s) {
      return new onig.OnigString(s);
    },
  }));

  const registry = new vsctm.Registry({
    onigLib,
    loadGrammar: async () =>
      JSON.parse(
        fs.readFileSync(
          path.resolve(__dirname, '..', 'syntaxes', 'txtreader.tmLanguage.json'),
          'utf8',
        ),
      ),
  });
  const grammar = await registry.loadGrammar('source.txtreader');

  const lines = [
    '他对自己说，2026年9月9日。',
    '　　天刚蒙蒙亮，李四就醒了。',
    '　　“今天也要好好读书。”他对自己说，2026年9月9日。',
    '第一章 风起',
    '# -*- coding: utf-8 -*-',
    'CONFIG = {"mode": "offline", "batch_size": 256}',
    'class TextProcessor:',
    'if __name__ == "__main__":',
    'https://example.com/novel 链接',
  ];

  for (const line of lines) {
    const { tokens } = grammar.tokenizeLine(line, vsctm.INITIAL);
    const out = tokens
      .map((t) => `${JSON.stringify(t.scopes[t.scopes.length - 1] || '(none)')}<${JSON.stringify(line.slice(t.startIndex, t.endIndex))}>`)
      .join(' ');
    console.log(out);
  }
})();
