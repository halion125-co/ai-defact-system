'use strict';

const { errors } = require('../utils/errors');
const { cleanText } = require('../utils/text');
const { PRIORITIES, ISSUE_STATUSES, CLOSE_TYPES } = require('../models/constants');

function fail(message, field) {
  return errors.validation(message, field ? { field } : undefined);
}

function requireObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('요청 본문이 올바르지 않습니다.');
  return body;
}

function text(value, { field, label, required = true, min = 0, max = 2000, multiline = false }) {
  const v = cleanText(value, { multiline });
  if (!v) {
    if (required) throw fail(`${label}을(를) 입력해주세요.`, field);
    return '';
  }
  if (v.length < min) throw fail(`${label}은(는) ${min}자 이상 입력해주세요.`, field);
  if (v.length > max) throw fail(`${label}은(는) ${max}자 이하로 입력해주세요.`, field);
  return v;
}

function expectedRevision(body) {
  const r = body.expectedRevision;
  if (typeof r !== 'number' || !Number.isInteger(r) || r < 0) {
    throw fail('expectedRevision이 필요합니다.', 'expectedRevision');
  }
  return r;
}

function optionalRevision(body) {
  return body.expectedRevision === undefined ? undefined : expectedRevision(body);
}

function priority(value) {
  if (!PRIORITIES.includes(value)) throw fail('Priority 값이 올바르지 않습니다.', 'priority');
  return value;
}

function status(value) {
  if (!ISSUE_STATUSES.includes(value)) throw fail('상태 값이 올바르지 않습니다.', 'status');
  return value;
}

function closeType(value) {
  if (!CLOSE_TYPES.includes(value)) throw fail('closeType은 VERIFIED 또는 AGREED여야 합니다.', 'closeType');
  return value;
}

function reproductionSteps(value) {
  if (!Array.isArray(value)) throw fail('재현 절차를 1단계 이상 입력해주세요.', 'reproductionSteps');
  const steps = value
    .map((s) => (typeof s === 'string' ? s : s && s.text))
    .map((s) => cleanText(s))
    .filter(Boolean);
  if (steps.length === 0) throw fail('재현 절차를 1단계 이상 입력해주세요.', 'reproductionSteps');
  if (steps.length > 50) throw fail('재현 절차는 50단계 이하로 입력해주세요.', 'reproductionSteps');
  for (const s of steps) if (s.length > 500) throw fail('재현 절차 각 단계는 500자 이하로 입력해주세요.', 'reproductionSteps');
  return steps.map((t, i) => ({ order: i + 1, text: t }));
}

/* ---------- 도메인별 검증 ---------- */

function userRegistration(body) {
  requireObject(body);
  return {
    employeeId: text(body.employeeId, { field: 'employeeId', label: '사번', min: 1, max: 50 }).replace(/\s+/g, ''),
    name: text(body.name, { field: 'name', label: '이름', min: 2, max: 50 }),
    team: text(body.team, { field: 'team', label: '소속', min: 1, max: 100 }),
  };
}

function userUpdate(body) {
  requireObject(body);
  const out = {};
  if (body.name !== undefined) out.name = text(body.name, { field: 'name', label: '이름', min: 2, max: 50 });
  if (body.team !== undefined) out.team = text(body.team, { field: 'team', label: '소속', min: 1, max: 100 });
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw fail('active는 boolean이어야 합니다.', 'active');
    out.active = body.active;
  }
  if (body.isQualityAdmin !== undefined) {
    if (typeof body.isQualityAdmin !== 'boolean') throw fail('isQualityAdmin은 boolean이어야 합니다.', 'isQualityAdmin');
    out.isQualityAdmin = body.isQualityAdmin;
  }
  return out;
}

function defectCreate(body, activeEnvironments) {
  requireObject(body);
  const environmentId = text(body.environmentId, { field: 'environmentId', label: '발생 환경', max: 50 });
  const env = activeEnvironments.find((e) => e.id === environmentId && e.active);
  if (!env) throw fail('발생 환경을 선택해주세요.', 'environmentId');
  return {
    location: text(body.location, { field: 'location', label: '발생 위치', min: 1, max: 200 }),
    environment: { id: env.id, displayNameSnapshot: env.displayName },
    symptom: text(body.symptom, { field: 'symptom', label: '발생 현상', min: 5, max: 2000, multiline: true }),
    reproductionSteps: reproductionSteps(body.reproductionSteps),
    expectedResult: text(body.expectedResult, { field: 'expectedResult', label: '기대 결과', min: 5, max: 2000, multiline: true }),
  };
}

function improvementCreate(body) {
  requireObject(body);
  return {
    target: text(body.target, { field: 'target', label: '개선 대상', min: 1, max: 200 }),
    request: text(body.request, { field: 'request', label: '개선 내용', min: 5, max: 2000, multiline: true }),
    reason: text(body.reason, { field: 'reason', label: '개선 필요 사유', required: false, max: 2000, multiline: true }),
  };
}

function inquiryCreate(body) {
  requireObject(body);
  return {
    target: text(body.target, { field: 'target', label: '문의 대상', min: 1, max: 200 }),
    question: text(body.question, { field: 'question', label: '문의 내용', min: 5, max: 2000, multiline: true }),
  };
}

/** 등록내용 수정 changes 검증. allowlist 밖 필드는 거부 */
function contentChanges(type, changes, activeEnvironments) {
  if (!changes || typeof changes !== 'object') throw fail('changes가 필요합니다.', 'changes');
  const out = {};
  for (const [k, v] of Object.entries(changes)) {
    if (type === 'DEFECT') {
      if (k === 'location') out.location = text(v, { field: k, label: '발생 위치', min: 1, max: 200 });
      else if (k === 'symptom') out.symptom = text(v, { field: k, label: '발생 현상', min: 5, max: 2000, multiline: true });
      else if (k === 'expectedResult') out.expectedResult = text(v, { field: k, label: '기대 결과', min: 5, max: 2000, multiline: true });
      else if (k === 'reproductionSteps') out.reproductionSteps = reproductionSteps(v);
      else if (k === 'environmentId') {
        const env = activeEnvironments.find((e) => e.id === v);
        if (!env) throw fail('발생 환경이 올바르지 않습니다.', 'environmentId');
        out.environment = { id: env.id, displayNameSnapshot: env.displayName };
      } else throw fail(`수정할 수 없는 항목입니다: ${k}`, k);
    } else if (type === 'IMPROVEMENT') {
      if (k === 'target') out.target = text(v, { field: k, label: '개선 대상', min: 1, max: 200 });
      else if (k === 'request') out.request = text(v, { field: k, label: '개선 내용', min: 5, max: 2000, multiline: true });
      else if (k === 'reason') out.reason = text(v, { field: k, label: '개선 필요 사유', required: false, max: 2000, multiline: true });
      else throw fail(`수정할 수 없는 항목입니다: ${k}`, k);
    } else if (type === 'INQUIRY') {
      if (k === 'target') out.target = text(v, { field: k, label: '문의 대상', min: 1, max: 200 });
      else if (k === 'question') out.question = text(v, { field: k, label: '문의 내용', min: 5, max: 2000, multiline: true });
      else throw fail(`수정할 수 없는 항목입니다: ${k}`, k);
    }
  }
  if (Object.keys(out).length === 0) throw fail('변경된 내용이 없습니다.', 'changes');
  return out;
}

function reason(body, label = '사유', required = true) {
  return text(body.reason, { field: 'reason', label, required, min: required ? 2 : 0, max: 1000, multiline: true });
}

function resolution(body, operation) {
  const r = body.resolution && typeof body.resolution === 'object' ? body.resolution : body;
  return {
    description: text(r.description, { field: 'description', label: '처리 결과', min: 2, max: 2000, multiline: true }),
    changeReference: operation.enableChangeReference
      ? text(r.changeReference, { field: 'changeReference', label: 'Change Reference', required: false, max: 200 })
      : '',
    targetVersion: text(r.targetVersion, { field: 'targetVersion', label: '반영 예정 버전', required: false, max: 100 }),
  };
}

function comment(body) {
  requireObject(body);
  return {
    body: text(body.body, { field: 'body', label: 'Comment', min: 1, max: 5000, multiline: true }),
    attachmentIds: Array.isArray(body.attachmentIds) ? body.attachmentIds.map(String).slice(0, 20) : [],
  };
}

function deployment(body, environments) {
  requireObject(body);
  const environmentId = text(body.environmentId, { field: 'environmentId', label: '배포 환경', max: 50 });
  const env = environments.find((e) => e.id === environmentId);
  if (!env) throw fail('배포 환경을 선택해주세요.', 'environmentId');
  const version = text(body.version, { field: 'version', label: '배포 버전', required: false, max: 100 });
  let deployedAt = body.deployedAt ? String(body.deployedAt) : null;
  if (deployedAt && Number.isNaN(new Date(deployedAt).getTime())) throw fail('배포 일시가 올바르지 않습니다.', 'deployedAt');
  return { env, version, deployedAt };
}

function projectUpdate(body) {
  requireObject(body);
  return {
    customerName: text(body.customerName, { field: 'customerName', label: '고객사명', min: 1, max: 100 }),
    projectName: text(body.projectName, { field: 'projectName', label: '프로젝트명', min: 1, max: 100 }),
  };
}

function environmentCreate(body) {
  requireObject(body);
  const displayName = text(body.displayName, { field: 'displayName', label: '환경명', min: 1, max: 50 });
  const code = text(body.code, { field: 'code', label: '환경 코드', required: false, max: 30 })
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '');
  return { displayName, code };
}

function environmentUpdate(body) {
  requireObject(body);
  const out = {};
  if (body.displayName !== undefined) out.displayName = text(body.displayName, { field: 'displayName', label: '환경명', min: 1, max: 50 });
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw fail('active는 boolean이어야 합니다.', 'active');
    out.active = body.active;
  }
  if (body.order !== undefined) {
    if (!Number.isInteger(body.order) || body.order < 1) throw fail('order는 1 이상의 정수여야 합니다.', 'order');
    out.order = body.order;
  }
  return out;
}

function prioritiesUpdate(body) {
  requireObject(body);
  if (!Array.isArray(body.priorities)) throw fail('priorities 배열이 필요합니다.', 'priorities');
  return body.priorities.map((p) => ({
    code: priority(p.code),
    displayName: text(p.displayName, { field: 'displayName', label: 'Priority 이름', min: 1, max: 30 }),
    description: text(p.description, { field: 'description', label: '설명', required: false, max: 200 }),
    active: p.active === undefined ? true : !!p.active,
    order: Number.isInteger(p.order) ? p.order : 99,
  }));
}

function operationUpdate(body) {
  requireObject(body);
  const out = {};
  if (body.staleIssueDays !== undefined) {
    if (!Number.isInteger(body.staleIssueDays) || body.staleIssueDays < 1 || body.staleIssueDays > 365) {
      throw fail('장기 미조치 기준 일수는 1~365 사이여야 합니다.', 'staleIssueDays');
    }
    out.staleIssueDays = body.staleIssueDays;
  }
  if (body.maxAttachmentMb !== undefined) {
    if (!Number.isInteger(body.maxAttachmentMb) || body.maxAttachmentMb < 1 || body.maxAttachmentMb > 500) {
      throw fail('첨부 최대 크기는 1~500MB 사이여야 합니다.', 'maxAttachmentMb');
    }
    out.maxAttachmentMb = body.maxAttachmentMb;
  }
  if (body.allowedExtensions !== undefined) {
    const list = Array.isArray(body.allowedExtensions)
      ? body.allowedExtensions
      : String(body.allowedExtensions).split(/[,\s]+/);
    out.allowedExtensions = [...new Set(list.map((e) => String(e).trim().toLowerCase().replace(/^\./, '')).filter((e) => /^[a-z0-9]{1,10}$/.test(e)))];
    const blocked = ['exe', 'bat', 'cmd', 'com', 'msi', 'js', 'vbs', 'ps1', 'sh', 'html', 'htm', 'svg', 'jar', 'dll', 'scr'];
    out.allowedExtensions = out.allowedExtensions.filter((e) => !blocked.includes(e));
    if (out.allowedExtensions.length === 0) throw fail('허용 확장자를 1개 이상 입력해주세요.', 'allowedExtensions');
  }
  for (const k of ['enableChangeReference', 'enableDeployment']) {
    if (body[k] !== undefined) {
      if (typeof body[k] !== 'boolean') throw fail(`${k}는 boolean이어야 합니다.`, k);
      out[k] = body[k];
    }
  }
  if (body.backup !== undefined) {
    const b = body.backup || {};
    out.backup = {
      enabled: b.enabled === undefined ? true : !!b.enabled,
      retainDays: Number.isInteger(b.retainDays) && b.retainDays >= 1 && b.retainDays <= 3650 ? b.retainDays : 30,
    };
  }
  return out;
}

module.exports = {
  requireObject,
  text,
  expectedRevision,
  optionalRevision,
  priority,
  status,
  closeType,
  reproductionSteps,
  userRegistration,
  userUpdate,
  defectCreate,
  improvementCreate,
  inquiryCreate,
  contentChanges,
  reason,
  resolution,
  comment,
  deployment,
  projectUpdate,
  environmentCreate,
  environmentUpdate,
  prioritiesUpdate,
  operationUpdate,
};
