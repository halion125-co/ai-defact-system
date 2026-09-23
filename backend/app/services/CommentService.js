'use strict';

const { errors } = require('../utils/errors');
const V = require('../validators/validators');
const P = require('../permissions/permissions');
const { EVENT } = require('../models/constants');
const { padNumber } = require('../utils/id');

/**
 * Comment는 immutable. 정정은 새 Comment, Admin 숨김 시 원본은 파일/Audit에 보존.
 */
class CommentService {
  constructor({ issueService, userService }) {
    this.issueService = issueService;
    this.userService = userService;
  }

  async add(user, issueId, body) {
    const data = V.comment(body);
    const rev = V.expectedRevision(body);
    let created = null;
    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      if (!P.canComment(user, iss)) throw errors.forbidden('등록자, 조치자 또는 Quality Admin만 Comment를 작성할 수 있습니다.');
      const attachmentIds = data.attachmentIds.filter((id) => (iss.attachments || []).some((a) => a.attachmentId === id && !a.deleted));
      const seq = (iss.comments || []).length + 1;
      const comment = {
        commentId: `CMT-${padNumber(seq, 4)}`,
        author: { userId: ctx.actor.userId, nameSnapshot: ctx.actor.nameSnapshot, teamSnapshot: ctx.actor.teamSnapshot },
        body: data.body,
        attachments: attachmentIds,
        createdAt: ctx.now,
        hidden: false,
      };
      iss.comments = iss.comments || [];
      iss.comments.push(comment);
      created = comment;
      ctx.event(EVENT.COMMENTED, { comment: data.body, data: { commentId: comment.commentId, attachments: attachmentIds } });
    });
    return { id: issue.id, revision: issue.revision, comment: created };
  }

  async hide(user, issueId, commentId, body) {
    V.requireObject(body);
    if (!P.canHideComment(user)) throw errors.forbidden('Quality Admin만 Comment를 숨길 수 있습니다.');
    const rev = V.expectedRevision(body);
    const reason = V.reason(body, '숨김 사유', true);
    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      const c = (iss.comments || []).find((x) => x.commentId === commentId);
      if (!c) throw errors.notFound('Comment를 찾을 수 없습니다.');
      if (c.hidden) throw errors.validation('이미 숨김 처리된 Comment입니다.');
      c.hidden = true;
      c.hiddenBy = user.userId;
      c.hiddenAt = ctx.now;
      c.hiddenReason = reason;
      ctx.event(EVENT.COMMENT_HIDDEN, { comment: reason, data: { commentId, originalBody: c.body } });
    });
    return { id: issue.id, revision: issue.revision };
  }
}

module.exports = { CommentService };
