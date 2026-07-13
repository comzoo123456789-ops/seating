/* ════════════════════════════════════════════════════════════════
   자리배치도 공유 서버 (무설치 · Node 내장 모듈만 사용)
   - 정적 파일(index.html·app.js·styles.css·data.js) 서빙
   - GET  /api/state  → 저장된 공유 상태(JSON) 반환 (없으면 null)
   - PUT  /api/state  → 공유 상태 저장 (data.state.json)
   실행:  node server.js   (기본 포트 8080, PORT 환경변수로 변경 가능)
   같은 네트워크의 다른 PC/휴대폰에서 http://<이 PC IP>:8080 으로 접속하면
   모두 같은 배치도를 실시간(7초 폴링)으로 공유합니다.
   ════════════════════════════════════════════════════════════════ */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, 'public');   // 정적 파일은 public/ 에 있음
var PORT = process.env.PORT || 8080;
var DATA = path.join(__dirname, 'data.state.json');

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

var server = http.createServer(function (req, res) {
  var url = decodeURIComponent(req.url.split('?')[0]);

  // ── API ──
  if (url === '/api/state') {
    if (req.method === 'GET') {
      fs.readFile(DATA, 'utf8', function (err, txt) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(err ? 'null' : txt);
      });
      return;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      var body = '';
      req.on('data', function (c) { body += c; if (body.length > 30 * 1024 * 1024) req.destroy(); });
      req.on('end', function () {
        fs.writeFile(DATA, body, 'utf8', function (err) {
          if (err) { res.writeHead(500); res.end('{"ok":false}'); return; }
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
        });
      });
      return;
    }
    res.writeHead(405); res.end(); return;
  }

  // ── 정적 파일 ──
  if (url === '/') url = '/index.html';
  var safe = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');
  var file = path.join(ROOT, safe);
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    var ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('──────────────────────────────────────────────');
  console.log(' 자리배치도 공유 서버 실행 중');
  console.log(' 이 PC:        http://localhost:' + PORT);
  console.log(' 다른 기기:    http://<이 PC의 IP>:' + PORT + '  (같은 네트워크)');
  console.log(' 종료: Ctrl + C');
  console.log('──────────────────────────────────────────────');
});
