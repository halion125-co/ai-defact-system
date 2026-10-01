'use strict';

const { errors } = require('../utils/errors');
const V = require('../validators/validators');
const P = require('../permissions/permissions');
const { padNumber } = require('../utils/id');
const { nowIso } = require('../utils/time');
const { EVENT } = require('../models/constants');
const { verifyPassword } = require('../utils/password');

class UserService {
  /**
   * adminPasswordHash: scrypt 해시 문자열("scrypt$salt$hash"). 환경변수 DMS_ADMIN_PASSWORD_HASH로
   * 운영자가 직접 주입한다. 평문 비밀번호나 고정 해시를 코드에 두지 않는다(SEC-001).
   * 생성 방법: node scripts/hash-admin-password.js "원하는 비밀번호"
   */
  constructor({ userRepo, bootstrapAdminEmployeeIds = [], adminPasswordHash = '', auditRepo, sequenceRepo, logger }) {
    this.userRepo = userRepo;
    this.bootstrapAdmins = new Set(bootstrapAdminEmployeeIds.map((s) => String(s).toLowerCase()));
    this.adminPasswordHash = adminPasswordHash || '';
    this.auditRepo = auditRepo;
    this.sequenceRepo = sequenceRepo;
    this.logger = logger;
    this.adminLoginFailures = { count: 0, blockedUntil: 0 };
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
      isResponder: !!u.isResponder,
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
    const user = await this.userRepo.create({ ...data, isQualityAdmin: false });
    if (this.logger) this.logger.info('사용자 등록', { userId: user.userId });
    return this.publicUser(user);
  }

  /** 일반 세션 시작: 사번으로 기존 사용자 확인. Quality Admin 자동 승격은 하지 않는다(관리자 전용 로그인만 승격 가능). */
  async findForSession(employeeId) {
    const id = String(employeeId || '').trim();
    if (!id) throw errors.validation('사번을 입력해주세요.', { field: 'employeeId' });
    const user = this.userRepo.findByEmployeeId(id);
    if (!user) throw errors.notFound('등록되지 않은 사번입니다. 신규 사용자 등록을 진행해주세요.');
    if (user.active === false) throw errors.forbidden('비활성화된 사용자입니다. Quality Admin에게 문의하세요.');
    return this.publicUser(user);
  }

  /**
   * 관리자 전용 로그인: 사번 'admin' + 운영자가 주입한 비밀번호로만 진입 가능(부트스트랩 전용 경로).
   * 다른 사번은 이 경로로 Admin이 될 수 없다 — 일반 사용자를 Admin으로 승격하는 것은
   * 이미 Admin인 사람이 [설정 > 사용자]에서 지정해야 한다(UserService.update의 isQualityAdmin).
   * 비밀번호 해시가 설정되지 않은 배포는 관리자 로그인 자체를 막는다(fail-closed, SEC-001).
   * 성공 시 사번이 없으면 새로 만들고, 있으면 Quality Admin 상태를 보정한다.
   */
  async adminLogin({ employeeId, password }) {
    const id = String(employeeId || '').trim();
    if (!id) throw errors.validation('사번을 입력해주세요.', { field: 'employeeId' });
    if (!this.isBootstrapAdmin(id)) throw errors.forbidden('관리자 전용 로그인은 관리자 계정에서만 사용할 수 있습니다.');
    if (!this.adminPasswordHash) throw errors.forbidden('관리자 로그인이 설정되지 않았습니다. 서버 관리자에게 문의하세요.');
    const now = Date.now();
    if (now < this.adminLoginFailures.blockedUntil) {
      throw errors.forbidden('로그인 시도가 많아 잠시 후 다시 시도해주세요.');
    }
    if (!verifyPassword(password, this.adminPasswordHash)) {
      this.adminLoginFailures.count += 1;
      if (this.adminLoginFailures.count >= 5) {
        this.adminLoginFailures.blockedUntil = now + 5 * 60 * 1000;
        this.adminLoginFailures.count = 0;
      }
      throw errors.forbidden('사번 또는 관리자 비밀번호가 올바르지 않습니다.');
    }
    this.adminLoginFailures = { count: 0, blockedUntil: 0 };
    let user = this.userRepo.findByEmployeeId(id);
    if (!user) {
      user = await this.userRepo.create({ employeeId: id, name: id, team: 'Quality Admin', isQualityAdmin: true, isResponder: true });
      if (this.logger) this.logger.info('관리자 로그인으로 신규 Admin 계정 생성', { userId: user.userId });
    } else {
      if (user.active === false) throw errors.forbidden('비활성화된 사용자입니다.');
      if (!user.isQualityAdmin) {
        user = await this.userRepo.update(user.userId, { isQualityAdmin: true });
      }
      if (this.logger) this.logger.info('관리자 로그인', { userId: user.userId });
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

  /**
   * 사용자 레코드를 완전히 삭제한다(복구 불가). Admin 전용, 본인 계정은 삭제 불가.
   * 마지막 활성 Admin은 삭제할 수 없다(update()의 보호 로직과 동일한 취지 — 시스템에 Admin이
   * 0명이 되는 상황을 막는다). 기존 Issue의 등록자/조치자 표시는 스냅샷(name/team)으로 유지되어
   * 삭제 후에도 깨지지 않지만, 그 userId로의 재조회(담당자 지정 등)는 더 이상 불가능해진다.
   */
  async deleteUser(actor, userId) {
    if (!P.canDeleteUser(actor, { userId })) throw errors.forbidden();
    const target = this.userRepo.findById(userId);
    if (!target) throw errors.notFound('사용자를 찾을 수 없습니다.');
    if (target.isQualityAdmin) {
      const otherAdmins = this.userRepo.all().filter((u) => u.isQualityAdmin && u.active !== false && u.userId !== userId);
      if (otherAdmins.length === 0) throw errors.validation('최소 1명의 활성 Quality Admin이 필요합니다.');
    }
    await this.userRepo.remove(userId);
    if (this.auditRepo && this.sequenceRepo) {
      this.auditRepo.append({
        eventId: `EVT-${padNumber(await this.sequenceRepo.next('EVT'), 6)}`,
        eventType: EVENT.USER_DELETED,
        actor: this.snapshot(actor),
        actorId: actor.userId,
        timestamp: nowIso(),
        data: { userId, employeeId: target.employeeId, name: target.name },
      });
    }
    if (this.logger) this.logger.info('사용자 완전 삭제', { actor: actor.userId, userId, employeeId: target.employeeId });
    return { userId };
  }
}

module.exports = { UserService };
