// 로컬 미리보기 서버 — Cloudflare Pages 동작(clean URL + 미매칭 경로에 404.html을 404 상태로)을 재현한다.
// 404 재현이 중요한 이유: 404 페이지가 URL 경로를 읽어 gone/ 맵에서 복구 링크를 만들기 때문에,
// 평범한 'not found' 문자열을 돌려주면 그 동작을 로컬에서 검증할 수 없다.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'public');
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, code, body, ext) => { res.writeHead(code, { 'Content-Type': types[ext] || 'text/plain; charset=utf-8' }); res.end(body); };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) return send(res, 403, 'forbidden');
  fs.readFile(f, (e, d) => {
    if (!e) return send(res, 200, d, path.extname(f));
    // 확장자 없는 경로는 .html로 폴백 (CF Pages clean URL)
    if (!path.extname(f)) {
      return fs.readFile(f + '.html', (e2, d2) => {
        if (!e2) return send(res, 200, d2, '.html');
        notFound(res);
      });
    }
    notFound(res);
  });
}).listen(3360, () => console.log('serving public/ on 3360'));

// CF Pages는 미매칭 경로에 404.html을 "그 경로 그대로" 404 상태로 서빙한다
function notFound(res) {
  fs.readFile(path.join(root, '404.html'), (e, d) => {
    if (e) return send(res, 404, '404');
    send(res, 404, d, '.html');
  });
}
