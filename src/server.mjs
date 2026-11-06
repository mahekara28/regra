import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Store } from './store.mjs';
import { examples } from './examples.mjs';
import { localModels, suggest } from './ollama.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const assets = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']]]);
function json(res, code, value) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 200000) throw new Error('Request exceeds 200 KB.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Request must contain valid JSON.'); }
}
export function createApp({ directory = path.resolve('.regra') } = {}) {
  const store = new Store(directory);
  const token = randomBytes(32).toString('hex');
  let aiBusy = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const port = server.address()?.port;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    const origin = req.headers.origin;
    if (!hosts.has(req.headers.host) || (origin && ![...hosts].some(h => origin === `http://${h}`)) || req.headers['sec-fetch-site'] === 'cross-site') {
      json(res, 403, { error: 'Use the local REGRA page to access this service.' }); return;
    }
    const route = new URL(req.url, 'http://127.0.0.1').pathname;
    try {
      if (req.method === 'GET' && assets.has(route)) {
        const [file, mime] = assets.get(route);
        res.writeHead(200, { 'Content-Type': mime }); res.end(await readFile(path.join(publicDir, file))); return;
      }
      if (req.method === 'GET' && route === '/api/state') {
        json(res, 200, { ...(await store.read()), examples, token, version: '0.1.0' }); return;
      }
      if (req.method === 'GET' && route === '/api/models') { json(res, 200, await localModels()); return; }
      if (req.method === 'GET' && route === '/api/export') {
        res.setHeader('Content-Disposition', 'attachment; filename="regra-lessons.json"');
        json(res, 200, { version: 1, exportedAt: new Date().toISOString(), lessons: (await store.read()).lessons }); return;
      }
      if (req.method === 'POST') {
        const supplied = String(req.headers['x-regra-token'] || '');
        if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) { json(res, 403, { error: 'Session expired. Refresh the page.' }); return; }
        if (!String(req.headers['content-type']).startsWith('application/json')) { json(res, 415, { error: 'Send application/json.' }); return; }
        const input = await body(req);
        if (route === '/api/verify') { json(res, 200, await store.verify(input)); return; }
        if (route === '/api/suggest') {
          if (aiBusy) { json(res, 409, { error: 'A local AI draft is already running.' }); return; }
          aiBusy = true;
          try { json(res, 200, await suggest({ ...input, lessons: (await store.read()).lessons })); }
          finally { aiBusy = false; }
          return;
        }
      }
      json(res, 404, { error: 'Not found.' });
    } catch (error) {
      if (!res.headersSent) json(res, 400, { error: error.name === 'TimeoutError' ? 'The local model took too long. Try a smaller model or use the example fix.' : error.message });
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}
export async function startServer({ port = Number(process.env.PORT || 4317), directory = process.env.REGRA_DATA || path.resolve('.regra') } = {}) {
  const server = createApp({ directory });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  console.log(`REGRA · Every fix earns its proof.\nOpen http://127.0.0.1:${server.address().port}\nLessons: ${path.resolve(directory)}\nKeep this terminal open. Press Ctrl+C to stop.`);
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch(error => { console.error(error.code === 'EADDRINUSE' ? 'Port 4317 is in use. Close the other REGRA window or set PORT to another port.' : error.message); process.exitCode = 2; });
}
