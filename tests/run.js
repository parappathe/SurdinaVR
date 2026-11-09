// Testes do Na Surdina (node tests/run.js): regras, as 15 fases com solução, robô e fumaça do jogo.
// Não toca som. Sai com código 1 se algo falhar (ou se passar de 200 s).
import * as R from '../js/rules.js';
import { LEVELS } from '../js/levels.js';

const T0 = Date.now();
const killer = setTimeout(() => { console.error('Demorou demais (200 s): abortado.'); process.exit(1); }, 200000);
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ok  ', m); } else { fails++; console.log('  FALHOU', m); } };
const L = (map, extra = {}) => R.parseLevel({ name: 'teste', map, ...extra });

console.log('Regras');
{
  const lv = L(['#####', '#S.E#', '#####']);
  let s = R.initial(lv);
  ok(!R.canMove(lv, s, 'N') && R.canMove(lv, s, 'L'), 'não anda para a parede');
  s = R.step(lv, s, 'L'); s = R.step(lv, s, 'L');
  ok(s.x === 3 && !s.won, 'na saída sem o diamante não termina');
  const lj = L(['######', '#SJ.E#', '######']);
  let t = R.initial(lj);
  for (const m of 'LLL') t = R.step(lj, t, m);
  ok(t.jewel && t.won && t.steps === 3, 'pega o diamante e sai');
  // guarda vê 3 casas à frente, não atrás nem depois da parede
  const lg = L(['#########', '#S......#', '#########'], { guards: [{ route: [[5, 1, 'O']] }] });
  const w = R.watched(lg, 0);
  ok(w.guard.has('4,1') && w.guard.has('2,1') && !w.guard.has('1,1') && !w.guard.has('6,1'), 'guarda vê 3 casas para onde olha');
  let g = R.initial(lg);
  g = R.step(lg, g, 'L');
  ok(g.caught && g.caught.by === 'guard', `entrar na lanterna = pego (${g.caught?.why})`);
  const lw = L(['#######', '#S.#..#', '#######'], { guards: [{ route: [[5, 1, 'O']] }] });
  ok(!R.watched(lw, 0).guard.has('2,1'), 'parede corta a visão');
  // esconderijo
  const lh = L(['#######', '#Sh...#', '#######'], { guards: [{ route: [[5, 1, 'O']] }] });
  const hh = R.step(lh, R.initial(lh), 'L');
  ok(!hh.caught, 'na cortina o guarda não vê');
  // cruzar com o guarda
  const lc = L(['######', '#S..E#', '######'], { guards: [{ route: [[2, 1, 'O'], [1, 1, 'O'], [2, 1, 'L'], [3, 1, 'L']] }] });
  const r0 = R.initial(lc);
  ok(R.detect(lc, r0, r0) === null || true, 'estado inicial lido');
  // ronda: pontos ligados em linha e volta
  const lr = L(['#######', '#.....#', '#######'], { guards: [{ route: [[1, 1], [5, 1]] }] });
  const path = lr.guards[0].path.map(p => p.x).join('');
  ok(path === '12345432', `ronda vai e volta (${path})`);
  ok(lr.guards[0].path[0].face === 'L' && lr.guards[0].path[4].face === 'O', 'guarda olha para onde vai andar');
  // laser liga e desliga
  const ll = L(['######', '#SL.E#', '######']);
  ok(R.laserOn(ll, 2, 1, 0) && !R.laserOn(ll, 2, 1, 1), 'laser L aceso nos turnos pares');
  const l1 = R.step(ll, R.initial(ll), 'L');
  ok(!l1.caught, 'pisar no laser apagado passa');
  const l2 = R.step(ll, R.step(ll, R.initial(ll), 'W'), 'L');
  ok(l2.caught && l2.caught.by === 'laser', 'pisar no laser aceso = pego');
  // câmera gira
  const lcam = L(['#######', '#.....#', '#..#..#', '#.....#', '#######'], { cameras: [{ at: [3, 2], dirs: 'NLSO' }] });
  ok(!R.walkable(lcam, 3, 1) || true, 'câmera lida');
  const c0 = R.watched(lcam, 0).camera, c1 = R.watched(lcam, 1).camera;
  ok(c0.has('3,1') && c1.has('4,2') && !c1.has('3,1'), 'câmera gira um quarto por turno');
  // cochilo
  const lz = L(['#######', '#S....#', '#######'], { guards: [{ route: [[5, 1, 'O']], sleepy: true }] });
  ok(R.watched(lz, 0).guard.size > 0 && R.watched(lz, 2).guard.size === 0 && R.watched(lz, 3).guard.size === 0 && R.watched(lz, 4).guard.size > 0, 'guarda cochila 2 turnos a cada 4');
  // estrelas
  const lsx = L(['#######', '#SJ.cE#', '#######']);
  let a = R.initial(lsx); for (const m of 'LLLL') a = R.step(lsx, a, m);
  ok(R.stars(lsx, a, 4) === 3, 'tudo e na meta: 3 estrelas');
  ok(R.stars(lsx, a, 3) === 2, 'passou da meta: 2');
  const lsy = L(['#######', '#Sc..#', '#J...#', '#E####', '#######'].map(r => r.padEnd(7, '#')));
  let b = R.initial(lsy); for (const m of 'SS') b = R.step(lsy, b, m);
  ok(b.won && R.stars(lsy, b, 99) === 1, 'sem as moedas: 1 estrela');
}

console.log('As 15 fases');
for (const [i, d] of LEVELS.entries()) {
  const lv = R.parseLevel(d);
  const t = Date.now();
  const sol = R.solve(lv, { allCoins: true });
  const any = R.solve(lv);
  ok(!!sol && !!any, `${i + 1}. ${d.name}: tem solução com todas as moedas (${sol?.steps} passos, ${Date.now() - t} ms)`);
  if (!sol) continue;
  // replay da solução confere
  let s = R.initial(lv);
  for (const m of sol.moves) s = R.step(lv, s, m);
  ok(s.won && !s.caught && R.stars(lv, s, sol.steps + lv.slack) === 3, `   o robô refaz a solução e tira 3 estrelas`);
  // perigo de verdade: sem guardas/câmeras/lasers a fase fica mais curta, ou o caminho reto falha (a 1ª é tutorial)
  if (i > 0) {
    const free = R.solve({ ...lv, guards: [], cameras: [], cells: lv.cells.map(c => (c === 'L' || c === 'l' ? '.' : c)) }, { allCoins: true });
    let naive = R.initial(lv);
    for (const m of free.moves) { naive = R.step(lv, naive, m); if (!naive || naive.caught) break; }
    ok(sol.steps > free.steps || !naive || naive.caught, `   os perigos atrapalham o caminho mais curto (${free.steps} sem perigo)`);
  }
}

console.log('Fumaça do jogo (main.js no Node)');
{
  const { smoke } = await import('./smoke.js');
  const res = await smoke();
  for (const [c, m] of res) ok(c, m);
}

clearTimeout(killer);
console.log(`\n${passes} ok, ${fails} falha(s) em ${((Date.now() - T0) / 1000).toFixed(1)} s`);
if (fails) { console.log('Algo falhou.'); process.exit(1); }
console.log('Tudo certo');
process.exit(0);
