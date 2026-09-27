// 零依赖静态 Web 服务：服务 build 产物 dist/，并提供 /healthz 健康检查。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('./dist', import.meta.url));
if (!existsSync(ROOT)) {
  console.error(
    '[server] 未找到 dist/ 目录，请先执行构建：npm run build',
  );
  process.exit(1);
}

const PORT = Number(process.env.WEB_PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/healthz') {
    send(res, 200, JSON.stringify({ status: 'ok' }), 'application/json');
    return;
  }

  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';
  // 防目录穿越：规范化后必须仍在 ROOT 内
  const file = normalize(join(ROOT, path));
  if (file !== ROOT && !file.startsWith(ROOT + '/')) {
    send(res, 403, 'Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    send(res, 200, body, MIME[extname(file)] || 'application/octet-stream');
  } catch {
    // 单页应用：未知路径回到首页
    try {
      const index = await readFile(join(ROOT, 'index.html'));
      send(res, 200, index, MIME['.html']);
    } catch {
      send(res, 404, 'Not found');
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[server] 彩窗铅条骨架编排页面：http://${HOST}:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
