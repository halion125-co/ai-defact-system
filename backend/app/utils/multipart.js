'use strict';

/**
 * 외부 의존성 없는 최소 multipart/form-data parser.
 * 반환: { fields: {name: value}, files: [{fieldName, filename, contentType, data(Buffer)}] }
 */
function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) throw new Error('multipart boundary가 없습니다.');
  const boundary = Buffer.from(`--${(m[1] || m[2]).trim()}`);
  const fields = {};
  const files = [];

  let pos = buffer.indexOf(boundary);
  if (pos < 0) return { fields, files };
  pos += boundary.length;

  while (pos < buffer.length) {
    // 종료 boundary
    if (buffer[pos] === 0x2d && buffer[pos + 1] === 0x2d) break;
    // CRLF 건너뛰기
    if (buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) pos += 2;

    const headerEnd = buffer.indexOf('\r\n\r\n', pos);
    if (headerEnd < 0) break;
    const headerText = buffer.slice(pos, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;
    const next = buffer.indexOf(boundary, bodyStart);
    if (next < 0) break;
    let bodyEnd = next;
    // body 뒤 CRLF 제거
    if (buffer[bodyEnd - 2] === 0x0d && buffer[bodyEnd - 1] === 0x0a) bodyEnd -= 2;
    const body = buffer.slice(bodyStart, bodyEnd);

    const headers = {};
    for (const line of headerText.split('\r\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    }
    const disposition = headers['content-disposition'] || '';
    const nameMatch = /name="([^"]*)"/i.exec(disposition);
    const fileMatch = /filename="([^"]*)"/i.exec(disposition);
    const fieldName = nameMatch ? nameMatch[1] : '';

    if (fileMatch) {
      files.push({
        fieldName,
        filename: decodeFilename(fileMatch[1]),
        contentType: headers['content-type'] || 'application/octet-stream',
        data: body,
      });
    } else {
      fields[fieldName] = body.toString('utf8');
    }

    pos = next + boundary.length;
  }
  return { fields, files };
}

function decodeFilename(name) {
  try {
    // 브라우저는 UTF-8 raw 전송. percent-encoding 된 경우 복원
    return /%[0-9A-Fa-f]{2}/.test(name) ? decodeURIComponent(name) : name;
  } catch {
    return name;
  }
}

module.exports = { parseMultipart };
