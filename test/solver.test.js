import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSkeleton, validateModel, compareId } from '../web/solver.js';
import { SAMPLE_PIECES, SAMPLE_BARS } from '../web/sample.js';

// ---- 独立暴力参考实现：枚举所有 (n-1) 条候选铅条的组合 ----
function combinations(arr, k) {
  const out = [];
  const cur = [];
  (function rec(start) {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i <= arr.length - (k - cur.length); i++) {
      cur.push(arr[i]);
      rec(i + 1);
      cur.pop();
    }
  })(0);
  return out;
}

function bruteForce(pieces, bars) {
  if (validateModel(pieces, bars).length) return { valid: false };
  const n = pieces.length;
  const idx = new Map(pieces.map((p) => [p.id, 0]));
  pieces.forEach((p, i) => idx.set(p.id, i));
  // 数值序列字典序（不能用字符串比较，否则 "10" 会错误地小于 "2"）
  const lexLess = (a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] < b[i];
    }
    return a.length < b.length;
  };
  let best = null;
  for (const combo of combinations(bars, n - 1)) {
    const parent = pieces.map((_, i) => i);
    const find = (x) => {
      while (parent[x] !== x) x = parent[x];
      return x;
    };
    const deg = Array(n).fill(0);
    let ok = true;
    let comps = n;
    for (const e of combo) {
      const a = idx.get(e.u);
      const b = idx.get(e.v);
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) {
        ok = false;
        break;
      }
      parent[rb] = ra;
      comps--;
      deg[a]++;
      deg[b]++;
    }
    if (!ok || comps !== 1) continue;
    for (let v = 0; v < n; v++) {
      if (deg[v] < pieces[v].lo || deg[v] > pieces[v].hi) ok = false;
    }
    if (!ok) continue;
    const bottleneck = Math.min(...combo.map((e) => e.grade));
    const total = combo.reduce((s, e) => s + e.cost, 0);
    const seq = combo.map((e) => e.index).sort((a, b) => a - b);
    if (
      !best ||
      bottleneck > best.bottleneck ||
      (bottleneck === best.bottleneck &&
        (total < best.total - 1e-9 ||
          (Math.abs(total - best.total) <= 1e-9 && lexLess(seq, best.seq))))
    ) {
      best = { bottleneck, total, seq };
    }
  }
  return { valid: true, best };
}

function randomModel(rng, n, m) {
  const pieces = [];
  for (let i = 1; i <= n; i++) {
    const lo = Math.floor(rng() * 3);
    const hi = lo + Math.floor(rng() * 3);
    pieces.push({ id: String(i), lo, hi });
  }
  const allPairs = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) allPairs.push([i, j]);
  for (let i = allPairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]];
  }
  const bars = allPairs.slice(0, m).map(([a, b], i) => ({
    index: i + 1,
    u: String(a + 1),
    v: String(b + 1),
    grade: 1 + Math.floor(rng() * 3),
    cost: Math.floor(rng() * 8),
  }));
  return { pieces, bars };
}

// 确定性伪随机
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('compareId：数字按数值、其余按字典序', () => {
  assert.deepEqual(['10', '2', '1', 'a'].sort(compareId), ['1', '2', '10', 'a']);
});

test('内置样例可解，且与暴力结果一致', () => {
  const r = planSkeleton(SAMPLE_PIECES, SAMPLE_BARS);
  assert.equal(r.ok, true);
  assert.equal(r.feasible, true);
  assert.equal(r.selected.length, SAMPLE_PIECES.length - 1);
  const ref = bruteForce(SAMPLE_PIECES, SAMPLE_BARS).best;
  assert.ok(ref);
  assert.equal(r.bottleneck, ref.bottleneck);
  assert.equal(r.totalCost, ref.total);
  assert.deepEqual(r.selected, ref.seq);
  // 最弱采用铅条等级必须为 3（存在全 3 级方案时不能选含 2 级的）
  assert.equal(r.bottleneck, 3);
});

test('200 个随机模型：可行性与三个择优目标均与暴力枚举一致', () => {
  const rng = mulberry32(20260927);
  for (let t = 0; t < 200; t++) {
    const n = 3 + Math.floor(rng() * 6); // 3..8
    const m = n - 1 + Math.floor(rng() * (15 - n)); // n-1..14
    const { pieces, bars } = randomModel(rng, n, Math.min(m, (n * (n - 1)) / 2));
    const r = planSkeleton(pieces, bars);
    const ref = bruteForce(pieces, bars);
    assert.equal(r.ok, true, `模型 ${t} 应通过校验`);
    if (ref.best === null) {
      assert.equal(r.feasible, false, `模型 ${t} 暴力无解而求解器有解`);
      assert.ok(r.evidence.length >= 1, `模型 ${t} 无解须给出证据`);
      const sorted = r.evidence
        .map((e) => e.pieceId)
        .every((id, i, arr) => i === 0 || compareId(arr[i - 1], id) <= 0);
      assert.ok(sorted, `模型 ${t} 证据须按玻璃片编号排序`);
    } else {
      assert.equal(r.feasible, true, `模型 ${t} 暴力有解而求解器无解`);
      assert.equal(
        r.bottleneck,
        ref.best.bottleneck,
        `模型 ${t} 瓶颈等级不符`,
      );
      assert.ok(
        Math.abs(r.totalCost - ref.best.total) < 1e-9,
        `模型 ${t} 总代价不符`,
      );
      assert.deepEqual(r.selected, ref.best.seq, `模型 ${t} 序号序列不符`);
      for (const d of r.degrees) {
        assert.ok(d.degree >= d.lo && d.degree <= d.hi);
      }
    }
  }
});

test('恰好选择 n-1 条且采用+未采用覆盖全部候选', () => {
  const r = planSkeleton(SAMPLE_PIECES, SAMPLE_BARS);
  assert.equal(r.selectedBars.length + r.unusedBars.length, SAMPLE_BARS.length);
  assert.equal(r.selectedBars.length, SAMPLE_PIECES.length - 1);
});

test('数据校验：重复编号、非法区间、未知端点、自环', () => {
  const r = planSkeleton(
    [
      { id: '1', lo: 0, hi: 2 },
      { id: '1', lo: 3, hi: 1 },
    ],
    [{ index: 1, u: '1', v: '1', grade: 1, cost: 0 }],
  );
  assert.equal(r.ok, false);
  assert.ok(r.validationIssues.some((s) => s.includes('重复')));
  assert.ok(r.validationIssues.some((s) => s.includes('下限大于上限')));
  assert.ok(r.validationIssues.some((s) => s.includes('自环')));
});

test('无解-不连通：证据按编号排序且为连通性证据', () => {
  const pieces = [
    { id: '1', lo: 1, hi: 3 },
    { id: '2', lo: 1, hi: 3 },
    { id: '3', lo: 1, hi: 3 },
    { id: '4', lo: 1, hi: 3 },
  ];
  const bars = [
    { index: 1, u: '1', v: '2', grade: 2, cost: 1 },
    { index: 2, u: '3', v: '4', grade: 2, cost: 1 },
  ];
  const r = planSkeleton(pieces, bars);
  assert.equal(r.feasible, false);
  assert.ok(r.evidence.every((e) => e.kind === 'connectivity'));
  assert.deepEqual(r.evidence.map((e) => e.pieceId), ['3', '4']);
});

test('无解-度数不可达：生成树叶子上限无法满足', () => {
  // 星形图：中心 1 是所有边的必经点，要求其度数 <= 2 则无解
  const pieces = [
    { id: '1', lo: 1, hi: 2 },
    { id: '2', lo: 1, hi: 3 },
    { id: '3', lo: 1, hi: 3 },
    { id: '4', lo: 1, hi: 3 },
  ];
  const bars = [
    { index: 1, u: '1', v: '2', grade: 2, cost: 1 },
    { index: 2, u: '1', v: '3', grade: 2, cost: 1 },
    { index: 3, u: '1', v: '4', grade: 2, cost: 1 },
  ];
  const r = planSkeleton(pieces, bars);
  assert.equal(r.feasible, false);
  assert.equal(r.evidence[0].pieceId, '1');
  assert.match(r.evidence[0].detail, /至少需要 3/);
});

test('字典序次序：前两目标并列时取序号序列最小', () => {
  // 4 个点的完全图 K4，全部等级 1、代价 0；应有 16 棵生成树并列，
  // 解必须是序号最小的三棵可成树的边。录入顺序：12=1,13=2,14=3,23=4,24=5,34=6
  const pieces = [1, 2, 3, 4].map((i) => ({ id: String(i), lo: 1, hi: 3 }));
  const pairs = [
    ['1', '2'],
    ['1', '3'],
    ['1', '4'],
    ['2', '3'],
    ['2', '4'],
    ['3', '4'],
  ];
  const bars = pairs.map(([u, v], i) => ({
    index: i + 1,
    u,
    v,
    grade: 1,
    cost: 0,
  }));
  const r = planSkeleton(pieces, bars);
  assert.equal(r.feasible, true);
  // 边 1(12)、2(13)、3(14) 构成以 1 为中心的星形，是序号最小的生成树
  assert.deepEqual(r.selected, [1, 2, 3]);
});

test('瓶颈优先于代价：含更高等级铅条的更贵方案胜出', () => {
  // 唯一一棵生成树即全部三条边（路径），此处构造两条生成树竞争：
  // 三角+尾：点 1-2-3 三角，3-4 尾边
  const pieces = [1, 2, 3, 4].map((i) => ({
    id: String(i),
    lo: 1,
    hi: 3,
  }));
  const bars = [
    { index: 1, u: '1', v: '2', grade: 5, cost: 100 },
    { index: 2, u: '1', v: '3', grade: 5, cost: 100 },
    { index: 3, u: '2', v: '3', grade: 1, cost: 1 },
    { index: 4, u: '3', v: '4', grade: 5, cost: 1 },
  ];
  const r = planSkeleton(pieces, bars);
  // 含边3 的树瓶颈为 1；不含边3（选 1,2,4）瓶颈为 5，必须胜出
  assert.equal(r.bottleneck, 5);
  assert.deepEqual(r.selected, [1, 2, 4]);
});
