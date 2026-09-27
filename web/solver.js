// 彩窗铅条骨架规划求解器（浏览器 / Node 共用的 ES Module）
//
// 问题：给定 n 块玻璃片（每片允许连接数闭区间 [lo, hi]）与 m 条候选铅条
// （录入序号、两端编号、抗拉等级、安装代价），联合选择恰好 n-1 条，
// 使全部玻璃片连通、无环（即一棵生成树）、各片度数落在区间内；
// 依次按以下次序择优：
//   1. 最弱采用铅条的抗拉等级最高（瓶颈等级最大化）
//   2. 总安装代价最低
//   3. 采用铅条录入序号序列字典序最小
//
// 规模 n <= 8, m <= 14，直接 DFS 枚举（带并查集剪枝）即可穷举。

/** 玻璃片编号排序：纯数字按数值，其余按字典序，数字组排在前面。 */
export function compareId(a, b) {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na !== nb) return na ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function isInt(value) {
  return Number.isInteger(value);
}

/**
 * 校验草稿数据。返回问题字符串数组（空数组合法）。
 * 合法后调用方可假定：编号非空且唯一、区间为非负整数且 lo<=hi、
 * 铅条端点均存在、非自环、等级为正整数、代价为非负数字。
 */
export function validateModel(pieces, bars) {
  const issues = [];
  if (!Array.isArray(pieces) || pieces.length === 0) {
    issues.push('还没有录入任何玻璃片');
    return issues;
  }
  const ids = new Set();
  const isBlank = (v) => v === '' || v === null || v === undefined;
  for (const raw of pieces) {
    const id = String(raw.id ?? '').trim();
    if (!id) {
      issues.push('存在编号为空的玻璃片');
      continue;
    }
    if (ids.has(id)) issues.push(`玻璃片编号重复：${id}`);
    ids.add(id);
    const lo = Number(raw.lo);
    const hi = Number(raw.hi);
    if (isBlank(raw.lo) || isBlank(raw.hi) || !isInt(lo) || !isInt(hi) || lo < 0 || hi < 0) {
      issues.push(`玻璃片 ${id} 的连接数区间必须是非负整数`);
    } else if (lo > hi) {
      issues.push(`玻璃片 ${id} 的连接数区间下限大于上限（${lo} > ${hi}）`);
    }
  }

  const seenIndex = new Set();
  (bars || []).forEach((raw, i) => {
    const seq = raw.index ?? i + 1;
    if (!isInt(Number(seq)) || Number(seq) < 1) {
      issues.push(`第 ${i + 1} 条候选铅条录入序号非法`);
    } else if (seenIndex.has(Number(seq))) {
      issues.push(`候选铅条录入序号重复：${seq}`);
    } else {
      seenIndex.add(Number(seq));
    }
    const u = String(raw.u ?? '').trim();
    const v = String(raw.v ?? '').trim();
    if (!ids.has(u) || !ids.has(v)) {
      issues.push(`第 ${seq} 条铅条的端点编号不存在（${u || '?'} — ${v || '?'}）`);
    } else if (u === v) {
      issues.push(`第 ${seq} 条铅条两端都是玻璃片 ${u}，不能形成自环`);
    }
    const grade = Number(raw.grade);
    if (isBlank(raw.grade) || !isInt(grade) || grade < 1) {
      issues.push(`第 ${seq} 条铅条的抗拉等级必须是正整数`);
    }
    const cost = Number(raw.cost);
    if (isBlank(raw.cost) || !Number.isFinite(cost) || cost < 0) {
      issues.push(`第 ${seq} 条铅条的安装代价必须是非负数字`);
    }
  });
  return issues;
}

function normalize(pieces, bars) {
  const normPieces = pieces.map((p) => ({
    id: String(p.id).trim(),
    lo: Number(p.lo),
    hi: Number(p.hi),
  }));
  const indexById = new Map(normPieces.map((p, i) => [p.id, i]));
  const normBars = bars.map((b, i) => ({
    index: isInt(Number(b.index)) ? Number(b.index) : i + 1,
    u: String(b.u).trim(),
    v: String(b.v).trim(),
    grade: Number(b.grade),
    cost: Number(b.cost),
    a: indexById.get(String(b.u).trim()),
    b: indexById.get(String(b.v).trim()),
  }));
  return { normPieces, normBars };
}

function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (i >= b.length) return false;
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return a.length < b.length;
}

/**
 * 枚举全部满足度数上界的生成树，返回最优方案或 null。
 */
function enumerateBestTree(pieces, bars, options = {}) {
  const n = pieces.length;
  const m = bars.length;
  const need = n - 1;
  const lo = pieces.map((p) => (options.ignoreLower ? 0 : p.lo));
  const hi = pieces.map((p) => (options.ignoreUpper ? n - 1 : p.hi));

  const parent = Array.from({ length: n }, (_, i) => i);
  const size = Array(n).fill(1);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x];
    return x;
  };
  const deg = Array(n).fill(0);

  // suffix[k][v]：第 k..m-1 条候选铅条中触及顶点 v 的条数，用于下界剪枝
  const suffix = Array.from({ length: m + 1 }, () => Array(n).fill(0));
  for (let k = m - 1; k >= 0; k--) {
    for (let v = 0; v < n; v++) suffix[k][v] = suffix[k + 1][v];
    suffix[k][bars[k].a]++;
    suffix[k][bars[k].b]++;
  }

  const chosen = [];
  let best = null;

  function consider() {
    if (!options.ignoreLower) {
      for (let v = 0; v < n; v++) if (deg[v] < lo[v]) return;
    }
    let bottleneck = Infinity;
    let total = 0;
    for (const pos of chosen) {
      const e = bars[pos];
      if (e.grade < bottleneck) bottleneck = e.grade;
      total += e.cost;
    }
    const seq = chosen.map((pos) => bars[pos].index);
    const better =
      best === null ||
      bottleneck > best.bottleneck ||
      (bottleneck === best.bottleneck &&
        (total < best.total - 1e-9 ||
          (Math.abs(total - best.total) <= 1e-9 && lexLess(seq, best.seq))));
    if (better) {
      best = {
        seq,
        positions: chosen.slice(),
        bottleneck,
        total,
        degrees: deg.slice(),
      };
    }
  }

  function dfs(k, picked, components) {
    if (picked === need) {
      if (components === 1) consider();
      return;
    }
    if (k === m) return;
    if (picked + (m - k) < need) return;
    if (!options.ignoreLower) {
      for (let v = 0; v < n; v++) {
        if (deg[v] + suffix[k][v] < lo[v]) return;
      }
    }

    const e = bars[k];

    // 选入第 k 条：不能成环、不能突破度数上界
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb && deg[e.a] < hi[e.a] && deg[e.b] < hi[e.b]) {
      const mergeSmall = size[ra] < size[rb];
      const root = mergeSmall ? rb : ra;
      const child = mergeSmall ? ra : rb;
      parent[child] = root;
      size[root] += size[child];
      deg[e.a]++;
      deg[e.b]++;
      chosen.push(k);

      dfs(k + 1, picked + 1, components - 1);

      chosen.pop();
      deg[e.a]--;
      deg[e.b]--;
      parent[child] = child;
      size[root] -= size[child];
    }

    // 不选第 k 条
    dfs(k + 1, picked, components);
  }

  dfs(0, 0, n);
  return best;
}

/**
 * 无约束生成树中每个顶点度数的最小值 / 最大值（用于无解诊断）。
 * 通过两次带不同目标的枚举取得：枚举时不施加度数区间。
 * 候选图不连通时返回 null。
 */
function spanningTreeDegreeExtrema(pieces, bars) {
  const n = pieces.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x];
    return x;
  };
  let components = n;
  for (const e of bars) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) {
      parent[rb] = ra;
      components--;
    }
  }
  if (components !== 1) return null;

  const minDeg = Array(n).fill(Infinity);
  const maxDeg = Array(n).fill(-Infinity);
  const deg = Array(n).fill(0);
  const dsu = Array.from({ length: n }, (_, i) => i);
  const size = Array(n).fill(1);
  const f2 = (x) => {
    while (dsu[x] !== x) x = dsu[x];
    return x;
  };
  const chosen = [];
  const need = n - 1;

  function record() {
    for (let v = 0; v < n; v++) {
      if (deg[v] < minDeg[v]) minDeg[v] = deg[v];
      if (deg[v] > maxDeg[v]) maxDeg[v] = deg[v];
    }
  }

  function dfs(k, picked, comps) {
    if (picked === need) {
      if (comps === 1) record();
      return;
    }
    if (k === m0) return;
    if (picked + (m0 - k) < need) return;
    const e = bars[k];
    const ra = f2(e.a);
    const rb = f2(e.b);
    if (ra !== rb) {
      const mergeSmall = size[ra] < size[rb];
      const root = mergeSmall ? rb : ra;
      const child = mergeSmall ? ra : rb;
      dsu[child] = root;
      size[root] += size[child];
      deg[e.a]++;
      deg[e.b]++;
      chosen.push(k);
      dfs(k + 1, picked + 1, comps - 1);
      chosen.pop();
      deg[e.a]--;
      deg[e.b]--;
      dsu[child] = child;
      size[root] -= size[child];
    }
    dfs(k + 1, picked, comps);
  }

  const m0 = bars.length;
  dfs(0, 0, n);
  return { minDeg, maxDeg };
}

/**
 * 构造按玻璃片编号稳定排序的无解证据。
 * 依次给出：触达候选铅条数不足（连接范围）、候选图不连通（连通性）、
 * 单顶点在任意生成树中的度数上下界冲突；都不是时给出联合约束结论。
 */
export function failureEvidence(rawPieces, rawBars) {
  const { normPieces: pieces, normBars: bars } = normalize(rawPieces, rawBars);
  const order = pieces
    .map((p, v) => ({ p, v }))
    .sort((x, y) => compareId(x.p.id, y.p.id));
  const kindRank = { degree: 0, connectivity: 1, constraint: 2 };
  const evidence = [];
  const push = (pieceId, kind, detail) =>
    evidence.push({ pieceId, kind, detail });

  // 1) 连接范围：触达该玻璃片的候选铅条条数连下限都达不到
  const incident = new Map(pieces.map((p) => [p.id, 0]));
  for (const e of bars) {
    incident.set(e.u, (incident.get(e.u) ?? 0) + 1);
    incident.set(e.v, (incident.get(e.v) ?? 0) + 1);
  }
  for (const { p } of order) {
    const count = incident.get(p.id) ?? 0;
    if (count < p.lo) {
      push(
        p.id,
        'degree',
        `仅有 ${count} 条候选铅条触及该玻璃片，达不到连接数下限 ${p.lo}（允许区间 [${p.lo}, ${p.hi}]）`,
      );
    }
  }

  // 2) 连通性：候选铅条整体构成的图是否连通
  const n = pieces.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x];
    return x;
  };
  let components = n;
  for (const e of bars) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) {
      parent[rb] = ra;
      components--;
    }
  }
  if (components > 1) {
    const anchor = order[0].p.id;
    const anchorRoot = find(order[0].v);
    for (const { p } of order) {
      const v = pieces.findIndex((q) => q.id === p.id);
      if (find(v) !== anchorRoot) {
        push(
          p.id,
          'connectivity',
          `候选铅条图共有 ${components} 个互不连通的部分：该玻璃片与玻璃片 ${anchor} 之间不存在任何候选铅条路径，骨架无法连通`,
        );
      }
    }
  }

  if (evidence.length) {
    evidence.sort((a, b) => {
      const c = compareId(a.pieceId, b.pieceId);
      return c !== 0 ? c : kindRank[a.kind] - kindRank[b.kind];
    });
    return evidence;
  }

  // 3) 单片在“任意”生成树中的度数可达区间与要求区间冲突
  const extrema = spanningTreeDegreeExtrema(pieces, bars);
  if (extrema) {
    const vertexOf = new Map(pieces.map((p, v) => [p.id, v]));
    for (const { p } of order) {
      const v = vertexOf.get(p.id);
      if (extrema.maxDeg[v] < p.lo) {
        push(
          p.id,
          'degree',
          `任何连通无环骨架中该玻璃片最多只有 ${extrema.maxDeg[v]} 条连接，低于允许区间下限 ${p.lo}`,
        );
      } else if (extrema.minDeg[v] > p.hi) {
        push(
          p.id,
          'degree',
          `任何连通无环骨架中该玻璃片至少需要 ${extrema.minDeg[v]} 条连接，高于允许区间上限 ${p.hi}`,
        );
      }
    }
  }

  if (!evidence.length) {
    push(
      order[0].p.id,
      'constraint',
      '单片连接范围与候选图连通性均成立，但各玻璃片的连接数区间无法同时满足：不存在合格的连通无环骨架',
    );
  }
  evidence.sort((a, b) => {
    const c = compareId(a.pieceId, b.pieceId);
    return c !== 0 ? c : kindRank[a.kind] - kindRank[b.kind];
  });
  return evidence;
}

/**
 * 主入口：编排铅条骨架。
 *
 * 返回：
 *   { ok: false, validationIssues: string[] }
 *   { ok: true, feasible: false, evidence: [{pieceId, kind, detail}] }
 *   { ok: true, feasible: true, selected, selectedBars, unusedBars,
 *     bottleneck, totalCost, degrees: [{id, lo, hi, degree}] }
 */
export function planSkeleton(rawPieces, rawBars) {
  const issues = validateModel(rawPieces, rawBars || []);
  if (issues.length) return { ok: false, validationIssues: issues };

  const { normPieces: pieces, normBars: bars } = normalize(rawPieces, rawBars);
  const best = enumerateBestTree(pieces, bars);

  if (!best) {
    return { ok: true, feasible: false, evidence: failureEvidence(pieces, bars) };
  }

  const chosen = new Set(best.positions);
  const selectedBars = best.positions
    .map((pos) => bars[pos])
    .sort((x, y) => x.index - y.index);
  const unusedBars = bars
    .filter((_, pos) => !chosen.has(pos))
    .sort((x, y) => x.index - y.index);
  const degrees = pieces
    .map((p, v) => ({ id: p.id, lo: p.lo, hi: p.hi, degree: best.degrees[v] }))
    .sort((a, b) => compareId(a.id, b.id));

  return {
    ok: true,
    feasible: true,
    edgeCount: pieces.length - 1,
    selected: best.seq.slice().sort((a, b) => a - b),
    selectedBars,
    unusedBars,
    bottleneck: best.bottleneck,
    totalCost: best.total,
    degrees,
  };
}
