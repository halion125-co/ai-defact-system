/**
 * 네이티브 SVG 차트 (외부 라이브러리 없음).
 * - 얇은 마크, 4px 라운드 상단, 인접 막대 2px 간격, hover tooltip, 범례(2개 이상 시리즈), 선택적 직접 라벨
 * - 팔레트: 등록 #126BFF / 조치 #18B981 / Closed #8B5CF6 (CVD 검증 통과)
 */
import { h, svg } from './ui.js';

export const SERIES = {
  created: { label: '신규 등록', color: '#126BFF' },
  resolved: { label: '조치 완료', color: '#18B981' },
  closed: { label: 'Closed', color: '#8B5CF6' },
};
export const STATUS_COLORS = { OPEN: '#64748B', IN_PROGRESS: '#126BFF', DONE: '#7C3AED', CLOSED: '#18B981', CANCEL: '#98A2B3' };
export const PRIORITY_COLORS = { CRITICAL: '#F04438', MAJOR: '#F5A623', MINOR: '#4A6FA5', UNASSIGNED: '#98A2B3' };

function niceMax(v) {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * p;
}

function shortDate(d) {
  return d.slice(5).replace('-', '/');
}

function tooltip(wrap) {
  const tip = h('div', { class: 'chart-tip hidden' });
  wrap.append(tip);
  return {
    show(x, y, dateLabel, rows) {
      tip.replaceChildren(h('div', { class: 'd' }, dateLabel), ...rows.map((r) => h('div', { class: 'r' }, h('span', {}, r[0]), h('strong', {}, r[1]))));
      tip.classList.remove('hidden');
      const rect = wrap.getBoundingClientRect();
      let left = x + 12;
      if (left + tip.offsetWidth > rect.width) left = x - tip.offsetWidth - 12;
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = `${Math.max(0, y - 10)}px`;
    },
    hide() {
      tip.classList.add('hidden');
    },
  };
}

export function legend(items) {
  return h('div', { class: 'legend' }, ...items.map((i) => h('span', {}, h('span', { class: i.line ? 'line' : 'sw', style: { background: i.color } }), i.label)));
}

/**
 * Grouped Bar Chart. data: [{date, created, resolved, closed}], keys: ['created','resolved']
 */
export function barChart({ data, keys, onBarClick, height = 240 }) {
  const wrap = h('div', { class: 'chart-wrap' });
  const W = 800;
  const H = height;
  const pad = { t: 16, r: 12, b: 34, l: 36 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => keys.map((k) => d[k] || 0))));
  const n = Math.max(data.length, 1);
  const slot = iw / n;
  const gap = 2;
  const groupW = Math.min(slot * 0.7, 48);
  const barW = (groupW - gap * (keys.length - 1)) / keys.length;
  const y = (v) => pad.t + ih - (v / max) * ih;
  const el = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '일자별 등록/조치 Bar Chart' });
  const grid = svg('g', { class: 'grid' });
  const axis = svg('g', { class: 'axis' });
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    grid.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }));
    axis.append(svg('text', { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, Math.round(v)));
  }
  el.append(grid, axis);
  const tip = tooltip(wrap);
  const labelEvery = Math.ceil(n / 14);
  data.forEach((d, i) => {
    const gx = pad.l + slot * i + (slot - groupW) / 2;
    const hit = svg('rect', { class: 'hit', x: pad.l + slot * i, y: pad.t, width: slot, height: ih, rx: 4 });
    const showTip = (e) => {
      const r = wrap.getBoundingClientRect();
      tip.show(e.clientX - r.left, e.clientY - r.top, d.date, keys.map((k) => [SERIES[k].label, d[k] || 0]));
    };
    hit.addEventListener('mousemove', showTip);
    hit.addEventListener('mouseleave', tip.hide);
    el.append(hit);
    keys.forEach((k, j) => {
      const v = d[k] || 0;
      const bx = gx + j * (barW + gap);
      const by = y(v);
      const bh = pad.t + ih - by;
      const bar = svg('rect', { class: 'bar', x: bx, y: v > 0 ? by : pad.t + ih - 1, width: barW, height: v > 0 ? bh : 1, rx: v > 0 ? Math.min(4, barW / 2) : 0, fill: v > 0 ? SERIES[k].color : '#E5EAF2', tabindex: onBarClick ? 0 : null, 'aria-label': `${d.date} ${SERIES[k].label} ${v}건` });
      if (onBarClick) {
        bar.addEventListener('click', () => onBarClick(d, k));
        bar.addEventListener('keydown', (e) => e.key === 'Enter' && onBarClick(d, k));
      }
      bar.addEventListener('mousemove', showTip);
      bar.addEventListener('mouseleave', tip.hide);
      el.append(bar);
      if (v > 0 && n <= 14) el.append(svg('text', { class: 'val', x: bx + barW / 2, y: by - 4, 'text-anchor': 'middle' }, v));
    });
    if (i % labelEvery === 0 || i === n - 1) {
      axis.append(svg('text', { x: pad.l + slot * i + slot / 2, y: H - 12, 'text-anchor': 'middle' }, shortDate(d.date)));
    }
  });
  wrap.append(el);
  return wrap;
}

/**
 * Burn Up Line Chart. data: [{date, createdCumulative, resolvedCumulative, closedCumulative}]
 */
export function lineChart({ data, keys, height = 260, onPointClick }) {
  const wrap = h('div', { class: 'chart-wrap' });
  const W = 800;
  const H = height;
  const pad = { t: 16, r: 16, b: 34, l: 40 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => keys.map((k) => d[k.field] || 0))));
  const n = data.length;
  const x = (i) => pad.l + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const el = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Burn Up Chart' });
  const grid = svg('g', { class: 'grid' });
  const axis = svg('g', { class: 'axis' });
  for (let i = 0; i <= 5; i++) {
    const v = (max / 5) * i;
    grid.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }));
    axis.append(svg('text', { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, Math.round(v)));
  }
  el.append(grid, axis);
  const labelEvery = Math.ceil(n / 10);
  data.forEach((d, i) => {
    if (i % labelEvery === 0 || i === n - 1) axis.append(svg('text', { x: x(i), y: H - 12, 'text-anchor': 'middle' }, shortDate(d.date)));
  });
  for (const k of keys) {
    const pts = data.map((d, i) => `${x(i)},${y(d[k.field] || 0)}`).join(' ');
    // area fill for created (gap 가시화)
    if (k.area) {
      el.append(svg('polygon', { points: `${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`, fill: k.color, opacity: 0.06 }));
    }
    el.append(svg('polyline', { points: pts, fill: 'none', stroke: k.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    // 마지막 점 직접 라벨
    const last = data[n - 1];
    if (last) {
      el.append(svg('circle', { cx: x(n - 1), cy: y(last[k.field] || 0), r: 4, fill: k.color, stroke: '#fff', 'stroke-width': 2 }));
    }
  }
  // hover crosshair
  const cross = svg('line', { x1: 0, x2: 0, y1: pad.t, y2: pad.t + ih, stroke: '#98A2B3', 'stroke-dasharray': '3 3', class: 'hidden' });
  const dots = keys.map((k) => svg('circle', { r: 5, fill: k.color, stroke: '#fff', 'stroke-width': 2, class: 'hidden' }));
  el.append(cross, ...dots);
  const tip = tooltip(wrap);
  const overlay = svg('rect', { x: pad.l, y: pad.t, width: iw, height: ih, fill: 'transparent', style: onPointClick ? 'cursor:pointer' : '' });
  let hoverIdx = -1;
  overlay.addEventListener('mousemove', (e) => {
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / iw) * (n - 1))));
    hoverIdx = i;
    const d = data[i];
    cross.setAttribute('x1', x(i));
    cross.setAttribute('x2', x(i));
    cross.classList.remove('hidden');
    keys.forEach((k, j) => {
      dots[j].setAttribute('cx', x(i));
      dots[j].setAttribute('cy', y(d[k.field] || 0));
      dots[j].classList.remove('hidden');
    });
    const rows = keys.map((k) => [k.label, d[k.field] || 0]);
    if (keys.length >= 2) rows.push(['Gap', (d[keys[0].field] || 0) - (d[keys[1].field] || 0)]);
    const wr = wrap.getBoundingClientRect();
    tip.show(e.clientX - wr.left, e.clientY - wr.top, d.date, rows);
  });
  overlay.addEventListener('mouseleave', () => {
    cross.classList.add('hidden');
    dots.forEach((d) => d.classList.add('hidden'));
    tip.hide();
  });
  if (onPointClick) overlay.addEventListener('click', () => hoverIdx >= 0 && onPointClick(data[hoverIdx]));
  el.append(overlay);
  wrap.append(el);
  return wrap;
}

/**
 * Donut Chart. items: [{code,label,count,color}]
 */
export function donutChart({ items, onClick, size = 180 }) {
  const wrap = h('div', { class: 'chart-wrap flex gap-16', style: { alignItems: 'center' } });
  const total = items.reduce((a, b) => a + b.count, 0);
  const R = 70;
  const r = 46;
  const cx = 90;
  const cy = 90;
  const el = svg('svg', { class: 'chart donut', viewBox: '0 0 180 180', width: size, height: size, role: 'img', 'aria-label': '상태 분포' });
  let angle = -Math.PI / 2;
  if (total === 0) el.append(svg('circle', { cx, cy, r: (R + r) / 2, fill: 'none', stroke: '#E5EAF2', 'stroke-width': R - r }));
  for (const it of items) {
    if (it.count === 0) continue;
    const frac = it.count / total;
    const a2 = angle + frac * Math.PI * 2 - (items.filter((x) => x.count > 0).length > 1 ? 0.03 : 0);
    const large = frac > 0.5 ? 1 : 0;
    const p = (a, rad) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
    const d = frac >= 0.999
      ? `M${p(angle, R)} A${R},${R} 0 1 1 ${p(angle + Math.PI, R)} A${R},${R} 0 1 1 ${p(angle, R)} M${p(angle, r)} A${r},${r} 0 1 0 ${p(angle + Math.PI, r)} A${r},${r} 0 1 0 ${p(angle, r)} Z`
      : `M${p(angle, R)} A${R},${R} 0 ${large} 1 ${p(a2, R)} L${p(a2, r)} A${r},${r} 0 ${large} 0 ${p(angle, r)} Z`;
    const path = svg('path', { d, fill: it.color, class: 'bar', 'fill-rule': 'evenodd' }, svg('title', {}, `${it.label} ${it.count}건`));
    if (onClick) path.addEventListener('click', () => onClick(it));
    el.append(path);
    angle += frac * Math.PI * 2;
  }
  el.append(svg('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', style: 'font-size:22px;font-weight:700;fill:#172033' }, total));
  el.append(svg('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', class: 'dlabel' }, '전체'));
  const list = h('div', { class: 'dist-list grow' });
  for (const it of items) {
    list.append(
      h(
        'button',
        { class: 'dist-row', type: 'button', onClick: () => onClick && onClick(it) },
        h('span', {}, h('span', { class: 'sw', style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: it.color, marginRight: '6px' } }), it.label),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${total ? (it.count / total) * 100 : 0}%`, background: it.color } })),
        h('span', { class: 'n' }, it.count)
      )
    );
  }
  wrap.append(el, list);
  return wrap;
}

/**
 * Horizontal Bar list. items: [{code,label,count,color}]
 */
export function hBarList({ items, onClick, color }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const list = h('div', { class: 'dist-list' });
  for (const it of items) {
    list.append(
      h(
        'button',
        { class: 'dist-row', type: 'button', onClick: () => onClick && onClick(it), 'aria-label': `${it.label} ${it.count}건` },
        h('span', { class: 'nowrap', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, it.label),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${(it.count / max) * 100}%`, background: it.color || color || '#126BFF' } })),
        h('span', { class: 'n' }, it.count)
      )
    );
  }
  return list;
}
