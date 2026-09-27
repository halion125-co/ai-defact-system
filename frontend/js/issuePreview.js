/**
 * Issue 미리보기 패널 — Kanban 카드, 목록/MY 행을 클릭했을 때 화면 이동 없이 우측에서 열리는 공용 패널.
 * "다음 작업" 버튼은 상세 화면과 동일한 기준(issueActions.js)으로 결정되고, 첨부파일은 다운로드/이미지 확대만
 * 지원하는 읽기 전용이다(업로드·삭제는 상세 화면에서만). "상세 보기"를 눌러야 전체 화면으로 이동한다.
 */
import { api } from './api.js';
import { store } from './store.js';
import { h, clear, openSidePanel, openModal, confirmModal, loadingState, errorBox, toast, errorMessage, fmtBytes, fmtDateTime, typeBadge, priorityBadge, statusBadge, userLabel, icon } from './ui.js';
import { getPrimaryAction, runPrimaryAction, toActionIssue } from './issueActions.js';
import { renderIssueBodyText } from './richText.js';

function previewImage(url, name) {
  openModal({
    title: name,
    wide: true,
    body: h('img', { src: `${url}?inline=1`, alt: name, class: 'att-preview', style: { maxHeight: '70vh', margin: '0 auto' } }),
    actions: [{ label: '다운로드', variant: 'btn-secondary', onClick: () => window.open(url, '_blank') }, { label: '닫기', variant: 'btn-primary', onClick: (c) => c() }],
  });
}

/** 본문에 붙여넣은 이미지를 작은 썸네일로 표시하고, 클릭 시 확대 모달로 보여준다. */
function bindBodyImagePreview(container) {
  for (const img of container.querySelectorAll('img')) {
    img.classList.add('body-image-thumb');
    img.addEventListener('click', () => previewImage(img.src, img.alt || '첨부 이미지'));
  }
  return container;
}

/** 읽기 전용 첨부 목록: 다운로드 링크 + 이미지는 클릭 시 확대. 업로드/삭제는 상세 화면에서만 가능하다. */
function attachmentListReadonly(issue) {
  const atts = (issue.attachments || []).filter((a) => !a.deleted);
  if (!atts.length) return h('div', { class: 'muted small' }, '첨부된 파일 없음');
  const list = h('div', { class: 'att-table' });
  for (const a of atts) {
    const url = `/api/issues/${issue.id}/attachments/${a.attachmentId}`;
    const isImg = /^image\//.test(a.mimeType);
    list.append(
      h(
        'div',
        { class: 'att-row' },
        h('a', { class: 'att-name', href: url, title: a.originalName }, icon('paperclip', { size: 13 }), a.originalName),
        h('span', { class: 'att-meta' }, fmtBytes(a.size)),
        h('span', { class: 'att-meta nowrap' }, a.uploadedAt ? fmtDateTime(a.uploadedAt) : '-'),
        h(
          'span',
          { class: 'att-actions' },
          isImg ? h('button', { class: 'btn btn-ghost btn-xs', onClick: () => previewImage(url, a.originalName) }, '미리보기') : null,
          h('a', { class: 'btn btn-ghost btn-xs', href: url, target: '_blank', rel: 'noopener' }, '다운로드')
        )
      )
    );
  }
  return list;
}

/**
 * Issue 미리보기 패널을 연다. summaryIt은 목록 요약(toSummary) 형태(id, revision, assigneeId 등)면 충분하다.
 * onReload: 배정/상태 변경 성공 후 호출부(목록/Kanban)가 자기 화면을 재조회하도록 하는 콜백.
 */
export function openIssuePreview(summaryIt, { onReload } = {}) {
  const body = (close) => {
    const wrap = h('div', {}, loadingState(4));
    api.issues
      .get(summaryIt.id)
      .then(({ issue, permissions: p }) => {
        const me = store.user;
        const contentText = issue.type === 'DEFECT' ? issue.symptom : issue.type === 'IMPROVEMENT' ? issue.request : issue.question;
        const contentLabel = issue.type === 'DEFECT' ? '발생 현상' : issue.type === 'IMPROVEMENT' ? '개선 내용' : '문의 내용';
        const pa = getPrimaryAction(toActionIssue(issue), me);
        const canClaimHere = p.canClaim;

        const actionBody = h('div', { class: 'sp-actions' });
        if (canClaimHere) {
          actionBody.append(
            h(
              'button',
              {
                class: 'btn btn-primary btn-block',
                onClick: async () => {
                  const ok = await confirmModal({ title: '내게 배정', message: '이 이슈의 조치자를 나로 지정합니다. 실제 조치는 상세 화면에서 시작하세요.', confirmLabel: '내게 배정' });
                  if (!ok) return;
                  try {
                    await api.issues.action(issue.id, 'claim', { expectedRevision: issue.revision });
                    toast(`${issue.id} 조치자로 지정되었습니다.`, 'success');
                    close();
                    if (onReload) onReload();
                  } catch (err) {
                    toast(err.isConflict ? '다른 사용자가 먼저 변경했습니다. 목록을 새로고침합니다.' : errorMessage(err), 'error');
                    if (onReload) onReload();
                  }
                },
              },
              '내게 배정'
            )
          );
        } else if (pa) {
          const mutate = async (fn, msg) => {
            try {
              const res = await fn(issue.revision);
              if (msg) toast(msg, 'success');
              return res;
            } catch (err) {
              toast(err.isConflict ? '다른 사용자가 먼저 변경했습니다. 목록을 새로고침합니다.' : errorMessage(err), 'error');
              throw err;
            } finally {
              if (onReload) onReload();
            }
          };
          actionBody.append(h('button', { class: `btn ${pa.variant} btn-block`, onClick: () => { close(); runPrimaryAction(pa.key, issue, { mutate, onSuccess: onReload }); } }, pa.label));
        } else {
          actionBody.append(h('div', { class: 'next-action-note' }, '현재 수행 가능한 작업이 없습니다.'));
        }

        const symptomBody = renderIssueBodyText(contentText);
        bindBodyImagePreview(symptomBody);

        clear(wrap).append(
          h(
            'div',
            { class: 'sp-top' },
            h('span', { class: 'mono', style: { fontWeight: 700 } }, issue.id),
            h('a', { class: 'btn btn-ghost btn-xs', href: `#/issues/${issue.id}` }, '상세 보기 →')
          ),
          h('div', { class: 'flex', style: { gap: '6px', marginBottom: '10px' } }, typeBadge(issue.type), priorityBadge(issue.priority), statusBadge(issue.status)),
          h('h4', { class: 'sp-title' }, issue.title),
          h(
            'div',
            { class: 'sp-meta-grid' },
            h('div', {}, h('div', { class: 'k' }, '등록자'), h('div', { class: 'v' }, userLabel(issue.reporter))),
            h('div', {}, h('div', { class: 'k' }, '조치자'), h('div', { class: 'v' }, issue.assignee ? userLabel(issue.assignee) : h('span', { class: 'badge warn' }, '미지정'))),
            h('div', {}, h('div', { class: 'k' }, '환경'), h('div', { class: 'v' }, issue.environment ? issue.environment.displayNameSnapshot : '-')),
            h('div', {}, h('div', { class: 'k' }, '업데이트'), h('div', { class: 'v' }, fmtDateTime(issue.updatedAt)))
          ),
          h('div', { class: 'content-block' }, h('h4', {}, contentLabel), symptomBody),
          h('div', { class: 'content-block' }, h('h4', {}, '첨부파일 / 증적'), attachmentListReadonly(issue)),
          actionBody
        );
      })
      .catch((err) => clear(wrap).append(errorBox(err)));
    return wrap;
  };
  openSidePanel({ title: 'Issue 미리보기', body });
}
