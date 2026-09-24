/**
 * SCR-020 유형 선택 / SCR-021~023 등록. 1 Page Form, Sample 표시, Assignee/Priority 미입력.
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { h, clear, pageHead, setBusy, errorMessage, toast, fmtBytes, josa } from '../ui.js';

const DRAFT_KEY = 'dms.draft';

function field({ label, required, help, input, q }) {
  return h('div', { class: 'field' }, h('label', { class: q ? 'q' : '', for: input.id }, label, required ? h('span', { class: 'req' }, '*') : null), input, help ? h('div', { class: 'help' }, help) : null, h('div', { class: 'error-msg hidden' }));
}

function showError(wrapper, msg) {
  wrapper.classList.add('has-error');
  const m = wrapper.querySelector('.error-msg');
  m.textContent = msg;
  m.classList.remove('hidden');
}
function clearErrors(form) {
  form.querySelectorAll('.field').forEach((w) => {
    w.classList.remove('has-error');
    const m = w.querySelector('.error-msg');
    if (m) m.classList.add('hidden');
  });
}

function fileInput(files) {
  const list = h('div', { class: 'file-list' });
  const input = h('input', { type: 'file', multiple: true, class: 'hidden', id: 'attachments' });
  const op = store.operation || {};
  const help = h('div', { class: 'help' }, `허용: ${(op.allowedExtensions || []).join(', ')} · 최대 ${op.maxAttachmentMb || 20}MB`);
  const btn = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => input.click() }, '+ 파일 추가');
  const renderList = () => {
    clear(list);
    files.forEach((f, i) => list.append(h('div', { class: 'file-row' }, h('span', { class: 'name' }, f.name), h('span', { class: 'muted small' }, fmtBytes(f.size)), h('button', { type: 'button', class: 'btn btn-ghost btn-xs', onClick: () => { files.splice(i, 1); renderList(); } }, '삭제'))));
  };
  input.addEventListener('change', () => {
    for (const f of input.files) files.push(f);
    input.value = '';
    renderList();
  });
  return h('div', {}, btn, input, help, list);
}

async function uploadFiles(issueId, files) {
  if (!files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('file', f, f.name);
  const res = await api.issues.upload(issueId, fd);
  if (res.rejected && res.rejected.length) {
    toast(`일부 첨부가 거부되었습니다: ${res.rejected.map((r) => `${r.name} (${r.message})`).join(', ')}`, 'error', { timeout: 8000 });
  }
}

function successPanel(main, { id, title, type }, again) {
  clear(main).append(
    h(
      'div',
      { class: 'card success-panel', style: { margin: '40px auto' } },
      h('div', { style: { fontSize: '40px' } }, '✓'),
      h('div', { class: 'id' }, id),
      h('h2', { style: { margin: '0 0 6px' } }, `${josa({ DEFECT: '결함', IMPROVEMENT: '개선요청', INQUIRY: '문의' }[type], '이/가')} 등록되었습니다.`),
      h('p', { class: 'muted' }, title),
      h(
        'div',
        { class: 'actions mt-24' },
        h('a', { class: 'btn btn-primary', href: `#/issues/${id}` }, '상세 보기'),
        h('button', { class: 'btn btn-secondary', onClick: again }, '계속 등록'),
        h('a', { class: 'btn btn-secondary', href: '#/issues/list' }, '목록으로')
      )
    )
  );
}

export async function renderCreate(main, { params, navigate }) {
  const type = params.type;
  // 관리자가 환경/Priority 설정을 변경했을 수 있으므로 등록 화면 진입 시 최신 설정을 반영한다.
  try {
    await store.refreshProject({ silent: true });
  } catch {
    /* 기존 캐시 사용 */
  }
  if (!type) {
    main.append(
      pageHead('Issue 등록', '무엇을 등록하시겠어요?'),
      h(
        'div',
        { class: 'type-cards' },
        h('button', { class: 'type-card', onClick: () => navigate('/new/defect') }, h('div', { class: 'ico' }, '🐞'), h('h3', {}, '결함'), h('p', {}, '오류가 발생했어요')),
        h('button', { class: 'type-card', onClick: () => navigate('/new/improvement') }, h('div', { class: 'ico' }, '💡'), h('h3', {}, '개선요청'), h('p', {}, '더 좋게 개선하고 싶어요')),
        h('button', { class: 'type-card', onClick: () => navigate('/new/inquiry') }, h('div', { class: 'ico' }, '❓'), h('h3', {}, '문의'), h('p', {}, '확인이 필요한 내용이 있어요'))
      )
    );
    return;
  }
  if (type === 'defect') return renderDefectForm(main, navigate);
  if (type === 'improvement') return renderSimpleForm(main, navigate, 'IMPROVEMENT');
  if (type === 'inquiry') return renderSimpleForm(main, navigate, 'INQUIRY');
  navigate('/new', {}, { replace: true });
}

function renderDefectForm(main, navigate) {
  const files = [];
  const envs = store.activeEnvironments();
  const location = h('input', { class: 'input', id: 'location', placeholder: '예) 고객관리 > 고객정보 조회', maxlength: 200 });
  const env = h('select', { class: 'input', id: 'environmentId' }, h('option', { value: '' }, '발생 환경 선택'), ...envs.map((e) => h('option', { value: e.id }, e.displayName)));
  if (envs.length === 1) env.value = envs[0].id;
  const symptom = h('textarea', { class: 'input', id: 'symptom', rows: 4, placeholder: '예) 고객명을 입력하고 조회 버튼을 누르면 결과가 표시되지 않고 로딩 상태가 계속됩니다.' });
  const expected = h('textarea', { class: 'input', id: 'expectedResult', rows: 3, placeholder: '예) 조회조건에 해당하는 고객 목록이 표시되어야 합니다.' });

  // 재현 절차
  const stepsEl = h('div', { class: 'steps' });
  const stepSamples = ['고객관리 메뉴 접속', '고객정보 조회 선택', '고객명 입력', '조회 버튼 클릭', '로딩 화면에서 멈춤'];
  const steps = [];
  const renderSteps = () => {
    clear(stepsEl);
    steps.forEach((input, i) => {
      input.placeholder = `예) ${stepSamples[i] || '다음 동작'}`;
      stepsEl.append(h('div', { class: 'step-row' }, h('span', { class: 'num' }, `${i + 1}.`), input, h('button', { type: 'button', class: 'btn btn-ghost btn-xs', 'aria-label': '단계 삭제', disabled: steps.length <= 1, onClick: () => { steps.splice(i, 1); renderSteps(); } }, '✕')));
    });
  };
  const addStep = (value = '') => {
    const input = h('input', { class: 'input', maxlength: 500 });
    input.value = value;
    bindStep(input);
    steps.push(input);
    renderSteps();
    return input;
  };
  function bindStep(input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (steps.indexOf(input) === steps.length - 1) addStep();
        steps[Math.min(steps.indexOf(input) + 1, steps.length - 1)].focus();
      }
    });
    // 여러 줄 붙여넣기 → 줄마다 단계로 분리(앞의 "1." 번호 제거)
    input.addEventListener('paste', (e) => {
      const txt = (e.clipboardData || window.clipboardData).getData('text');
      if (!txt || !/[\r\n]/.test(txt.trim())) return;
      e.preventDefault();
      const lines = txt.split(/\r?\n/).map((l) => l.replace(/^\s*\d{1,3}[.)]\s+/, '').trim()).filter(Boolean);
      if (!lines.length) return;
      const idx = steps.indexOf(input);
      input.value = lines[0];
      let at = idx;
      for (const l of lines.slice(1)) {
        const next = h('input', { class: 'input', maxlength: 500 });
        next.value = l;
        bindStep(next);
        steps.splice(++at, 0, next);
      }
      // 뒤따르는 빈 단계 제거
      for (let i = steps.length - 1; i > at; i--) if (!steps[i].value.trim()) steps.splice(i, 1);
      renderSteps();
      toast(`재현 절차를 ${lines.length}단계로 나누어 입력했습니다.`, 'info');
    });
  }
  addStep();
  addStep();
  addStep();

  const wraps = {
    location: field({ label: '1. 어디에서 발생했나요?', required: true, input: location, q: true, help: '화면/메뉴/기능 위치' }),
    environmentId: field({ label: '발생 환경', required: true, input: env }),
    symptom: field({ label: '2. 어떤 문제가 발생했나요?', required: true, input: symptom, q: true }),
    reproductionSteps: h('div', { class: 'field' }, h('label', { class: 'q' }, '3. 어떻게 하면 다시 발생하나요?', h('span', { class: 'req' }, '*')), stepsEl, h('div', {}, h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => addStep().focus() }, '+ 단계 추가')), h('div', { class: 'help' }, '순서대로 한 줄씩 입력. 1단계 이상 필수'), h('div', { class: 'error-msg hidden' })),
    expectedResult: field({ label: '4. 정상이라면 어떻게 되어야 하나요?', required: true, input: expected, q: true }),
    attachments: h('div', { class: 'field' }, h('label', { class: 'q' }, '5. 화면 캡처 / 증적'), fileInput(files)),
  };
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, '결함 등록');
  const errTop = h('div', { class: 'error-box hidden mb-16' });
  const form = h('form', { class: 'create-form', novalidate: true }, errTop, ...Object.values(wraps), h('div', { class: 'form-actions' }, h('a', { class: 'btn btn-secondary btn-lg', href: '#/new' }, '취소'), submitBtn));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    errTop.classList.add('hidden');
    const data = {
      location: location.value.trim(),
      environmentId: env.value,
      symptom: symptom.value.trim(),
      reproductionSteps: steps.map((s) => s.value.trim()).filter(Boolean),
      expectedResult: expected.value.trim(),
    };
    let bad = false;
    if (!data.location) { showError(wraps.location, '발생 위치를 입력해주세요.'); bad = true; }
    if (!data.environmentId) { showError(wraps.environmentId, '발생 환경을 선택해주세요.'); bad = true; }
    if (data.symptom.length < 5) { showError(wraps.symptom, '발생 현상을 5자 이상 입력해주세요.'); bad = true; }
    if (data.reproductionSteps.length === 0) { showError(wraps.reproductionSteps, '재현 절차를 1단계 이상 입력해주세요.'); bad = true; }
    if (data.expectedResult.length < 5) { showError(wraps.expectedResult, '기대 결과를 5자 이상 입력해주세요.'); bad = true; }
    if (bad) {
      form.querySelector('.has-error input, .has-error textarea, .has-error select')?.focus();
      return;
    }
    setBusy(submitBtn, true, '결함 등록');
    try {
      const res = await api.issues.createDefect(data);
      try {
        await uploadFiles(res.id, files);
      } catch (err) {
        toast(`Issue는 등록되었으나 첨부 업로드에 실패했습니다: ${errorMessage(err)}`, 'error', { timeout: 7000 });
      }
      toast(`${res.id} 결함이 등록되었습니다.`, 'success');
      successPanel(main, { ...res, type: 'DEFECT' }, () => { clear(main); renderDefectForm(main, navigate); });
    } catch (err) {
      const f = err.details && err.details.field;
      if (f && wraps[f]) showError(wraps[f], errorMessage(err));
      errTop.textContent = `저장에 실패했습니다. 입력한 내용은 유지됩니다. (${errorMessage(err)})`;
      errTop.classList.remove('hidden');
      window.scrollTo(0, 0);
    } finally {
      setBusy(submitBtn, false, '결함 등록');
    }
  });

  main.append(pageHead('결함 등록', '문제를 다른 사람이 다시 재현할 수 있도록 간단하게 작성해주세요. 조치자와 Priority는 조치 담당자가 지정합니다.'), h('div', { class: 'card create-form' }, h('div', { class: 'card-body' }, form)));
  setTimeout(() => location.focus(), 0);
}

function renderSimpleForm(main, navigate, type) {
  const files = [];
  const isImp = type === 'IMPROVEMENT';
  const target = h('input', { class: 'input', id: 'target', placeholder: '예) 고객정보 조회 화면', maxlength: 200 });
  const body = h('textarea', { class: 'input', id: 'body', rows: 5, placeholder: isImp ? '예) 상태별 필터를 상단에서 바로 선택할 수 있도록 개선' : '예) 탈퇴 고객도 조회 대상에 포함되는지 확인이 필요합니다.' });
  const reason = isImp ? h('textarea', { class: 'input', id: 'reason', rows: 3, placeholder: '예) 결함이 많아지면 원하는 고객을 찾기 어려움' }) : null;
  const wraps = {
    target: field({ label: isImp ? '개선 대상' : '문의 대상', required: true, input: target, q: true }),
    body: field({ label: isImp ? '어떻게 개선했으면 좋겠나요?' : '문의 내용', required: true, input: body, q: true }),
    reason: reason ? field({ label: '왜 개선이 필요한가요?', input: reason, q: true }) : null,
    attachments: h('div', { class: 'field' }, h('label', { class: 'q' }, '참고자료'), fileInput(files)),
  };
  const label = isImp ? '개선요청 등록' : '문의 등록';
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, label);
  const errTop = h('div', { class: 'error-box hidden mb-16' });
  const form = h('form', { class: 'create-form', novalidate: true }, errTop, ...Object.values(wraps).filter(Boolean), h('div', { class: 'form-actions' }, h('a', { class: 'btn btn-secondary btn-lg', href: '#/new' }, '취소'), submitBtn));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    errTop.classList.add('hidden');
    const data = isImp
      ? { target: target.value.trim(), request: body.value.trim(), reason: reason.value.trim() }
      : { target: target.value.trim(), question: body.value.trim() };
    let bad = false;
    if (!data.target) { showError(wraps.target, `${isImp ? '개선' : '문의'} 대상을 입력해주세요.`); bad = true; }
    if ((isImp ? data.request : data.question).length < 5) { showError(wraps.body, '내용을 5자 이상 입력해주세요.'); bad = true; }
    if (bad) return;
    setBusy(submitBtn, true, label);
    try {
      const res = isImp ? await api.issues.createImprovement(data) : await api.issues.createInquiry(data);
      try {
        await uploadFiles(res.id, files);
      } catch (err) {
        toast(`Issue는 등록되었으나 첨부 업로드에 실패했습니다: ${errorMessage(err)}`, 'error', { timeout: 7000 });
      }
      toast(`${res.id} ${josa(isImp ? '개선요청' : '문의', '이/가')} 등록되었습니다.`, 'success');
      successPanel(main, { ...res, type }, () => { clear(main); renderSimpleForm(main, navigate, type); });
    } catch (err) {
      const f = err.details && err.details.field;
      const map = { target: 'target', request: 'body', question: 'body', reason: 'reason' };
      if (f && wraps[map[f]]) showError(wraps[map[f]], errorMessage(err));
      errTop.textContent = `저장에 실패했습니다. 입력한 내용은 유지됩니다. (${errorMessage(err)})`;
      errTop.classList.remove('hidden');
    } finally {
      setBusy(submitBtn, false, label);
    }
  });
  main.append(pageHead(label, isImp ? '개선하고 싶은 내용을 간단히 적어주세요.' : '확인이 필요한 내용을 적어주세요.'), h('div', { class: 'card create-form' }, h('div', { class: 'card-body' }, form)));
  setTimeout(() => target.focus(), 0);
}

void DRAFT_KEY;
