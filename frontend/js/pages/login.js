/**
 * SCR-001 사용자 시작 / SCR-002 최초 사용자 등록. 비밀번호 없음(사번 기반 식별).
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { h, clear, setBusy, errorMessage, initials } from '../ui.js';

export async function renderLogin(root, { onLogin }) {
  const p = store.project || {};
  const last = store.lastEmployeeId();
  let lastUser = null;
  if (last) {
    try {
      // 이 브라우저가 마지막으로 사용한 사번 "본인" 정보만 조회한다. 타인 목록은 요청하지 않는다.
      const { users } = await api.users.recent(last);
      lastUser = users[0] || null;
    } catch {
      lastUser = null;
    }
  }

  const card = h('div', { class: 'login-card' });
  const errEl = h('div', { class: 'error small mt-8 hidden' });
  const showErr = (msg) => {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  };

  async function start(employeeId, btn) {
    errEl.classList.add('hidden');
    setBusy(btn, true);
    try {
      const { user } = await api.session.start(employeeId);
      await store.loadSession();
      store.setUser(user);
      onLogin();
    } catch (err) {
      showErr(errorMessage(err));
    } finally {
      setBusy(btn, false);
    }
  }

  function viewStart() {
    clear(card);
    card.append(h('h2', {}, '사용자 시작'), h('p', { class: 'hint' }, '폐쇄망 내부 사용자 식별용입니다. 비밀번호를 사용하지 않습니다.'));
    if (lastUser) {
      const btn = h('button', { class: 'btn btn-primary btn-block btn-lg', onClick: (e) => start(lastUser.employeeId, e.currentTarget) }, '이 사용자로 시작');
      card.append(
        h('div', { class: 'user-pick' }, h('div', { class: 'avatar' }, initials(lastUser.name)), h('div', {}, h('div', { style: { fontWeight: 600 } }, lastUser.name), h('div', { class: 'small', style: { color: '#B8CBE6' } }, lastUser.team, lastUser.isQualityAdmin ? ' · Quality Admin' : ''))),
        btn,
        h('button', { class: 'btn btn-secondary btn-block mt-8', onClick: viewChange }, '사용자 변경')
      );
    } else {
      viewChange(true);
      return;
    }
    card.append(errEl, h('div', { class: 'divider' }), h('div', { class: 'small', style: { color: '#B8CBE6', marginBottom: '8px' } }, '처음 사용하시나요?'), h('button', { class: 'btn btn-secondary btn-block', onClick: viewRegister }, '신규 사용자 등록'));
  }

  function viewChange(initial = false) {
    clear(card);
    // 본인 사번을 직접 입력해야만 진입할 수 있다. 등록된 타 사용자 이름을 목록으로 노출하지 않는다
    // (공용 PC에서 사번을 모르는 채로 다른 사람 이름을 클릭해 접근하는 것을 방지).
    card.append(h('h2', {}, '사용자 선택'), h('p', { class: 'hint' }, '본인 사번을 입력해주세요.'));
    const input = h('input', { class: 'input', placeholder: '사번 입력', autocomplete: 'off' });
    const btn = h('button', { class: 'btn btn-primary btn-block btn-lg mt-8', onClick: (e) => (input.value.trim() ? start(input.value.trim(), e.currentTarget) : showErr('사번을 입력해주세요.')) }, '시작');
    input.addEventListener('keydown', (e) => e.key === 'Enter' && btn.click());
    card.append(h('div', { class: 'field' }, h('label', {}, '사번'), input), btn, errEl);
    if (!initial && lastUser) card.append(h('button', { class: 'btn btn-ghost btn-block mt-8', style: { color: '#B8CBE6' }, onClick: viewStart }, '← 돌아가기'));
    card.append(h('div', { class: 'divider' }), h('div', { class: 'small', style: { color: '#B8CBE6', marginBottom: '8px' } }, '처음 사용하시나요?'), h('button', { class: 'btn btn-secondary btn-block', onClick: viewRegister }, '신규 사용자 등록'));
    setTimeout(() => input.focus(), 0);
  }

  function viewRegister() {
    clear(card);
    card.append(h('h2', {}, '최초 사용자 등록'), h('p', { class: 'hint' }, '사번·이름·소속만 입력하면 바로 시작합니다.'));
    const f = {
      employeeId: h('input', { class: 'input', placeholder: '예) 12345678', autocomplete: 'off' }),
      name: h('input', { class: 'input', placeholder: '예) 김성훈' }),
      team: h('input', { class: 'input', placeholder: '예) AX리스크/품질팀' }),
    };
    const fields = { employeeId: '사번', name: '이름', team: '소속' };
    const wraps = {};
    for (const [k, label] of Object.entries(fields)) {
      wraps[k] = h('div', { class: 'field' }, h('label', {}, label, h('span', { class: 'req' }, '*')), f[k], h('div', { class: 'error-msg hidden' }));
      card.append(wraps[k]);
    }
    const btn = h('button', { class: 'btn btn-primary btn-block btn-lg', onClick: submit }, '시작');
    async function submit() {
      errEl.classList.add('hidden');
      Object.values(wraps).forEach((w) => { w.classList.remove('has-error'); w.querySelector('.error-msg').classList.add('hidden'); });
      const data = { employeeId: f.employeeId.value.trim(), name: f.name.value.trim(), team: f.team.value.trim() };
      let bad = false;
      for (const k of Object.keys(fields)) {
        if (!data[k]) {
          wraps[k].classList.add('has-error');
          const m = wraps[k].querySelector('.error-msg');
          m.textContent = `${fields[k]}을(를) 입력해주세요.`;
          m.classList.remove('hidden');
          bad = true;
        }
      }
      if (bad) return;
      setBusy(btn, true);
      try {
        const { user } = await api.users.register(data);
        await store.loadSession();
        store.setUser(user);
        onLogin();
      } catch (err) {
        const field = err.details && err.details.field;
        if (field && wraps[field]) {
          wraps[field].classList.add('has-error');
          const m = wraps[field].querySelector('.error-msg');
          m.textContent = errorMessage(err);
          m.classList.remove('hidden');
        } else showErr(errorMessage(err));
      } finally {
        setBusy(btn, false);
      }
    }
    f.team.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    card.append(btn, errEl, h('button', { class: 'btn btn-ghost btn-block mt-8', style: { color: '#B8CBE6' }, onClick: () => (lastUser ? viewStart() : viewChange(true)) }, '← 취소'));
    setTimeout(() => f.employeeId.focus(), 0);
  }

  const brand = h(
    'div',
    { class: 'login-brand' },
    h('h1', {}, h('span', { class: 'ring' }), 'KT AI Agent'),
    h('div', { class: 'sub' }, '프로젝트 품질 · 결함관리 서비스'),
    h('div', { class: 'msg' }, '함께 만드는 더 나은 품질,', h('br'), '빠르게 등록하고 끝까지 추적합니다'),
    h('div', { class: 'mt-24 small', style: { color: '#9DB4D3' } }, `${p.customerName || ''} ${p.customerName ? '|' : ''} ${p.projectName || ''}`)
  );
  clear(root).append(
    h('div', { class: 'login' }, h('div', { class: 'login-wrap' }, brand, card), h('div', { class: 'login-foot' }, h('img', { src: '/assets/kt-logo.png', alt: 'KT' }), h('span', {}, '폐쇄망 전용 · 외부 통신 없음')))
  );
  viewStart();
}
