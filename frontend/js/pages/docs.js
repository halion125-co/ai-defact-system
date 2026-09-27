import { h, loadingState, errorBox, icon, openModal } from '../ui.js';

const DOCS = {
  help: { title: '도움말', subtitle: '결함관리 프로세스와 사용자·조치자 가이드입니다.', file: '/docs/HELP_GUIDE.md' },
  developer: { title: '개발자 센터', subtitle: 'API 연동과 일반 서버 설치·운영을 위한 안내서입니다.', file: '/docs/DEVELOPER_CENTER.md' },
};

function inline(text) {
  const nodes = [];
  let rest = text;
  const pattern = /(!?\[([^\]]+)\]\(([^)]+)\))|(`([^`]+)`)|\*\*([^*]+)\*\*/;
  while (rest) {
    const m = pattern.exec(rest);
    if (!m) {
      nodes.push(rest);
      break;
    }
    if (m.index) nodes.push(rest.slice(0, m.index));
    if (m[1] && m[1].startsWith('!')) nodes.push(h('img', { class: 'doc-image', src: m[3].startsWith('/') ? m[3] : `/docs/${m[3]}`, alt: m[2] }));
    else if (m[1]) nodes.push(h('a', { href: m[3], target: m[3].startsWith('/docs/') ? '_self' : '_blank', rel: 'noreferrer' }, m[2]));
    else if (m[4]) nodes.push(h('code', { class: 'doc-inline-code' }, m[5]));
    else nodes.push(h('strong', {}, m[6]));
    rest = rest.slice(m.index + m[0].length);
  }
  return nodes;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (line.startsWith('```')) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i += 1;
      blocks.push(h('pre', { class: 'doc-code' }, h('code', {}, code.join('\n'))));
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push(h(`h${heading[1].length}`, { class: 'doc-heading' }, ...inline(heading[2])));
      i += 1;
      continue;
    }
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*:?-+:?\s*\|/.test(lines[i + 1])) {
      const rows = [];
      const parseRow = (row) => row.replace(/^\||\|$/g, '').split('|').map((v) => v.trim());
      rows.push(parseRow(line));
      i += 2;
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(parseRow(lines[i++]));
      blocks.push(
        h(
          'div',
          { class: 'doc-table-wrap' },
          h(
            'table',
            { class: 'doc-table' },
            h('thead', {}, h('tr', {}, ...rows[0].map((v) => h('th', {}, ...inline(v))))),
            h('tbody', {}, ...rows.slice(1).map((row) => h('tr', {}, ...row.map((v) => h('td', {}, ...inline(v))))))
          )
        )
      );
      continue;
    }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items = [];
      while (i < lines.length && (ordered ? /^\d+\.\s+/.test(lines[i]) : /^[-*]\s+/.test(lines[i]))) {
        items.push(h('li', {}, ...inline(lines[i].replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ''))));
        i += 1;
      }
      blocks.push(h(ordered ? 'ol' : 'ul', { class: 'doc-list' }, ...items));
      continue;
    }
    if (line.startsWith('> ')) {
      blocks.push(h('blockquote', { class: 'doc-quote' }, ...inline(line.slice(2))));
      i += 1;
      continue;
    }
    const paragraph = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s|^```|^\|/.test(lines[i]) && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i]) && !lines[i].startsWith('> ')) paragraph.push(lines[i++]);
    blocks.push(h('p', { class: 'doc-paragraph' }, ...inline(paragraph.join('\n'))));
  }
  return blocks;
}

async function loadDocBody(kind) {
  const doc = DOCS[kind];
  const body = h('article', { class: 'doc-content' }, loadingState(8));
  fetch(doc.file, { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then((text) => body.replaceChildren(...renderMarkdown(text)))
    .catch((err) => body.replaceChildren(errorBox(`문서를 불러오지 못했습니다. ${err.message}`)));
  return body;
}

/** 도움말/개발자 센터를 중앙 모달 팝업으로 연다(사이드바 GUIDES 메뉴에서 호출). */
export function openDocsModal(kind = 'help') {
  let currentKind = kind === 'developer' ? 'developer' : 'help';
  const bodyWrap = h('div', {});
  const tabs = h('div', { class: 'doc-tabs' });
  const renderTabs = () => {
    tabs.replaceChildren(
      h('button', { type: 'button', class: currentKind === 'help' ? 'active' : '', onClick: () => switchTo('help') }, icon('question', { size: 14 }), '도움말'),
      h('button', { type: 'button', class: currentKind === 'developer' ? 'active' : '', onClick: () => switchTo('developer') }, icon('code', { size: 14 }), '개발자 센터')
    );
  };
  async function switchTo(next) {
    currentKind = next;
    renderTabs();
    bodyWrap.replaceChildren(await loadDocBody(currentKind));
  }
  renderTabs();
  const modalBody = h('div', { class: 'doc-modal-body' }, tabs, bodyWrap);
  openModal({ title: '가이드', body: modalBody, wide: true, actions: [{ label: '닫기', variant: 'btn-primary', onClick: (close) => close() }] });
  switchTo(currentKind);
}

/** 구버전 링크(#/help?kind=...) 호환용: 라우트로 직접 진입하면 동일 팝업을 띄우고 이전 화면으로 되돌린다. */
export async function renderDocs(main, { query, navigate }) {
  openDocsModal(query.kind === 'developer' ? 'developer' : 'help');
  navigate('/dashboard', {}, { replace: true });
}
