'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDir } = require('./fsutil');
const { nowIso, dateKey } = require('./time');

/**
 * 파일 + 콘솔 로거. 07_SECURITY §16: Comment 본문/첨부/개인정보 과다 기록 금지.
 */
class Logger {
  constructor({ logDir, level = 'info', console: toConsole = true }) {
    this.logDir = logDir;
    this.level = level;
    this.toConsole = toConsole;
    if (logDir) ensureDir(logDir);
  }

  _write(kind, obj) {
    const line = JSON.stringify({ ts: nowIso(), ...obj });
    if (this.logDir) {
      const file = path.join(this.logDir, `${kind}-${dateKey(nowIso())}.log`);
      try {
        fs.appendFileSync(file, line + '\n', 'utf8');
      } catch {
        /* 로그 실패는 서비스에 영향 주지 않음 */
      }
    }
    if (this.toConsole) {
      if (kind === 'error') console.error(line);
      else console.log(line);
    }
  }

  access(entry) {
    this._write('access', { level: 'info', ...entry });
  }

  info(message, extra = {}) {
    this._write('app', { level: 'info', message, ...extra });
  }

  warn(message, extra = {}) {
    this._write('app', { level: 'warn', message, ...extra });
  }

  error(message, extra = {}) {
    this._write('error', { level: 'error', message, ...extra });
  }
}

module.exports = { Logger };
