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
  if (!multiline) s = s.replace(/[\r\n]+/g, ' ');
  s = s.replace(/\r\n/g, '\n');
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
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
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

module.exports = { cleanText, escapeHtml, makeTitle, sanitizeFilename, getExtension };
