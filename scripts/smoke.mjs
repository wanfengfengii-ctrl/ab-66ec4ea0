// 一次性冒烟：
//  1. 对内置样例执行编排，校验采用数、连通性、度数区间与择优结果；
//  2. 启动静态服务器，通过 HTTP 验证 /healthz 与首页可用；
//  3. 覆盖无解证据路径（稳定、按编号排序）。
// 任一步失败即以非零退出码结束，供 Compose verify 服务报告。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { planSkeleton } from '../web/solver.js';
import { SAMPLE_PIECES, SAMPLE_BARS } from '../web/sample.js';
import { compareId } from '../web/solver.js';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

function fail(msg) {
  console.error(`[smoke] 失败：${msg}`);
  process.exit(1);
}

// ---- 1. 样例骨架冒烟 ----
const r = planSkeleton(SAMPLE_PIECES, SAMPLE_BARS);
if (!r.ok) fail('样例未通过数据校验');
if (!r.feasible) fail('样例应存在合格骨架');
if (r.selectedBars.length !== SAMPLE_PIECES.length - 1)
  fail(`采用铅条数应为 ${SAMPLE_PIECES.length - 1}`);
if (r.selectedBars.length + r.unusedBars.length !== SAMPLE_BARS.length)
  fail('采用与未采用铅条应覆盖全部候选');
for (const d of r.degrees) {
  if (d.degree < d.lo || d.degree > d.hi)
    fail(`玻璃片 ${d.id} 实际连接数 ${d.degree} 超出区间 [${d.lo}, ${d.hi}]`);
}
// 连通性与无环复核（标准并查集，按玻璃片在样例中的下标）
const rootOf = SAMPLE_PIECES.map((_, i) => i);
const findRoot = (x) => {
  while (rootOf[x] !== x) x = rootOf[x];
  return x;
};
const idIndex = new Map(SAMPLE_PIECES.map((p, i) => [p.id, i]));
for (const e of r.selectedBars) {
  const ra = findRoot(idIndex.get(e.u));
  const rb = findRoot(idIndex.get(e.v));
  if (ra === rb) fail(`铅条 ${e.index} 形成闭环`);
  rootOf[rb] = ra;
}
if (new Set(SAMPLE_PIECES.map((_, i) => findRoot(i))).size !== 1)
  fail('采用铅条未连通全部玻璃片');
console.log(
  `[smoke] 样例骨架 OK：采用 ${r.selected.join(',')}，最弱等级 ${r.bottleneck}，总代价 ${r.totalCost}`,
);

// 无解路径
const bad = planSkeleton(
  [
    { id: '1', lo: 1, hi: 3 },
    { id: '2', lo: 1, hi: 3 },
    { id: '3', lo: 1, hi: 3 },
  ],
  [{ index: 1, u: '1', v: '2', grade: 1, cost: 0 }],
);
if (bad.feasible || !bad.evidence.length) fail('无解模型应产生证据');
const ids = bad.evidence.map((e) => e.pieceId);
const sorted = ids.every((id, i) => i === 0 || compareId(ids[i - 1], id) <= 0);
if (!sorted) fail('证据须按玻璃片编号稳定排序');
console.log('[smoke] 无解证据 OK：', bad.evidence.map((e) => `${e.pieceId}:${e.kind}`).join(' '));

// ---- 2. HTTP 健康检查 ----
// Compose 中通过 SMOKE_TARGET 指向已就绪的 web 服务；本地运行则自行拉起服务器。
const target = process.env.SMOKE_TARGET;
let base;
let srv = null;
if (target) {
  base = target.replace(/\/$/, '');
} else {
  const PORT = Number(process.env.SMOKE_PORT || 8099);
  base = `http://127.0.0.1:${PORT}`;
  srv = spawn(process.execPath, [join(ROOT, 'server.js')], {
    env: { ...process.env, WEB_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  srv.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
}
let healthy = false;
for (let i = 0; i < 40; i++) {
  try {
    const h = await fetch(`${base}/healthz`);
    if (h.ok && (await h.json()).status === 'ok') {
      healthy = true;
      break;
    }
  } catch {
    /* 服务器尚未就绪，重试 */
  }
  await sleep(100);
}
if (!healthy) fail('/healthz 未通过');

const page = await fetch(`${base}/`);
if (!page.ok) fail('首页 HTTP 状态异常');
const html = await page.text();
if (!html.includes('彩窗') || !html.includes('编排')) fail('首页内容不符');
const js = await fetch(`${base}/solver.js`);
if (!js.ok) fail('求解器脚本不可达');
console.log('[smoke] HTTP 健康检查 OK：/healthz 与首页均可用');

if (srv) {
  srv.kill('SIGTERM');
  await sleep(100);
}
console.log('[smoke] 全部通过');
