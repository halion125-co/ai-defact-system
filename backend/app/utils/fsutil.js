'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * JSON 파일 읽기. 파일이 없으면 null, 파싱 실패 시 오류 throw(호출자가 fail-safe 처리).
 */
function readJson(file) {
  if (!exists(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.trim() === '') throw new Error(`빈 JSON 파일: ${file}`);
  return JSON.parse(raw);
}

/**
 * Atomic write: temp file → fsync → rename/replace.
 * 기존 파일은 `.bak` 한 세대 보존(복구용).
 */
function writeJsonAtomic(file, data, { keepBackup = true } = {}) {
  const dir = path.dirname(file);
  ensureDir(dir);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  const payload = JSON.stringify(data, null, 2);
  let fd;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, payload, 0, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    // 쓰기 검증: temp 파일이 유효한 JSON인지 확인 후 교체
    JSON.parse(fs.readFileSync(tmp, 'utf8'));
    if (keepBackup && exists(file)) {
      try {
        fs.copyFileSync(file, `${file}.bak`);
      } catch {
        /* backup 실패는 저장을 막지 않음 */
      }
    }
    fs.renameSync(tmp, file);
  } catch (err) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      if (exists(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/** 디렉터리 내 남은 temp 파일 정리(startup) */
function cleanupTempFiles(dir) {
  if (!exists(dir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('.') && f.endsWith('.tmp')) {
      try {
        fs.unlinkSync(path.join(dir, f));
        n++;
      } catch {
        /* ignore */
      }
    }
  }
  return n;
}

function appendLine(file, line) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, line + '\n', 'utf8');
}

function copyDirSync(src, dest, filter = () => true) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (!filter(s, entry)) continue;
    if (entry.isDirectory()) copyDirSync(s, d, filter);
    else fs.copyFileSync(s, d);
  }
}

function safeJoin(root, ...segments) {
  const resolved = path.resolve(root, ...segments);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error('경로 이탈 시도가 감지되었습니다.');
  }
  return resolved;
}

module.exports = { ensureDir, exists, readJson, writeJsonAtomic, cleanupTempFiles, appendLine, copyDirSync, safeJoin };
