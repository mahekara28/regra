import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSite, buildDirectory, publicFiles } from './build.mjs';

const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
export function createPreviewServer() {
  return http.createServer(async (request, response) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" };
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { ...headers, Allow: 'GET, HEAD' }); response.end(); return; }
    let pathname;
    try { pathname = new URL(request.url, 'http://localhost').pathname; }
    catch { response.writeHead(400, headers); response.end(); return; }
    if (pathname === '/' || pathname === '/regra') { response.writeHead(302, { ...headers, Location: '/regra/' }); response.end(); return; }
    const requested = pathname === '/regra/' ? 'index.html' : pathname.startsWith('/regra/') ? pathname.slice('/regra/'.length) : '';
    const found = publicFiles.includes(requested);
    const file = found ? requested : '404.html';
    try {
      const bytes = await readFile(path.join(buildDirectory, file));
      response.writeHead(found ? 200 : 404, { ...headers, 'Content-Type': contentTypes[path.extname(file)], 'Content-Length': bytes.length });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      response.writeHead(500, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Build the website with npm run site:build before previewing it.');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await buildSite();
  const server = createPreviewServer();
  server.on('error', error => { console.error(`Website preview: ${error.message}`); process.exitCode = 1; });
  server.listen(4318, '127.0.0.1', () => console.log('REGRA public website: http://127.0.0.1:4318/regra/\nPreview uses the GitHub Pages project path. Ctrl+C to stop.'));
}
