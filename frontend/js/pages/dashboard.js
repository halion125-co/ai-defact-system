/**
 * SCR-010 Dashboard. Global Filter → KPI/Chart/관리필요. 모든 지표 Drill-down → Issue List.
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { h, clear, pageHead, card, errorBox, loadingState, TYPE_LABEL, statusBadge, priorityBadge } from '../ui.js';
import { barChart, lineChart, donutChart, hBarList, legend, SERIES, STATUS_COLORS, PRIORITY_COLORS } from '../charts.js';

const PERIODS = [
  { value: '', label: '기간 전체' },
  { value: '7', label: '최근 7일' },
  { value: '14', label: '최근 14일' },
  { value: '30', label: '최근 30일' },
  { value: '90', label: '최근 90일' },
];

function isoDate(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export async function renderDashboard(main, { query, navigate }) {
  const type = query.type || 'DEFECT';
  const period = query.period || '';
  const filter = { type, environmentId: query.environmentId || '', priority: query.priority || '' };
  if (period) {
    const from = new Date();
    from.setDate(from.getDate() - (parseInt(period, 10) - 1));
    filter.dateFrom = isoDate(from);
  }
  const go = (q) => navigate('/dashboard', { ...query, ...q });
  const drill = (params) => navigate('/issues/list', params);

  // Filter bar
  const sel = (name, options, value) => {
    const s = h('select', { class: 'input input-sm', style: { width: 'auto' } }, ...options.map((o) => h('option', { value: o.value }, o.label)));
    s.value = value || '';
    s.addEventListener('change', () => go({ [name]: s.value }));
    return s;
  };
  const filterBar = h(
    'div',
    { class: 'filter-bar', style: { marginBottom: 0 } },
    sel('type', Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })), type),
    sel('period', PERIODS, period),
    sel('environmentId', [{ value: '', label: '환경 전체' }, ...(store.project ? store.project.environments : []).map((e) => ({ value: e.id, label: e.displayName }))], filter.environmentId),
    sel('priority', [{ value: '', label: 'Priority 전체' }, ...store.activePriorities().map((p) => ({ value: p.code, label: p.displayName })), { value: 'UNASSIGNED', label: '미지정' }], filter.priority)
  );
  const typeLabel = TYPE_LABEL[type];
  const kpi1 = h('div', { class: 'kpi-row' });
  const kpi2 = h('div', { class: 'kpi-row six' });
  const dailyBody = h('div', {}, loadingState(4));
  const burnBody = h('div', {}, loadingState(4));
  const statusBody = h('div', {}, loadingState(3));
  const prioBody = h('div', {}, loadingState(3));
  const envBody = h('div', {}, loadingState(3));
  const attBody = h('div', {}, loadingState(5));
  const dailyLegend = legend([{ ...SERIES.created }, { ...SERIES.resolved }, { ...SERIES.closed }]);
  const burnToggle = h('label', { class: 'checkbox small' }, h('input', { type: 'checkbox' }), 'Closed 누적 표시');

  main.append(
    pageHead('Dashboard', `${typeLabel} 기준 품질 현황 · 등록/조치/미조치 Gap과 관리 필요 항목을 확인합니다.`, filterBar),
    kpi1,
    kpi2,
    h('div', { class: 'mt-16' }, card(`일자별 ${typeLabel} 등록 / 조치`, dailyBody, { headRight: dailyLegend })),
    h('div', { class: 'dash-grid mt-16' }, card(`${typeLabel} Burn Up`, burnBody, { headRight: burnToggle }), card('상태 분포', statusBody)),
    h('div', { class: 'dash-grid equal' }, card('Priority 분포', prioBody), card('환경별 분포', envBody)),
    card('관리 필요', attBody, { headRight: h('span', { class: 'small muted' }, '클릭 시 해당 목록으로 이동') })
  );

  const kpiCard = ({ label, value, sub, accent, onClick, title }) =>
    h('button', { class: `kpi${accent ? ` accent-${accent}` : ''}`, onClick, title: title || `${label} 목록 보기` }, h('span', { class: 'label' }, label), h('span', { class: 'value' }, value), sub ? h('span', { class: 'sub' }, sub) : null);

  // Summary
  api.dashboard
    .summary(filter)
    .then((s) => {
      const d = s.drilldown;
      clear(kpi1).append(
        kpiCard({ label: `전체 ${typeLabel}`, value: s.total, sub: s.cancelled ? `Cancel ${s.cancelled}건 별도` : ' ', onClick: () => drill(d.total) }),
        kpiCard({ label: 'Open · 접수', value: s.status.open, onClick: () => drill(d.open) }),
        kpiCard({ label: 'In Progress · 조치중', value: s.status.inProgress, accent: 'blue', onClick: () => drill(d.inProgress) }),
        kpiCard({ label: 'Done · 확인대기', value: s.status.done, accent: 'purple', onClick: () => drill(d.done) }),
        kpiCard({ label: 'Closed · 완료', value: s.status.closed, accent: 'success', onClick: () => drill(d.closed) })
      );
      const a = s.attention;
      clear(kpi2).append(
        kpiCard({ label: 'Critical 미조치', value: a.criticalUnresolved, accent: a.criticalUnresolved ? 'danger' : null, onClick: () => drill(d.criticalUnresolved) }),
        kpiCard({ label: '담당자 미지정', value: a.unassigned, accent: a.unassigned ? 'warning' : null, onClick: () => drill(d.unassigned) }),
        kpiCard({ label: `장기 미조치 (${s.staleIssueDays}일+)`, value: a.stale, accent: a.stale ? 'warning' : null, onClick: () => drill(d.stale), title: `${s.staleIssueDays}일 이상 업데이트가 없는 Open/In Progress` }),
        kpiCard({ label: 'Re-open', value: a.reopened, accent: a.reopened ? 'danger' : null, onClick: () => drill(d.reopened), title: '재조치 요청 이력이 있고 아직 종료되지 않은 Issue' }),
        kpiCard({ label: '배포대기', value: s.enableDeployment ? a.waitingDeploy : '-', accent: 'cyan', onClick: () => drill(d.waitingDeploy), title: 'Done + 미배포' }),
        kpiCard({ label: '재검증대기', value: a.waitingVerification, accent: 'cyan', onClick: () => drill(d.waitingVerification), title: s.enableDeployment ? 'Done + 배포완료' : 'Done 전체' })
      );
    })
    .catch((err) => clear(kpi1).append(errorBox(err)));

  // Daily
  const loadDaily = () =>
    api.dashboard
      .daily({ ...filter, days: period ? parseInt(period, 10) : 30 })
      .then(({ items, drilldownBase }) => {
        clear(dailyBody);
        if (!items.length) return dailyBody.append(h('div', { class: 'empty' }, '표시할 데이터가 없습니다.'));
        dailyBody.append(
          barChart({
            data: items,
            keys: ['created', 'resolved', 'closed'],
            onBarClick: (d, k) => drill({ ...drilldownBase, [k === 'created' ? 'createdOn' : k === 'resolved' ? 'resolvedOn' : 'closedOn']: d.date }),
          }),
          h('div', { class: 'small muted mt-8' }, '신규 등록 = 등록일 기준 · 조치 완료 = 최초 Done 도달일 기준 · Closed = 최초 Close일 기준. 막대를 클릭하면 해당 일자 목록으로 이동합니다.')
        );
      })
      .catch((err) => clear(dailyBody).append(errorBox(err, loadDaily)));
  loadDaily();

  // Burn Up
  let burnData = null;
  const drawBurn = () => {
    if (!burnData) return;
    const { items, current } = burnData;
    const showClosed = burnToggle.querySelector('input').checked;
    const keys = [
      { field: 'createdCumulative', label: '누적 등록', color: SERIES.created.color, area: true },
      { field: 'resolvedCumulative', label: '누적 조치', color: SERIES.resolved.color },
    ];
    if (showClosed) keys.push({ field: 'closedCumulative', label: '누적 Closed', color: SERIES.closed.color });
    clear(burnBody).append(
      h(
        'div',
        { class: 'chart-summary mb-16' },
        h('div', { class: 'item' }, h('span', { class: 'k' }, '누적 등록'), h('span', { class: 'v' }, current.total)),
        h('div', { class: 'item' }, h('span', { class: 'k' }, '누적 조치'), h('span', { class: 'v', style: { color: '#0E8F63' } }, current.resolvedEver)),
        showClosed ? h('div', { class: 'item' }, h('span', { class: 'k' }, '누적 Closed'), h('span', { class: 'v', style: { color: SERIES.closed.color } }, current.closedEver)) : null,
        h('div', { class: 'item' }, h('span', { class: 'k' }, '미조치 Gap'), h('span', { class: 'v' }, current.gap)),
        h('div', { class: 'item', title: '현재 상태가 Open/In Progress인 건수. Re-open 시 누적 조치는 유지되므로 Gap과 다를 수 있습니다.' }, h('span', { class: 'k' }, '현재 미조치 ⓘ'), h('span', { class: 'v', style: { color: current.currentlyUnresolved ? '#B36F00' : undefined } }, current.currentlyUnresolved))
      ),
      items.length ? lineChart({ data: items, keys, onPointClick: (d) => drill({ type, createdTo: d.date, ...(filter.environmentId ? { environmentId: filter.environmentId } : {}), ...(filter.priority ? { priority: filter.priority } : {}) }) }) : h('div', { class: 'empty' }, '표시할 데이터가 없습니다.'),
      legend(keys.map((k) => ({ label: k.label, color: k.color, line: true }))),
      h('div', { class: 'small muted mt-8' }, '누적 조치 = 최초 Done 도달 Unique 건수(Re-open으로 감소하지 않음). Re-open은 별도 KPI, 현재 미조치는 현재 상태 기준입니다.')
    );
  };
  burnToggle.querySelector('input').addEventListener('change', drawBurn);
  const loadBurn = () =>
    api.dashboard
      .burnup({ ...filter, days: period ? parseInt(period, 10) : 60 })
      .then((res) => { burnData = res; drawBurn(); })
      .catch((err) => clear(burnBody).append(errorBox(err, loadBurn)));
  loadBurn();

  // Distribution
  const loadDist = () =>
    api.dashboard
      .distribution(filter)
      .then((d) => {
        clear(statusBody).append(donutChart({ items: d.status.map((s) => ({ ...s, color: STATUS_COLORS[s.code] })), onClick: (it) => drill(it.drilldown) }));
        clear(prioBody).append(hBarList({ items: d.priority.map((p) => ({ ...p, color: PRIORITY_COLORS[p.code] })), onClick: (it) => drill(it.drilldown) }));
        clear(envBody).append(type !== 'DEFECT' ? h('div', { class: 'empty' }, '발생 환경은 결함(Defect)에만 기록됩니다.', h('div', { class: 'small muted mt-8' }, '개선요청/문의는 환경 구분 없이 집계됩니다.')) : d.environment.length ? hBarList({ items: d.environment, color: '#126BFF', onClick: (it) => drill(it.drilldown) }) : h('div', { class: 'empty' }, '환경 데이터가 없습니다.'));
      })
      .catch((err) => clear(statusBody).append(errorBox(err, loadDist)));
  loadDist();

  // Attention
  const loadAtt = () =>
    api.dashboard
      .attention({ ...filter, limit: 3 })
      .then(({ items }) => {
        clear(attBody);
        const list = h('div', { class: 'attention-list' });
        for (const it of items) {
          const row = h(
            'button',
            { class: 'attention-row', onClick: () => drill(it.drilldown) },
            h('div', {}, h('div', { style: { fontWeight: 600 } }, it.label), it.sample.length ? h('div', { class: 'small muted mt-8 flex flex-wrap' }, ...it.sample.map((s) => h('span', { class: 'flex', style: { gap: '4px' } }, h('span', { class: 'mono' }, s.id), priorityBadge(s.priority), statusBadge(s.status), h('span', { class: 'nowrap', style: { maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis' } }, s.title)))) : null),
            h('span', { class: `cnt${it.count === 0 ? ' zero' : it.key === 'criticalUnresolved' || it.key === 'reopened' ? ' hot' : ''}` }, `${it.count}건`)
          );
          list.append(row);
        }
        attBody.append(list);
      })
      .catch((err) => clear(attBody).append(errorBox(err, loadAtt)));
  loadAtt();
}
