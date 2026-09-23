'use strict';

const path = require('path');
const { readJson, writeJsonAtomic } = require('../utils/fsutil');
const { errors } = require('../utils/errors');

/**
 * sequence.json: {"DEF":23,"IMP":7,"INQ":12,"EVT":126}
 * 전역 exclusive lock('sequence')으로 보호. ID 중복 0건 보장.
 */
class SequenceRepository {
  constructor({ dataDir, mutex }) {
    this.file = path.join(dataDir, 'sequence.json');
    this.mutex = mutex;
    this.state = null;
  }

  load() {
    this.state = readJson(this.file) || { DEF: 0, IMP: 0, INQ: 0, EVT: 0 };
    for (const k of ['DEF', 'IMP', 'INQ', 'EVT']) {
      if (typeof this.state[k] !== 'number') this.state[k] = 0;
    }
    writeJsonAtomic(this.file, this.state);
  }

  /** 시작 시 실제 Issue 파일 기준으로 sequence를 보정(중복 방지 안전장치) */
  reconcile(maxByPrefix) {
    let changed = false;
    for (const [prefix, max] of Object.entries(maxByPrefix)) {
      if ((this.state[prefix] || 0) < max) {
        this.state[prefix] = max;
        changed = true;
      }
    }
    if (changed) writeJsonAtomic(this.file, this.state);
    return changed;
  }

  async next(key) {
    return this.mutex.withLock('sequence', async () => {
      const value = (this.state[key] || 0) + 1;
      const nextState = { ...this.state, [key]: value };
      try {
        writeJsonAtomic(this.file, nextState);
      } catch (err) {
        throw errors.storageWriteFailed(`Sequence 저장 실패: ${err.message}`);
      }
      this.state = nextState;
      return value;
    });
  }

  current() {
    return { ...this.state };
  }
}

module.exports = { SequenceRepository };
