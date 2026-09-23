/**
 * API Client. 모든 Mutation은 X-Requested-With(CSRF) + JSON. 401 시 세션 만료 이벤트 발행.
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details || {};
  }
  get isConflict() {
    return this.status === 409 && this.code === 'REVISION_CONFLICT';
  }
}

const listeners = new Set();
export function onUnauthorized(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function request(method, url, { body, form, signal } = {}) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', signal });
  } catch (err) {
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.');
  }
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const e = (data && data.error) || {};
    if (res.status === 401) listeners.forEach((fn) => fn());
    throw new ApiError(res.status, e.code || `HTTP_${res.status}`, e.message || `요청 실패 (${res.status})`, e.details);
  }
  return data;
}

const qs = (params) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: (url, params) => request('GET', url + qs(params)),
  post: (url, body) => request('POST', url, { body }),
  put: (url, body) => request('PUT', url, { body }),
  patch: (url, body) => request('PATCH', url, { body }),
  delete: (url, params) => request('DELETE', url + qs(params)),
  upload: (url, formData) => request('POST', url, { form: formData }),

  session: {
    current: () => request('GET', '/api/session/current'),
    start: (employeeId) => request('POST', '/api/session/start', { body: { employeeId } }),
    end: () => request('POST', '/api/session/end', { body: {} }),
  },
  users: {
    recent: () => request('GET', '/api/users/recent'),
    register: (data) => request('POST', '/api/users', { body: data }),
    list: (params) => request('GET', '/api/users' + qs(params)),
    update: (userId, data) => request('PATCH', `/api/users/${userId}`, { body: data }),
  },
  config: {
    project: () => request('GET', '/api/config/project'),
    operation: () => request('GET', '/api/config/operation'),
    updateProject: (data) => request('PUT', '/api/config/project', { body: data }),
    addEnvironment: (data) => request('POST', '/api/config/environments', { body: data }),
    updateEnvironment: (id, data) => request('PATCH', `/api/config/environments/${id}`, { body: data }),
    removeEnvironment: (id) => request('DELETE', `/api/config/environments/${id}`),
    reorderEnvironments: (ids) => request('PUT', '/api/config/environments/order', { body: { ids } }),
    updatePriorities: (priorities) => request('PUT', '/api/config/priorities', { body: { priorities } }),
    updateOperation: (data) => request('PUT', '/api/config/operation', { body: data }),
  },
  issues: {
    list: (params) => request('GET', '/api/issues' + qs(params)),
    get: (id) => request('GET', `/api/issues/${id}`),
    createDefect: (data) => request('POST', '/api/issues/defects', { body: data }),
    createImprovement: (data) => request('POST', '/api/issues/improvements', { body: data }),
    createInquiry: (data) => request('POST', '/api/issues/inquiries', { body: data }),
    update: (id, expectedRevision, changes) => request('PATCH', `/api/issues/${id}`, { body: { expectedRevision, changes } }),
    action: (id, action, body) => request('POST', `/api/issues/${id}/actions/${action}`, { body }),
    comment: (id, body) => request('POST', `/api/issues/${id}/comments`, { body }),
    hideComment: (id, commentId, body) => request('POST', `/api/issues/${id}/comments/${commentId}/hide`, { body }),
    upload: (id, formData) => request('POST', `/api/issues/${id}/attachments`, { form: formData }),
    deleteAttachment: (id, attId, expectedRevision) => request('DELETE', `/api/issues/${id}/attachments/${attId}${qs({ expectedRevision })}`),
    deploy: (id, body) => request('POST', `/api/issues/${id}/deployments`, { body }),
  },
  dashboard: {
    summary: (p) => request('GET', '/api/dashboard/summary' + qs(p)),
    daily: (p) => request('GET', '/api/dashboard/daily' + qs(p)),
    burnup: (p) => request('GET', '/api/dashboard/burnup' + qs(p)),
    distribution: (p) => request('GET', '/api/dashboard/distribution' + qs(p)),
    attention: (p) => request('GET', '/api/dashboard/attention' + qs(p)),
  },
  search: (q, limit = 10) => request('GET', '/api/search' + qs({ q, limit })),
  my: { counts: () => request('GET', '/api/my/counts') },
  admin: {
    backupStatus: () => request('GET', '/api/admin/backup/status'),
    runBackup: () => request('POST', '/api/admin/backup/run', { body: {} }),
    audit: (p) => request('GET', '/api/admin/audit' + qs(p)),
    health: () => request('GET', '/api/admin/health'),
  },
};
