'use strict';

const { randomToken } = require('../utils/id');

/**
 * HttpOnly Cookie 기반 세션. 인증 강화가 아닌 사용자 식별 목적(07_SECURITY §3).
 * 메모리 저장: 서버 재시작 시 사용자는 다시 "이 사용자로 시작"을 선택한다.
 */
class SessionService {
  constructor({ ttlHours = 12 } = {}) {
    this.ttlMs = ttlHours * 3600 * 1000;
    this.sessions = new Map();
    this.cookieName = 'dms_sid';
  }

  create(userId) {
    const sid = randomToken(24);
    this.sessions.set(sid, { userId, expiresAt: Date.now() + this.ttlMs, createdAt: Date.now() });
    return sid;
  }

  get(sid) {
    if (!sid) return null;
    const s = this.sessions.get(sid);
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      this.sessions.delete(sid);
      return null;
    }
    s.expiresAt = Date.now() + this.ttlMs; // sliding expiration
    return s;
  }

  destroy(sid) {
    if (sid) this.sessions.delete(sid);
  }

  destroyByUser(userId) {
    for (const [sid, s] of this.sessions) if (s.userId === userId) this.sessions.delete(sid);
  }

  sweep() {
    const now = Date.now();
    for (const [sid, s] of this.sessions) if (s.expiresAt < now) this.sessions.delete(sid);
  }

  cookieHeader(sid, { secure = false } = {}) {
    const parts = [`${this.cookieName}=${sid}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.floor(this.ttlMs / 1000)}`];
    if (secure) parts.push('Secure');
    return parts.join('; ');
  }

  clearCookieHeader() {
    return `${this.cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
  }
}

module.exports = { SessionService };
