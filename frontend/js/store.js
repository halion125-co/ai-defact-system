import { api } from './api.js';

/**
 * 전역 상태: 현재 사용자, 프로젝트 설정, 운영 설정.
 * 브라우저에는 employeeId만 저장(E2-04). 세션 Actor는 서버가 결정.
 */
const LS_KEY = 'dms.lastEmployeeId';

export const store = {
  user: null,
  project: null,
  operation: null,
  _subs: new Set(),

  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  },
  _emit() {
    this._subs.forEach((fn) => fn(this));
  },

  async loadSession() {
    const [{ user }, project] = await Promise.all([api.session.current(), api.config.project()]);
    this.user = user;
    this.project = project;
    if (user) {
      try {
        this.operation = await api.config.operation();
      } catch {
        this.operation = null;
      }
    }
    this._emit();
    return user;
  },

  async refreshProject() {
    this.project = await api.config.project();
    if (this.user) this.operation = await api.config.operation();
    this._emit();
  },

  setUser(user) {
    this.user = user;
    if (user) this.rememberEmployeeId(user.employeeId);
    this._emit();
  },

  rememberEmployeeId(employeeId) {
    try {
      localStorage.setItem(LS_KEY, employeeId);
    } catch {
      /* ignore */
    }
  },
  lastEmployeeId() {
    try {
      return localStorage.getItem(LS_KEY);
    } catch {
      return null;
    }
  },
  forgetEmployeeId() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  },

  get isAdmin() {
    return !!(this.user && this.user.isQualityAdmin);
  },

  envName(id) {
    const e = (this.project && this.project.environments.find((x) => x.id === id)) || null;
    return e ? e.displayName : id || '-';
  },
  priorityName(code) {
    if (!code || code === 'UNASSIGNED') return '미지정';
    const p = this.project && this.project.priorities.find((x) => x.code === code);
    return p ? p.displayName : code;
  },
  activeEnvironments() {
    return ((this.project && this.project.environments) || []).filter((e) => e.active).sort((a, b) => a.order - b.order);
  },
  activePriorities() {
    return ((this.project && this.project.priorities) || []).filter((p) => p.active !== false).sort((a, b) => a.order - b.order);
  },
};
