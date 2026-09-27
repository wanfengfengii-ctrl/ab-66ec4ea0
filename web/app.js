// 浏览器端：草稿编辑、画布渲染与编排结果展示。
import { planSkeleton } from './solver.js';
import { SAMPLE_PIECES, SAMPLE_BARS } from './sample.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VW = 720;
const VH = 560;

const state = {
  pieces: [], // {id, lo, hi, x, y}
  bars: [], // {index, u, v, grade, cost}
  nextBarIndex: 1,
  result: null,
};

const $ = (sel) => document.querySelector(sel);
const canvas = $('#canvas');
const pieceBody = $('#piece-table tbody');
const barBody = $('#bar-table tbody');
const resultBox = $('#result');

// ---------- 草稿操作 ----------

function circleLayout(pieces) {
  const cx = VW / 2;
  const cy = VH / 2 + 6;
  const radius = Math.min(VW, VH) * 0.33;
  pieces.forEach((p, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(pieces.length, 1);
    p.x = Math.round(cx + radius * Math.cos(ang));
    p.y = Math.round(cy + radius * Math.sin(ang));
  });
}

function addPiece(id) {
  const nums = state.pieces
    .map((p) => Number(p.id))
    .filter((n) => Number.isInteger(n));
  const autoId =
    id ?? String(nums.length ? Math.max(...nums) + 1 : state.pieces.length + 1);
  const p = { id: autoId, lo: 1, hi: 3, x: VW / 2, y: VH / 2 };
  state.pieces.push(p);
  // 新片先放在画布上一个不那么挤的位置
  const ang = Math.random() * Math.PI * 2;
  p.x = Math.round(VW / 2 + 150 * Math.cos(ang));
  p.y = Math.round(VH / 2 + 150 * Math.sin(ang));
  state.result = null;
  renderTables();
  renderCanvas();
  renderResult();
}

function addBar() {
  const u = state.pieces[0]?.id ?? '';
  const v = state.pieces[1]?.id ?? u;
  state.bars.push({
    index: state.nextBarIndex++,
    u,
    v,
    grade: 2,
    cost: 1,
  });
  state.result = null;
  renderTables();
  renderCanvas();
  renderResult();
}

function removePiece(id) {
  state.pieces = state.pieces.filter((p) => p.id !== id);
  state.result = null;
  renderTables();
  renderCanvas();
  renderResult();
}

function removeBar(index) {
  state.bars = state.bars.filter((b) => b.index !== index);
  state.result = null;
  renderTables();
  renderCanvas();
  renderResult();
}

function loadSample() {
  state.pieces = SAMPLE_PIECES.map((p) => ({ ...p }));
  state.bars = SAMPLE_BARS.map((b) => ({ ...b }));
  state.nextBarIndex = state.bars.length + 1;
  circleLayout(state.pieces);
  state.result = null;
  renderTables();
  renderCanvas();
  renderResult();
}

function clearDraft() {
  state.pieces = [];
  state.bars = [];
  state.nextBarIndex = 1;
  state.result = null;
  renderTables();
  renderCanvas();
  renderResult();
}

// ---------- 编辑表格 ----------

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function inputCell(value, oninput, attrs = {}) {
  const td = el('td');
  const input = el('input', { value: String(value), ...attrs });
  input.addEventListener('input', () => oninput(input.value));
  td.append(input);
  return td;
}

function renderPieces() {
  pieceBody.innerHTML = '';
  state.pieces.forEach((p) => {
    const tr = el('tr');
    tr.append(
      inputCell(p.id, (v) => {
        const old = p.id;
        p.id = v.trim();
        // 编号变化同步更新铅条端点下拉
        for (const b of state.bars) {
          if (b.u === old) b.u = p.id;
          if (b.v === old) b.v = p.id;
        }
        renderBars();
        renderCanvas();
      }, { 'aria-label': '玻璃片编号' }),
    );
    tr.append(
      inputCell(p.lo, (v) => {
        p.lo = v === '' ? '' : Number(v);
      }, { type: 'number', min: '0', 'aria-label': '连接数下限' }),
    );
    tr.append(
      inputCell(p.hi, (v) => {
        p.hi = v === '' ? '' : Number(v);
      }, { type: 'number', min: '0', 'aria-label': '连接数上限' }),
    );
    const td = el('td');
    const del = el('button', { class: 'btn del', type: 'button', title: '删除该玻璃片' }, '×');
    del.addEventListener('click', () => removePiece(p.id));
    td.append(del);
    tr.append(td);
    pieceBody.append(tr);
  });
  $('#piece-count').textContent = `（${state.pieces.length} 块）`;
}

function endpointSelect(current, onChange) {
  const select = el('select');
  for (const p of state.pieces) {
    const opt = el('option', { value: p.id }, p.id);
    if (p.id === current) opt.selected = true;
    select.append(opt);
  }
  if (current && !state.pieces.some((p) => p.id === current)) {
    const opt = el('option', { value: current }, `${current}（已缺失）`);
    opt.selected = true;
    select.append(opt);
  }
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function renderBars() {
  barBody.innerHTML = '';
  state.bars.forEach((b) => {
    const tr = el('tr');
    tr.append(el('td', { class: 'idx-cell' }, String(b.index)));

    const tdA = el('td');
    tdA.append(endpointSelect(b.u, (v) => { b.u = v; renderCanvas(); }));
    tr.append(tdA);
    const tdB = el('td');
    tdB.append(endpointSelect(b.v, (v) => { b.v = v; renderCanvas(); }));
    tr.append(tdB);

    tr.append(
      inputCell(b.grade, (v) => { b.grade = v === '' ? '' : Number(v); },
        { type: 'number', min: '1', 'aria-label': '抗拉等级' }),
    );
    tr.append(
      inputCell(b.cost, (v) => { b.cost = v === '' ? '' : Number(v); },
        { type: 'number', min: '0', step: '0.1', 'aria-label': '安装代价' }),
    );
    const td = el('td');
    const del = el('button', { class: 'btn del', type: 'button', title: '删除该铅条' }, '×');
    del.addEventListener('click', () => removeBar(b.index));
    td.append(del);
    tr.append(td);
    barBody.append(tr);
  });
  $('#bar-count').textContent = `（${state.bars.length} 条）`;
}

function renderTables() {
  renderPieces();
  renderBars();
}

// ---------- 画布 ----------

function gradeColor(g) {
  if (g >= 4) return '#ffd479';
  if (g === 3) return '#56c2d0';
  if (g === 2) return '#8b7cf6';
  return '#e573a8';
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function toSvgPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * VW,
    y: ((evt.clientY - rect.top) / rect.height) * VH,
  };
}

function renderCanvas() {
  canvas.innerHTML = '';
  const pos = new Map(state.pieces.map((p) => [p.id, p]));
  const selected = state.result?.feasible
    ? new Set(state.result.selectedBars.map((b) => b.index))
    : new Set();

  // 未采用候选先画，采用铅条压在上面
  const layers = [
    state.bars.filter((b) => !selected.has(b.index)),
    state.bars.filter((b) => selected.has(b.index)),
  ];
  layers.forEach((group, li) => {
    for (const b of group) {
      const a = pos.get(b.u);
      const c = pos.get(b.v);
      if (!a || !c) continue;
      const used = li === 1;
      const line = svgEl('line', {
        x1: a.x, y1: a.y, x2: c.x, y2: c.y,
        class: used ? 'edge-used' : 'edge-unused',
      });
      if (used) {
        line.setAttribute('stroke', gradeColor(Number(b.grade)));
        line.setAttribute('stroke-width', 5);
      }
      canvas.append(line);

      const mx = (a.x + c.x) / 2;
      const my = (a.y + c.y) / 2;
      const label = String(b.index);
      const bg = svgEl('rect', {
        x: mx - 8, y: my - 7, width: 16, height: 13, rx: 3,
        class: 'edge-label-bg',
      });
      const txt = svgEl('text', { x: mx, y: my + 3, class: 'edge-label' }, );
      txt.textContent = label;
      canvas.append(bg, txt);
    }
  });

  const degOf = new Map();
  if (state.result?.feasible) {
    for (const d of state.result.degrees) degOf.set(d.id, d);
  }

  for (const p of state.pieces) {
    const g = svgEl('g', { class: 'piece-node', transform: `translate(${p.x},${p.y})` });
    g.append(svgEl('circle', { r: 21, class: 'piece-circle' }));
    const t = svgEl('text', { y: 1, class: 'piece-label' });
    t.textContent = p.id;
    g.append(t);
    const sub = svgEl('text', { y: 36, class: 'piece-range' });
    const d = degOf.get(p.id);
    sub.textContent = d
      ? `连接 ${d.degree}  [${d.lo},${d.hi}]`
      : `[${p.lo === '' ? '?' : p.lo},${p.hi === '' ? '?' : p.hi}]`;
    if (d) sub.setAttribute('fill', '#4fd18b');
    g.append(sub);
    attachDrag(g, p);
    canvas.append(g);
  }
}

function attachDrag(group, piece) {
  let dragging = false;
  group.addEventListener('pointerdown', (e) => {
    dragging = true;
    group.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  group.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const pt = toSvgPoint(e);
    piece.x = Math.max(26, Math.min(VW - 26, Math.round(pt.x)));
    piece.y = Math.max(26, Math.min(VH - 30, Math.round(pt.y)));
    renderCanvas();
  });
  const stop = () => { dragging = false; };
  group.addEventListener('pointerup', stop);
  group.addEventListener('pointercancel', stop);
}

// ---------- 结果面板 ----------

function gradeTag(g) {
  const cls = g >= 4 ? 'tg4' : g === 3 ? 'tg3' : g === 2 ? 'tg2' : 'tg1';
  return `<span class="tag ${cls}">等级 ${g}</span>`;
}

function barChip(b, used) {
  return `<span class="chip ${used ? '' : 'unused'}">
    <b>#${b.index}</b> ${escapeHtml(b.u)}–${escapeHtml(b.v)}
    ${gradeTag(Number(b.grade))}<span>代价 ${b.cost}</span>
  </span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderResult() {
  const r = state.result;
  if (!r) {
    resultBox.innerHTML = '<p class="placeholder">录入玻璃片与候选铅条后，点击右上方「编排骨架」。</p>';
    return;
  }

  if (!r.ok) {
    resultBox.innerHTML =
      `<div class="banner bad">草稿数据存在问题，请先修正：</div>
       <ul class="issues">${r.validationIssues.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`;
    return;
  }

  if (!r.feasible) {
    const items = r.evidence
      .map(
        (e) => `<li>
          <span class="pid">${escapeHtml(e.pieceId)}</span>
          <span class="emsg"><span class="ekind">${
            e.kind === 'degree' ? '连接范围' : e.kind === 'connectivity' ? '连通性' : '联合约束'
          }</span>${escapeHtml(e.detail)}</span>
        </li>`,
      )
      .join('');
    resultBox.innerHTML =
      `<div class="banner bad">不存在合格骨架 — 失败证据（按玻璃片编号排序）</div>
       <ul class="evidence">${items}</ul>`;
    return;
  }

  const degRows = r.degrees
    .map(
      (d) => `<tr>
        <td>${escapeHtml(d.id)}</td>
        <td>[${d.lo}, ${d.hi}]</td>
        <td class="ok-t">${d.degree}</td>
        <td class="ok-t">${d.degree >= d.lo && d.degree <= d.hi ? '✓ 在区间内' : '✗'}</td>
      </tr>`,
    )
    .join('');

  resultBox.innerHTML = `
    <div class="banner ok">已选出 ${r.edgeCount} 条铅条：全部玻璃片连通且无环，各片连接数均在区间内。</div>
    <div class="metrics">
      <div class="metric"><span class="k">最弱采用铅条等级</span><span class="v">${r.bottleneck}</span></div>
      <div class="metric"><span class="k">总安装代价</span><span class="v">${r.totalCost}</span></div>
      <div class="metric"><span class="k">采用铅条数</span><span class="v">${r.selectedBars.length}</span></div>
    </div>
    <div class="subhead">采用铅条（序号序列：${r.selected.join(' → ')}）</div>
    <div class="chip-row">${r.selectedBars.map((b) => barChip(b, true)).join('')}</div>
    <div class="subhead">未采用候选（${r.unusedBars.length} 条）</div>
    <div class="chip-row">${r.unusedBars.map((b) => barChip(b, false)).join('')}</div>
    <div class="subhead">各玻璃片实际连接数</div>
    <table class="deg-table">
      <thead><tr><th>编号</th><th>允许区间</th><th>实际连接数</th><th>判定</th></tr></thead>
      <tbody>${degRows}</tbody>
    </table>`;
}

// ---------- 编排 ----------

function runPlan() {
  // 规模约束先给出明确提示
  const issues = [];
  if (state.pieces.length < 5 || state.pieces.length > 8)
    issues.push(`玻璃片数量需在 5–8 块之间（当前 ${state.pieces.length} 块）`);
  if (state.bars.length < 8 || state.bars.length > 14)
    issues.push(`候选铅条数量需在 8–14 条之间（当前 ${state.bars.length} 条）`);
  if (issues.length) {
    state.result = { ok: false, validationIssues: issues };
  } else {
    state.result = planSkeleton(state.pieces, state.bars);
  }
  renderResult();
  renderCanvas();
}

// ---------- 初始化 ----------

$('#btn-plan').addEventListener('click', runPlan);
$('#btn-sample').addEventListener('click', loadSample);
$('#btn-clear').addEventListener('click', clearDraft);
$('#btn-add-piece').addEventListener('click', () => addPiece());
$('#btn-add-bar').addEventListener('click', addBar);

loadSample();
runPlan();
