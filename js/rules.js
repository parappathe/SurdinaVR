// Regras do Na Surdina, sem navegador: o mapa do museu, a ronda dos guardas, as câmeras, os lasers,
// a visão de cada um e o resolvedor (busca em largura) que prova que toda fase tem solução e
// calcula a meta de passos. Tudo determinístico.

export const DIRS = { N: [0, -1], S: [0, 1], L: [1, 0], O: [-1, 0] };   // norte = para longe de você
export const DIR_KEYS = ['N', 'L', 'S', 'O'];
export const GUARD_RANGE = 3, CAMERA_RANGE = 4;

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => a / gcd(a, b) * b;

// Lê uma fase: mapa em texto + guardas + câmeras.
// '#' parede, '.' chão, 'S' início, 'E' saída, 'J' joia, 'c' moeda, 'h' esconderijo (cortina),
// 'L' laser que liga nos turnos pares, 'l' laser que liga nos ímpares.
export function parseLevel(def) {
  const rows = def.map;
  const H = rows.length, W = Math.max(...rows.map(r => r.length));
  const cells = [];
  let start = null, exit = null, jewel = null;
  const coins = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = rows[y][x] || '#';
    cells.push(ch === '#' ? '#' : ch === 'h' ? 'h' : ch === 'L' ? 'L' : ch === 'l' ? 'l' : '.');
    if (ch === 'S') start = [x, y];
    if (ch === 'E') exit = [x, y];
    if (ch === 'J') jewel = [x, y];
    if (ch === 'c') coins.push([x, y]);
  }
  const lv = { W, H, cells, start, exit, jewel, coins, name: def.name, desc: def.desc, slack: def.slack ?? 2 };
  lv.guards = (def.guards || []).map((g, i) => expandGuard(lv, g, i));
  lv.cameras = (def.cameras || []).map((c, i) => ({ id: i, at: c.at, dirs: c.dirs.split(''), range: c.range || CAMERA_RANGE }));
  lv.period = [2, lv.guards.some(g => g.sleepy) ? 4 : 1, ...lv.guards.map(g => g.path.length), ...lv.cameras.map(c => c.dirs.length)].reduce(lcm, 1);
  return lv;
}
// Ronda: pontos de passagem ligados em linha reta; fecha o laço voltando ao primeiro.
// Um ponto pode ter o olhar fixo [x, y, 'N'] (ex.: guarda parado que vira a cabeça) e repetir para esperar.
function expandGuard(lv, g, id) {
  const pts = g.route;
  const path = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    path.push({ x: a[0], y: a[1], face: a[2] || null });
    if (pts.length === 1) break;
    let x = a[0], y = a[1];
    const dx = Math.sign(b[0] - x), dy = Math.sign(b[1] - y);
    if (dx && dy) throw new Error(`${lv.name}: ronda diagonal no guarda ${id}`);
    while (x + dx !== b[0] || y + dy !== b[1]) {
      if (!dx && !dy) break;
      x += dx; y += dy;
      if (x === b[0] && y === b[1]) break;
      path.push({ x, y, face: null });
    }
  }
  // olhar de cada passo: o informado, senão para onde vai andar, senão o anterior
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (p.face) continue;
    for (let k = 1; k <= path.length; k++) {
      const q = path[(i + k) % path.length];
      if (q.x !== p.x || q.y !== p.y) { p.face = q.x > p.x ? 'L' : q.x < p.x ? 'O' : q.y > p.y ? 'S' : 'N'; break; }
    }
    p.face ||= g.face || 'S';
  }
  const off = ((g.offset || 0) % path.length + path.length) % path.length;
  return { id, path: path.slice(off).concat(path.slice(0, off)), sleepy: !!g.sleepy };
}

export const cellAt = (lv, x, y) => (x < 0 || y < 0 || x >= lv.W || y >= lv.H ? '#' : lv.cells[y * lv.W + x]);
export const walkable = (lv, x, y) => cellAt(lv, x, y) !== '#' && !lv.cameras.some(c => c.at[0] === x && c.at[1] === y);
export function guardAt(lv, g, t) { return g.path[t % g.path.length]; }
export const laserOn = (lv, x, y, t) => { const c = cellAt(lv, x, y); return (c === 'L' && t % 2 === 0) || (c === 'l' && t % 2 === 1); };
export const cameraDir = (c, t) => c.dirs[t % c.dirs.length];

// Casas vistas de um ponto olhando numa direção (para até a parede).
export function rayCells(lv, x, y, dir, range) {
  const [dx, dy] = DIRS[dir];
  const out = [];
  for (let k = 1; k <= range; k++) {
    const cx = x + dx * k, cy = y + dy * k;
    if (cellAt(lv, cx, cy) === '#') break;
    out.push([cx, cy]);
  }
  return out;
}
// Tudo que está vigiado no tempo t: { guard: Set, camera: Set } de "x,y".
export function watched(lv, t) {
  const guard = new Set(), camera = new Set();
  for (const g of lv.guards) {
    if (g.sleepy && t % 4 >= 2) continue;   // cochila 2 turnos a cada 4
    const p = guardAt(lv, g, t);
    for (const [x, y] of rayCells(lv, p.x, p.y, p.face, GUARD_RANGE)) guard.add(`${x},${y}`);
  }
  for (const c of lv.cameras) for (const [x, y] of rayCells(lv, c.at[0], c.at[1], cameraDir(c, t), c.range)) camera.add(`${x},${y}`);
  return { guard, camera };
}

// Estado do jogador: { x, y, t, jewel, coins (bits), steps, caught, won }
export function initial(lv) {
  return { x: lv.start[0], y: lv.start[1], t: 0, jewel: false, coins: 0, steps: 0, caught: null, won: false };
}
export const MOVES = ['N', 'S', 'L', 'O', 'W'];   // W = esperar
export function canMove(lv, st, m) {
  if (st.caught || st.won) return false;
  if (m === 'W') return true;
  const [dx, dy] = DIRS[m];
  return walkable(lv, st.x + dx, st.y + dy);
}
// Um turno: o ladrão anda (ou espera), depois guardas e câmeras avançam. Devolve o estado novo.
export function step(lv, st, m) {
  if (!canMove(lv, st, m)) return null;
  const [dx, dy] = m === 'W' ? [0, 0] : DIRS[m];
  const n = { ...st, x: st.x + dx, y: st.y + dy, t: st.t + 1, steps: st.steps + 1 };
  if (lv.jewel && n.x === lv.jewel[0] && n.y === lv.jewel[1]) n.jewel = true;
  lv.coins.forEach(([cx, cy], i) => { if (n.x === cx && n.y === cy) n.coins |= 1 << i; });
  n.caught = detect(lv, st, n);
  if (!n.caught && n.jewel && n.x === lv.exit[0] && n.y === lv.exit[1]) n.won = true;
  return n;
}
// Por que foi pego (ou null).
export function detect(lv, prev, n) {
  const hidden = cellAt(lv, n.x, n.y) === 'h';
  for (const g of lv.guards) {
    const a = guardAt(lv, g, prev.t), b = guardAt(lv, g, n.t);
    if (b.x === n.x && b.y === n.y) return { by: 'guard', id: g.id, why: 'esbarrou no guarda' };
    if (a.x === n.x && a.y === n.y && b.x === prev.x && b.y === prev.y) return { by: 'guard', id: g.id, why: 'cruzou com o guarda' };
  }
  if (laserOn(lv, n.x, n.y, n.t)) return { by: 'laser', why: 'pisou no laser ligado' };
  if (hidden) return null;
  const w = watched(lv, n.t), k = `${n.x},${n.y}`;
  if (w.guard.has(k)) {
    const g = lv.guards.find(gg => !(gg.sleepy && n.t % 4 >= 2) && rayCells(lv, guardAt(lv, gg, n.t).x, guardAt(lv, gg, n.t).y, guardAt(lv, gg, n.t).face, GUARD_RANGE).some(([x, y]) => x === n.x && y === n.y));
    return { by: 'guard', id: g?.id, why: 'a lanterna do guarda pegou você' };
  }
  if (w.camera.has(k)) return { by: 'camera', why: 'a câmera filmou você' };
  return null;
}

// Busca em largura: menor número de turnos até a saída com a joia (e, se allCoins, com todas as moedas).
export function solve(lv, { allCoins = false } = {}) {
  const full = (1 << lv.coins.length) - 1;
  const key = (s) => `${s.x},${s.y},${s.t % lv.period},${s.jewel ? 1 : 0},${s.coins}`;
  const s0 = initial(lv);
  if (detect(lv, s0, s0)) return null;
  const seen = new Map([[key(s0), null]]);
  const q = [{ s: s0, moves: [] }];
  for (let h = 0; h < q.length; h++) {
    const { s, moves } = q[h];
    for (const m of MOVES) {
      const n = step(lv, s, m);
      if (!n || n.caught) continue;
      const mv = moves.concat(m);
      if (n.won && (!allCoins || n.coins === full)) return { moves: mv, steps: mv.length };
      if (n.won) continue;   // chegou sem as moedas: a fase acaba ao sair, então não serve
      const k = key(n);
      if (seen.has(k)) continue;
      seen.set(k, true);
      q.push({ s: n, moves: mv });
    }
    if (q.length > 400000) break;
  }
  return null;
}

// Estrelas: 1 = saiu com a joia; 2 = e com todas as moedas; 3 = e em até meta passos.
export function stars(lv, st, par) {
  if (!st.won) return 0;
  const all = st.coins === (1 << lv.coins.length) - 1;
  if (!all) return 1;
  return st.steps <= par ? 3 : 2;
}
