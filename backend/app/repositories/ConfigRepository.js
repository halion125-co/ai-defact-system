'use strict';

const path = require('path');
const { readJson, writeJsonAtomic, ensureDir } = require('../utils/fsutil');
const { nowIso } = require('../utils/time');

function defaultProject() {
  const now = nowIso();
  return {
    projectId: 'PRJ-001',
    customerName: '고객사',
    projectName: '프로젝트',
    environments: [
      { id: 'ENV-DEV', code: 'DEV', displayName: '개발계', active: true, order: 1 },
      { id: 'ENV-TEST', code: 'TEST', displayName: '테스트계', active: true, order: 2 },
      { id: 'ENV-VERIFY', code: 'VERIFY', displayName: '검증계', active: true, order: 3 },
    ],
    priorities: [
      { code: 'CRITICAL', displayName: 'Critical', description: '핵심 업무 또는 테스트 진행 불가', active: true, order: 1 },
      { code: 'MAJOR', displayName: 'Major', description: '주요 기능 또는 업무에 큰 영향', active: true, order: 2 },
      { code: 'MINOR', displayName: 'Minor', description: '영향이 제한적인 경미한 문제', active: true, order: 3 },
    ],
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
}

function defaultOperation() {
  return {
    staleIssueDays: 3,
    maxAttachmentMb: 20,
    allowedExtensions: ['png', 'jpg', 'jpeg', 'gif', 'pdf', 'txt', 'log', 'csv', 'xlsx', 'docx', 'pptx', 'zip'],
    enableChangeReference: true,
    enableDeployment: true,
    timezone: 'Asia/Seoul',
    backup: { enabled: true, retainDays: 30 },
    updatedAt: nowIso(),
    revision: 1,
  };
}

class ConfigRepository {
  constructor({ dataDir, mutex }) {
    this.dir = path.join(dataDir, 'config');
    this.projectFile = path.join(this.dir, 'project.json');
    this.operationFile = path.join(this.dir, 'operation.json');
    this.mutex = mutex;
    this.project = null;
    this.operation = null;
  }

  load() {
    ensureDir(this.dir);
    const p = readJson(this.projectFile);
    const o = readJson(this.operationFile);
    this.project = p || defaultProject();
    this.operation = { ...defaultOperation(), ...(o || {}) };
    if (!Array.isArray(this.project.environments) || !Array.isArray(this.project.priorities)) {
      throw new Error('project.json 형식 오류');
    }
    if (!p) writeJsonAtomic(this.projectFile, this.project);
    if (!o) writeJsonAtomic(this.operationFile, this.operation);
  }

  getProject() {
    return JSON.parse(JSON.stringify(this.project));
  }

  getOperation() {
    return JSON.parse(JSON.stringify(this.operation));
  }

  async saveProject(mutator) {
    return this.mutex.withLock('config-project', async () => {
      const next = mutator(this.getProject());
      next.revision = (this.project.revision || 0) + 1;
      next.updatedAt = nowIso();
      writeJsonAtomic(this.projectFile, next);
      this.project = next;
      return this.getProject();
    });
  }

  async saveOperation(mutator) {
    return this.mutex.withLock('config-operation', async () => {
      const next = mutator(this.getOperation());
      next.revision = (this.operation.revision || 0) + 1;
      next.updatedAt = nowIso();
      writeJsonAtomic(this.operationFile, next);
      this.operation = next;
      return this.getOperation();
    });
  }
}

module.exports = { ConfigRepository, defaultProject, defaultOperation };
