'use strict';

const fs = require('fs');
const path = require('path');
const { errors, AppError } = require('../utils/errors');
const P = require('../permissions/permissions');
const { EVENT } = require('../models/constants');
const { ensureDir, safeJoin } = require('../utils/fsutil');
const { sanitizeFilename, getExtension } = require('../utils/text');
const { randomToken, padNumber } = require('../utils/id');
const { nowIso } = require('../utils/time');

const MIME_BY_EXT = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  gif: ['image/gif'],
  pdf: ['application/pdf'],
  txt: ['text/plain'],
  log: ['text/plain', 'application/octet-stream', 'text/x-log'],
  csv: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
  json: ['application/json', 'text/plain'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/octet-stream'],
  zip: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
};

const DOWNLOAD_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

/** 파일 시그니처(magic bytes) 검사 */
function sniff(ext, buf) {
  const hex = (n) => buf.slice(0, n).toString('hex');
  switch (ext) {
    case 'png':
      return hex(8) === '89504e470d0a1a0a';
    case 'jpg':
    case 'jpeg':
      return hex(3) === 'ffd8ff';
    case 'gif':
      return buf.slice(0, 6).toString('ascii') === 'GIF87a' || buf.slice(0, 6).toString('ascii') === 'GIF89a';
    case 'pdf':
      return buf.slice(0, 5).toString('ascii') === '%PDF-';
    case 'zip':
    case 'xlsx':
    case 'docx':
    case 'pptx':
      return hex(2) === '504b';
    case 'txt':
    case 'log':
    case 'csv':
    case 'json': {
      const sample = buf.slice(0, 4096);
      for (const b of sample) if (b === 0) return false;
      // script 태그가 포함된 텍스트는 거부(브라우저 sniffing 우회 방지)
      return !/<script[\s>]/i.test(sample.toString('utf8'));
    }
    default:
      return true;
  }
}

class AttachmentService {
  constructor({ issueService, configService, uploadDir, logger }) {
    this.issueService = issueService;
    this.configService = configService;
    this.uploadDir = uploadDir;
    this.logger = logger;
    ensureDir(uploadDir);
  }

  maxBytes() {
    return (this.configService.getOperation().maxAttachmentMb || 20) * 1024 * 1024;
  }

  validateFile(file) {
    const op = this.configService.getOperation();
    const originalName = sanitizeFilename(file.filename);
    const ext = getExtension(originalName);
    if (!ext || !op.allowedExtensions.includes(ext)) throw errors.fileTypeNotAllowed(ext || '(없음)');
    // double extension 우회 차단: 이름 중간의 위험 확장자
    const parts = originalName.toLowerCase().split('.');
    const dangerous = ['exe', 'bat', 'cmd', 'com', 'msi', 'js', 'vbs', 'ps1', 'sh', 'html', 'htm', 'jar', 'dll', 'scr', 'php', 'asp', 'jsp'];
    if (parts.slice(1, -1).some((p) => dangerous.includes(p))) throw errors.fileTypeNotAllowed(originalName);
    if (file.data.length === 0) throw errors.validation('빈 파일은 업로드할 수 없습니다.');
    if (file.data.length > this.maxBytes()) throw errors.fileTooLarge(op.maxAttachmentMb);
    const declared = String(file.contentType || '').split(';')[0].trim().toLowerCase();
    const allowedMimes = MIME_BY_EXT[ext];
    if (allowedMimes && declared && !allowedMimes.includes(declared) && declared !== 'application/octet-stream') {
      throw errors.validation(`파일 형식(MIME)이 확장자와 일치하지 않습니다: ${declared}`, { field: 'file' });
    }
    if (!sniff(ext, file.data)) throw errors.validation('파일 내용이 확장자와 일치하지 않습니다.', { field: 'file' });
    return { originalName, ext, mimeType: (allowedMimes && allowedMimes[0]) || declared || 'application/octet-stream' };
  }

  async upload(user, issueId, files, expectedRevision) {
    if (!files || files.length === 0) throw errors.validation('업로드할 파일이 없습니다.', { field: 'file' });
    if (files.length > 10) throw errors.validation('한 번에 10개까지 업로드할 수 있습니다.');
    // 파일별 검증: 유효한 파일만 저장하고 거부 사유를 함께 반환한다.
    const validated = [];
    const rejected = [];
    for (const f of files) {
      try {
        validated.push({ file: f, meta: this.validateFile(f) });
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        rejected.push({ name: sanitizeFilename(f.filename), code: err.code, message: err.message });
      }
    }
    if (validated.length === 0) {
      const first = rejected[0];
      throw new AppError(first.code, rejected.length === 1 ? first.message : `업로드할 수 있는 파일이 없습니다. (${rejected.map((r) => r.name).join(', ')})`, first.code === 'FILE_TOO_LARGE' ? 413 : 400, { rejected });
    }
    const added = [];
    const { issue } = await this.issueService.mutate(issueId, user, expectedRevision, async (iss, ctx) => {
      if (!P.canAttach(user, iss)) throw errors.forbidden('등록자, 조치자 또는 Quality Admin만 첨부를 추가할 수 있습니다.');
      ctx.assertRevision(); // 파일 쓰기(부수효과) 전에 충돌 확인
      const dir = safeJoin(this.uploadDir, iss.id);
      ensureDir(dir);
      iss.attachments = iss.attachments || [];
      for (const { file, meta } of validated) {
        const seq = iss.attachments.length + 1;
        const stamp = ctx.now.replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6})/, '$1_$2');
        const storedName = `${stamp}_${randomToken(4)}.${meta.ext}`;
        const target = safeJoin(dir, storedName);
        fs.writeFileSync(target, file.data, { mode: 0o644 });
        const att = {
          attachmentId: `ATT-${padNumber(seq, 3)}`,
          originalName: meta.originalName,
          storedName,
          mimeType: meta.mimeType,
          size: file.data.length,
          uploadedBy: user.userId,
          uploadedByName: ctx.actor.nameSnapshot,
          uploadedAt: ctx.now,
          deleted: false,
        };
        iss.attachments.push(att);
        added.push(att);
      }
      ctx.event(EVENT.ATTACHMENT_ADDED, { data: { files: added.map((a) => ({ attachmentId: a.attachmentId, name: a.originalName, size: a.size })) } });
    });
    return { id: issue.id, revision: issue.revision, attachments: added, rejected };
  }

  /** 다운로드 대상 파일 정보 반환(권한: 세션 사용자 전원 — 프로젝트 내부 사용자 공유 원칙) */
  resolveForDownload(user, issueId, attachmentId) {
    const issue = this.issueService.getRaw(issueId);
    const att = (issue.attachments || []).find((a) => a.attachmentId === attachmentId);
    if (!att || (att.deleted && !user.isQualityAdmin)) throw errors.notFound('첨부파일을 찾을 수 없습니다.');
    const file = safeJoin(this.uploadDir, issue.id, att.storedName);
    if (!fs.existsSync(file)) throw errors.notFound('첨부파일이 저장소에 없습니다.');
    const ext = getExtension(att.storedName);
    return { file, attachment: att, contentType: DOWNLOAD_MIME[ext] || 'application/octet-stream', inlineAllowed: ['png', 'jpg', 'jpeg', 'gif', 'pdf'].includes(ext) };
  }

  async remove(user, issueId, attachmentId, expectedRevision) {
    const { issue } = await this.issueService.mutate(issueId, user, expectedRevision, async (iss, ctx) => {
      const att = (iss.attachments || []).find((a) => a.attachmentId === attachmentId);
      if (!att || att.deleted) throw errors.notFound('첨부파일을 찾을 수 없습니다.');
      if (!P.canDeleteAttachment(user, att)) throw errors.forbidden('업로더 또는 Quality Admin만 삭제할 수 있습니다.');
      att.deleted = true;
      att.deletedBy = user.userId;
      att.deletedAt = ctx.now;
      ctx.event(EVENT.ATTACHMENT_DELETED, { data: { attachmentId, name: att.originalName } });
    });
    return { id: issue.id, revision: issue.revision };
  }
}

module.exports = { AttachmentService, sniff, nowIso };
