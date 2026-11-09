// Liga as regras do Na Surdina à cena, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { parseLevel, initial, step, canMove, solve, stars, watched, DIRS, cellAt, walkable } from './rules.js';
import { LEVELS } from './levels.js';
import { buildWorld, TABLE, FLOOR_Y, T } from './scene.js';
import { createShell } from './shell.js';
import { setTheme } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

setTheme({
  bg: 'rgba(22,26,44,0.96)', edge: '#f2c14e', text: '#eef0f8', dim: '#9aa2c0', btn: '#2e3658', btnHover: '#4a5688',
  btnOn: '#f2c14e', btnOnText: '#1a1e30', lock: '#20263c', star: '#f2c14e', labelBg: 'rgba(22,26,44,0.88)',
  title: 'bold 60px Georgia, serif',
});

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const GRAB_DIST = 0.07;
const STAND = { x: 0, z: 0.0 };

const shell = createShell({ scene: new THREE.Scene(), sfx, save, storeSave, stand: STAND, exposure: 1.0, statusPos: new THREE.Vector3(0, 1.32, TABLE.z - TABLE.d / 2 - 0.12), statusWidth: 0.7, shadows: true, hooks: {} });
const world = buildWorld(shell.renderer);
const { scene } = world;
{ const old = shell.scene; for (const o of [...old.children]) scene.add(o); shell.scene = scene; shell.render = () => shell.renderer.render(scene, shell.camera); }
const { renderer, camera, panel } = shell;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.15;
shell.orbit.target.set(TABLE.x, FLOOR_Y, TABLE.z - 0.02);
shell.orbit.dist = 1.05; shell.orbit.pitch = 1.0; shell.orbit.yaw = 0; shell.orbit.keys = 'none';
shell.orbit.minPitch = 0.25; shell.orbit.maxPitch = 1.45; shell.orbit.minDist = 0.45; shell.orbit.maxDist = 2.2;
const menuCam = (t) => ({ pos: new THREE.Vector3(Math.sin(t * 0.1) * 1.4, 1.6, TABLE.z + 1.6 + Math.cos(t * 0.1) * 0.3), look: new THREE.Vector3(0, 1.3, TABLE.z - 1.5) });

// ---------- Estado ----------
let app = 'menu', li = 0, lv = null, st = null, hist = [], par = 0, phase = 'idle';
let time = 0, msg = null, result = null, held = null;
const timers = [];
const later = (sec, fn) => timers.push({ at: time + sec, fn });
const parCache = new Map();
const _v = new THREE.Vector3();
const KEYMOVE = { w: 'N', arrowup: 'N', s: 'S', arrowdown: 'S', a: 'O', arrowleft: 'O', d: 'L', arrowright: 'L' };

function parOf(i) {
  if (!parCache.has(i)) {
    const l = parseLevel(LEVELS[i]);
    const sol = solve(l, { allCoins: true });
    parCache.set(i, { steps: sol.steps + l.slack, best: sol.steps, moves: sol.moves });
  }
  return parCache.get(i);
}
const unlocked = (i) => i === 0 || (save.lv[i - 1] || 0) >= 1;

function loadLevel(i, skipIntro = false) {
  li = clamp(i, 0, LEVELS.length - 1);
  lv = parseLevel(LEVELS[li]);
  par = parOf(li).steps;
  st = initial(lv); hist = []; result = null; held = null;
  timers.length = 0;
  world.setLevel(lv);
  world.setAlarm(false);
  app = 'play';
  shell.orbit.menu = null; shell.orbit.snap = true;
  if (shell.vr && !rigPlaced) { shell.recenter(); rigPlaced = true; }
  refresh(null, true);
  robotPlan = null;
  msg = null;
  if (skipIntro || dev.autoplay) { shell.hidePanel(); phase = 'move'; }
  else { phase = 'intro'; showScreen('intro'); }
  updateHint();
}
let rigPlaced = false;

function moveCells() {
  if (!st || st.caught || st.won) return [];
  const out = [];
  for (const k of ['N', 'S', 'L', 'O']) { const [dx, dy] = DIRS[k]; if (walkable(lv, st.x + dx, st.y + dy)) out.push([st.x + dx, st.y + dy]); }
  return out;
}
function refresh(prev, snap = false) {
  world.showTurn(st, prev, { snap, showNext: save.preview, watched: watched(lv, st.t), nextWatched: watched(lv, st.t + 1), moveCells: phase === 'move' || snap ? moveCells() : [] });
}

function doMove(m) {
  if (app !== 'play' || phase !== 'move' || panel.visible) return false;
  if (!canMove(lv, st, m)) { sfx.deny(); return false; }
  const prev = st;
  const n = step(lv, st, m);
  hist.push(st);
  st = n;
  refresh(prev);
  if (m === 'W') sfx.wait(); else sfx.step();
  if (n.jewel && !prev.jewel) { later(0.2, () => sfx.jewel()); msg = { text: 'Diamante na sacola! Agora para a porta verde.', t: 4 }; }
  if (n.coins !== prev.coins) later(0.2, () => sfx.coin());
  if (n.caught) {
    phase = 'caught';
    later(0.25, () => { sfx.alarm(); world.setAlarm(true); shell.pulseAll(0.8, 200); });
    msg = { text: `Pego! ${n.caught.why[0].toUpperCase()}${n.caught.why.slice(1)}. Desfaça o passo (Z) ou recomece (R).`, t: 60 };
  } else if (n.won) {
    phase = 'won';
    finish();
  }
  updateHint();
  return true;
}
function undo() {
  if (app !== 'play' || !hist.length || phase === 'won' || panel.visible) return;
  const prev = st;
  st = hist.pop();
  phase = 'move';
  world.setAlarm(false);
  msg = null;
  refresh(prev);
  sfx.undo();
  updateHint();
}
function restart() { if (app === 'play' && phase !== 'won') { loadLevel(li, true); sfx.undo(); } }

function finish() {
  const s = stars(lv, st, par);
  result = { stars: s, steps: st.steps, coins: countBits(st.coins), allCoins: lv.coins.length };
  save.lv[li] = Math.max(save.lv[li] || 0, s);
  if (!save.best[li] || st.steps < save.best[li]) save.best[li] = st.steps;
  storeSave(save);
  for (let k = 0; k < s; k++) later(0.4 + 0.25 * k, () => sfx.star(k));
  later(0.3, () => sfx.fanfare());
  later(1.0, () => { if (app === 'play' && phase === 'won') showScreen('result'); });
  msg = { text: 'Escapou com o diamante!', t: 3 };
}
const countBits = (n) => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };

function goMenu() {
  app = 'menu'; phase = 'idle';
  shell.orbit.menu = menuCam; shell.orbit.snap = true;
  lv = parseLevel(LEVELS[14]); st = initial(lv); hist = [];
  world.setLevel(lv); world.setAlarm(false);
  world.showTurn(st, null, { snap: true, showNext: false, watched: watched(lv, 0), nextWatched: null, moveCells: [] });
  if (shell.vr) shell.recenter();
  showScreen('main');
  updateHint();
}
function togglePause() {
  if (app === 'play' && !panel.visible) { app = 'paused'; dropHeld(); showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; shell.hidePanel(); }
  updateHint();
}

// ---------- Menus ----------
function showScreen(name) {
  const vr = shell.vr;
  shell.showPanel((p) => {
    if (name === 'main') {
      p.title('Na Surdina', 72);
      p.text('Furto em turnos: a cada passo seu, os guardas dão o deles', 512, 130, { size: 26, color: '#9aa2c0' });
      p.button('Jogar', () => showScreen('levels'), 212, 172, 600, 92, { size: 40 });
      p.button('Como jogar', () => showScreen('help'), 212, 280, 600, 80);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 380, 190, 66, { size: 26 });
      p.button(`Prévia: ${save.preview ? 'sim' : 'não'}`, () => { save.preview = !save.preview; storeSave(save); showScreen('main'); }, 417, 380, 190, 66, { size: 26 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 622, 380, 190, 66, { size: 26 });
      const total = Object.values(save.lv).reduce((a, b) => a + b, 0);
      p.text(`Estrelas: ${total} de ${LEVELS.length * 3}`, 512, 500, { size: 30, color: '#f2c14e', bold: true });
      p.text('Prévia: losangos laranja mostram onde os guardas e câmeras vão olhar no próximo turno.', 512, 560, { size: 21, color: '#9aa2c0' });
      p.text(vr ? 'Aponte com o controle e aperte o gatilho' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 640, { size: 22, color: '#9aa2c0' });
    } else if (name === 'levels') {
      p.title('Fases', 56);
      LEVELS.forEach((l, i) => p.tile(52 + (i % 5) * 186, 100 + Math.floor(i / 5) * 160, 172, 146, { num: i + 1, name: l.name, stars: save.lv[i] || 0, done: save.lv[i] != null, locked: !unlocked(i), master: i === LEVELS.length - 1, action: () => loadLevel(i) }));
      p.text('Termine uma fase para liberar a próxima.', 512, 600, { size: 23, color: '#9aa2c0' });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 628, 300, 66, { size: 28 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = [
        'Pegue o diamante e saia pela porta verde. Um passo seu = um passo de todos.',
        'Amarelo no chão: o que a lanterna do guarda vê (3 casas). Vermelho: câmera.',
        'Não pise no amarelo nem no vermelho, nem esbarre no guarda.',
        'Cortina roxa: escondido ali, ninguém vê você. Laser aceso: não pise.',
        'Moedas = 2ª estrela. Chegar em até a meta de passos = 3ª estrela.',
        'Pego? Desfaça o passo. Pode desfazer quantas vezes quiser.',
        vr ? 'VR: pegue o ladrão (botão lateral ou pinça) e solte na casa ao lado.' : 'PC: WASD/setas andam, Espaço espera, Z desfaz, R recomeça. Ou clique na casa.',
        vr ? 'Raio + gatilho na casa também anda. Abaixe-se para espiar a maquete.' : 'Botão direito arrastando: câmera. Roda: zoom. Esc: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 40, 124 + i * 54, { size: 23, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'intro') {
      const l = LEVELS[li];
      p.title(`${li + 1}. ${l.name}`, 66);
      p.text(l.desc, 512, 150, { size: 25 });
      p.text(`Moedas: ${lv.coins.length} · meta: ${par} passos`, 512, 210, { size: 26, color: '#f2c14e' });
      p.text('1 estrela: escapar · 2: com todas as moedas · 3: e dentro da meta', 512, 256, { size: 22, color: '#9aa2c0' });
      p.button('Começar', () => { shell.hidePanel(); phase = 'move'; refresh(null, true); updateHint(); }, 262, 320, 500, 96, { size: 38 });
      p.button('Fases', () => showScreen('levels'), 262, 440, 500, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(`Fase ${li + 1}: ${LEVELS[li].name} · ${st.steps} passos`, 512, 130, { size: 28, color: '#9aa2c0' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button('Recomeçar a fase', () => loadLevel(li, true), 262, 276, 500, 84);
      p.button('Como jogar', () => showScreen('help'), 262, 376, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { togglePause(); shell.recenter(); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Fases', () => showScreen('levels'), 262, 476, 245, 84, { size: 30 });
      p.button('Menu', () => goMenu(), 517, 476, 245, 84, { size: 30 });
    } else if (name === 'result') {
      p.title('Escapou!', 66);
      p.stars(result.stars, 512, 160, 80);
      p.text(`${result.steps} passos (meta ${par})   ·   moedas ${result.coins} de ${result.allCoins}`, 512, 236, { size: 30, bold: true });
      p.text(result.stars < 2 ? 'Pegue todas as moedas para a 2ª estrela.' : result.stars < 3 ? `Chegue em até ${par} passos para a 3ª.` : 'Trabalho limpo.', 512, 282, { size: 24, color: '#9aa2c0' });
      p.button('De novo', () => loadLevel(li, true), 262, 330, 245, 84, { size: 30 });
      p.button('Próxima', () => loadLevel(li + 1), 517, 330, 245, 84, { size: 30, locked: li >= LEVELS.length - 1 || !unlocked(li + 1) });
      p.button('Fases', () => showScreen('levels'), 262, 434, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 534, 500, 80);
      if (li === LEVELS.length - 1) p.text('Você roubou o diamante grande. Fim do golpe!', 512, 650, { size: 26, color: '#f2c14e' });
    }
  });
  updateHint();
}

// ---------- Entrada ----------
function dirTo(x, y) {
  const dx = x - st.x, dy = y - st.y;
  if (dx === 0 && dy === 0) return 'W';
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  return dx === 1 ? 'L' : dx === -1 ? 'O' : dy === 1 ? 'S' : 'N';
}
function cellFromRay(rc) {
  const h = rc.intersectObject(world.pickPlane, false)[0];
  return h ? world.cellOf(h.point) : null;
}
function buttonFromRay(rc) {
  const h = rc.intersectObjects(Object.values(world.buttons), false)[0];
  return h ? h.object.userData.kind : null;
}
function pressButton(kind) {
  if (kind === 'wait') doMove('W');
  else if (kind === 'undo') undo();
  else if (kind === 'restart') restart();
}
function clickCell(c) {
  if (!c || phase !== 'move') return false;
  const m = dirTo(c[0], c[1]);
  if (!m) return false;
  return doMove(m);
}
function tryGrab(e) {
  const p = shell.grabPoint(e);
  for (const [kind, b] of Object.entries(world.buttons)) { b.getWorldPosition(_v); if (_v.distanceTo(p) < 0.08) { pressButton(kind); shell.pulse(e, 0.3, 20); return true; } }
  if (phase !== 'move') return false;
  world.thief.getWorldPosition(_v); _v.y += T * 0.4;
  if (_v.distanceTo(p) < GRAB_DIST) { held = { entry: e }; world.thief.userData.held = true; sfx.pick(); shell.pulse(e, 0.3, 20); return true; }
  return false;
}
function releaseHeld() {
  if (!held) return;
  const p = shell.grabPoint(held.entry);
  held = null; world.thief.userData.held = false;
  const c = world.cellOf(p);
  if (!(c && Math.abs(p.y - FLOOR_Y) < 0.18 && clickCell(c))) refresh(null, true);
}
function dropHeld() { if (held) { held = null; world.thief.userData.held = false; if (st) refresh(null, true); } }
function updateHeld() {
  if (!held) return;
  const p = shell.grabPoint(held.entry);
  world.thief.position.set(p.x, Math.max(FLOOR_Y, p.y - T * 0.4), p.z);
}

const hooks = {
  tick,
  pause: () => togglePause(),
  button: (e, k) => { if (k === 4) undo(); },
  squeezeStart: (e) => { if (!e.isHand) tryGrab(e); },
  squeezeEnd: (e) => { if (held?.entry === e) releaseHeld(); },
  selectStart: (e) => {
    if (e.isHand && tryGrab(e)) return;
    const rc = shell.entryRay(e);
    const b = buttonFromRay(rc);
    if (b) { pressButton(b); return; }
    clickCell(cellFromRay(shell.entryRay(e)));
  },
  selectEnd: (e) => { if (held?.entry === e) releaseHeld(); },
  disconnected: (e) => { if (held?.entry === e) dropHeld(); },
  sessionStart: () => { rigPlaced = false; updateHint(); },
  sessionEnd: () => { dropHeld(); updateHint(); },
  pointerDown: () => {
    const b = buttonFromRay(shell.mouseRay());
    if (b) { pressButton(b); return; }
    clickCell(cellFromRay(shell.mouseRay()));
  },
  key: (k) => {
    if (app !== 'play' || panel.visible) return false;
    if (KEYMOVE[k]) { doMove(KEYMOVE[k]); return true; }
    if (k === ' ') { doMove('W'); return true; }
    if (k === 'z' || k === 'backspace') { undo(); return true; }
    if (k === 'r') { restart(); return true; }
    return false;
  },
};
Object.assign(shell.hooks, hooks);

// ---------- HUD ----------
function updateHint() {
  let t;
  if (app !== 'play' || panel.visible) t = 'Clique nas opções do painel';
  else if (phase === 'caught') t = 'Pego! Z ou Backspace: desfazer o passo · R: recomeçar';
  else t = 'WASD ou setas: andar · Espaço: esperar · Z: desfazer · R: recomeçar · clique numa casa vizinha · botão direito: câmera · Esc: pausa';
  shell.setHint(t);
}
function statusLines() {
  return {
    a: `${li + 1}. ${LEVELS[li].name} · passos ${st.steps} (meta ${par}) · moedas ${countBits(st.coins)}/${lv.coins.length} · ${st.jewel ? 'diamante na sacola' : 'falta o diamante'}`,
    b: LEVELS[li].desc,
  };
}

// ---------- Laço ----------
let robotT = 0, robotPlan = null, lastHover = '';
function tick(dt) {
  const paused = app === 'paused';
  if (!paused) {
    time += dt;
    for (let i = 0; i < timers.length; i++) if (timers[i].at <= time) { const t = timers.splice(i, 1)[0]; i--; t.fn(); }
  }
  if (app === 'play' && !paused && dev.autoplay) {
    robotT += dt;
    if (robotT > 0.3) {
      robotT = 0;
      if (phase === 'intro') { shell.hidePanel(); phase = 'move'; }
      else if (phase === 'move') {
        if (!robotPlan) { robotPlan = parOf(li).moves.slice(); }
        const m = robotPlan.shift();
        if (m) doMove(m);
      } else if (phase === 'caught') undo();
    }
  }
  updateHeld();
  if (shell.vr && app === 'play') for (const e of shell.ctrls) { if (!e.source) continue; const rc = shell.entryRay(e); const h = rc.intersectObjects([world.pickPlane, ...Object.values(world.buttons)], false)[0]; if (h) e.laserLen = h.distance; }
  shell.showPinch = app === 'play';
  world.animate(dt, time);
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  shell.setStatus(app === 'play' && st ? { ...statusLines(), msg: msg?.text } : null);
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true   o robô joga por você      dev.advance(5)  avança 5 s na hora
// dev.state()           resumo                    dev.loadLevel(3) abre a fase 3 (1 a 15)
// dev.move('N'|'S'|'L'|'O'|'W')  anda            dev.undo()  dev.win()  resolve a fase
// dev.screenOf(x, y) | dev.screenOf('wait'|'undo'|'restart')   posição na tela   dev.resetSave()
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; robotPlan = null; dropHeld(); },
  loadLevel(n) { loadLevel(n - 1, true); return this.state(); },
  advance(sec, stepT = 1 / 60) {
    const frames = Math.round(sec / stepT);
    for (let i = 0; i < frames; i++) shell.step(stepT);
    shell.resetClock(); shell.render();
    return this.state();
  },
  move(m) { doMove(m); return this.state(); },
  undo() { undo(); return this.state(); },
  win() {
    if (!lv) return this.state();
    loadLevel(li, true);
    for (const m of parOf(li).moves) doMove(m);
    return this.state();
  },
  screenOf(a, b) {
    const o = typeof a === 'string' ? world.buttons[a].getWorldPosition(new THREE.Vector3()) : world.cellPos(a, b, new THREE.Vector3());
    const p = o.clone().project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight };
  },
  state() {
    const base = { tela: app, fase: phase, painel: panel.visible };
    if (!st || app === 'menu') return base;
    return {
      ...base, nivel: li + 1, nome: LEVELS[li].name, pos: [st.x, st.y], t: st.t, passos: st.steps, meta: par,
      joia: st.jewel, moedas: countBits(st.coins), pego: st.caught?.why || null, escapou: st.won,
      estrelas: result ? result.stars : null, desfazer: hist.length,
      salvo: { fases: save.lv },
    };
  },
  resetSave() { save.lv = {}; save.best = {}; storeSave(save); },
};
window.dev = dev;
window.surdina = { dev, get level() { return lv; }, get st() { return st; }, save, camera, scene, renderer, world, shell };

goMenu();
shell.start();
