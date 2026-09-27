// 简单构建步骤：校验源码、把 web/ 静态资产组装到 dist/，并写入构建清单。
import { rm, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const WEB = join(ROOT, 'web');
const DIST = join(ROOT, 'dist');

const ASSETS = ['index.html', 'styles.css', 'app.js', 'solver.js', 'sample.js'];

const missing = ASSETS.filter((f) => !existsSync(join(WEB, f)));
if (missing.length) {
  console.error('[build] 缺少源文件：', missing.join(', '));
  process.exit(1);
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
for (const f of ASSETS) {
  await copyFile(join(WEB, f), join(DIST, f));
}

// 对求解器做一次构建期冒烟导入，确保模块可加载
const { planSkeleton } = await import(join(DIST, 'solver.js'));
const probe = planSkeleton(
  [
    { id: 'a', lo: 1, hi: 2 },
    { id: 'b', lo: 1, hi: 2 },
  ],
  [{ index: 1, u: 'a', v: 'b', grade: 1, cost: 0 }],
);
if (!probe.feasible) {
  console.error('[build] 求解器自检失败');
  process.exit(1);
}

const manifest = {
  name: 'stained-glass-lead-skeleton',
  builtAt: new Date().toISOString(),
  assets: ASSETS,
};
await writeFile(join(DIST, 'build-manifest.json'), JSON.stringify(manifest, null, 2));
console.log('[build] 完成，产物已写入 dist/：', ASSETS.join(', '));
