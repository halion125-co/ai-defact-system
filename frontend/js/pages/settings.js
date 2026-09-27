/**
 * SCR-050 설정 (Quality Admin). 프로젝트 / 환경 / Priority / 사용자 / 운영 / 백업·상태.
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { h, clear, pageHead, card, forbiddenState, toast, errorMessage, setBusy, confirmModal, formModal, openModal, copyText, loadingState, errorBox, fmtDateTime, fmtBytes, josa } from '../ui.js';

const TABS = [
  { key: 'project', label: '프로젝트' },
  { key: 'environments', label: '발생환경' },
  { key: 'priorities', label: 'Priority' },
  { key: 'users', label: '사용자' },
  { key: 'operation', label: '운영설정' },
  { key: 'external', label: '외부 연동' },
  { key: 'backup', label: '백업 · 상태' },
];

export async function renderSettings(main, { query, navigate }) {
  if (!store.isAdmin) {
    main.append(forbiddenState('설정은 Quality Admin만 접근할 수 있습니다.'));
    return;
  }
  const tab = TABS.find((t) => t.key === query.tab) || TABS[0];
  const nav = h('nav', { class: 'settings-nav' }, ...TABS.map((t) => h('a', { class: `nav-item${t.key === tab.key ? ' active' : ''}`, href: `#/settings?tab=${t.key}` }, t.label)));
  const content = h('div', {});
  main.append(pageHead('설정', 'Quality Admin 전용. 프로젝트/환경/사용자/운영 설정을 관리합니다.'), h('div', { class: 'settings-layout' }, nav, content));
  const R = { project: tabProject, environments: tabEnvironments, priorities: tabPriorities, users: tabUsers, operation: tabOperation, external: tabExternal, backup: tabBackup };
  await R[tab.key](content, navigate);
}

function fieldRow(label, input, help) {
  return h('div', { class: 'field' }, h('label', {}, label), input, help ? h('div', { class: 'help' }, help) : null);
}

async function saveWith(btn, fn, okMsg) {
  setBusy(btn, true);
  try {
    await fn();
    await store.refreshProject();
    toast(okMsg, 'success');
  } catch (err) {
    toast(err.isConflict ? '다른 관리자가 먼저 수정했습니다. 화면을 새로고침합니다.' : errorMessage(err), 'error');
    if (err.isConflict) await store.refreshProject();
  } finally {
    setBusy(btn, false);
  }
}

/* ---------- 프로젝트 ---------- */
async function tabProject(content) {
  const p = store.project;
  const customer = h('input', { class: 'input', maxlength: 100 });
  customer.value = p.customerName;
  const project = h('input', { class: 'input', maxlength: 100 });
  project.value = p.projectName;
  const btn = h('button', { class: 'btn btn-primary' }, '저장');
  btn.addEventListener('click', () => saveWith(btn, () => api.config.updateProject({ expectedRevision: p.revision, customerName: customer.value.trim(), projectName: project.value.trim() }), '프로젝트 정보가 저장되었습니다.'));
  content.append(card('프로젝트', h('div', { style: { maxWidth: '520px' } }, fieldRow('고객사명', customer), fieldRow('프로젝트명', project), h('div', { class: 'form-actions', style: { justifyContent: 'flex-start' } }, btn), h('div', { class: 'small muted mt-16' }, `Project ID ${p.projectId} · revision ${p.revision} · 수정 ${fmtDateTime(p.updatedAt)}`))));
}

/* ---------- 발생환경 ---------- */
async function tabEnvironments(content) {
  const list = h('div', {});
  const draw = () => {
    clear(list);
    const envs = store.project.environments.slice().sort((a, b) => a.order - b.order);
    envs.forEach((e, i) => {
      const name = h('input', { class: 'input input-sm', maxlength: 50 });
      name.value = e.displayName;
      const save = h('button', { class: 'btn btn-secondary btn-xs' }, '이름 저장');
      save.addEventListener('click', () => saveWith(save, () => api.config.updateEnvironment(e.id, { displayName: name.value.trim() }), '환경명이 변경되었습니다.').then(draw));
      const toggle = h('button', { class: `btn btn-xs ${e.active ? 'btn-ghost' : 'btn-secondary'}` }, e.active ? '비활성화' : '활성화');
      toggle.addEventListener('click', () => saveWith(toggle, () => api.config.updateEnvironment(e.id, { active: !e.active }), e.active ? '비활성화되었습니다. 신규 등록 시 선택할 수 없습니다.' : '활성화되었습니다.').then(draw));
      const del = h('button', { class: 'btn btn-danger-outline btn-xs' }, '삭제');
      del.addEventListener('click', async () => {
        if (!(await confirmModal({ title: '환경 삭제', message: `${josa(e.displayName, '을/를')} 삭제합니다. 기존 Issue가 참조 중이면 물리 삭제 대신 비활성 처리됩니다.`, confirmLabel: '삭제', variant: 'btn-danger' }))) return;
        setBusy(del, true);
        try {
          const res = await api.config.removeEnvironment(e.id);
          await store.refreshProject();
          toast(res.mode === 'INACTIVATED' ? '기존 Issue가 참조 중이어서 비활성 처리되었습니다.' : '환경이 삭제되었습니다.', 'success');
          draw();
        } catch (err) {
          toast(errorMessage(err), 'error');
          setBusy(del, false);
        }
      });
      const up = h('button', { class: 'btn btn-ghost btn-xs', disabled: i === 0, title: '위로' }, '↑');
      const down = h('button', { class: 'btn btn-ghost btn-xs', disabled: i === envs.length - 1, title: '아래로' }, '↓');
      const move = (dir) => {
        const ids = envs.map((x) => x.id);
        const j = i + dir;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        saveWith(up, () => api.config.reorderEnvironments(ids), '순서가 변경되었습니다.').then(draw);
      };
      up.addEventListener('click', () => move(-1));
      down.addEventListener('click', () => move(1));
      list.append(h('div', { class: 'env-row' }, h('div', { class: 'flex' }, name, save), h('span', { class: 'mono small muted' }, e.id), h('span', { class: `badge ${e.active ? 'status-CLOSED' : 'neutral'}` }, e.active ? '활성' : '비활성'), h('div', { class: 'btns' }, up, down, toggle, del)));
    });
  };
  draw();
  const addName = h('input', { class: 'input', placeholder: '예) 운영계', maxlength: 50, style: { maxWidth: '240px' } });
  const addCode = h('input', { class: 'input', placeholder: '코드 (선택, 예: PROD)', maxlength: 30, style: { maxWidth: '200px' } });
  const addBtn = h('button', { class: 'btn btn-primary' }, '+ 환경 추가');
  addBtn.addEventListener('click', () => {
    if (!addName.value.trim()) return toast('환경명을 입력해주세요.', 'error');
    saveWith(addBtn, () => api.config.addEnvironment({ displayName: addName.value.trim(), code: addCode.value.trim() }), '환경이 추가되었습니다.').then(() => { addName.value = ''; addCode.value = ''; draw(); });
  });
  content.append(card('발생환경', h('div', {}, list, h('div', { class: 'flex mt-16' }, addName, addCode, addBtn), h('div', { class: 'small muted mt-8' }, '저장 즉시 신규 Issue 등록 화면 Select에 적용됩니다. 기존 Issue의 환경값은 이력 보존을 위해 유지됩니다.'))));
}

/* ---------- Priority ---------- */
async function tabPriorities(content) {
  const rows = store.project.priorities.slice().sort((a, b) => a.order - b.order).map((p) => {
    const name = h('input', { class: 'input input-sm', maxlength: 30 });
    name.value = p.displayName;
    const desc = h('input', { class: 'input input-sm', maxlength: 200 });
    desc.value = p.description || '';
    const active = h('input', { type: 'checkbox' });
    active.checked = p.active !== false;
    return { p, name, desc, active };
  });
  const btn = h('button', { class: 'btn btn-primary' }, '저장');
  btn.addEventListener('click', async () => {
    if (!(await confirmModal({ title: 'Priority 설정 변경', message: '표시 이름/설명만 변경되며 내부 코드(CRITICAL/MAJOR/MINOR)와 기존 Issue 데이터는 유지됩니다. 비활성화하면 신규 지정이 불가하지만 기존 Issue 값은 유지됩니다.', confirmLabel: '저장' }))) return;
    saveWith(btn, () => api.config.updatePriorities(rows.map((r, i) => ({ code: r.p.code, displayName: r.name.value.trim(), description: r.desc.value.trim(), active: r.active.checked, order: i + 1 }))), 'Priority 설정이 저장되었습니다.');
  });
  content.append(
    card('Priority', h('div', {}, h('div', { class: 'info-box mb-16' }, '기본 Critical / Major / Minor. 프로젝트별 Tailoring 시 표시 이름만 변경되고 통계 코드는 유지됩니다.'), h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, '코드'), h('th', {}, '표시 이름'), h('th', {}, '설명'), h('th', {}, '활성'))), h('tbody', {}, ...rows.map((r) => h('tr', {}, h('td', { class: 'mono' }, r.p.code), h('td', {}, r.name), h('td', {}, r.desc), h('td', {}, r.active)))))), h('div', { class: 'form-actions mt-16', style: { justifyContent: 'flex-start' } }, btn)))
  );
}

/* ---------- 사용자 ---------- */
async function tabUsers(content) {
  const wrap = h('div', {}, loadingState(5));
  content.append(card('사용자', wrap, { headRight: h('span', { class: 'small muted' }, 'Quality Admin 지정/해제 · 비활성화(삭제 대신)') }));
  async function load() {
    clear(wrap).append(loadingState(5));
    try {
      const { users } = await api.users.list({});
      clear(wrap);
      const tbody = h('tbody', {});
      for (const u of users) {
        const edit = h('button', { class: 'btn btn-secondary btn-xs' }, '수정');
        edit.addEventListener('click', () =>
          formModal({
            title: `사용자 수정 · ${u.employeeId}`,
            fields: [
              { name: 'name', label: '이름', required: true, value: u.name },
              { name: 'team', label: '소속팀', required: true, value: u.team },
            ],
            onSubmit: async (v) => { await api.users.update(u.userId, v); toast('저장되었습니다.', 'success'); load(); },
          })
        );
        const admin = h('button', { class: `btn btn-xs ${u.isQualityAdmin ? 'btn-ghost' : 'btn-secondary'}`, disabled: u.userId === store.user.userId }, u.isQualityAdmin ? 'Admin 해제' : 'Admin 지정');
        admin.addEventListener('click', async () => {
          if (!(await confirmModal({ title: 'Quality Admin 변경', message: `${josa(u.name, '을/를')} Quality Admin ${u.isQualityAdmin ? '해제' : '지정'}합니다.`, confirmLabel: '변경' }))) return;
          try { await api.users.update(u.userId, { isQualityAdmin: !u.isQualityAdmin }); toast('변경되었습니다.', 'success'); load(); } catch (err) { toast(errorMessage(err), 'error'); }
        });
        const responder = h('button', { class: `btn btn-xs ${u.isResponder ? 'btn-ghost' : 'btn-secondary'}` }, u.isResponder ? '조치자 해제' : '조치자 지정');
        responder.addEventListener('click', async () => {
          if (!(await confirmModal({ title: '역할 변경', message: `${josa(u.name, '을/를')} 조치자에서 ${u.isResponder ? '해제' : '지정'}합니다.`, confirmLabel: '변경' }))) return;
          try { await api.users.update(u.userId, { isResponder: !u.isResponder }); toast('변경되었습니다.', 'success'); load(); } catch (err) { toast(errorMessage(err), 'error'); }
        });
        const act = h('button', { class: `btn btn-xs ${u.active ? 'btn-danger-outline' : 'btn-secondary'}`, disabled: u.userId === store.user.userId }, u.active ? '비활성화' : '활성화');
        act.addEventListener('click', async () => {
          try { await api.users.update(u.userId, { active: !u.active }); toast('변경되었습니다.', 'success'); load(); } catch (err) { toast(errorMessage(err), 'error'); }
        });
        tbody.append(h('tr', {}, h('td', { class: 'mono' }, u.employeeId), h('td', {}, u.name), h('td', {}, u.team), h('td', {}, u.isQualityAdmin ? h('span', { class: 'badge admin' }, 'Quality Admin') : (u.isResponder ? h('span', { class: 'badge neutral' }, '조치자') : h('span', { class: 'small muted' }, '일반 사용자'))), h('td', {}, h('span', { class: `badge ${u.active ? 'status-CLOSED' : 'neutral'}` }, u.active ? '활성' : '비활성')), h('td', { class: 'nowrap' }, fmtDateTime(u.createdAt)), h('td', {}, h('div', { class: 'flex' }, edit, admin, responder, act))));
      }
      wrap.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ...['사번', '이름', '소속팀', '역할', 'Active', '등록일', ''].map((c) => h('th', {}, c)))), tbody)), h('div', { class: 'small muted mt-8' }, '사용자는 삭제하지 않고 비활성화합니다. 과거 Issue/History에는 계속 표시됩니다. 본인 계정은 Admin 해제/비활성화할 수 없습니다. 조치자가 아닌 사용자는 본인이 등록한 Issue만 조회할 수 있습니다.'));
    } catch (err) {
      clear(wrap).append(errorBox(err, load));
    }
  }
  await load();
}

/* ---------- 운영설정 ---------- */
async function tabOperation(content) {
  const wrap = h('div', {}, loadingState(4));
  content.append(card('운영설정', wrap));
  try {
    const op = await api.config.operation();
    clear(wrap);
    const stale = h('input', { class: 'input', type: 'number', min: 1, max: 365, style: { maxWidth: '160px' } });
    stale.value = op.staleIssueDays;
    const maxMb = h('input', { class: 'input', type: 'number', min: 1, max: 500, style: { maxWidth: '160px' } });
    maxMb.value = op.maxAttachmentMb;
    const ext = h('input', { class: 'input' });
    ext.value = op.allowedExtensions.join(', ');
    const cr = h('input', { type: 'checkbox' });
    cr.checked = !!op.enableChangeReference;
    const dep = h('input', { type: 'checkbox' });
    dep.checked = !!op.enableDeployment;
    const bk = h('input', { type: 'checkbox' });
    bk.checked = !!(op.backup && op.backup.enabled);
    const retain = h('input', { class: 'input', type: 'number', min: 1, max: 3650, style: { maxWidth: '160px' } });
    retain.value = (op.backup && op.backup.retainDays) || 30;
    const loginAlerts = h('input', { type: 'checkbox' });
    loginAlerts.checked = op.loginAlertsEnabled !== false;
    const ann = op.announcement || { enabled: false, title: '', message: '' };
    const annEnabled = h('input', { type: 'checkbox' });
    annEnabled.checked = !!ann.enabled;
    const annTitle = h('input', { class: 'input', maxlength: 100, placeholder: '예) 정기 점검 안내' });
    annTitle.value = ann.title || '';
    const annMsg = h('textarea', { class: 'input', rows: 4, maxlength: 2000, placeholder: '로그인 시 팝업으로 표시할 공지 내용을 입력하세요.' });
    annMsg.value = ann.message || '';
    const btn = h('button', { class: 'btn btn-primary' }, '저장');
    btn.addEventListener('click', () =>
      saveWith(
        btn,
        () =>
          api.config.updateOperation({
            expectedRevision: op.revision,
            staleIssueDays: parseInt(stale.value, 10),
            maxAttachmentMb: parseInt(maxMb.value, 10),
            allowedExtensions: ext.value,
            enableChangeReference: cr.checked,
            enableDeployment: dep.checked,
            backup: { enabled: bk.checked, retainDays: parseInt(retain.value, 10) },
            loginAlertsEnabled: loginAlerts.checked,
            announcement: { enabled: annEnabled.checked, title: annTitle.value.trim(), message: annMsg.value.trim() },
          }),
        '운영 설정이 저장되었습니다.'
      ).then(() => { clear(wrap); tabOperation(content); content.firstChild.remove(); })
    );
    wrap.append(
      h('div', { class: 'form-grid' }, fieldRow('장기 미조치 기준 일수', stale, 'Open/In Progress 상태로 이 일수 이상 업데이트가 없으면 장기 미조치'), fieldRow('첨부 최대 크기 (MB)', maxMb)),
      fieldRow('허용 확장자', ext, '쉼표로 구분. 실행 파일/HTML/JS 등은 정책상 허용되지 않습니다.'),
      h('div', { class: 'flex gap-16 mb-16' }, h('label', { class: 'checkbox' }, cr, 'Change Reference 사용'), h('label', { class: 'checkbox' }, dep, 'Deployment(배포 정보) 기능 사용')),
      h('div', { class: 'form-grid' }, h('div', { class: 'field' }, h('label', {}, '백업'), h('label', { class: 'checkbox' }, bk, '일 1회 자동 백업 사용')), fieldRow('백업 보관 일수', retain)),
      h(
        'div',
        { class: 'field mb-16' },
        h('label', {}, '로그인 알림 팝업'),
        h('label', { class: 'checkbox' }, loginAlerts, '임시저장/조치대상/미배정 알림 팝업 사용'),
        h('div', { class: 'help' }, '끄면 아래 공지사항과 무관하게 건수 기반 알림(임시저장, 조치·확인대상, 관리자 미배정)이 표시되지 않습니다.')
      ),
      h(
        'div',
        { class: 'field mb-16' },
        h('label', {}, '공지사항'),
        h('label', { class: 'checkbox mb-8' }, annEnabled, '로그인 시 공지사항 팝업 표시'),
        annTitle,
        h('div', { class: 'mt-8' }, annMsg),
        h('div', { class: 'help' }, '사용자가 "오늘 하루 보지 않기"를 선택해도, 공지 내용을 저장하면 다시 표시됩니다.')
      ),
      h('div', { class: 'small muted mb-16' }, `Timezone ${op.timezone} · revision ${op.revision}`),
      h('div', { class: 'form-actions', style: { justifyContent: 'flex-start' } }, btn)
    );
  } catch (err) {
    clear(wrap).append(errorBox(err));
  }
}

/* ---------- 외부 연동 ---------- */
async function tabExternal(content) {
  const wrap = h('div', {}, loadingState(3));
  content.append(
    card('외부 연동 API', wrap, { headRight: h('span', { class: 'small muted' }, '사내 타 시스템 전용 · 내부망 접근 권장') })
  );
  async function load() {
    clear(wrap).append(loadingState(3));
    try {
      const s = await api.admin.externalApi();
      clear(wrap);
      const statusBadgeEl = h('span', { class: `badge ${s.enabled && s.hasKey ? 'status-CLOSED' : 'neutral'}` }, s.enabled && s.hasKey ? '사용 중' : '사용 안 함');
      const enableToggle = h('input', { type: 'checkbox' });
      enableToggle.checked = !!s.enabled;
      enableToggle.disabled = !s.hasKey;
      enableToggle.addEventListener('change', async () => {
        try {
          await api.admin.setExternalApiEnabled(enableToggle.checked);
          toast(enableToggle.checked ? '외부 연동 API가 활성화되었습니다.' : '외부 연동 API가 비활성화되었습니다.', 'success');
          load();
        } catch (err) {
          toast(errorMessage(err), 'error');
          enableToggle.checked = !enableToggle.checked;
        }
      });

      const issueBtn = h('button', { class: 'btn btn-primary' }, s.hasKey ? 'API Key 재발급' : 'API Key 발급');
      issueBtn.addEventListener('click', async () => {
        if (s.hasKey && !(await confirmModal({ title: 'API Key 재발급', message: '기존 Key는 즉시 폐기되며, 이 Key를 사용 중인 외부 시스템은 재발급된 새 Key로 갱신해야 합니다.', confirmLabel: '재발급', variant: 'btn-danger' }))) return;
        setBusy(issueBtn, true);
        try {
          const res = await api.admin.issueExternalApiKey();
          load();
          openModal({
            title: '발급된 API Key',
            body: h(
              'div',
              {},
              h('p', { class: 'muted' }, '이 Key는 지금만 표시됩니다. 안전한 곳에 저장한 뒤 외부 시스템 설정에 등록하세요.'),
              h('div', { class: 'field' }, h('input', { class: 'input mono', readonly: true, value: res.apiKey, onClick: (e) => e.target.select() }))
            ),
            actions: [
              { label: '복사', variant: 'btn-secondary', onClick: async () => { await copyText(res.apiKey); toast('복사되었습니다.', 'success'); } },
              { label: '닫기', variant: 'btn-primary', onClick: (c) => c() },
            ],
          });
        } catch (err) {
          toast(errorMessage(err), 'error');
        } finally {
          setBusy(issueBtn, false, s.hasKey ? 'API Key 재발급' : 'API Key 발급');
        }
      });
      const revokeBtn = s.hasKey
        ? h('button', { class: 'btn btn-danger-outline' }, 'Key 폐기')
        : null;
      if (revokeBtn) {
        revokeBtn.addEventListener('click', async () => {
          if (!(await confirmModal({ title: 'API Key 폐기', message: '이 Key를 사용하는 모든 외부 연동이 즉시 중단됩니다.', confirmLabel: '폐기', variant: 'btn-danger' }))) return;
          try {
            await api.admin.revokeExternalApiKey();
            toast('API Key가 폐기되었습니다.', 'success');
            load();
          } catch (err) {
            toast(errorMessage(err), 'error');
          }
        });
      }

      wrap.append(
        h('div', { class: 'info-box mb-16' }, '외부 시스템이 사번(employeeId)을 지정해 결함 티켓을 생성·조회하거나, 배포 등록·댓글·첨부를 남길 수 있는 API입니다. 상태 전이(조치 시작/완료/종료 등)는 내부 화면에서만 수행합니다.'),
        h('div', { class: 'flex gap-16 mb-16', style: { alignItems: 'center' } }, h('span', {}, '상태'), statusBadgeEl, h('label', { class: 'checkbox', style: { marginLeft: '8px' } }, enableToggle, '사용')),
        h('div', { class: 'field mb-16' }, h('label', {}, 'API Key'), h('div', { class: 'flex', style: { alignItems: 'center', gap: '10px' } }, h('span', { class: 'mono' }, s.keyPreview || '발급된 Key 없음'), issueBtn, revokeBtn)),
        s.createdAt ? h('div', { class: 'small muted mb-16' }, `발급일 ${fmtDateTime(s.createdAt)} · 최근 변경 ${fmtDateTime(s.updatedAt)}`) : null,
        h(
          'div',
          { class: 'card', style: { background: '#F9FAFC' } },
          h(
            'div',
            { class: 'card-body small' },
            h('div', { style: { fontWeight: 600, marginBottom: '8px' } }, '호출 방법'),
            h('div', { class: 'mono', style: { whiteSpace: 'pre-wrap', lineHeight: '1.7' } },
              'POST /api/external/v1/issues\n' +
              'Header: X-Api-Key: <발급된 Key>\n' +
              'Body: { "employeeId": "10001", "location": "...", "environmentId": "...", "symptom": "...", "reproductionSteps": ["..."], "expectedResult": "..." }\n\n' +
              'GET  /api/external/v1/issues/:id?employeeId=10001\n' +
              'POST /api/external/v1/issues/:id/deployments  (조치자/Admin만 · body에 employeeId 포함)\n' +
              'POST /api/external/v1/issues/:id/comments     (body에 employeeId 포함)\n' +
              'POST /api/external/v1/issues/:id/attachments  (multipart, employeeId는 query string)'
            )
          )
        )
      );
    } catch (err) {
      clear(wrap).append(errorBox(err, load));
    }
  }
  await load();
}

/* ---------- 백업 · 상태 ---------- */
async function tabBackup(content) {
  const wrap = h('div', {}, loadingState(4));
  const healthWrap = h('div', {}, loadingState(3));
  const auditWrap = h('div', {}, loadingState(3));
  content.append(card('백업', wrap), h('div', { class: 'mt-16' }, card('서비스 상태', healthWrap)), h('div', { class: 'mt-16' }, card('최근 Audit (100건)', auditWrap)));
  async function load() {
    try {
      const s = await api.admin.backupStatus();
      clear(wrap);
      const run = h('button', { class: 'btn btn-primary' }, '지금 백업 실행');
      run.addEventListener('click', async () => {
        setBusy(run, true, '지금 백업 실행');
        try { const r = await api.admin.runBackup(); toast(`백업 완료: ${r.name} (Issue ${r.issues}건, ${fmtBytes(r.sizeBytes)})`, 'success'); load(); } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(run, false, '지금 백업 실행'); }
      });
      wrap.append(
        h('div', { class: 'chart-summary mb-16' }, h('div', { class: 'item' }, h('span', { class: 'k' }, '마지막 성공'), h('span', { class: 'v', style: { fontSize: '15px' } }, s.lastSuccessAt ? fmtDateTime(s.lastSuccessAt) : '-')), h('div', { class: 'item' }, h('span', { class: 'k' }, '마지막 실패'), h('span', { class: 'v', style: { fontSize: '15px', color: s.lastFailureAt ? '#C0281F' : undefined } }, s.lastFailureAt ? `${fmtDateTime(s.lastFailureAt)} · ${s.lastError || ''}` : '-')), h('div', { class: 'item' }, h('span', { class: 'k' }, '스케줄'), h('span', { class: 'v', style: { fontSize: '15px' } }, s.enabled ? `매일 ${String(s.schedule.hour).padStart(2, '0')}:${String(s.schedule.minute).padStart(2, '0')} · ${s.retainDays}일 보관` : '사용 안 함'))),
        run,
        h('div', { class: 'table-wrap mt-16 backup-list' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, '백업명'), h('th', {}, '생성'), h('th', {}, 'Issue'), h('th', {}, '크기'))), h('tbody', {}, ...(s.backups.length ? s.backups.slice(0, 30).map((b) => h('tr', {}, h('td', { class: 'mono' }, b.name), h('td', {}, fmtDateTime(b.createdAt)), h('td', {}, b.issues ?? '-'), h('td', {}, fmtBytes(b.sizeBytes)))) : [h('tr', {}, h('td', { colspan: 4, class: 'muted' }, '백업이 없습니다.'))])))),
        h('div', { class: 'small muted mt-8' }, '복구: 서비스 중지 → backup/<이름>/data, uploads를 운영 경로에 복사 → 서비스 시작. (docs/OPERATIONS_GUIDE.md)')
      );
    } catch (err) {
      clear(wrap).append(errorBox(err, load));
    }
    try {
      const hlt = await api.admin.health();
      clear(healthWrap).append(
        h('div', { class: 'chart-summary' }, h('div', { class: 'item' }, h('span', { class: 'k' }, 'Issue 파일'), h('span', { class: 'v' }, hlt.issues)), h('div', { class: 'item' }, h('span', { class: 'k' }, '손상 파일'), h('span', { class: 'v', style: { color: hlt.corrupted.length ? '#C0281F' : undefined } }, hlt.corrupted.length)), h('div', { class: 'item' }, h('span', { class: 'k' }, 'Sequence'), h('span', { class: 'v mono', style: { fontSize: '14px' } }, `DEF ${hlt.sequence.DEF} · IMP ${hlt.sequence.IMP} · INQ ${hlt.sequence.INQ}`)), h('div', { class: 'item' }, h('span', { class: 'k' }, 'Uptime'), h('span', { class: 'v', style: { fontSize: '14px' } }, `${Math.floor(hlt.uptimeSec / 3600)}h ${Math.floor((hlt.uptimeSec % 3600) / 60)}m`))),
        hlt.corrupted.length ? h('div', { class: 'error-box mt-16' }, h('div', {}, '손상된 Issue 파일이 있습니다. 해당 Issue는 쓰기가 차단됩니다. .bak 또는 백업에서 복구하세요: ', hlt.corrupted.map((c) => `${c.id} (${c.reason})`).join(', '))) : null,
        hlt.startupWarnings.length ? h('div', { class: 'info-box mt-16' }, hlt.startupWarnings.join(' / ')) : null,
        h('div', { class: 'small muted mt-8 mono' }, `data: ${hlt.dataDir}`)
      );
    } catch (err) {
      clear(healthWrap).append(errorBox(err));
    }
    try {
      const { items } = await api.admin.audit({ limit: 100 });
      clear(auditWrap).append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, '시각'), h('th', {}, 'Issue'), h('th', {}, 'Event'), h('th', {}, 'Actor'), h('th', {}, '내용'))), h('tbody', {}, ...items.map((e) => h('tr', {}, h('td', { class: 'nowrap' }, fmtDateTime(e.timestamp)), h('td', {}, h('a', { href: `#/issues/${e.issueId}` }, e.issueId)), h('td', { class: 'mono small' }, e.eventType), h('td', {}, e.actor ? e.actor.nameSnapshot : e.actorId), h('td', { class: 'small muted', style: { maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, e.comment || (e.after ? JSON.stringify(e.after) : ''))))))));
    } catch (err) {
      clear(auditWrap).append(errorBox(err));
    }
  }
  await load();
}
