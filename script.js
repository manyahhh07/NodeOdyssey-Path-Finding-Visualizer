/* ============================================================
   Pathfinding Analyzer — script.js
   8 Algorithms: BFS · DFS · Dijkstra · A* · Greedy · Bi-BFS
                 Bellman-Ford · Jump Point Search
   4 Mazes:      Recursive Division · Prim's · Kruskal's
                 Recursive Backtracking
   Features:     Weighted terrain (×5 / ×10) · Diagonal movement
                 Heuristic selector · Algorithm comparison mode
   ============================================================ */

'use strict';

// ── Grid constants ────────────────────────────────────────────
const ROWS = 21;   // keep ODD for maze generators
const COLS = 35;   // keep ODD
const CS   = 22;   // cell pixel size

const T_EMPTY  = 0;
const T_WALL   = 1;
const T_W5     = 2;  // weight cost 5
const T_W10    = 3;  // weight cost 10

// ── App state ─────────────────────────────────────────────────
let grid        = [];
let startNode   = [2, 2];
let endNode     = [ROWS - 3, COLS - 3];
let isDragging  = null;  // 'start' | 'end' | null
let isDrawing   = false;
let drawMode    = 'wall';
let animRunning = false;
let currentAlgo = 'bfs';
let appMode     = 'single';  // 'single' | 'compare'

// ── Canvas setup ──────────────────────────────────────────────
const canvas = document.getElementById('mainCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = COLS * CS;
canvas.height = ROWS * CS;

// ── Colour palette (mirrors CSS variables) ───────────────────
const C = {
  empty:    '#fdfaf4',
  wall:     '#252018',
  w5:       '#b8d97a',
  w10:      '#f5c86a',
  start:    '#3b6d11',
  end:      '#854f0b',
  visited:  '#afd0f4',
  visitedB: '#f8d49a',
  path:     '#efac42',
  gridLine: '#e2ddd1',
};

// ── Algorithm metadata ─────────────────────────────────────────
const ALGO_META = {
  bfs:     { label:'BFS — Breadth-First Search',    optimal:true,  weighted:false, title:'BFS', body:'Explores neighbours level by level. Guarantees shortest path on unweighted grids. Time O(V+E).', tags:['Optimal (unweighted)','Complete'] },
  dfs:     { label:'DFS — Depth-First Search',      optimal:false, weighted:false, title:'DFS', body:'Explores as far as possible before backtracking. Fast but non-optimal. Time O(V+E).', tags:['Not Optimal','Complete'] },
  dijkstra:{ label:'Dijkstra — Weighted Shortest',  optimal:true,  weighted:true,  title:'Dijkstra', body:'Optimal shortest path on weighted graphs. Uses a priority queue. Time O((V+E)logV).', tags:['Optimal','Weighted','Complete'] },
  astar:   { label:'A* — Heuristic Best Path',      optimal:true,  weighted:true,  title:'A*', body:'Combines Dijkstra with a heuristic to guide search toward the goal. Optimal when h is admissible.', tags:['Optimal','Weighted','Heuristic'] },
  greedy:  { label:'Greedy Best-First Search',      optimal:false, weighted:false, title:'Greedy', body:'Always expands the node closest to the goal by heuristic. Fast but not optimal.', tags:['Not Optimal','Heuristic'] },
  bidir:   { label:'Bidirectional BFS',             optimal:true,  weighted:false, title:'Bi-BFS', body:'Simultaneously searches from both start and end. Meets in the middle—roughly halves explored nodes.', tags:['Optimal (unweighted)','Complete'] },
  bellman: { label:'Bellman-Ford — Edge Relaxation',optimal:true,  weighted:true,  title:'Bellman-Ford', body:'Relaxes all edges V-1 times. Slower than Dijkstra but works with negative weights. Time O(VE).', tags:['Optimal','Weighted','Slow'] },
  jps:     { label:'Jump Point Search',             optimal:true,  weighted:false, title:'Jump Point Search', body:'Optimises A* on uniform grids by pruning symmetric paths via jump points. Very fast in open areas.', tags:['Optimal','Fast','Grid-only'] },
};

// ── Grid init ─────────────────────────────────────────────────
function mkGrid() {
  grid = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = { type: T_EMPTY, visited: false, visitedB: false, pathStep: false, parent: null, dist: Infinity, g: 0, f: 0 };
    }
  }
}
mkGrid();

// ── Drawing ───────────────────────────────────────────────────
function cellCost(n) {
  if (n.type === T_W5)  return 5;
  if (n.type === T_W10) return 10;
  return 1;
}

function drawGrid(c2d, g, sr, sc, er, ec) {
  const W = COLS * CS, H = ROWS * CS;
  c2d.clearRect(0, 0, W, H);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const n = g[r][c];
      const isStart = (r === sr && c === sc);
      const isEnd   = (r === er && c === ec);

      let fill = C.empty;
      if (n.type === T_WALL)  fill = C.wall;
      if (n.type === T_W5)    fill = C.w5;
      if (n.type === T_W10)   fill = C.w10;
      if (n.visited  && n.type !== T_WALL) fill = C.visited;
      if (n.visitedB && n.type !== T_WALL) fill = C.visitedB;
      if (n.pathStep) fill = C.path;
      if (isStart)    fill = C.start;
      if (isEnd)      fill = C.end;

      c2d.fillStyle = fill;
      c2d.fillRect(c * CS + 1, r * CS + 1, CS - 2, CS - 2);

      // Weight label
      if ((n.type === T_W5 || n.type === T_W10) && !n.visited && !n.pathStep && !isStart && !isEnd) {
        c2d.fillStyle = '#3b2e08';
        c2d.font = 'bold 8px DM Mono, monospace';
        c2d.textAlign = 'center'; c2d.textBaseline = 'middle';
        c2d.fillText(n.type === T_W5 ? '5' : '10', c * CS + CS / 2, r * CS + CS / 2);
      }
      // S / E labels
      if (isStart || isEnd) {
        c2d.fillStyle = 'white';
        c2d.font = 'bold 11px DM Mono, monospace';
        c2d.textAlign = 'center'; c2d.textBaseline = 'middle';
        c2d.fillText(isStart ? 'S' : 'E', c * CS + CS / 2, r * CS + CS / 2);
      }
    }
  }

  // Grid lines
  c2d.strokeStyle = C.gridLine;
  c2d.lineWidth = 0.4;
  for (let r = 0; r <= ROWS; r++) { c2d.beginPath(); c2d.moveTo(0, r * CS); c2d.lineTo(COLS * CS, r * CS); c2d.stroke(); }
  for (let c = 0; c <= COLS; c++) { c2d.beginPath(); c2d.moveTo(c * CS, 0); c2d.lineTo(c * CS, ROWS * CS); c2d.stroke(); }
}

function render() { drawGrid(ctx, grid, startNode[0], startNode[1], endNode[0], endNode[1]); }
render();

// ── Mouse input ───────────────────────────────────────────────
function getCell(e, cvs) {
  const rect = cvs.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const c = Math.floor(x / CS), r = Math.floor(y / CS);
  return (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? [r, c] : null;
}

function applyDraw(r, c) {
  if (r === startNode[0] && c === startNode[1]) return;
  if (r === endNode[0]   && c === endNode[1])   return;
  if (drawMode === 'wall')
    grid[r][c].type = grid[r][c].type === T_WALL ? T_EMPTY : T_WALL;
  else if (drawMode === 'w5')
    grid[r][c].type = grid[r][c].type === T_W5 ? T_EMPTY : T_W5;
  else if (drawMode === 'w10')
    grid[r][c].type = grid[r][c].type === T_W10 ? T_EMPTY : T_W10;
}

canvas.addEventListener('mousedown', e => {
  if (animRunning) return;
  const pos = getCell(e, canvas);
  if (!pos) return;
  const [r, c] = pos;
  if (r === startNode[0] && c === startNode[1]) { isDragging = 'start'; return; }
  if (r === endNode[0]   && c === endNode[1])   { isDragging = 'end';   return; }
  isDrawing = true;
  applyDraw(r, c);
  render();
});
canvas.addEventListener('mousemove', e => {
  if (animRunning) return;
  const pos = getCell(e, canvas);
  if (!pos) return;
  const [r, c] = pos;
  if (isDragging) {
    if (isDragging === 'start') startNode = [r, c];
    else                        endNode   = [r, c];
    render(); return;
  }
  if (!isDrawing) return;
  grid[r][c].type = (drawMode === 'wall') ? T_WALL : (drawMode === 'w5') ? T_W5 : T_W10;
  if (r === startNode[0] && c === startNode[1]) return;
  if (r === endNode[0]   && c === endNode[1])   return;
  render();
});
canvas.addEventListener('mouseup',    () => { isDragging = null; isDrawing = false; });
canvas.addEventListener('mouseleave', () => { isDragging = null; isDrawing = false; });

// ── UI controls ───────────────────────────────────────────────
document.getElementById('algoGrid').addEventListener('click', e => {
  if (!e.target.dataset.algo) return;
  document.querySelectorAll('.algo-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  currentAlgo = e.target.dataset.algo;
  updateAlgoInfo(currentAlgo);
  document.getElementById('algoLabel').textContent = ALGO_META[currentAlgo].label;
});

function setDrawMode(m) {
  drawMode = m;
  document.getElementById('drawWall').classList.toggle('active', m === 'wall');
  document.getElementById('drawWeight5').classList.toggle('active', m === 'w5');
  document.getElementById('drawWeight10').classList.toggle('active', m === 'w10');
}

function setMode(m) {
  appMode = m;
  document.getElementById('modeSingle').classList.toggle('active', m === 'single');
  document.getElementById('modeCompare').classList.toggle('active', m === 'compare');
  document.getElementById('singleView').style.display       = m === 'single' ? '' : 'none';
  document.getElementById('compareView').style.display      = m === 'compare' ? '' : 'none';
  document.getElementById('compareAlgoSection').style.display = m === 'compare' ? '' : 'none';
}

function updateAlgoInfo(algo) {
  const m = ALGO_META[algo];
  if (!m) return;
  document.getElementById('algoInfoBox').innerHTML = `
    <div class="info-title">${m.title}</div>
    <div class="info-body">${m.body}</div>
    <div class="info-tags">${m.tags.map(t => `<span class="tag green">${t}</span>`).join('')}</div>`;
}
updateAlgoInfo('bfs');

function resetNodes() {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      Object.assign(grid[r][c], { visited: false, visitedB: false, pathStep: false, parent: null, dist: Infinity, g: 0, f: 0 });
}

function resetPath() {
  resetNodes(); render();
}

function resetAll() {
  mkGrid(); startNode = [2, 2]; endNode = [ROWS - 3, COLS - 3];
  ['mNodes','mPath','mTime','mCost'].forEach(id => document.getElementById(id).textContent = '—');
  document.getElementById('statusBar').textContent = 'Click to paint walls · Drag S/E to move · Hit Visualize';
  setDot('idle');
  render();
}

function setDot(state) {
  const dot = document.getElementById('statusDot');
  dot.className = `status-dot ${state}`;
}

function setBtns(disabled) {
  document.getElementById('runBtn').disabled = disabled;
}

function getDelay() {
  return [100, 60, 30, 10, 2][parseInt(document.getElementById('speedSlider').value) - 1];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getHeuristic() {
  return document.querySelector('input[name="heuristic"]:checked').value;
}

function allowDiag() { return document.getElementById('diagToggle').checked; }

function deepClone() {
  return grid.map(row => row.map(n => ({ ...n, visited: false, visitedB: false, pathStep: false, parent: null, dist: Infinity, g: 0, f: 0 })));
}

// ── Neighbour iterator ────────────────────────────────────────
function neighbors(g, r, c, diag) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  if (diag) dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
  return dirs
    .map(([dr, dc]) => [r + dr, c + dc])
    .filter(([nr, nc]) => nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && g[nr][nc].type !== T_WALL);
}

// ── Heuristic functions ───────────────────────────────────────
function heur(r, c, er, ec) {
  const dr = Math.abs(r - er), dc = Math.abs(c - ec);
  switch (getHeuristic()) {
    case 'euclidean':  return Math.sqrt(dr * dr + dc * dc);
    case 'chebyshev':  return Math.max(dr, dc);
    case 'octile':     return Math.max(dr, dc) + (Math.sqrt(2) - 1) * Math.min(dr, dc);
    default:           return dr + dc; // manhattan
  }
}

// ── Path reconstructor ────────────────────────────────────────
function buildPath(par, sk, ek) {
  const path = [];
  let cur = ek;
  while (cur && cur !== sk) { path.unshift(cur.split(',').map(Number)); cur = par[cur]; }
  if (cur !== sk) return [];
  path.unshift(sk.split(',').map(Number));
  return path;
}

// ══════════════════════════════════════════════════════════════
//  ALGORITHM IMPLEMENTATIONS
//  Each returns { order:[[r,c,side?],...], path:[[r,c],...], cost? }
// ══════════════════════════════════════════════════════════════

// ── BFS ───────────────────────────────────────────────────────
function algoBFS(g, sr, sc, er, ec) {
  const queue = [[sr, sc]];
  const vis   = new Set([`${sr},${sc}`]);
  const par   = { [`${sr},${sc}`]: null };
  const order = [];
  const diag  = allowDiag();

  while (queue.length) {
    const [r, c] = queue.shift();
    order.push([r, c]);
    if (r === er && c === ec) break;
    for (const [nr, nc] of neighbors(g, r, c, diag)) {
      const k = `${nr},${nc}`;
      if (!vis.has(k)) { vis.add(k); par[k] = `${r},${c}`; queue.push([nr, nc]); }
    }
  }
  return { order, path: buildPath(par, `${sr},${sc}`, `${er},${ec}`) };
}

// ── DFS ───────────────────────────────────────────────────────
function algoDFS(g, sr, sc, er, ec) {
  const stack = [[sr, sc]];
  const vis   = new Set([`${sr},${sc}`]);
  const par   = { [`${sr},${sc}`]: null };
  const order = [];
  const diag  = allowDiag();

  while (stack.length) {
    const [r, c] = stack.pop();
    order.push([r, c]);
    if (r === er && c === ec) break;
    for (const [nr, nc] of neighbors(g, r, c, diag)) {
      const k = `${nr},${nc}`;
      if (!vis.has(k)) { vis.add(k); par[k] = `${r},${c}`; stack.push([nr, nc]); }
    }
  }
  return { order, path: buildPath(par, `${sr},${sc}`, `${er},${ec}`) };
}

// ── Dijkstra ──────────────────────────────────────────────────
function algoDijkstra(g, sr, sc, er, ec) {
  const dist  = {};
  const par   = {};
  const order = [];
  const diag  = allowDiag();

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) { dist[`${r},${c}`] = Infinity; par[`${r},${c}`] = null; }

  dist[`${sr},${sc}`] = 0;
  // Min-heap via sorted array (sufficient for grid sizes here)
  const pq = [[0, sr, sc]];

  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, r, c] = pq.shift();
    const k = `${r},${c}`;
    if (d > dist[k]) continue;
    order.push([r, c]);
    if (r === er && c === ec) break;
    for (const [nr, nc] of neighbors(g, r, c, diag)) {
      const nk = `${nr},${nc}`;
      const step = (nr !== r && nc !== c) ? Math.SQRT2 : 1;
      const nd = d + cellCost(g[nr][nc]) * step;
      if (nd < dist[nk]) { dist[nk] = nd; par[nk] = k; pq.push([nd, nr, nc]); }
    }
  }
  return { order, path: buildPath(par, `${sr},${sc}`, `${er},${ec}`), cost: +dist[`${er},${ec}`].toFixed(2) };
}

// ── A* ────────────────────────────────────────────────────────
function algoAstar(g, sr, sc, er, ec) {
  const open   = new Set([`${sr},${sc}`]);
  const closed = new Set();
  const par    = { [`${sr},${sc}`]: null };
  const gsc    = { [`${sr},${sc}`]: 0 };
  const fsc    = { [`${sr},${sc}`]: heur(sr, sc, er, ec) };
  const order  = [];
  const diag   = allowDiag();

  while (open.size) {
    let cur = null, best = Infinity;
    for (const k of open) { if (fsc[k] < best) { best = fsc[k]; cur = k; } }
    if (!cur) break;
    const [r, c] = cur.split(',').map(Number);
    order.push([r, c]);
    if (r === er && c === ec) break;
    open.delete(cur); closed.add(cur);
    for (const [nr, nc] of neighbors(g, r, c, diag)) {
      const nk = `${nr},${nc}`;
      if (closed.has(nk)) continue;
      const step = (nr !== r && nc !== c) ? Math.SQRT2 : 1;
      const tg   = (gsc[cur] || 0) + cellCost(g[nr][nc]) * step;
      if (!open.has(nk) || tg < (gsc[nk] || Infinity)) {
        par[nk] = cur; gsc[nk] = tg; fsc[nk] = tg + heur(nr, nc, er, ec);
        open.add(nk);
      }
    }
  }
  const path = buildPath(par, `${sr},${sc}`, `${er},${ec}`);
  return { order, path, cost: +(gsc[`${er},${ec}`] || 0).toFixed(2) };
}

// ── Greedy Best-First ─────────────────────────────────────────
function algoGreedy(g, sr, sc, er, ec) {
  const open  = [[heur(sr, sc, er, ec), sr, sc]];
  const vis   = new Set([`${sr},${sc}`]);
  const par   = { [`${sr},${sc}`]: null };
  const order = [];
  const diag  = allowDiag();

  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [, r, c] = open.shift();
    order.push([r, c]);
    if (r === er && c === ec) break;
    for (const [nr, nc] of neighbors(g, r, c, diag)) {
      const nk = `${nr},${nc}`;
      if (!vis.has(nk)) { vis.add(nk); par[nk] = `${r},${c}`; open.push([heur(nr, nc, er, ec), nr, nc]); }
    }
  }
  return { order, path: buildPath(par, `${sr},${sc}`, `${er},${ec}`) };
}

// ── Bidirectional BFS ─────────────────────────────────────────
function algoBidir(g, sr, sc, er, ec) {
  const fq   = [[sr, sc]], bq = [[er, ec]];
  const fvis = new Set([`${sr},${sc}`]);
  const bvis = new Set([`${er},${ec}`]);
  const fpar = { [`${sr},${sc}`]: null };
  const bpar = { [`${er},${ec}`]: null };
  const order = [];
  let meet = null;
  const diag = allowDiag();

  outer:
  while (fq.length && bq.length) {
    if (fq.length) {
      const [r, c] = fq.shift();
      order.push([r, c, 'A']);
      for (const [nr, nc] of neighbors(g, r, c, diag)) {
        const nk = `${nr},${nc}`;
        if (bvis.has(nk)) { meet = nk; break outer; }
        if (!fvis.has(nk)) { fvis.add(nk); fpar[nk] = `${r},${c}`; fq.push([nr, nc]); }
      }
    }
    if (bq.length) {
      const [r, c] = bq.shift();
      order.push([r, c, 'B']);
      for (const [nr, nc] of neighbors(g, r, c, diag)) {
        const nk = `${nr},${nc}`;
        if (fvis.has(nk)) { meet = nk; break outer; }
        if (!bvis.has(nk)) { bvis.add(nk); bpar[nk] = `${r},${c}`; bq.push([nr, nc]); }
      }
    }
  }
  if (!meet) return { order, path: [] };

  const fp = [], bp = [];
  let c1 = meet;             while (c1) { fp.unshift(c1.split(',').map(Number)); c1 = fpar[c1]; }
  let c2 = bpar[meet];       while (c2) { bp.push(c2.split(',').map(Number));   c2 = bpar[c2]; }
  return { order, path: [...fp, ...bp] };
}

// ── Bellman-Ford ──────────────────────────────────────────────
function algoBellman(g, sr, sc, er, ec) {
  // Build edge list from all non-wall cells
  const dist  = {};
  const par   = {};
  const order = [];
  const diag  = allowDiag();

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) { dist[`${r},${c}`] = Infinity; par[`${r},${c}`] = null; }

  dist[`${sr},${sc}`] = 0;

  // Collect all edges
  const edges = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (g[r][c].type === T_WALL) continue;
      for (const [nr, nc] of neighbors(g, r, c, diag)) {
        const step = (nr !== r && nc !== c) ? Math.SQRT2 : 1;
        edges.push([`${r},${c}`, `${nr},${nc}`, cellCost(g[nr][nc]) * step]);
      }
    }
  }

  const V = ROWS * COLS;
  // V-1 relaxation passes (for grid we cap at practical limit)
  for (let i = 0; i < Math.min(V - 1, 30); i++) {
    let updated = false;
    for (const [u, v, w] of edges) {
      if (dist[u] !== Infinity && dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        par[v] = u;
        updated = true;
      }
    }
    if (!updated) break;
  }

  // Build order from BFS for animation (Bellman-Ford doesn't have natural order)
  const bfsQ = [[sr, sc]], bfsVis = new Set([`${sr},${sc}`]);
  while (bfsQ.length) {
    const [r, c] = bfsQ.shift();
    order.push([r, c]);
    if (r === er && c === ec) break;
    for (const [nr, nc] of neighbors(g, r, c, diag)) {
      const k = `${nr},${nc}`;
      if (!bfsVis.has(k)) { bfsVis.add(k); bfsQ.push([nr, nc]); }
    }
  }

  return { order, path: buildPath(par, `${sr},${sc}`, `${er},${ec}`), cost: +dist[`${er},${ec}`].toFixed(2) };
}

// ── Jump Point Search (JPS) ────────────────────────────────────
// Simplified JPS on 4/8-connected grid — optimal on uniform grids
function algoJPS(g, sr, sc, er, ec) {
  const diag = allowDiag();
  if (!diag) {
    // JPS requires diagonal movement to be meaningful; fall back to A* without it
    return algoAstar(g, sr, sc, er, ec);
  }

  function blocked(r, c) {
    return r < 0 || r >= ROWS || c < 0 || c >= COLS || g[r][c].type === T_WALL;
  }

  function jump(r, c, dr, dc) {
    const nr = r + dr, nc = c + dc;
    if (blocked(nr, nc)) return null;
    if (nr === er && nc === ec) return [nr, nc];

    // Forced neighbour check
    if (dr !== 0 && dc !== 0) {
      // Diagonal
      if ((!blocked(nr - dr, nc + dc) && blocked(nr - dr, nc)) ||
          (!blocked(nr + dr, nc - dc) && blocked(nr, nc - dc))) return [nr, nc];
      if (jump(nr, nc, dr, 0) || jump(nr, nc, 0, dc)) return [nr, nc];
    } else if (dr !== 0) {
      if ((!blocked(nr, nc + 1) && blocked(r, nc + 1)) ||
          (!blocked(nr, nc - 1) && blocked(r, nc - 1))) return [nr, nc];
    } else {
      if ((!blocked(nr + 1, nc) && blocked(nr + 1, c)) ||
          (!blocked(nr - 1, nc) && blocked(nr - 1, c))) return [nr, nc];
    }
    return jump(nr, nc, dr, dc);
  }

  const open  = [[heur(sr, sc, er, ec), sr, sc]];
  const vis   = new Set([`${sr},${sc}`]);
  const par   = { [`${sr},${sc}`]: null };
  const gsc   = { [`${sr},${sc}`]: 0 };
  const order = [];

  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [, r, c] = open.shift();
    const k = `${r},${c}`;
    order.push([r, c]);
    if (r === er && c === ec) break;
    vis.add(k);

    const dirsAll = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, dc] of dirsAll) {
      const jp = jump(r, c, dr, dc);
      if (!jp) continue;
      const [jr, jc] = jp;
      const jk = `${jr},${jc}`;
      if (vis.has(jk)) continue;
      const step = (dr !== 0 && dc !== 0) ? Math.SQRT2 * Math.max(Math.abs(jr - r), Math.abs(jc - c)) : Math.abs(jr - r) + Math.abs(jc - c);
      const tg = (gsc[k] || 0) + step;
      if (!(jk in gsc) || tg < gsc[jk]) {
        gsc[jk] = tg; par[jk] = k;
        open.push([tg + heur(jr, jc, er, ec), jr, jc]);
      }
    }
  }
  return { order, path: buildPath(par, `${sr},${sc}`, `${er},${ec}`), cost: +(gsc[`${er},${ec}`] || 0).toFixed(2) };
}

// ── Dispatcher ────────────────────────────────────────────────
function dispatch(algo, g, sr, sc, er, ec) {
  switch (algo) {
    case 'bfs':     return algoBFS(g, sr, sc, er, ec);
    case 'dfs':     return algoDFS(g, sr, sc, er, ec);
    case 'dijkstra':return algoDijkstra(g, sr, sc, er, ec);
    case 'astar':   return algoAstar(g, sr, sc, er, ec);
    case 'greedy':  return algoGreedy(g, sr, sc, er, ec);
    case 'bidir':   return algoBidir(g, sr, sc, er, ec);
    case 'bellman': return algoBellman(g, sr, sc, er, ec);
    case 'jps':     return algoJPS(g, sr, sc, er, ec);
    default:        return algoBFS(g, sr, sc, er, ec);
  }
}

// ══════════════════════════════════════════════════════════════
//  ANIMATION ENGINE
// ══════════════════════════════════════════════════════════════

async function animateResult(g, c2d, order, path, sr, sc, er, ec) {
  const delay = getDelay();
  for (const node of order) {
    const [r, c, side] = node;
    if ((r === sr && c === sc) || (r === er && c === ec)) continue;
    if (side === 'B') g[r][c].visitedB = true;
    else              g[r][c].visited  = true;
    drawGrid(c2d, g, sr, sc, er, ec);
    if (delay > 0) await sleep(delay);
  }
  // Batch draw for speed 5
  if (delay === 0) drawGrid(c2d, g, sr, sc, er, ec);

  // Path trace
  for (const [r, c] of path) {
    if ((r === sr && c === sc) || (r === er && c === ec)) continue;
    g[r][c].visited  = false;
    g[r][c].visitedB = false;
    g[r][c].pathStep = true;
    drawGrid(c2d, g, sr, sc, er, ec);
    await sleep(Math.max(delay * 2, 10));
  }
}

// ── Single run ────────────────────────────────────────────────
async function runAlgo() {
  if (animRunning) return;

  if (appMode === 'compare') { await runCompare(); return; }

  resetNodes(); render();
  animRunning = true;
  setBtns(true);
  setDot('running');

  const [sr, sc] = startNode, [er, ec] = endNode;
  const t0 = performance.now();
  const result = dispatch(currentAlgo, grid, sr, sc, er, ec);
  const t1 = performance.now();

  await animateResult(grid, ctx, result.order, result.path, sr, sc, er, ec);

  document.getElementById('mNodes').textContent = result.order.length;
  document.getElementById('mPath').textContent  = result.path.length || 'No path';
  document.getElementById('mTime').textContent  = (t1 - t0).toFixed(1);
  document.getElementById('mCost').textContent  = result.cost !== undefined ? result.cost : (result.path.length || '—');
  document.getElementById('statusBar').textContent = result.path.length
    ? `✓ Path found · ${result.path.length} steps · ${result.order.length} nodes explored`
    : '✗ No path found — try clearing some walls';

  setDot(result.path.length ? 'done' : 'idle');
  animRunning = false;
  setBtns(false);
}

// ── Compare run ───────────────────────────────────────────────
async function runCompare() {
  if (animRunning) return;

  document.getElementById('singleView').style.display  = 'none';
  document.getElementById('compareView').style.display = '';
  animRunning = true;
  setBtns(true);

  const algoA = currentAlgo;
  const algoB = document.getElementById('algoB').value;
  const [sr, sc] = startNode, [er, ec] = endNode;

  document.getElementById('cmpLabelA').textContent = ALGO_META[algoA]?.title || algoA;
  document.getElementById('cmpLabelB').textContent = ALGO_META[algoB]?.title || algoB;
  document.getElementById('dotA').className = 'status-dot running';
  document.getElementById('dotB').className = 'status-dot running';

  // Size compare canvases
  const c1 = document.getElementById('cmpCanvas1'), c2 = document.getElementById('cmpCanvas2');
  const cmpCS = Math.floor(Math.min(
    (window.innerWidth - 460) / 2 / COLS,
    (window.innerHeight - 140) / ROWS,
    18
  ));
  c1.width = COLS * cmpCS; c1.height = ROWS * cmpCS;
  c2.width = COLS * cmpCS; c2.height = ROWS * cmpCS;
  const cx1 = c1.getContext('2d'), cx2 = c2.getContext('2d');

  // Clone grids
  const g1 = deepClone(), g2 = deepClone();

  // Run algorithms (measure pure compute time)
  const tA0 = performance.now();
  const r1   = dispatch(algoA, g1, sr, sc, er, ec);
  const tA1  = performance.now();
  const r2   = dispatch(algoB, g2, sr, sc, er, ec);
  const tB1  = performance.now();

  const delay = getDelay();
  const cmpCS2 = cmpCS; // for inner draw calls

  // Lockstep animation with scaled cell size
  function drawCmp(c2d, g, cmpcs) {
    const origCS = CS;
    // Temporarily override draw to use cmpcs
    drawGridScaled(c2d, g, sr, sc, er, ec, cmpcs);
  }

  const maxLen = Math.max(r1.order.length, r2.order.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < r1.order.length) { const [r, c] = r1.order[i]; if (!((r===sr&&c===sc)||(r===er&&c===ec))) g1[r][c][r1.order[i][2]==='B'?'visitedB':'visited'] = true; }
    if (i < r2.order.length) { const [r, c] = r2.order[i]; if (!((r===sr&&c===sc)||(r===er&&c===ec))) g2[r][c][r2.order[i][2]==='B'?'visitedB':'visited'] = true; }
    drawGridScaled(cx1, g1, sr, sc, er, ec, cmpCS);
    drawGridScaled(cx2, g2, sr, sc, er, ec, cmpCS);
    if (delay > 0) await sleep(delay);
  }
  if (delay === 0) { drawGridScaled(cx1, g1, sr, sc, er, ec, cmpCS); drawGridScaled(cx2, g2, sr, sc, er, ec, cmpCS); }

  const maxPath = Math.max(r1.path.length, r2.path.length);
  for (let i = 0; i < maxPath; i++) {
    if (i < r1.path.length) { const [r, c] = r1.path[i]; if (!((r===sr&&c===sc)||(r===er&&c===ec))) { g1[r][c].visited=false; g1[r][c].visitedB=false; g1[r][c].pathStep=true; } }
    if (i < r2.path.length) { const [r, c] = r2.path[i]; if (!((r===sr&&c===sc)||(r===er&&c===ec))) { g2[r][c].visited=false; g2[r][c].visitedB=false; g2[r][c].pathStep=true; } }
    drawGridScaled(cx1, g1, sr, sc, er, ec, cmpCS);
    drawGridScaled(cx2, g2, sr, sc, er, ec, cmpCS);
    await sleep(Math.max(delay * 2, 12));
  }

  document.getElementById('dotA').className = 'status-dot done';
  document.getElementById('dotB').className = 'status-dot done';

  // Comparison metrics
  const winner = (r1.order.length <= r2.order.length) ? algoA : algoB;
  document.getElementById('cmpMetrics').innerHTML = `
    <div class="cmp-cards">
      <div class="cmp-card">
        <div class="cmp-card-title">${ALGO_META[algoA]?.title || algoA}</div>
        <div class="cmp-row"><span>Nodes explored</span><span>${r1.order.length}</span></div>
        <div class="cmp-row"><span>Path length</span><span>${r1.path.length || '—'}</span></div>
        <div class="cmp-row"><span>Time (ms)</span><span>${(tA1-tA0).toFixed(2)}</span></div>
        <div class="cmp-row"><span>Path cost</span><span>${r1.cost !== undefined ? r1.cost : r1.path.length || '—'}</span></div>
      </div>
      <div class="cmp-card">
        <div class="cmp-card-title blue">${ALGO_META[algoB]?.title || algoB}</div>
        <div class="cmp-row"><span>Nodes explored</span><span>${r2.order.length}</span></div>
        <div class="cmp-row"><span>Path length</span><span>${r2.path.length || '—'}</span></div>
        <div class="cmp-row"><span>Time (ms)</span><span>${(tB1-tA1).toFixed(2)}</span></div>
        <div class="cmp-row"><span>Path cost</span><span>${r2.cost !== undefined ? r2.cost : r2.path.length || '—'}</span></div>
      </div>
    </div>`;

  // Sync metrics panel
  document.getElementById('mNodes').textContent = r1.order.length;
  document.getElementById('mPath').textContent  = r1.path.length || '—';
  document.getElementById('mTime').textContent  = (tA1-tA0).toFixed(1);
  document.getElementById('mCost').textContent  = r1.cost || '—';

  animRunning = false;
  setBtns(false);
}

// Draw grid at a custom cell size (for compare canvases)
function drawGridScaled(c2d, g, sr, sc, er, ec, cs) {
  c2d.clearRect(0, 0, COLS * cs, ROWS * cs);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const n = g[r][c];
      const isStart = (r === sr && c === sc);
      const isEnd   = (r === er && c === ec);
      let fill = C.empty;
      if (n.type === T_WALL)  fill = C.wall;
      if (n.type === T_W5)    fill = C.w5;
      if (n.type === T_W10)   fill = C.w10;
      if (n.visited  && n.type !== T_WALL) fill = C.visited;
      if (n.visitedB && n.type !== T_WALL) fill = C.visitedB;
      if (n.pathStep) fill = C.path;
      if (isStart)    fill = C.start;
      if (isEnd)      fill = C.end;
      c2d.fillStyle = fill;
      c2d.fillRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2);
      if (isStart || isEnd) {
        c2d.fillStyle = 'white';
        c2d.font = `bold ${Math.max(8, cs - 10)}px DM Mono,monospace`;
        c2d.textAlign = 'center'; c2d.textBaseline = 'middle';
        c2d.fillText(isStart ? 'S' : 'E', c * cs + cs / 2, r * cs + cs / 2);
      }
    }
  }
  c2d.strokeStyle = C.gridLine; c2d.lineWidth = 0.4;
  for (let r = 0; r <= ROWS; r++) { c2d.beginPath(); c2d.moveTo(0, r*cs); c2d.lineTo(COLS*cs, r*cs); c2d.stroke(); }
  for (let c = 0; c <= COLS; c++) { c2d.beginPath(); c2d.moveTo(c*cs, 0); c2d.lineTo(c*cs, ROWS*cs); c2d.stroke(); }
}

// ══════════════════════════════════════════════════════════════
//  MAZE GENERATORS
// ══════════════════════════════════════════════════════════════

function genMaze(type) {
  if (animRunning) return;
  mkGrid();
  if (type === 'recursive') mazeRecursive();
  else if (type === 'prims')    mazePrims();
  else if (type === 'kruskal')  mazeKruskal();
  else if (type === 'backtrack')mazeBacktrack();
  // Always clear start/end
  grid[startNode[0]][startNode[1]].type = T_EMPTY;
  grid[endNode[0]][endNode[1]].type     = T_EMPTY;
  render();
}

// ── Recursive Division ────────────────────────────────────────
function mazeRecursive() {
  // Outer border
  for (let r = 0; r < ROWS; r++) { grid[r][0].type = T_WALL; grid[r][COLS-1].type = T_WALL; }
  for (let c = 0; c < COLS; c++) { grid[0][c].type = T_WALL; grid[ROWS-1][c].type = T_WALL; }
  divide(1, 1, ROWS - 2, COLS - 2);
}

function divide(r1, c1, r2, c2) {
  const h = r2 - r1, w = c2 - c1;
  if (h < 2 || w < 2) return;
  const horiz = h >= w;
  if (horiz) {
    // pick even row to place wall
    const wallRows = [];
    for (let r = r1 + 1; r < r2; r += 2) wallRows.push(r);
    if (!wallRows.length) return;
    const wr = wallRows[Math.floor(Math.random() * wallRows.length)];
    // pick odd col for passage
    const passCols = [];
    for (let c = c1; c <= c2; c += 2) passCols.push(c);
    const pc = passCols[Math.floor(Math.random() * passCols.length)];
    for (let c = c1; c <= c2; c++) if (c !== pc) grid[wr][c].type = T_WALL;
    divide(r1, c1, wr - 1, c2);
    divide(wr + 1, c1, r2, c2);
  } else {
    const wallCols = [];
    for (let c = c1 + 1; c < c2; c += 2) wallCols.push(c);
    if (!wallCols.length) return;
    const wc = wallCols[Math.floor(Math.random() * wallCols.length)];
    const passRows = [];
    for (let r = r1; r <= r2; r += 2) passRows.push(r);
    const pr = passRows[Math.floor(Math.random() * passRows.length)];
    for (let r = r1; r <= r2; r++) if (r !== pr) grid[r][wc].type = T_WALL;
    divide(r1, c1, r2, wc - 1);
    divide(r1, wc + 1, r2, c2);
  }
}

// ── Prim's ────────────────────────────────────────────────────
function mazePrims() {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) grid[r][c].type = T_WALL;
  const sr = 1, sc = 1; grid[sr][sc].type = T_EMPTY;
  const walls = [];

  function addW(r, c) {
    [[-2,0],[2,0],[0,-2],[0,2]].forEach(([dr,dc]) => {
      const nr = r+dr, nc = c+dc;
      if (nr>0&&nr<ROWS-1&&nc>0&&nc<COLS-1&&grid[nr][nc].type===T_WALL) walls.push([r,c,nr,nc]);
    });
  }
  addW(sr, sc);
  while (walls.length) {
    const idx = Math.floor(Math.random() * walls.length);
    const [r1,c1,r2,c2] = walls.splice(idx, 1)[0];
    if (grid[r2][c2].type === T_WALL) {
      grid[r2][c2].type = T_EMPTY;
      grid[Math.floor((r1+r2)/2)][Math.floor((c1+c2)/2)].type = T_EMPTY;
      addW(r2, c2);
    }
  }
}

// ── Kruskal's ─────────────────────────────────────────────────
function mazeKruskal() {
  // Set all cells to wall, work on odd-row/col cells
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) grid[r][c].type = T_WALL;
  // Carve passage cells
  for (let r = 1; r < ROWS-1; r += 2) for (let c = 1; c < COLS-1; c += 2) grid[r][c].type = T_EMPTY;

  // Union-Find
  const parent = {};
  const rank   = {};
  function find(k) { if (parent[k] !== k) parent[k] = find(parent[k]); return parent[k]; }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if ((rank[ra]||0) < (rank[rb]||0)) parent[ra] = rb;
    else if ((rank[ra]||0) > (rank[rb]||0)) parent[rb] = ra;
    else { parent[rb] = ra; rank[ra] = (rank[ra]||0) + 1; }
  }

  // Init sets
  for (let r = 1; r < ROWS-1; r += 2)
    for (let c = 1; c < COLS-1; c += 2) { const k = `${r},${c}`; parent[k] = k; rank[k] = 0; }

  // Build edge list (walls between passages)
  const edges = [];
  for (let r = 1; r < ROWS-1; r += 2) {
    for (let c = 1; c < COLS-1; c += 2) {
      if (r+2 < ROWS-1) edges.push([`${r},${c}`,`${r+2},${c}`,r+1,c]);
      if (c+2 < COLS-1) edges.push([`${r},${c}`,`${r},${c+2}`,r,c+1]);
    }
  }
  // Shuffle
  for (let i = edges.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [edges[i], edges[j]] = [edges[j], edges[i]];
  }
  for (const [a, b, wr, wc] of edges) {
    if (find(a) !== find(b)) { union(a, b); grid[wr][wc].type = T_EMPTY; }
  }
}

// ── Recursive Backtracking (DFS maze) ─────────────────────────
function mazeBacktrack() {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) grid[r][c].type = T_WALL;
  const vis = new Set();

  function carve(r, c) {
    vis.add(`${r},${c}`);
    grid[r][c].type = T_EMPTY;
    const dirs = [[-2,0],[2,0],[0,-2],[0,2]].sort(() => Math.random()-.5);
    for (const [dr,dc] of dirs) {
      const nr = r+dr, nc = c+dc;
      if (nr>0&&nr<ROWS-1&&nc>0&&nc<COLS-1&&!vis.has(`${nr},${nc}`)) {
        grid[r+dr/2][c+dc/2].type = T_EMPTY;
        carve(nr, nc);
      }
    }
  }
  // Use iterative version to avoid stack overflow on large grids
  const stack = [[1, 1]];
  vis.add('1,1'); grid[1][1].type = T_EMPTY;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const dirs = [[-2,0],[2,0],[0,-2],[0,2]].sort(() => Math.random()-.5);
    let moved = false;
    for (const [dr,dc] of dirs) {
      const nr = r+dr, nc = c+dc;
      if (nr>0&&nr<ROWS-1&&nc>0&&nc<COLS-1&&!vis.has(`${nr},${nc}`)) {
        vis.add(`${nr},${nc}`);
        grid[r+dr/2][c+dc/2].type = T_EMPTY;
        grid[nr][nc].type = T_EMPTY;
        stack.push([nr, nc]);
        moved = true;
        break;
      }
    }
    if (!moved) stack.pop();
  }
}

// ── Init ──────────────────────────────────────────────────────
document.getElementById('algoLabel').textContent = ALGO_META['bfs'].label;
updateAlgoInfo('bfs');
render();