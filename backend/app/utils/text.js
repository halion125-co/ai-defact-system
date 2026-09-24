'use strict';

/**
 * 입력 텍스트 정규화. 렌더링 시 XSS 방지는 Frontend가 textContent로 처리하고,
 * 서버는 제어문자 제거/공백 trim/길이 제한을 담당한다.
 */
function cleanText(value, { multiline = false } = {}) {
  if (value === undefined || value === null) return '';
  let s = String(value);
  // NUL 및 제어문자 제거(개행/탭 허용)
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = s.replace(/\r\n?/g, '\n'); // CRLF / 단독 CR → LF
  if (!multiline) s = s.replace(/\n+/g, ' ');
  // 줄 끝 공백 제거, 3줄 이상 연속 빈 줄은 2줄로 축약(붙여넣기 시 과도한 여백 방지)
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 제목 자동 생성: 첫 줄, 최대 80자 */
function makeTitle(text, max = 80) {
  const first = cleanText(text, { multiline: true }).split('\n')[0].trim();
  const chars = Array.from(first); // 서로게이트 쌍(이모지) 보호
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : first;
}

/** 파일명 sanitize: path 제거, 위험 문자 제거 */
function sanitizeFilename(name) {
  const base = String(name || 'file')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  const cleaned = base.replace(/[^\w.\-ㄱ-힝 ()\[\]]/g, '_').replace(/^\.+/, '').slice(0, 120);
  return cleaned || 'file';
}

function getExtension(filename) {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

/** 문자열 끝 글자의 한글 받침 유무. "Priority(심각도)"처럼 괄호 부연설명이 붙은 라벨은 괄호 안 마지막 글자로 판단한다.
 * 한글 완성형(가~힣) 외 문자는 받침 있음으로 간주(숫자/영문 뒤에는 "을"/"이"가 자연스러움). */
function hasFinalConsonant(str) {
  const s = String(str || '').trim();
  if (!s) return true;
  const m = /\)\s*$/.test(s) && /\(([^()]*)\)\s*$/.exec(s);
  const target = m ? m[1] : s;
  if (!target) return true;
  const code = target.codePointAt(target.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return true;
}

/** 명사 뒤에 붙는 조사를 받침 유무에 맞춰 고른다. josa(단어, '을/를') → '을' 또는 '를'. */
function josa(word, pair) {
  const [withFinal, withoutFinal] = pair.split('/');
  return `${word}${hasFinalConsonant(word) ? withFinal : withoutFinal}`;
}

module.exports = { cleanText, escapeHtml, makeTitle, sanitizeFilename, getExtension, hasFinalConsonant, josa };
