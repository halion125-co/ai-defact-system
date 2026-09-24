/**
 * DOM 헬퍼 / 공통 UI Component. 모든 사용자 콘텐츠는 textContent로 삽입(XSS 방지).
 */
import { store } from './store.js';
import { ApiError } from './api.js';

/** 문자열 끝 글자의 한글 받침 유무. "Priority(심각도)"처럼 괄호 부연설명이 붙은 라벨은 괄호 안 마지막 글자로 판단한다.
 * 한글 완성형(가~힣) 외 문자는 받침 있음으로 간주. */
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
/** 명사 뒤에 붙는 조사를 받침 유무에 맞춰 고른다. josa('결함', '이/가') → '결함이', josa('문의', '이/가') → '문의가'. */
export function josa(word, pair) {
  const [withFinal, withoutFinal] = pair.split('/');
  return `${word}${hasFinalConsonant(word) ? withFinal : withoutFinal}`;
}

/* ---------- h() ---------- */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v; // 내부 정적 마크업 전용. 사용자 콘텐츠 금지.
      else if (k in el && typeof v !== 'string' && k !== 'value') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

/* ---------- Labels ---------- */
export const STATUS_LABEL = { OPEN: 'Open', IN_PROGRESS: 'In Progress', DONE: 'Done', CLOSED: 'Closed', CANCEL: 'Cancel' };
export const STATUS_KO = { OPEN: '접수', IN_PROGRESS: '조치중', DONE: '확인대기', CLOSED: '완료', CANCEL: '취소' };
export const TYPE_LABEL = { DEFECT: '결함', IMPROVEMENT: '개선요청', INQUIRY: '문의' };
export const TYPE_ICON = { DEFECT: '🐞', IMPROVEMENT: '💡', INQUIRY: '❓' };
export const CLOSE_LABEL = { VERIFIED: '정상 확인', AGREED: '합의 종료' };
export const EVENT_LABEL = {
  CREATED: 'Issue 등록',
  UPDATED: '등록내용 수정',
  COMMENTED: 'Comment',
  COMMENT_HIDDEN: 'Comment 숨김',
  ASSIGNED: '조치자 변경',
  PRIORITY_CHANGED: 'Priority 변경',
  STATUS_CHANGED: '상태 변경',
  RESOLVED: '조치 완료',
  DEPLOYED: '배포 완료',
  REOPENED: '재조치 요청 (Re-open)',
  CANCELLED: 'Cancel',
  CLOSED: 'Close',
  ADMIN_STATUS_OVERRIDE: '관리자 상태 강제 변경',
  ATTACHMENT_ADDED: '첨부 추가',
  ATTACHMENT_DELETED: '첨부 삭제',
};

/* ---------- Badges ---------- */
export const statusBadge = (s, lg) =>
  h('span', { class: `badge status-${s}${lg ? ' badge-lg' : ''}` }, STATUS_KO[s] || s, h('span', { class: 'badge-en' }, STATUS_LABEL[s] || ''));
export const priorityBadge = (p, lg) => h('span', { class: `badge prio-${p || 'UNASSIGNED'}${lg ? ' badge-lg' : ''}` }, store.priorityName(p));
export const typeBadge = (t, lg) => h('span', { class: `badge type-${t}${lg ? ' badge-lg' : ''}` }, `${TYPE_ICON[t] || ''} ${TYPE_LABEL[t] || t}`);
export const deployBadge = (d) => h('span', { class: `badge deploy-${d}` }, d === 'DEPLOYED' ? '배포완료' : '미배포');

/* ---------- Format ----------
 * 저장된 시각은 두 표기가 섞여 있을 수 있다: 서버 자체 기록(nowIso)은 "+09:00" 오프셋이 붙은
 * KST 문자열, 사용자가 <input type="datetime-local">로 입력한 값은 프론트에서 UTC("...Z")로
 * 변환해 전달한다. 문자열을 그대로 슬라이스하면 후자는 KST가 아닌 UTC 시각이 노출되므로,
 * 항상 Date로 파싱한 뒤 Asia/Seoul 기준으로 다시 포맷한다.
 */
const KST_TZ = 'Asia/Seoul';
const dtFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KST_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function kstParts(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const out = {};
  for (const p of dtFormatter.formatToParts(d)) if (p.type !== 'literal') out[p.type] = p.value;
  return out;
}
export function fmtDate(iso) {
  const p = iso && kstParts(iso);
  return p ? `${p.year}-${p.month}-${p.day}` : '-';
}
export function fmtDateTime(iso) {
  const p = iso && kstParts(iso);
  return p ? `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` : '-';
}
export function fmtTime(iso) {
  const p = iso && kstParts(iso);
  return p ? `${p.hour}:${p.minute}` : '';
}
export function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export function userLabel(snap) {
  if (!snap) return '미지정';
  const name = snap.nameSnapshot || snap.name || '';
  const team = snap.teamSnapshot || snap.team || '';
  return team ? `${name} (${team})` : name;
}
export function initials(name) {
  return (name || '?').slice(0, 1);
}
export function localDateTimeValue(iso) {
  const s = iso ? String(iso) : new Date().toISOString();
  const d = iso ? s : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString();
  return d.slice(0, 16);
}

/* ---------- Toast ---------- */
export function toast(message, type = 'info', { action, timeout = 4000 } = {}) {
  const root = document.getElementById('toast-root');
  const el = h('div', { class: `toast ${type}`, role: 'status' }, h('span', { class: 'grow' }, message));
  if (action) el.append(h('button', { class: 'btn', onClick: () => { action.onClick(); el.remove(); } }, action.label));
  root.append(el);
  setTimeout(() => el.remove(), timeout);
  return el;
}

/* ---------- Modal ---------- */
export function openModal({ title, body, actions = [], wide = false, onClose } = {}) {
  const root = document.getElementById('modal-root');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const foot = h('div', { class: 'modal-foot' });
  for (const a of actions) {
    const btn = h('button', { class: `btn ${a.variant || 'btn-secondary'}`, type: a.type || 'button' }, a.label);
    btn.addEventListener('click', () => a.onClick && a.onClick(close, btn));
    foot.append(btn);
  }
  const modal = h(
    'div',
    { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'close-x', 'aria-label': '닫기', onClick: close }, '×')),
    h('div', { class: 'modal-body' }, body),
    actions.length ? foot : null
  );
  const backdrop = h('div', { class: 'modal-backdrop', onClick: (e) => e.target === backdrop && close() }, modal);
  root.append(backdrop);
  document.addEventListener('keydown', onKey);
  setTimeout(() => {
    const first = modal.querySelector('input, textarea, select, button.btn-primary');
    if (first) first.focus();
  }, 0);
  return close;
}

/**
 * 입력 Modal. fields: [{name,label,type,required,placeholder,help,options,value,rows}]
 * onSubmit(values) → Promise. 실패 시 입력값 유지 + 오류 표시.
 */
export function formModal({ title, description, fields = [], submitLabel = '저장', submitVariant = 'btn-primary', cancelLabel = '취소', onSubmit, wide = false, extra }) {
  const inputs = {};
  const errBox = h('div', { class: 'form-error hidden' });
  const form = h('form', { class: 'modal-form', novalidate: true });
  if (description) form.append(h('p', { class: 'desc' }, description));
  form.append(errBox);
  if (extra) form.append(extra);
  const fieldEls = {};
  for (const f of fields) {
    let input;
    if (f.type === 'textarea') input = h('textarea', { class: 'input', name: f.name, placeholder: f.placeholder || '', rows: f.rows || 4 });
    else if (f.type === 'select') {
      input = h('select', { class: 'input', name: f.name });
      // 기본 선택값을 명시하지 않은 필수 select는 브라우저가 첫 옵션을 자동 선택하므로,
      // 사용자가 실제로 고르기 전까지는 빈 placeholder 옵션을 기본값으로 둔다.
      if (f.required && (f.value === undefined || f.value === null)) input.append(h('option', { value: '' }, f.placeholder || '선택하세요'));
      for (const o of f.options || []) input.append(h('option', { value: o.value }, o.label));
    } else input = h('input', { class: 'input', name: f.name, type: f.type || 'text', placeholder: f.placeholder || '' });
    if (f.value !== undefined && f.value !== null) input.value = f.value;
    inputs[f.name] = input;
    const wrap = h(
      'div',
      { class: 'field' },
      h('label', { for: `f-${f.name}` }, f.label, f.required ? h('span', { class: 'req' }, '*') : null),
      input,
      f.help ? h('div', { class: 'help' }, f.help) : null,
      h('div', { class: 'error-msg hidden' })
    );
    input.id = `f-${f.name}`;
    fieldEls[f.name] = wrap;
    form.append(wrap);
  }
  const showFieldError = (name, msg) => {
    const w = fieldEls[name];
    if (!w) return false;
    w.classList.add('has-error');
    const m = w.querySelector('.error-msg');
    m.textContent = msg;
    m.classList.remove('hidden');
    return true;
  };
  const clearErrors = () => {
    errBox.classList.add('hidden');
    for (const w of Object.values(fieldEls)) {
      w.classList.remove('has-error');
      w.querySelector('.error-msg').classList.add('hidden');
    }
  };
  let submitBtn;
  const doSubmit = async (close) => {
    clearErrors();
    const values = {};
    for (const f of fields) values[f.name] = inputs[f.name].value.trim();
    let bad = false;
    for (const f of fields) {
      if (f.required && !values[f.name]) {
        showFieldError(f.name, `${josa(f.label, '을/를')} 입력해주세요.`);
        bad = true;
      }
    }
    if (bad) return;
    setBusy(submitBtn, true, submitLabel);
    try {
      await onSubmit(values, { close, showFieldError });
      close();
    } catch (err) {
      const msg = errorMessage(err);
      if (err instanceof ApiError && err.details && err.details.field && showFieldError(err.details.field, msg)) {
        /* field level */
      } else {
        errBox.textContent = msg;
        errBox.classList.remove('hidden');
      }
    } finally {
      setBusy(submitBtn, false, submitLabel);
    }
  };
  const close = openModal({
    title,
    body: form,
    wide,
    actions: [
      { label: cancelLabel, variant: 'btn-secondary', onClick: (c) => c() },
      { label: submitLabel, variant: submitVariant, onClick: (c, btn) => { submitBtn = btn; doSubmit(c); } },
    ],
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitBtn = document.querySelector('.modal-foot .btn-primary, .modal-foot .btn-danger, .modal-foot .btn-warning, .modal-foot .btn-success');
    doSubmit(close);
  });
  return { close, inputs };
}

export function confirmModal({ title, message, confirmLabel = '확인', variant = 'btn-primary' }) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: h('p', { class: 'desc' }, message),
      onClose: () => resolve(false),
      actions: [
        { label: '취소', onClick: (c) => c() },
        { label: confirmLabel, variant, onClick: (c) => { resolve(true); c(); } },
      ],
    });
  });
}

/* ---------- Busy / Error ---------- */
export function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) {
    btn.dataset.label = label || btn.textContent;
    clear(btn).append(h('span', { class: 'spinner' }), ' 저장 중…');
  } else {
    btn.textContent = btn.dataset.label || label || btn.textContent;
  }
}

export function errorMessage(err) {
  if (err instanceof ApiError) return err.message;
  return (err && err.message) || '오류가 발생했습니다.';
}

export function errorBox(err, onRetry) {
  return h(
    'div',
    { class: 'error-box' },
    h('span', {}, errorMessage(err)),
    onRetry ? h('button', { class: 'btn btn-secondary btn-sm', onClick: onRetry }, '다시 시도') : null
  );
}

export function conflictBox(onReload) {
  return h(
    'div',
    { class: 'conflict-box' },
    h('span', {}, '다른 사용자가 이 Issue를 먼저 수정했습니다. 최신 내용을 불러온 후 다시 시도해주세요.'),
    h('button', { class: 'btn btn-secondary btn-sm', onClick: onReload }, '최신 내용 불러오기')
  );
}

export function emptyState(title, desc, action) {
  return h('div', { class: 'empty' }, h('strong', {}, title), desc ? h('div', {}, desc) : null, action || null);
}

export function loadingState(lines = 4) {
  const el = h('div', { class: 'loading-skel', style: { padding: '12px 0' } });
  for (let i = 0; i < lines; i++) el.append(h('div', { class: 'skeleton', style: { width: `${90 - i * 12}%` } }));
  return el;
}

export function forbiddenState(message = '권한이 없습니다.') {
  return h('div', { class: 'forbidden' }, h('h2', {}, '접근할 수 없습니다'), h('p', { class: 'muted' }, message));
}

export function pageHead(title, desc, actions) {
  return h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), desc ? h('p', {}, desc) : null), actions ? h('div', { class: 'page-actions' }, actions) : null);
}

export function card(title, body, { headRight, cls } = {}) {
  return h('section', { class: `card${cls ? ` ${cls}` : ''}` }, title ? h('div', { class: 'card-head' }, h('h3', {}, title), headRight || null) : null, h('div', { class: 'card-body' }, body));
}

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } finally {
    ta.remove();
  }
  return Promise.resolve();
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
