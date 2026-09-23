'use strict';

/**
 * 시간 유틸. 모든 저장 시각은 ISO8601 + 프로젝트 timezone offset(기본 +09:00) 형식.
 */
let DEFAULT_TZ = 'Asia/Seoul';

function setDefaultTimezone(tz) {
  if (tz) DEFAULT_TZ = tz;
}

const partsCache = new Map();
function formatter(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  }
  return partsCache.get(tz);
}

function tzParts(date, tz = DEFAULT_TZ) {
  const parts = formatter(tz).formatToParts(date);
  const out = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = parseInt(p.value, 10);
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** timezone offset(분) 계산 */
function tzOffsetMinutes(date, tz = DEFAULT_TZ) {
  const p = tzParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const real = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - real) / 60000);
}

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

function toIso(date, tz = DEFAULT_TZ) {
  const p = tzParts(date, tz);
  const off = tzOffsetMinutes(date, tz);
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

function nowIso(tz = DEFAULT_TZ) {
  return toIso(new Date(), tz);
}

/** ISO 문자열 → 'YYYY-MM-DD' (프로젝트 timezone 기준) */
function dateKey(iso, tz = DEFAULT_TZ) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = tzParts(d, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 'YYYY-MM-DD' 또는 ISO 입력 → Date. 실패 시 null */
function parseDate(input) {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DD'의 프로젝트 timezone 기준 하루 시작/끝 (ms) */
function dayRange(dateStr, tz = DEFAULT_TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) return null;
  const guess = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0));
  const off = tzOffsetMinutes(guess, tz);
  const start = Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0) - off * 60000;
  return { start, end: start + 86400000 - 1 };
}

function addDays(dateStr, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function daysBetween(fromIso, toIso) {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400000;
}

module.exports = { setDefaultTimezone, nowIso, toIso, dateKey, parseDate, dayRange, addDays, daysBetween, pad };
