'use strict';

const { errors } = require('../utils/errors');
const V = require('../validators/validators');

class UserService {
  constructor({ userRepo, bootstrapAdminEmployeeIds = [], logger }) {
    this.userRepo = userRepo;
    this.bootstrapAdmins = new Set(bootstrapAdminEmployeeIds.map((s) => String(s).toLowerCase()));
    this.logger = logger;
  }

  isBootstrapAdmin(employeeId) {
    return this.bootstrapAdmins.has(String(employeeId).toLowerCase());
  }

  publicUser(u) {
    if (!u) return null;
    return {
      userId: u.userId,
      employeeId: u.employeeId,
      name: u.name,
      team: u.team,
      isQualityAdmin: !!u.isQualityAdmin,
      active: u.active !== false,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  snapshot(u) {
    return { userId: u.userId, employeeId: u.employeeId, nameSnapshot: u.name, teamSnapshot: u.team };
  }

  async register(body) {
    const data = V.userRegistration(body);
    if (this.userRepo.findByEmployeeId(data.employeeId)) {
      throw errors.validation('이미 등록된 사번입니다. [사용자 변경]에서 사번으로 시작해주세요.', { field: 'employeeId' });
    }
    const user = await this.userRepo.create({ ...data, isQualityAdmin: this.isBootstrapAdmin(data.employeeId) });
    if (this.logger) this.logger.info('사용자 등록', { userId: user.userId });
    return this.publicUser(user);
  }

  /** 세션 시작: 사번으로 사용자 확인. bootstrap admin 사번은 자동 승격 */
  async findForSession(employeeId) {
    const id = String(employeeId || '').trim();
    if (!id) throw errors.validation('사번을 입력해주세요.', { field: 'employeeId' });
    let user = this.userRepo.findByEmployeeId(id);
    if (!user) throw errors.notFound('등록되지 않은 사번입니다. 신규 사용자 등록을 진행해주세요.');
    if (user.active === false) throw errors.forbidden('비활성화된 사용자입니다. Quality Admin에게 문의하세요.');
    if (!user.isQualityAdmin && this.isBootstrapAdmin(user.employeeId)) {
      user = await this.userRepo.update(user.userId, { isQualityAdmin: true });
      if (this.logger) this.logger.info('Bootstrap Quality Admin 승격', { userId: user.userId });
    }
    return this.publicUser(user);
  }

  getById(userId) {
    return this.publicUser(this.userRepo.findById(userId));
  }

  list({ q, active } = {}) {
    let users = this.userRepo.all();
    if (active === 'true') users = users.filter((u) => u.active !== false);
    if (active === 'false') users = users.filter((u) => u.active === false);
    if (q) {
      const key = q.toLowerCase();
      users = users.filter(
        (u) => u.name.toLowerCase().includes(key) || u.employeeId.toLowerCase().includes(key) || (u.team || '').toLowerCase().includes(key)
      );
    }
    users.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return users.map((u) => this.publicUser(u));
  }

  async update(actor, userId, body) {
    if (!actor.isQualityAdmin) throw errors.forbidden();
    const changes = V.userUpdate(body);
    const target = this.userRepo.findById(userId);
    if (!target) throw errors.notFound('사용자를 찾을 수 없습니다.');
    if (changes.isQualityAdmin === false && target.userId === actor.userId) {
      throw errors.validation('본인의 Quality Admin 권한은 해제할 수 없습니다.');
    }
    if (changes.isQualityAdmin === false || changes.active === false) {
      const admins = this.userRepo.all().filter((u) => u.isQualityAdmin && u.active !== false && u.userId !== userId);
      if (target.isQualityAdmin && admins.length === 0) {
        throw errors.validation('최소 1명의 활성 Quality Admin이 필요합니다.');
      }
    }
    const updated = await this.userRepo.update(userId, changes);
    if (this.logger) this.logger.info('사용자 수정', { actor: actor.userId, userId, fields: Object.keys(changes) });
    return this.publicUser(updated);
  }
}

module.exports = { UserService };
