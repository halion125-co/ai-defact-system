'use strict';

const { errors } = require('../utils/errors');
const V = require('../validators/validators');
const { setDefaultTimezone } = require('../utils/time');

class ConfigService {
  constructor({ configRepo, issueRepo, logger }) {
    this.configRepo = configRepo;
    this.issueRepo = issueRepo;
    this.logger = logger;
    setDefaultTimezone(configRepo.getOperation().timezone);
  }

  getProject() {
    const p = this.configRepo.getProject();
    p.environments.sort((a, b) => a.order - b.order);
    p.priorities.sort((a, b) => a.order - b.order);
    return p;
  }

  getOperation() {
    return this.configRepo.getOperation();
  }

  activeEnvironments() {
    return this.getProject().environments.filter((e) => e.active);
  }

  requireAdmin(user) {
    if (!user || !user.isQualityAdmin) throw errors.forbidden('Quality Admin만 설정을 변경할 수 있습니다.');
  }

  async updateProject(user, body) {
    this.requireAdmin(user);
    const data = V.projectUpdate(body);
    const rev = V.optionalRevision(body);
    return this.configRepo.saveProject((p) => {
      if (rev !== undefined && rev !== p.revision) throw errors.revisionConflict(p.revision);
      return { ...p, ...data };
    });
  }

  async addEnvironment(user, body) {
    this.requireAdmin(user);
    const data = V.environmentCreate(body);
    return this.configRepo.saveProject((p) => {
      const code = data.code || `ENV${p.environments.length + 1}`;
      let id = `ENV-${code}`;
      let n = 1;
      while (p.environments.some((e) => e.id === id)) id = `ENV-${code}-${++n}`;
      if (p.environments.some((e) => e.displayName === data.displayName)) {
        throw errors.validation('같은 이름의 환경이 이미 있습니다.', { field: 'displayName' });
      }
      const order = Math.max(0, ...p.environments.map((e) => e.order)) + 1;
      p.environments.push({ id, code, displayName: data.displayName, active: true, order });
      return p;
    });
  }

  async updateEnvironment(user, envId, body) {
    this.requireAdmin(user);
    const changes = V.environmentUpdate(body);
    return this.configRepo.saveProject((p) => {
      const env = p.environments.find((e) => e.id === envId);
      if (!env) throw errors.notFound('환경을 찾을 수 없습니다.');
      if (changes.active === false) {
        const actives = p.environments.filter((e) => e.active && e.id !== envId);
        if (actives.length === 0) throw errors.validation('최소 1개의 활성 환경이 필요합니다.');
      }
      Object.assign(env, changes);
      return p;
    });
  }

  /** 삭제 요청: 참조 중이면 물리 삭제 금지 → inactive 처리 */
  async removeEnvironment(user, envId) {
    this.requireAdmin(user);
    const referenced = this.issueRepo
      .all()
      .some((i) => (i.environment && i.environment.id === envId) || (i.deployment && i.deployment.environmentId === envId));
    return this.configRepo.saveProject((p) => {
      const idx = p.environments.findIndex((e) => e.id === envId);
      if (idx < 0) throw errors.notFound('환경을 찾을 수 없습니다.');
      const remaining = p.environments.filter((e) => e.active && e.id !== envId);
      if (remaining.length === 0) throw errors.validation('최소 1개의 활성 환경이 필요합니다.');
      if (referenced) p.environments[idx].active = false;
      else p.environments.splice(idx, 1);
      p._lastRemoveMode = referenced ? 'INACTIVATED' : 'DELETED';
      return p;
    }).then((p) => {
      const mode = p._lastRemoveMode;
      delete p._lastRemoveMode;
      return { project: p, mode };
    });
  }

  async reorderEnvironments(user, ids) {
    this.requireAdmin(user);
    if (!Array.isArray(ids)) throw errors.validation('ids 배열이 필요합니다.');
    return this.configRepo.saveProject((p) => {
      ids.forEach((id, i) => {
        const env = p.environments.find((e) => e.id === id);
        if (env) env.order = i + 1;
      });
      p.environments.sort((a, b) => a.order - b.order).forEach((e, i) => (e.order = i + 1));
      return p;
    });
  }

  async updatePriorities(user, body) {
    this.requireAdmin(user);
    const list = V.prioritiesUpdate(body);
    return this.configRepo.saveProject((p) => {
      for (const item of list) {
        const target = p.priorities.find((x) => x.code === item.code);
        if (target) Object.assign(target, item);
      }
      p.priorities.sort((a, b) => a.order - b.order);
      return p;
    });
  }

  async updateOperation(user, body) {
    this.requireAdmin(user);
    const changes = V.operationUpdate(body);
    const rev = V.optionalRevision(body);
    const updated = await this.configRepo.saveOperation((o) => {
      if (rev !== undefined && rev !== o.revision) throw errors.revisionConflict(o.revision);
      return { ...o, ...changes, backup: { ...o.backup, ...(changes.backup || {}) } };
    });
    if (this.logger) this.logger.info('운영 설정 변경', { actor: user.userId, fields: Object.keys(changes) });
    return updated;
  }
}

module.exports = { ConfigService };
