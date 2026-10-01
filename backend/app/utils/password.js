'use strict';

const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;
// scrypt 기본 파라미터(N=16384, r=8, p=1)는 Node 기본값과 동일하며 OWASP 권고 최소 수준을 충족한다.

/**
 * 비밀번호를 scrypt(salt 포함)로 해시한다. 저장 형식: "scrypt$<salt-hex>$<hash-hex>"
 * 매 호출마다 새 랜덤 salt를 쓰므로, 같은 비밀번호라도 해시 결과는 매번 달라진다.
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * 평문 비밀번호가 저장된 해시와 일치하는지 검증한다. 형식이 올바르지 않으면 false(비교 자체를 하지 않음).
 * timingSafeEqual로 비교해 타이밍 사이드채널을 막는다.
 */
function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  let salt, expected;
  try {
    salt = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = crypto.scryptSync(String(password), salt, expected.length);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
