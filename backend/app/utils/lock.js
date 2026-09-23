'use strict';

const { errors } = require('./errors');

/**
 * Key 단위 비동기 Mutex.
 * 단일 Backend Process가 data 디렉터리를 독점 소유한다는 전제(07_SECURITY §9)에서
 * Issue/Sequence/Users 파일별 직렬화를 보장한다.
 */
class KeyedMutex {
  constructor({ defaultTimeoutMs = 10000 } = {}) {
    this.queues = new Map(); // key -> Promise chain tail
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * @returns {Promise<() => void>} release 함수
   */
  acquire(key, timeoutMs = this.defaultTimeoutMs) {
    const prev = this.queues.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => current);
    this.queues.set(key, tail);

    const acquired = prev.then(() => {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        release();
        if (this.queues.get(key) === tail) this.queues.delete(key);
      };
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // timeout 시 대기열에서 이탈: 우리 슬롯을 즉시 해제하여 뒤 요청이 진행되게 함
        acquired.then((rel) => rel());
        reject(errors.lockTimeout());
      }, timeoutMs);
      acquired.then((rel) => {
        clearTimeout(timer);
        resolve(rel);
      });
    });
  }

  async withLock(key, fn, timeoutMs) {
    const release = await this.acquire(key, timeoutMs);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

module.exports = { KeyedMutex };
