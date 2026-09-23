#!/usr/bin/env node
'use strict';

/**
 * 폐쇄망 적합성 정적 검사: frontend/backend 소스에 외부 URL/CDN 참조가 없는지, 외부 npm 의존성이 없는지 확인.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const targets = ['frontend', 'backend/app', 'backend/server.js'];
const ALLOW = [/http:\/\/www\.w3\.org\/2000\/svg/, /http:\/\/localhost/, /http:\/\/internal-server/, /^\s*\*|\/\//];
const pattern = /https?:\/\/[^\s'"`)]+/g;
let bad = 0;

function scan(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const m = line.match(pattern);
    if (!m) return;
    for (const url of m) {
      if (ALLOW.some((re) => re.test(url)) || /^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      console.log(`외부 URL 발견: ${path.relative(ROOT, file)}:${i + 1} ${url}`);
      bad++;
    }
  });
}
function walk(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f));
  else if (/\.(js|html|css|json)$/.test(p)) scan(p);
}
for (const t of targets) walk(path.join(ROOT, t));

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});
if (deps.length) {
  console.log(`외부 npm 의존성 발견: ${deps.join(', ')}`);
  bad++;
}
if (fs.existsSync(path.join(ROOT, 'node_modules'))) console.log('참고: node_modules 존재(런타임에는 불필요)');

if (bad) {
  console.log(`\n검사 실패: ${bad}건`);
  process.exit(1);
}
console.log('폐쇄망 검사 통과: 외부 URL 0건, 외부 npm 의존성 0건');
