/**
 * "발생 현상" 등 제한적 리치 텍스트(굵게/줄바꿈/이미지)의 프론트 sanitizer + contenteditable 에디터.
 * 서버(backend/app/utils/text.js sanitizeRichText)와 동일한 허용목록을 따르며, innerHTML을 쓰는 유일한 통로다.
 * 붙여넣기(Ctrl+V)로 들어온 이미지는 본문에 임시 미리보기로 표시하고, 실제 업로드는 폼 제출 시점에 일괄 처리한다.
 */
import { h } from './ui.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SAFE_IMG_SRC_RE = /^\/api\/issues\/(DEF|IMP|INQ)-\d{4,}\/attachments\/ATT-\d{3,}$/;
// 등록 폼에서 아직 서버에 없는 이미지의 임시 미리보기(blob: URL)도 화면 표시용으로만 허용한다.
// 저장 시점에는 이 blob: img가 실제 첨부 업로드 후 SAFE_IMG_SRC_RE 형태로 반드시 치환되어야 한다(치환 전 저장 금지).
const PREVIEW_IMG_SRC_RE = /^blob:/;

/** 서버 sanitizeRichText와 동일한 허용목록(b/strong/br/img). previewMode면 blob: img도 통과시킨다(제출 전 화면 표시용). */
export function sanitizeRichText(html, { allowPreviewImages = false } = {}) {
  if (!html) return '';
  const s = String(html);
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
      out += '<br>';
    } else if (tag === 'b' || tag === 'strong') {
      out += isClose ? `</${tag}>` : `<${tag}>`;
    } else if (tag === 'div' && isClose) {
      out += '<br>'; // contenteditable이 줄바꿈을 <div>로 감싸는 브라우저 대응(닫는 div만 br로 치환, 여는 div는 무시)
    } else if (tag === 'img' && !isClose) {
      const srcMatch = /\bsrc\s*=\s*"([^"]*)"|\bsrc\s*=\s*'([^']*)'/i.exec(attrsRaw);
      const src = srcMatch ? srcMatch[1] || srcMatch[2] : '';
      const dataId = /\bdata-pending-id\s*=\s*"([^"]*)"|\bdata-pending-id\s*=\s*'([^']*)'/i.exec(attrsRaw);
      const pendingId = dataId ? dataId[1] || dataId[2] : '';
      if (SAFE_IMG_SRC_RE.test(src)) out += `<img src="${escapeHtml(src)}" alt="첨부 이미지">`;
      else if (allowPreviewImages && PREVIEW_IMG_SRC_RE.test(src) && pendingId) out += `<img src="${escapeHtml(src)}" data-pending-id="${escapeHtml(pendingId)}" alt="첨부 이미지(업로드 대기)">`;
    }
  }
  out += escapeHtml(s.slice(last));
  return out;
}

/** sanitize된 HTML을 안전하게 렌더링한다(innerHTML을 쓰는 유일한 통로). 반드시 sanitizeRichText를 거친 값만 넣는다. */
export function renderRichText(sanitizedHtml, tag = 'div', cls = '') {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.innerHTML = sanitizedHtml || ''; // sanitizeRichText가 이미 허용목록만 통과시켰으므로 안전
  return el;
}

/**
 * 리치 에디터 도입 전에 저장된 순수 텍스트 symptom과, 이후 저장된 HTML symptom을 모두 같은 규칙으로 HTML화한다.
 * 태그가 전혀 없는 값(과거 데이터)은 줄바꿈만 <br>로 살려서 하위 호환하고, 있는 값은 sanitize해서 그대로 쓴다.
 */
export function toDisplayHtml(raw) {
  const value = String(raw || '');
  if (!/<[a-zA-Z]/.test(value)) return escapeHtml(value).replace(/\n/g, '<br>');
  return sanitizeRichText(value);
}

export function renderIssueBodyText(raw, tag = 'div', cls = 'body') {
  return renderRichText(toDisplayHtml(raw), tag, cls);
}

let pendingSeq = 0;

/**
 * contenteditable 기반 리치 텍스트 에디터. 이미지 붙여넣기 시 즉시 미리보기(blob:)를 삽입하고,
 * onImagePending 콜백으로 { pendingId, file }을 전달한다(호출부가 files 배열에 보관했다가 제출 시 업로드).
 * getValue()는 항상 sanitize된 HTML을 반환한다.
 */
export function createRichTextEditor({ id, placeholder = '', initialHtml = '', onImagePending } = {}) {
  const editor = h('div', {
    id,
    class: 'rte-editor input',
    contentEditable: 'true',
    'data-placeholder': placeholder,
    role: 'textbox',
    'aria-multiline': 'true',
  });
  if (initialHtml) editor.innerHTML = sanitizeRichText(initialHtml, { allowPreviewImages: true });

  editor.addEventListener('paste', (e) => {
    const items = [...(e.clipboardData?.items || [])];
    const imageItem = items.find((it) => it.type && it.type.startsWith('image/'));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;
      const pendingId = `pending-${Date.now()}-${pendingSeq++}`;
      const blobUrl = URL.createObjectURL(file);
      insertImageAtCursor(editor, blobUrl, pendingId);
      if (onImagePending) onImagePending({ pendingId, file, blobUrl });
      return;
    }
    // 이미지가 아니면 일반 텍스트로만 붙여넣는다(서식/스크립트 붙여넣기 방지).
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  });

  // 굵게(Ctrl/Cmd+B)만 허용. 그 외 서식 단축키는 브라우저 기본 동작을 막지 않되 sanitize 단계에서 어차피 걸러진다.
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      document.execCommand('bold');
    }
  });

  function getValue() {
    return sanitizeRichText(editor.innerHTML, { allowPreviewImages: true });
  }
  function setValue(html) {
    editor.innerHTML = sanitizeRichText(html, { allowPreviewImages: true });
  }
  /** 제출 시점: pendingId → 실제 첨부 URL로 치환하고 blob: img를 최종 형태로 되돌린다. */
  function resolvePendingImages(idToUrl) {
    const imgs = [...editor.querySelectorAll('img[data-pending-id]')];
    for (const img of imgs) {
      const id = img.getAttribute('data-pending-id');
      const url = idToUrl.get(id);
      if (url) {
        img.src = url;
        img.removeAttribute('data-pending-id');
      }
    }
  }
  function hasPendingImages() {
    return editor.querySelectorAll('img[data-pending-id]').length > 0;
  }
  function isEmpty() {
    if (editor.querySelector('img')) return false;
    return !editor.textContent.trim();
  }

  editor.rte = { getValue, setValue, resolvePendingImages, hasPendingImages, isEmpty };
  return editor;
}

function insertImageAtCursor(editor, src, pendingId) {
  editor.focus();
  const sel = window.getSelection();
  const img = document.createElement('img');
  img.src = src;
  img.setAttribute('data-pending-id', pendingId);
  img.alt = '첨부 이미지(업로드 대기)';
  if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(img);
    range.setStartAfter(img);
    range.setEndAfter(img);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    editor.appendChild(img);
  }
}
