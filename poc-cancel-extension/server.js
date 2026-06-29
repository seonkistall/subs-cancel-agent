// Tiny static file server for the sandbox (no deps). Usage: node server.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, 'sandbox');
const PORT = Number(process.argv[2] || 8000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/subscriptions.html';
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('sandbox on http://localhost:' + PORT + '/subscriptions.html'));
