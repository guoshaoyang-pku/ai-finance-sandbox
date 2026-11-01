'use strict';
// Serve only this prototype, never a directory tree or user files.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'));
const port = Number(process.env.PORT || 8765);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT');
const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {Allow: 'GET, HEAD'}); return res.end('Method not allowed');
  }
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400); return res.end('Bad request'); }
  let body, type;
  if (pathname === '/' || pathname === '/index.html') {
    body = html; type = 'text/html; charset=utf-8';
  } else if (pathname === '/healthz') {
    body = Buffer.from(JSON.stringify({ok: true, uiVersion: '0.1.1'})); type = 'application/json';
  } else if (pathname === '/favicon.ico') {
    res.writeHead(204); return res.end();
  } else {
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}); return res.end('Not found');
  }
  res.writeHead(200, {'Content-Type': type, 'Content-Length': body.length});
  res.end(req.method === 'HEAD' ? undefined : body);
});
server.on('error', err => { console.error(err.message); process.exitCode = 1; });
server.listen(port, host, () => console.log(`AI Finance v0.1.1: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
