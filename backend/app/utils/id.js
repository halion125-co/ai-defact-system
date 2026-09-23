'use strict';

const crypto = require('crypto');

function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function padNumber(n, width = 4) {
  const s = String(n);
  return s.length >= width ? s : s.padStart(width, '0');
}

function formatIssueId(prefix, n) {
  return `${prefix}-${padNumber(n, 4)}`;
}

const ISSUE_ID_RE = /^(DEF|IMP|INQ)-(\d{4,})$/;

function parseIssueId(id) {
  const m = ISSUE_ID_RE.exec(String(id || ''));
  if (!m) return null;
  return { prefix: m[1], number: parseInt(m[2], 10) };
}

module.exports = { randomToken, padNumber, formatIssueId, parseIssueId, ISSUE_ID_RE };
