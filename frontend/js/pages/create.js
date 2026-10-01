/**
 * SCR-020 유형 선택 / SCR-021~023 등록. 1 Page Form, Sample 표시, Assignee/Priority 미입력.
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { h, clear, pageHead, setBusy, errorMessage, toast, fmtBytes, josa, errorBox, loadingState, icon } from '../ui.js';
import { createRichTextEditor, toDisplayHtml } from '../richText.js';

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
  const dzErr = h('div', { class: 'dz-error hidden' });
  const renderList = () => {
    clear(list);
    files.forEach((f, i) => list.append(h('div', { class: 'file-row' }, h('span', { class: 'name' }, f.name), h('span', { class: 'muted small' }, fmtBytes(f.size)), h('button', { type: 'button', class: 'btn btn-ghost btn-xs', onClick: () => { files.splice(i, 1); renderList(); } }, '삭제'))));
  };
  input.addEventListener('change', () => {
    for (const f of input.files) files.push(f);
    input.value = '';
    renderList();
  });
  const drop = h(
    'div',
    { class: 'dropzone-area', onClick: () => input.click(), onDragover: (e) => { e.preventDefault(); drop.classList.add('drag'); }, onDragleave: () => drop.classList.remove('drag'), onDrop: (e) => { e.preventDefault(); drop.classList.remove('drag'); for (const f of e.dataTransfer.files) files.push(f); renderList(); } },
    icon('paperclip', { size: 18, cls: 'dz-ico' }),
    h('div', { class: 'dz-text' }, '파일을 끌어오거나 선택하세요'),
    h('div', { class: 'dz-help' }, `최대 ${op.maxAttachmentMb || 20}MB`, h('button', { type: 'button', class: 'dz-ext-toggle', onClick: (e) => { e.stopPropagation(); e.currentTarget.nextElementSibling.classList.toggle('hidden'); } }, '허용 형식 보기'), h('span', { class: 'dz-ext hidden' }, (op.allowedExtensions || []).join(', ')))
  );
  const zone = h('div', { class: 'dropzone' }, drop, input, dzErr, list);
  zone.dzErr = dzErr;
  return zone;
}

/** 리치텍스트 안의 pending(blob:) 이미지를 "[이미지 첨부 예정]" 자리표시자로 치환한다.
 * Issue 생성 자체는 issueId가 있어야 첨부 업로드가 가능해서, 최초 저장 시 이미지를 실제 URL로 보낼 수 없다.
 * 이미지를 그냥 제거하면 "이미지만 붙여넣고 설명은 안 적은" 경우 서버의 최소 글자수 검증에 걸릴 수 있어
 * 자리표시자 텍스트로 남겨 최소 길이를 만족시키고, 업로드 완료 후 실제 이미지로 재치환한다. */
function placeholderForPendingImages(html) {
  return html.replace(/<img\b[^>]*data-pending-id="[^"]*"[^>]*>/g, '[이미지 첨부 예정]');
}

/** 여러 리치텍스트 필드에 걸친 pending 이미지를 한 Map(pendingId -> {file})으로 모아 순서대로 업로드하고,
 * {idToUrl, revision(마지막 업로드 후 최신값)}을 반환한다. idToUrl은 각 에디터의 resolvePendingImages에 그대로 넘기면
 * 해당 에디터 DOM 안의 pending 이미지만 알아서 치환된다. */
async function uploadPendingImages(issueId, pendingImages, startRevision) {
  const idToUrl = new Map();
  let revision = startRevision;
  for (const [pendingId, { file }] of pendingImages) {
    const fd = new FormData();
    fd.append('file', file, file.name || `pasted-${pendingId}.png`);
    const res = await api.issues.upload(issueId, fd);
    revision = res.revision;
    const att = res.attachments && res.attachments[0];
    if (att) idToUrl.set(pendingId, `/api/issues/${issueId}/attachments/${att.attachmentId}?inline=1`);
  }
  return { idToUrl, revision };
}

/** 반환값: 업로드가 실제로 일어났으면 최신 revision, 업로드할 파일이 없으면 undefined. */
async function uploadFiles(issueId, files, dzErr) {
  if (!files.length) return undefined;
  const fd = new FormData();
  for (const f of files) fd.append('file', f, f.name);
  const res = await api.issues.upload(issueId, fd);
  if (res.rejected && res.rejected.length) {
    const msg = `업로드 실패: ${res.rejected.map((r) => `${r.name} (${r.message})`).join(', ')}`;
    if (dzErr) {
      dzErr.textContent = msg;
      dzErr.classList.remove('hidden');
    }
    toast(msg, 'error', { timeout: 8000 });
  }
  return res.revision;
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

export async function renderCreate(main, { params, query, navigate }) {
  const type = params.type;
  // 관리자가 환경/Priority 설정을 변경했을 수 있으므로 등록 화면 진입 시 최신 설정을 반영한다.
  try {
    await store.refreshProject({ silent: true });
  } catch {
    /* 기존 캐시 사용 */
  }
  if (!type) {
    main.append(
      pageHead('Issue 유형 선택', '등록할 Issue의 유형을 선택하세요.'),
      h(
        'div',
        { class: 'type-cards' },
        h(
          'button',
          { class: 'type-card', onClick: () => navigate('/new/defect') },
          h('div', { class: 'ico' }, icon('bug', { size: 18 })),
          h('h3', {}, '결함'),
          h('p', {}, '시스템/업무 오류 등록'),
          h('p', { class: 'ex' }, '예) 조회 버튼 클릭 시 오류 발생')
        ),
        h(
          'button',
          { class: 'type-card', onClick: () => navigate('/new/improvement') },
          h('div', { class: 'ico' }, icon('bulb', { size: 18 })),
          h('h3', {}, '개선요청'),
          h('p', {}, '개선 요청 등록'),
          h('p', { class: 'ex' }, '예) 필터를 상단에 노출해주세요')
        ),
        h(
          'button',
          { class: 'type-card', onClick: () => navigate('/new/inquiry') },
          h('div', { class: 'ico' }, icon('question', { size: 18 })),
          h('h3', {}, '문의'),
          h('p', {}, '문의 등록'),
          h('p', { class: 'ex' }, '예) 처리 기준이 궁금합니다')
        )
      )
    );
    return;
  }
  const draftId = query && query.draftId;
  let draft = null;
  if (draftId) {
    main.append(pageHead('임시저장 이어 작성', ''), loadingState(4));
    try {
      const { issue } = await api.issues.get(draftId);
      if (issue.status !== 'DRAFT') {
        toast('이미 정식 등록된 Issue입니다.', 'info');
        return navigate(`/issues/${draftId}`, {}, { replace: true });
      }
      draft = issue;
    } catch (err) {
      clear(main).append(pageHead('임시저장 이어 작성', ''), errorBox(err));
      return;
    }
    clear(main);
  }
  if (type === 'defect') return renderDefectForm(main, navigate, draft);
  if (type === 'improvement') return renderSimpleForm(main, navigate, 'IMPROVEMENT', draft);
  if (type === 'inquiry') return renderSimpleForm(main, navigate, 'INQUIRY', draft);
  navigate('/new', {}, { replace: true });
}

function renderDefectForm(main, navigate, draft) {
  const files = [];
  const pendingImages = new Map(); // pendingId -> { file }. symptom에 붙여넣은 이미지는 제출 시 일괄 업로드 후 URL로 치환한다.
  const envs = store.activeEnvironments();
  const location = h('input', { class: 'input', id: 'location', placeholder: '예) 고객관리 > 고객정보 조회', maxlength: 200 });
  const env = h('select', { class: 'input', id: 'environmentId' }, h('option', { value: '' }, '발생 환경 선택'), ...envs.map((e) => h('option', { value: e.id }, e.displayName)));
  if (envs.length === 1) env.value = envs[0].id;
  const symptom = createRichTextEditor({
    id: 'symptom',
    placeholder: '예) 고객명을 입력하고 조회 버튼을 누르면 결과가 표시되지 않고 로딩 상태가 계속됩니다. 화면 캡처는 Ctrl+V로 바로 붙여넣을 수 있습니다.',
    initialHtml: draft ? toDisplayHtml(draft.symptom || '') : '',
    onImagePending: ({ pendingId, file }) => pendingImages.set(pendingId, { file }),
  });
  const expected = createRichTextEditor({
    id: 'expectedResult',
    placeholder: '예) 조회조건에 해당하는 고객 목록이 표시되어야 합니다. 화면 캡처는 Ctrl+V로 바로 붙여넣을 수 있습니다.',
    initialHtml: draft ? toDisplayHtml(draft.expectedResult || '') : '',
    onImagePending: ({ pendingId, file }) => pendingImages.set(pendingId, { file }),
  });
  if (draft) {
    location.value = draft.location || '';
    if (draft.environment) env.value = draft.environment.id;
  }

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
  if (draft && draft.reproductionSteps && draft.reproductionSteps.length) {
    for (const s of draft.reproductionSteps) addStep(s.text);
  } else {
    addStep();
  }

  const dz = fileInput(files);
  const wraps = {
    symptom: field({ label: '발생 현상', required: true, input: symptom, help: '어떤 문제가 발생했는지 적어주세요. 화면 캡처를 복사한 뒤 Ctrl+V로 바로 붙여넣을 수 있습니다.' }),
    location: field({ label: '발생 위치', required: true, input: location, help: '화면/메뉴/기능 위치' }),
    environmentId: field({ label: '발생 환경', required: true, input: env }),
    reproductionSteps: h('div', { class: 'field' }, h('label', {}, '재현 절차', h('span', { class: 'req' }, '*')), stepsEl, h('div', {}, h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => addStep().focus() }, '+ 단계 추가')), h('div', { class: 'help' }, '순서대로 한 줄씩 입력. 1단계 이상 필수'), h('div', { class: 'error-msg hidden' })),
    expectedResult: field({ label: '기대 결과', required: true, input: expected, help: '정상이라면 어떻게 동작해야 하는지 적어주세요. 화면 캡처를 복사한 뒤 Ctrl+V로 바로 붙여넣을 수 있습니다.' }),
    attachments: h('div', { class: 'field' }, h('label', {}, '첨부파일 / 증적'), dz),
  };
  const submitLabel = draft ? '등록 완료' : '결함 등록';
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, submitLabel);
  const draftBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-lg' }, '임시저장');
  let draftId = draft ? draft.id : null;
  let draftRevision = draft ? draft.revision : null;
  const errTop = h('div', { class: 'error-box hidden mb-16' });
  const form = h(
    'form',
    { class: 'create-form', novalidate: true },
    errTop,
    ...Object.values(wraps),
    h('div', { class: 'form-actions' }, h('a', { class: 'btn btn-secondary btn-lg', href: '#/new' }, '취소'), draftBtn, submitBtn)
  );

  // 임시저장은 서버에 blob: 이미지를 저장할 수 없으므로(sanitizer가 거부) pending 이미지를 뺀 텍스트만 보낸다.
  const collectForDraft = () => ({
    location: location.value.trim(),
    environmentId: env.value,
    symptom: symptom.rte.getValue(),
    reproductionSteps: steps.map((s) => s.value.trim()).filter(Boolean),
    expectedResult: expected.rte.getValue(),
  });

  draftBtn.addEventListener('click', async () => {
    setBusy(draftBtn, true, '임시저장');
    try {
      if (pendingImages.size) toast('임시저장에는 붙여넣은 이미지가 첨부되지 않습니다. 등록 시 함께 저장됩니다.', 'info', { timeout: 6000 });
      if (draftId) {
        const res = await api.issues.updateDraft(draftId, draftRevision, collectForDraft());
        draftRevision = res.revision;
      } else {
        const res = await api.issues.createDraft('DEFECT', collectForDraft());
        draftId = res.id;
        draftRevision = res.revision;
        navigate(`/new/defect`, { draftId }, { replace: true });
      }
      toast('임시저장했습니다. "내가 등록"에서 이어 작성할 수 있습니다.', 'success');
    } catch (err) {
      toast(`임시저장에 실패했습니다. (${errorMessage(err)})`, 'error');
    } finally {
      setBusy(draftBtn, false, '임시저장');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    errTop.classList.add('hidden');
    const symptomHtml = symptom.rte.getValue();
    const expectedHtml = expected.rte.getValue();
    const data = {
      location: location.value.trim(),
      environmentId: env.value,
      symptom: symptomHtml,
      reproductionSteps: steps.map((s) => s.value.trim()).filter(Boolean),
      expectedResult: expectedHtml,
    };
    let bad = false;
    if (!data.location) { showError(wraps.location, '발생 위치를 입력해주세요.'); bad = true; }
    if (!data.environmentId) { showError(wraps.environmentId, '발생 환경을 선택해주세요.'); bad = true; }
    if (symptom.rte.isEmpty()) { showError(wraps.symptom, '발생 현상을 입력해주세요.'); bad = true; }
    if (data.reproductionSteps.length === 0) { showError(wraps.reproductionSteps, '재현 절차를 1단계 이상 입력해주세요.'); bad = true; }
    if (expected.rte.isEmpty()) { showError(wraps.expectedResult, '기대 결과를 입력해주세요.'); bad = true; }
    if (bad) {
      form.querySelector('.has-error input, .has-error textarea, .has-error select, .rte-editor')?.focus();
      return;
    }
    setBusy(submitBtn, true, submitLabel);
    try {
      // symptom/expectedResult에 붙여넣은 이미지는 issueId가 생기기 전까지 blob: 상태라 그대로 저장할 수 없다.
      // 먼저 자리표시자 텍스트로 생성/제출한 뒤, 첨부 업로드 → 각 에디터의 실제 이미지로 치환 → 재저장하는 순서로 처리한다.
      const hasPendingImages = symptom.rte.hasPendingImages() || expected.rte.hasPendingImages();
      const dataForCreate = hasPendingImages ? { ...data, symptom: placeholderForPendingImages(symptomHtml), expectedResult: placeholderForPendingImages(expectedHtml) } : data;
      const res = draftId
        ? await api.issues.action(draftId, 'submit', { expectedRevision: draftRevision, changes: dataForCreate })
        : await api.issues.createDefect(dataForCreate);
      let latestRevision = res.revision;
      try {
        const up = await uploadFiles(res.id, files, dz.dzErr);
        if (up) latestRevision = up;
      } catch (err) {
        toast(`Issue는 등록되었으나 첨부 업로드에 실패했습니다: ${errorMessage(err)}`, 'error', { timeout: 7000 });
      }
      if (hasPendingImages) {
        try {
          const { idToUrl, revision } = await uploadPendingImages(res.id, pendingImages, latestRevision);
          symptom.rte.resolvePendingImages(idToUrl);
          expected.rte.resolvePendingImages(idToUrl);
          await api.issues.update(res.id, revision, { symptom: symptom.rte.getValue(), expectedResult: expected.rte.getValue() });
        } catch (err) {
          toast(`Issue는 등록되었으나 붙여넣은 이미지 반영에 실패했습니다: ${errorMessage(err)}`, 'error', { timeout: 7000 });
        }
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
      setBusy(submitBtn, false, submitLabel);
    }
  });

  main.append(
    pageHead(draft ? '임시저장 이어 작성 · 결함' : '결함 등록', '재현 가능한 정보만 입력하세요. 조치자와 우선순위는 담당자가 지정합니다.'),
    h('div', { class: 'card create-form' }, h('div', { class: 'card-body' }, form))
  );
  setTimeout(() => location.focus(), 0);
}

function renderSimpleForm(main, navigate, type, draft) {
  const files = [];
  const pendingImages = new Map(); // pendingId -> { file }. body에 붙여넣은 이미지는 제출 시 일괄 업로드 후 URL로 치환한다.
  const isImp = type === 'IMPROVEMENT';
  const target = h('input', { class: 'input', id: 'target', placeholder: '예) 고객정보 조회 화면', maxlength: 200 });
  const bodyRaw = (isImp ? draft?.request : draft?.question) || '';
  const body = createRichTextEditor({
    id: 'body',
    placeholder: isImp ? '예) 상태별 필터를 상단에서 바로 선택할 수 있도록 개선. 화면 캡처는 Ctrl+V로 바로 붙여넣을 수 있습니다.' : '예) 탈퇴 고객도 조회 대상에 포함되는지 확인이 필요합니다. 화면 캡처는 Ctrl+V로 바로 붙여넣을 수 있습니다.',
    initialHtml: draft ? toDisplayHtml(bodyRaw) : '',
    onImagePending: ({ pendingId, file }) => pendingImages.set(pendingId, { file }),
  });
  const reason = isImp ? h('textarea', { class: 'input', id: 'reason', rows: 3, placeholder: '예) 결함이 많아지면 원하는 고객을 찾기 어려움' }) : null;
  if (draft) {
    target.value = draft.target || '';
    if (reason) reason.value = draft.reason || '';
  }
  const dz = fileInput(files);
  const wraps = {
    target: field({ label: isImp ? '개선 대상' : '문의 대상', required: true, input: target }),
    body: field({ label: isImp ? '개선 내용' : '문의 내용', required: true, input: body, help: '화면 캡처를 복사한 뒤 Ctrl+V로 바로 붙여넣을 수 있습니다.' }),
    reason: reason ? field({ label: '개선 필요 사유', input: reason }) : null,
    attachments: h('div', { class: 'field' }, h('label', {}, '첨부파일 / 증적'), dz),
  };
  const label = isImp ? '개선요청 등록' : '문의 등록';
  const submitLabel = draft ? '등록 완료' : label;
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, submitLabel);
  const draftBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-lg' }, '임시저장');
  let draftId = draft ? draft.id : null;
  let draftRevision = draft ? draft.revision : null;
  const errTop = h('div', { class: 'error-box hidden mb-16' });
  const form = h(
    'form',
    { class: 'create-form', novalidate: true },
    errTop,
    ...Object.values(wraps).filter(Boolean),
    h('div', { class: 'form-actions' }, h('a', { class: 'btn btn-secondary btn-lg', href: '#/new' }, '취소'), draftBtn, submitBtn)
  );

  // 임시저장은 서버에 blob: 이미지를 저장할 수 없으므로(sanitizer가 거부) pending 이미지를 뺀 텍스트만 보낸다.
  const collect = () =>
    isImp
      ? { target: target.value.trim(), request: body.rte.getValue(), reason: reason.value.trim() }
      : { target: target.value.trim(), question: body.rte.getValue() };

  draftBtn.addEventListener('click', async () => {
    setBusy(draftBtn, true, '임시저장');
    try {
      if (draftId) {
        const res = await api.issues.updateDraft(draftId, draftRevision, collect());
        draftRevision = res.revision;
      } else {
        const res = await api.issues.createDraft(type, collect());
        draftId = res.id;
        draftRevision = res.revision;
        navigate(`/new/${isImp ? 'improvement' : 'inquiry'}`, { draftId }, { replace: true });
      }
      toast('임시저장했습니다. "내가 등록"에서 이어 작성할 수 있습니다.', 'success');
    } catch (err) {
      toast(`임시저장에 실패했습니다. (${errorMessage(err)})`, 'error');
    } finally {
      setBusy(draftBtn, false, '임시저장');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    errTop.classList.add('hidden');
    const bodyHtml = body.rte.getValue();
    const data = collect();
    let bad = false;
    if (!data.target) { showError(wraps.target, `${isImp ? '개선' : '문의'} 대상을 입력해주세요.`); bad = true; }
    if (body.rte.isEmpty()) { showError(wraps.body, '내용을 입력해주세요.'); bad = true; }
    if (bad) {
      form.querySelector('.has-error input, .has-error textarea, .rte-editor')?.focus();
      return;
    }
    setBusy(submitBtn, true, submitLabel);
    try {
      // body에 붙여넣은 이미지는 issueId가 생기기 전까지 blob: 상태라 그대로 저장할 수 없다.
      // 먼저 자리표시자 텍스트로 생성/제출한 뒤, 첨부 업로드 → 에디터의 실제 이미지로 치환 → 재저장하는 순서로 처리한다.
      const hasPendingImages = body.rte.hasPendingImages();
      const bodyField = isImp ? 'request' : 'question';
      const dataForCreate = hasPendingImages ? { ...data, [bodyField]: placeholderForPendingImages(bodyHtml) } : data;
      const res = draftId
        ? await api.issues.action(draftId, 'submit', { expectedRevision: draftRevision, changes: dataForCreate })
        : isImp
          ? await api.issues.createImprovement(dataForCreate)
          : await api.issues.createInquiry(dataForCreate);
      let latestRevision = res.revision;
      try {
        const up = await uploadFiles(res.id, files, dz.dzErr);
        if (up) latestRevision = up;
      } catch (err) {
        toast(`Issue는 등록되었으나 첨부 업로드에 실패했습니다: ${errorMessage(err)}`, 'error', { timeout: 7000 });
      }
      if (hasPendingImages) {
        try {
          const { idToUrl, revision } = await uploadPendingImages(res.id, pendingImages, latestRevision);
          body.rte.resolvePendingImages(idToUrl);
          await api.issues.update(res.id, revision, { [bodyField]: body.rte.getValue() });
        } catch (err) {
          toast(`Issue는 등록되었으나 붙여넣은 이미지 반영에 실패했습니다: ${errorMessage(err)}`, 'error', { timeout: 7000 });
        }
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
      setBusy(submitBtn, false, submitLabel);
    }
  });
  main.append(
    pageHead(draft ? `임시저장 이어 작성 · ${isImp ? '개선요청' : '문의'}` : label, isImp ? '필요한 내용만 간단히 입력하세요.' : '확인이 필요한 내용만 입력하세요.'),
    h('div', { class: 'card create-form' }, h('div', { class: 'card-body' }, form))
  );
  setTimeout(() => target.focus(), 0);
}
