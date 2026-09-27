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

/**
 * 발생 현상 등 "제한적 리치 텍스트" 필드 전용 HTML sanitizer.
 * 허용 태그: b, strong, br, img(src만, 이 서비스의 첨부 다운로드 경로만 허용). 그 외 모든 태그/속성/스크립트는 제거한다.
 * DOMPurify 등 외부 라이브러리를 쓰지 않는 폐쇄망 정책상 정규식 기반으로 직접 구현했으므로,
 * 매우 좁은 허용목록(allowlist)만 통과시키고 나머지는 전부 텍스트로 escape하는 보수적인 방식을 취한다.
 */
const SAFE_IMG_SRC_RE = /^\/api\/issues\/(DEF|IMP|INQ)-\d{4,}\/attachments\/ATT-\d{3,}$/;

function sanitizeRichText(html) {
  if (!html) return '';
  // NUL 및 제어문자 제거(개행/탭 허용). 태그 파싱 전에 적용해도 태그 구분자(<, >, ")는 제어문자가 아니라 구조에 영향 없다.
  const s = String(html).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  // 태그와 텍스트를 순서대로 스캔한다. 태그가 아닌 구간은 전부 escape(스크립트/속성 주입 불가).
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = tagRe.exec(s))) {
    out += escapeHtml(s.slice(last, m.index));
    last = tagRe.lastIndex;
    const isClose = m[0].startsWith('</');
    const tag = m[1].toLowerCase();
    const attrsRaw = m[2] || '';
    if (tag === 'br' && !isClose) {
      // b/strong은 속성 유무와 무관하게 태그만 통과시키고 속성은 항상 버린다.
      // (속성이 있을 때만 거부하면 여는 태그는 버려지고 짝이 되는 닫는 태그만 살아남아 </b> 같은 잔재가 남는 비대칭 문제가 생긴다.)
      out += '<br>';
    } else if (tag === 'b' || tag === 'strong') {
      out += isClose ? `</${tag}>` : `<${tag}>`;
    } else if (tag === 'img' && !isClose) {
      const srcMatch = /\bsrc\s*=\s*"([^"]*)"|\bsrc\s*=\s*'([^']*)'/i.exec(attrsRaw);
      const src = srcMatch ? srcMatch[1] || srcMatch[2] : '';
      if (SAFE_IMG_SRC_RE.test(src)) out += `<img src="${escapeHtml(src)}" alt="첨부 이미지">`;
      // src가 허용 패턴이 아니면 img 자체를 통째로 버린다(태그도 텍스트로도 남기지 않음).
    }
    // 허용목록 밖 태그(a, script, div, style 등)는 여닫는 태그 문자열 자체를 버린다(escape해서 노출하지 않음 — 불필요한 잡음 방지).
  }
  out += escapeHtml(s.slice(last));
  return out;
}

/**
 * 클라이언트가 태그 없는 순수 텍스트를 보낸 경우(외부 연동 API, 리치 에디터 도입 전 클라이언트 등) CRLF/CR을
 * LF로 정규화한 뒤 <br>로 변환해서 sanitizeRichText에 넘긴다(특수문자 escape는 sanitizeRichText가 담당하므로
 * 여기서는 하지 않는다 — 이중 escape 방지). 이미 태그가 있는 입력(에디터가 만든 HTML)은 그대로 위임한다.
 */
function normalizeRichTextInput(value) {
  let s = String(value ?? '');
  if (/<[a-zA-Z]/.test(s)) return s; // 이미 HTML로 보이는 입력은 그대로 sanitizer에 위임
  s = s.replace(/\r\n?/g, '\n');
  // 줄 끝 공백 제거, 3줄 이상 연속 빈 줄은 2줄로 축약(cleanText와 동일한 붙여넣기 정규화 규칙)
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.replace(/\n/g, '<br>');
}

/** sanitizeRichText 결과에서 실제로 남은 내용(텍스트 또는 이미지)이 있는지 판별한다. */
function richTextIsEmpty(sanitized) {
  const hasImage = /<img\b/i.test(sanitized || '');
  if (hasImage) return false;
  const textOnly = String(sanitized || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<\/?(b|strong)>/gi, '')
    .trim();
  return textOnly === '';
}

/** sanitizeRichText 결과를 makeTitle 등에 넘길 순수 텍스트로 변환한다(태그 제거, <br>→개행, HTML entity 복원). */
function richTextToPlainText(sanitized) {
  return String(sanitized || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(b|strong)>/gi, '')
    .replace(/<img\b[^>]*>/gi, '[이미지]')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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

module.exports = { cleanText, escapeHtml, sanitizeRichText, richTextIsEmpty, normalizeRichTextInput, richTextToPlainText, makeTitle, sanitizeFilename, getExtension, hasFinalConsonant, josa };
