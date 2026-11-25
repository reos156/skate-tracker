// Servidor estático mínimo para probar la PWA: node tools/serve.mjs [puerto]

import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = createServer(async (request, response) => {
  // Sin parsear la URL completa: un request target raro no debe tumbar el server.
  let pathname;
  try {
    pathname = decodeURIComponent((request.url ?? '/').split('?')[0].split('#')[0]) || '/';
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('url inválida');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const target = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(ROOT)) {
    response.writeHead(403).end('fuera del proyecto');
    return;
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error('no es archivo');
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('no encontrado');
  }
});

server.on('error', (error) => {
  console.error(`no se pudo escuchar en :${PORT} — ${error.message}`);
  process.exit(1);
});

/** URLs por las que se puede abrir desde fuera del propio Linux. */
function reachableUrls(port) {
  const urls = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) urls.push(`http://${entry.address}:${port}`);
    }
  }
  return urls;
}

server.listen(PORT, () => {
  console.log(`Skate Tracker escuchando en el puerto ${PORT}`);
  console.log('Escucha en IPv4 y en IPv6, así que atiende tanto 127.0.0.1 como [::1].\n');
  for (const url of reachableUrls(PORT)) console.log(`  ${url}`);
  console.log('\nSi el navegador corre en Windows (WSL): usá localhost o la URL de la IP.');
  console.log('127.0.0.1 suele fallar ahí porque Windows reenvía localhost pero no IPv4.');
});
