'use strict';

const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * Frontend 정적 파일 서버. SPA fallback(index.html). 경로 이탈 차단.
 */
function createStaticHandler(rootDir) {
  const root = path.resolve(rootDir);
  const indexFile = path.join(root, 'index.html');

  return function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const target = path.resolve(root, '.' + rel);
    if (target !== root && !target.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return true;
    }
    let file = target;
    let stat = null;
    try {
      stat = fs.statSync(file);
      if (stat.isDirectory()) {
        file = path.join(file, 'index.html');
        stat = fs.statSync(file);
      }
    } catch {
      stat = null;
    }
    if (!stat) {
      // SPA fallback: 확장자 없는 경로는 index.html
      if (!path.extname(rel) && fs.existsSync(indexFile)) {
        file = indexFile;
        stat = fs.statSync(file);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return true;
      }
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
    });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    fs.createReadStream(file).pipe(res);
    return true;
  };
}

module.exports = { createStaticHandler, MIME };
