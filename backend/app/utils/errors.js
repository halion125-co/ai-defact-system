'use strict';

/**
 * 표준 API 오류. 02_API_JSON_SPEC §29/§30 기준.
 */
class AppError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON() {
    const body = { error: { code: this.code, message: this.message } };
    if (this.details !== undefined) body.error.details = this.details;
    return body;
  }
}

const errors = {
  validation: (message, details) => new AppError('VALIDATION_ERROR', message, 400, details),
  unauthorized: (message = '세션이 없습니다. 사용자를 선택해주세요.') => new AppError('UNAUTHORIZED', message, 401),
  forbidden: (message = '권한이 없습니다.') => new AppError('FORBIDDEN', message, 403),
  notFound: (message = '대상을 찾을 수 없습니다.') => new AppError('NOT_FOUND', message, 404),
  revisionConflict: (currentRevision) =>
    new AppError('REVISION_CONFLICT', '다른 사용자가 먼저 수정했습니다.', 409, { currentRevision }),
  invalidTransition: (from, to, message) =>
    new AppError('INVALID_STATE_TRANSITION', message || `현재 상태(${from})에서는 수행할 수 없는 작업입니다.`, 409, { from, to }),
  fileTypeNotAllowed: (ext) => new AppError('FILE_TYPE_NOT_ALLOWED', `허용되지 않는 파일 형식입니다: ${ext}`, 400, { ext }),
  fileTooLarge: (maxMb) => new AppError('FILE_TOO_LARGE', `첨부 파일은 ${maxMb}MB 이하만 가능합니다.`, 413, { maxMb }),
  storageWriteFailed: (message = '저장에 실패했습니다. 입력한 내용은 유지됩니다.') =>
    new AppError('STORAGE_WRITE_FAILED', message, 500),
  lockTimeout: () => new AppError('LOCK_TIMEOUT', '다른 요청이 처리 중입니다. 잠시 후 다시 시도해주세요.', 503),
};

module.exports = { AppError, errors };
