// Cena do Na Surdina: um salão de museu à noite (luar pelas janelas altas, arandelas quentes,
// quadros nas paredes) e, numa mesa no meio, a maquete do andar a ser roubado: paredes, vitrines,
// guardas com lanterna, câmeras, lasers, cortinas, o diamante e a porta de saída.
import * as THREE from '../vendor/three/three.module.js';
import { cellAt, rayCells, GUARD_RANGE, DIRS } from './rules.js';
import { ceuGradiente, ambienteDoCeu, luzCeuChao, caixaArredondada, escurecerBase, sombraContato, halo } from './visual3d.js';
import { madeira, pedra, tecido } from './materiais3d.js';
import { Label } from './ui.js';

export const T = 0.075;                                 // tamanho de uma casa da maquete
export const TABLE = { x: 0, z: -0.62, w: 1.15, d: 1.0, top: 0.82 };
export const FLOOR_Y = TABLE.top + 0.025;
const IS_QUEST = typeof navigator !== 'undefined' && /OculusBrowser|Quest/i.test(navigator.userAgent || '');
const CAN_TEX = typeof ImageData !== 'undefined';
const FACE_YAW = { N: 0, L: -Math.PI / 2, S: Math.PI, O: Math.PI / 2 };
function hash(i) { let h = Math.imul(i ^ 0x9e3779b9, 2654435761); h ^= h >>> 15; return (h >>> 0) / 4294967296; }

export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  const SKY = { zenite: '#141c3a', horizonte: '#3a4a7a', chao: '#1a1a24', dirSol: new THREE.Vector3(0.4, 0.5, -0.7), corSol: '#c8d8ff', tamanhoSol: 0.02 };
  scene.background = new THREE.Color(0x1a2038);
  if (renderer && CAN_TEX && renderer.capabilities) ambienteDoCeu(renderer, scene, { ...SKY, horizonte: '#6a6a8a', zenite: '#4a5a8a' }, 0.5);
  luzCeuChao(scene, { ceu: '#8a9ad8', chao: '#a07850', intensidade: 0.9 });
  // luar frio de cima pelas claraboias (luz principal, com sombra na maquete)
  const moon = new THREE.DirectionalLight(0xbcd0ff, 1.6);
  moon.position.set(1.4, 3.2, 0.6);
  moon.target.position.set(TABLE.x, TABLE.top, TABLE.z);
  moon.castShadow = true;
  const sc = moon.shadow.camera; sc.left = sc.bottom = -0.8; sc.right = sc.top = 0.8; sc.near = 0.5; sc.far = 6;
  moon.shadow.mapSize.set(IS_QUEST ? 1024 : 2048, IS_QUEST ? 1024 : 2048);
  moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.01;
  scene.add(moon, moon.target);
  // luminária quente sobre a mesa
  const lamp = new THREE.PointLight(0xffc880, 1.6, 4, 1.6);
  lamp.position.set(TABLE.x - 0.2, 1.9, TABLE.z + 0.15);
  scene.add(lamp);

  // ---------- Salão ----------
  const ROOM = { w: 12, d: 14, h: 6 };
  const floorMat = CAN_TEX ? pedra({ tipo: 'lajota', cor: '#cfc6b4', escura: '#a89e8c', rejunte: '#7e7668', pedras: 4, repete: [ROOM.w / 1.2, ROOM.d / 1.2], leve: IS_QUEST }) : new THREE.MeshStandardMaterial({ color: 0xbab2a0, roughness: 0.5 });
  floorMat.roughness = 0.6;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.z = -2; floor.receiveShadow = true;
  scene.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb4, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.6 });
  const walls = [
    [0, ROOM.h / 2, -2 - ROOM.d / 2, ROOM.w, 0], [0, ROOM.h / 2, -2 + ROOM.d / 2, ROOM.w, Math.PI],
    [-ROOM.w / 2, ROOM.h / 2, -2, ROOM.d, Math.PI / 2], [ROOM.w / 2, ROOM.h / 2, -2, ROOM.d, -Math.PI / 2],
  ];
  for (const [x, y, z, w, ry] of walls) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.h), wallMat);
    m.position.set(x, y, z); m.rotation.y = ry;
    scene.add(m);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.05), trimMat);
    base.position.set(x, 0.125, z); base.rotation.y = ry; base.translateZ(0.025);
    scene.add(base);
    const top = base.clone(); top.position.y = ROOM.h - 0.4; scene.add(top);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, ROOM.h, -2);
  scene.add(ceil);
  // claraboias com luar
  for (const z of [-6, -2, 2]) {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ color: 0x5a6aa8 }));
    sky.rotation.x = Math.PI / 2; sky.position.set(0, ROOM.h - 0.01, z);
    scene.add(sky);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, ROOM.h, 4, 1, true), new THREE.MeshBasicMaterial({ color: 0x8aa0ff, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }));
    shaft.position.set(0, ROOM.h / 2, z); shaft.rotation.y = Math.PI / 4;
    if (z !== 2) scene.add(shaft);
  }
  // quadros nas paredes e arandelas
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.35, metalness: 1 });
  const paintings = [];
  const spots = [[-ROOM.w / 2 + 0.03, -5, Math.PI / 2], [-ROOM.w / 2 + 0.03, -1, Math.PI / 2], [ROOM.w / 2 - 0.03, -5, -Math.PI / 2], [ROOM.w / 2 - 0.03, -1, -Math.PI / 2], [-3, -2 - ROOM.d / 2 + 0.03, 0], [3, -2 - ROOM.d / 2 + 0.03, 0], [0, -2 - ROOM.d / 2 + 0.03, 0]];
  spots.forEach(([x, z, ry], k) => {
    const g = new THREE.Group();
    const w = 1.3 + hash(k) * 0.6, h = 1.0 + hash(k + 9) * 0.5;
    const fr = new THREE.Mesh(caixaArredondada(w + 0.16, h + 0.16, 0.06, 0.02, 1), frameMat);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: paintingTex(k), roughness: 0.7 }));
    pic.position.z = 0.032;
    g.add(fr, pic);
    g.position.set(x, 2.1, z); g.rotation.y = ry;
    scene.add(g);
    paintings.push(g);
    const sconce = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd8a0 }));
    sconce.position.set(0, h / 2 + 0.25, 0.12);
    g.add(sconce);
    const hl = halo('#ffc070', 0.7, 0.6); hl.position.copy(sconce.position); g.add(hl);
  });
  // cordões de veludo e pedestais vazios pelo salão (o que foi roubado...)
  const velvet = new THREE.MeshStandardMaterial({ color: 0x8a1a2a, roughness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.3, metalness: 1 });
  for (const [x, z] of [[-3, -4], [3, -4], [-3.5, 1.5], [3.5, 1.5]]) {
    const ped = new THREE.Mesh(caixaArredondada(0.5, 1.0, 0.5, 0.03, 2), new THREE.MeshStandardMaterial({ color: 0xece4d4, roughness: 0.5 }));
    ped.position.set(x, 0.5, z); ped.castShadow = true; scene.add(ped);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.18, roughness: 0.05 }));
    glass.position.set(x, 1.2, z); scene.add(glass);
    const vase = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.08, 0], [0.11, 0.08], [0.07, 0.2], [0.09, 0.27], [0, 0.27]].map(([a, b]) => new THREE.Vector2(a, b)), 16), new THREE.MeshStandardMaterial({ color: [0x2a5a9a, 0xa04a2a, 0x3a7a5a, 0xd8b04a][Math.abs(x * z) % 4 | 0], roughness: 0.3 }));
    vase.position.set(x, 1.0, z); scene.add(vase);
    for (const dx of [-0.6, 0.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.06, 0.9, 10), brass);
      post.position.set(x + dx, 0.45, z + 0.7); scene.add(post);
    }
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.018, 6, 20, Math.PI), velvet);
    rope.position.set(x, 0.86, z + 0.7); rope.rotation.z = Math.PI; scene.add(rope);
  }

  // ---------- Mesa ----------
  const tableMat = CAN_TEX ? madeira({ clara: '#7a4a2a', escura: '#3e2414', tabuas: 0, verniz: 0.6, repete: [1, 1], leve: IS_QUEST }) : new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.45 });
  const top = new THREE.Mesh(caixaArredondada(TABLE.w, 0.05, TABLE.d, 0.012, 2), tableMat);
  top.position.set(TABLE.x, TABLE.top - 0.025, TABLE.z);
  top.castShadow = top.receiveShadow = true;
  scene.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, TABLE.top - 0.05, 10), tableMat);
    leg.position.set(TABLE.x + sx * (TABLE.w / 2 - 0.08), (TABLE.top - 0.05) / 2, TABLE.z + sz * (TABLE.d / 2 - 0.08));
    leg.castShadow = true; scene.add(leg);
  }
  const ts = sombraContato(TABLE.w * 1.4, TABLE.d * 1.4, 0.55); ts.position.set(TABLE.x, 0.004, TABLE.z); scene.add(ts);

  // ---------- Maquete (refeita a cada fase) ----------
  const board = new THREE.Group();
  scene.add(board);
  const tileFloorMat = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.55 });
  const tileFloorMat2 = new THREE.MeshStandardMaterial({ color: 0xd2c8b0, roughness: 0.55 });
  const mazeWallMat = new THREE.MeshStandardMaterial({ color: 0x7a8aa8, roughness: 0.7, vertexColors: true });
  const wallCapMat = new THREE.MeshStandardMaterial({ color: 0x3a4258, roughness: 0.6 });
  const WALL_H = T * 0.85;
  const wallGeo = escurecerBase(caixaArredondada(T, WALL_H, T, T * 0.06, 1), { altura: WALL_H * 0.5, forca: 0.4 });
  const capGeo = caixaArredondada(T * 1.02, T * 0.08, T * 1.02, T * 0.02, 1);
  const tileGeo = caixaArredondada(T * 0.98, 0.006, T * 0.98, 0.002, 1);
  const visGeo = new THREE.PlaneGeometry(T * 0.92, T * 0.92); visGeo.rotateX(-Math.PI / 2);
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
  let lv = null, origin = new THREE.Vector3();
  const cellPos = (x, y, out = new THREE.Vector3()) => out.set(origin.x + (x + 0.5) * T, FLOOR_Y, origin.z + (y + 0.5) * T);

  // marcações que mudam a cada turno
  const MAXV = 120;
  const visGuard = new THREE.InstancedMesh(visGeo, new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }), MAXV);
  const visCam = new THREE.InstancedMesh(visGeo, new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }), MAXV);
  const visNext = new THREE.InstancedMesh(new THREE.RingGeometry(T * 0.3, T * 0.42, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), new THREE.MeshBasicMaterial({ color: 0xffa02a, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }), MAXV);
  const moves = new THREE.InstancedMesh(visGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }), 5);
  for (const m of [visGuard, visCam, visNext, moves]) { m.count = 0; m.frustumCulled = false; m.renderOrder = 2; scene.add(m); }
  moves.userData.cells = [];

  // ---------- Peças ----------
  const thief = makeThief();
  scene.add(thief);
  const guardFigs = [];
  const camFigs = [];
  const laserFigs = [];
  const coinFigs = [];
  const curtainFigs = [];
  let jewelFig = null, exitFig = null;
  const thiefRing = new THREE.Mesh(new THREE.RingGeometry(T * 0.3, T * 0.38, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd86a, transparent: true, opacity: 0.85, toneMapped: false }));
  scene.add(thiefRing);
  const alarm = new THREE.PointLight(0xff2020, 0, 3, 1.5);
  alarm.position.set(TABLE.x, TABLE.top + 0.6, TABLE.z);
  scene.add(alarm);

  function clearBoard() {
    for (const arr of [guardFigs, camFigs, laserFigs, coinFigs, curtainFigs]) { for (const o of arr) scene.remove(o.root || o); arr.length = 0; }
    if (jewelFig) scene.remove(jewelFig); if (exitFig) scene.remove(exitFig);
    while (board.children.length) board.remove(board.children[0]);
  }
  function setLevel(level) {
    clearBoard();
    lv = level;
    origin.set(TABLE.x - lv.W * T / 2, 0, TABLE.z - lv.H * T / 2 - 0.02);
    // piso e paredes (instâncias)
    let nw = 0, nf = 0;
    for (let y = 0; y < lv.H; y++) for (let x = 0; x < lv.W; x++) if (cellAt(lv, x, y) === '#') nw++; else nf++;
    const wallsM = new THREE.InstancedMesh(wallGeo, mazeWallMat, nw);
    const capsM = new THREE.InstancedMesh(capGeo, wallCapMat, nw);
    const fl1 = new THREE.InstancedMesh(tileGeo, tileFloorMat, nf), fl2 = new THREE.InstancedMesh(tileGeo, tileFloorMat2, nf);
    let iw = 0, i1 = 0, i2 = 0;
    for (let y = 0; y < lv.H; y++) for (let x = 0; x < lv.W; x++) {
      cellPos(x, y, _p);
      if (cellAt(lv, x, y) === '#') {
        const border = x === 0 || y === 0 || x === lv.W - 1 || y === lv.H - 1;
        const hgt = border ? 0.75 : 1;
        _p.y = FLOOR_Y + WALL_H * hgt / 2;
        wallsM.setMatrixAt(iw, _m.compose(_p, _q.identity(), _s.set(1, hgt, 1)));
        _p.y = FLOOR_Y + WALL_H * hgt;
        capsM.setMatrixAt(iw++, _m.compose(_p, _q.identity(), _s.set(1, 1, 1)));
      } else {
        _p.y = FLOOR_Y + 0.003;
        if ((x + y) % 2) fl1.setMatrixAt(i1++, _m.compose(_p, _q.identity(), _s.set(1, 1, 1)));
        else fl2.setMatrixAt(i2++, _m.compose(_p, _q.identity(), _s.set(1, 1, 1)));
      }
    }
    fl1.count = i1; fl2.count = i2;
    for (const m of [wallsM, capsM]) { m.castShadow = true; m.receiveShadow = true; }
    fl1.receiveShadow = fl2.receiveShadow = true;
    board.add(wallsM, capsM, fl1, fl2);
    // base escura da maquete
    const baseM = new THREE.Mesh(caixaArredondada(lv.W * T + 0.03, 0.02, lv.H * T + 0.03, 0.006, 1), wallCapMat);
    baseM.position.set(origin.x + lv.W * T / 2, FLOOR_Y - 0.01, origin.z + lv.H * T / 2);
    baseM.receiveShadow = true;
    board.add(baseM);
    // placa com o nome da fase na beira da maquete
    // saída
    exitFig = makeExit(); cellPos(...lv.exit, exitFig.position); scene.add(exitFig);
    // joia
    if (lv.jewel) { jewelFig = makeJewel(); cellPos(...lv.jewel, jewelFig.position); scene.add(jewelFig); }
    lv.coins.forEach(([x, y], i) => { const c = makeCoin(); cellPos(x, y, c.position); c.position.y += T * 0.25; c.userData.i = i; scene.add(c); coinFigs.push(c); });
    for (let y = 0; y < lv.H; y++) for (let x = 0; x < lv.W; x++) {
      const c = cellAt(lv, x, y);
      if (c === 'h') { const f = makeCurtain(); cellPos(x, y, f.position); scene.add(f); curtainFigs.push(f); }
      if (c === 'L' || c === 'l') {
        const horiz = cellAt(lv, x - 1, y) === '#' || cellAt(lv, x + 1, y) === '#' ? false : true;
        const f = makeLaser(horiz); cellPos(x, y, f.position); f.userData.kind = c; f.userData.cell = [x, y]; scene.add(f); laserFigs.push(f);
      }
    }
    for (const g of lv.guards) { const f = makeGuard(g.sleepy); scene.add(f); guardFigs.push({ root: f, g }); }
    // câmera: num pedestal no chão, ou em cima da parede (mais alta, vê por cima)
    for (const c of lv.cameras) { const f = makeCamera(); cellPos(...c.at, f.position); if (cellAt(lv, ...c.at) === '#') f.position.y += WALL_H; f.scale.setScalar(1.25); scene.add(f); camFigs.push({ root: f, c }); }
  }

  // ---------- Atualiza o turno (posições finais; a animação desliza até elas) ----------
  const anim = { thief: null, guards: [], t: 1, dur: 0.25 };
  function showTurn(st, prev, { snap = false, showNext = true, watched, nextWatched, moveCells }) {
    const a = prev || st;
    anim.t = snap ? 1 : 0;
    anim.thief = { a: cellPos(a.x, a.y), b: cellPos(st.x, st.y) };
    anim.guards = guardFigs.map(({ g }) => {
      const p0 = g.path[a.t % g.path.length], p1 = g.path[st.t % g.path.length];
      return { a: cellPos(p0.x, p0.y), b: cellPos(p1.x, p1.y), fa: FACE_YAW[p0.face], fb: FACE_YAW[p1.face] };
    });
    // olhar das câmeras
    for (const { root, c } of camFigs) root.userData.head.rotation.y = FACE_YAW[c.dirs[st.t % c.dirs.length]];
    // sono
    for (const { root, g } of guardFigs) { const asleep = g.sleepy && st.t % 4 >= 2; root.userData.zzz.visible = asleep; root.userData.beam.visible = !asleep; }
    // lasers
    for (const f of laserFigs) { const on = (f.userData.kind === 'L' && st.t % 2 === 0) || (f.userData.kind === 'l' && st.t % 2 === 1); f.userData.beam.material = on ? laserOnMat : laserOffMat; f.userData.glow.visible = on; }
    // joia e moedas
    if (jewelFig) jewelFig.userData.gem.visible = !st.jewel;
    thief.userData.bag.visible = st.jewel;
    for (const c of coinFigs) c.visible = !(st.coins & (1 << c.userData.i));
    // marcações
    fillCells(visGuard, watched.guard);
    fillCells(visCam, watched.camera);
    fillCells(visNext, showNext && nextWatched ? new Set([...nextWatched.guard, ...nextWatched.camera].filter(k => !watched.guard.has(k) && !watched.camera.has(k))) : new Set());
    moves.userData.cells = moveCells || [];
    let k = 0;
    for (const [x, y] of moves.userData.cells) { cellPos(x, y, _p); _p.y += 0.008; moves.setMatrixAt(k++, _m.compose(_p, _q.identity(), _s.set(1, 1, 1))); }
    moves.count = k; moves.instanceMatrix.needsUpdate = true;
    const hidden = cellAt(lv, st.x, st.y) === 'h';
    thief.userData.body.traverse(o => { if (o.material) { o.material.transparent = hidden; o.material.opacity = hidden ? 0.35 : 1; } });
  }
  function fillCells(mesh, set) {
    let k = 0;
    for (const key of set) {
      if (k >= MAXV) break;
      const [x, y] = key.split(',').map(Number);
      cellPos(x, y, _p); _p.y += 0.0075;
      mesh.setMatrixAt(k++, _m.compose(_p, _q.identity(), _s.set(1, 1, 1)));
    }
    mesh.count = k; mesh.instanceMatrix.needsUpdate = true;
  }

  let alarmT = 0;
  function setAlarm(on) { alarmT = on ? 2.5 : 0; if (!on) alarm.intensity = 0; }

  function animate(dt, time) {
    if (anim.t < 1) anim.t = Math.min(1, anim.t + dt / anim.dur);
    const k = anim.t * anim.t * (3 - 2 * anim.t);
    if (anim.thief) {
      thief.position.lerpVectors(anim.thief.a, anim.thief.b, k);
      if (!thief.userData.held) thief.position.y = FLOOR_Y + Math.sin(Math.PI * k) * T * 0.25;
      const d = anim.thief.b.clone().sub(anim.thief.a);
      if (d.lengthSq() > 1e-6) thief.rotation.y = Math.atan2(-d.x, -d.z);
      thiefRing.position.set(thief.position.x, FLOOR_Y + 0.009, thief.position.z);
    }
    anim.guards.forEach((a, i) => {
      const f = guardFigs[i].root;
      f.position.lerpVectors(a.a, a.b, k);
      let fa = a.fa, fb = a.fb;
      while (fb - fa > Math.PI) fb -= Math.PI * 2;
      while (fa - fb > Math.PI) fb += Math.PI * 2;
      f.rotation.y = fa + (fb - fa) * k;
      f.userData.legs.rotation.x = Math.sin(time * 14) * 0.3 * Math.sin(Math.PI * k);
      f.userData.zzz.position.y = T * 1.1 + Math.sin(time * 2) * T * 0.1;
    });
    if (jewelFig) { jewelFig.userData.gem.rotation.y = time * 0.8; jewelFig.userData.gem.position.y = T * 0.62 + Math.sin(time * 2) * T * 0.04; }
    for (const c of coinFigs) c.rotation.y = time * 2.5;
    for (const f of laserFigs) f.userData.glow.material.opacity = 0.5 + Math.sin(time * 20) * 0.15;
    thiefRing.material.opacity = 0.6 + Math.sin(time * 4) * 0.25;
    if (alarmT > 0) { alarmT -= dt; alarm.intensity = (Math.sin(time * 18) > 0 ? 6 : 0.5) * Math.min(1, alarmT); }
    if (exitFig) exitFig.userData.arrow.position.y = T * 0.5 + Math.sin(time * 3) * T * 0.08;
  }

  // casa da maquete debaixo de um ponto (para a mão e para o raio)
  function cellOf(p) {
    if (!lv) return null;
    const x = Math.floor((p.x - origin.x) / T), y = Math.floor((p.z - origin.z) / T);
    if (x < 0 || y < 0 || x >= lv.W || y >= lv.H) return null;
    return [x, y];
  }
  const pickPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ visible: false }));
  pickPlane.rotation.x = -Math.PI / 2; pickPlane.position.set(TABLE.x, FLOOR_Y + 0.008, TABLE.z);
  scene.add(pickPlane);

  // ---------- Botões na beira da mesa (VR e PC) ----------
  const buttons = {};
  const btnDefs = [['wait', 'Esperar', -0.32], ['undo', 'Desfazer', 0], ['restart', 'Recomeçar', 0.32]];
  for (const [kind, text, dx] of btnDefs) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(caixaArredondada(0.2, 0.025, 0.07, 0.008, 2), new THREE.MeshStandardMaterial({ color: kind === 'wait' ? 0x3a6a9a : kind === 'undo' ? 0x8a6a2a : 0x7a3a3a, roughness: 0.5 }));
    base.castShadow = true;
    const lab = new Label(0.18, 256, 64);
    lab.set([{ text, size: 0.7, color: '#ffffff' }]);
    lab.mesh.rotation.x = -Math.PI / 2; lab.mesh.position.y = 0.014;
    lab.mesh.material.depthTest = true;
    lab.mesh.renderOrder = 3;
    g.add(base, lab.mesh);
    g.position.set(TABLE.x + dx, TABLE.top + 0.0125, TABLE.z + TABLE.d / 2 - 0.06);
    base.userData = { kind };
    scene.add(g);
    buttons[kind] = base;
  }

  return { scene, thief, setLevel, showTurn, animate, cellPos, cellOf, pickPlane, moves, buttons, setAlarm, guardFigs, get origin() { return origin; }, get level() { return lv; } };
}

// ---------- Modelos ----------
const laserOnMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
const laserOffMat = new THREE.MeshBasicMaterial({ color: 0x5a2a2a, transparent: true, opacity: 0.35 });

function makeThief() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const stripes = document.createElement('canvas'); stripes.width = 16; stripes.height = 64;
  const c = stripes.getContext('2d');
  for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f2f2f2' : '#1e1e26'; c.fillRect(0, i * 8, 16, 8); }
  const tex = new THREE.CanvasTexture(stripes); tex.colorSpace = THREE.SRGBColorSpace;
  const shirt = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e1e26, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.15, T * 0.19, T * 0.36, 12), shirt); torso.position.y = T * 0.38;
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.16, T * 0.14, T * 0.2, 10), dark); legs.position.y = T * 0.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(T * 0.14, 14, 10), skin); head.position.y = T * 0.7;
  const mask = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.145, T * 0.145, T * 0.06, 14, 1, true), dark); mask.position.y = T * 0.72;
  const beanie = new THREE.Mesh(new THREE.SphereGeometry(T * 0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark); beanie.position.y = T * 0.74;
  body.add(torso, legs, head, mask, beanie);
  const bag = new THREE.Mesh(new THREE.SphereGeometry(T * 0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.9 }));
  bag.position.set(0, T * 0.5, T * 0.18); bag.scale.set(1, 1.1, 0.8);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.12, T * 0.08), new THREE.MeshBasicMaterial({ color: 0x2a8a3a }));
  sign.position.set(0, T * 0.52, T * 0.285); bag.add(sign); sign.position.set(0, 0, T * 0.11);
  bag.visible = false;
  g.add(bag);
  for (const o of [torso, legs, head, bag]) o.castShadow = true;
  g.userData = { body, bag };
  return g;
}
function makeGuard(sleepy) {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: sleepy ? 0x4a5a8a : 0x2a3a6a, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a880, roughness: 0.7 });
  const legs = new THREE.Group(); g.add(legs);
  const l = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.17, T * 0.15, T * 0.24, 10), new THREE.MeshStandardMaterial({ color: 0x1a2240, roughness: 0.7 })); l.position.y = T * 0.12; legs.add(l);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.17, T * (sleepy ? 0.26 : 0.2), T * 0.38, 12), blue); torso.position.y = T * 0.43;
  const head = new THREE.Mesh(new THREE.SphereGeometry(T * 0.14, 14, 10), skin); head.position.y = T * 0.76;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.15, T * 0.15, T * 0.08, 14), new THREE.MeshStandardMaterial({ color: 0x1a2240, roughness: 0.5 })); cap.position.y = T * 0.87;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(T * 0.2, T * 0.015, T * 0.1), cap.material); visor.position.set(0, T * 0.835, -T * 0.13);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(T * 0.035, 6), new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.3 })); badge.position.set(-T * 0.08, T * 0.5, -T * 0.185);
  badge.rotation.y = Math.PI;
  const torch = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.035, T * 0.045, T * 0.18, 8), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 1, roughness: 0.4 }));
  torch.rotation.x = Math.PI / 2; torch.position.set(T * 0.18, T * 0.45, -T * 0.18);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(T * 0.55, T * GUARD_RANGE, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  beam.rotation.x = -Math.PI / 2; beam.position.set(0, T * 0.4, -T * (GUARD_RANGE / 2 + 0.2));
  const zzz = new Label(T * 1.2, 128, 64); zzz.set([{ text: 'zzz', size: 0.8, color: '#3a4a8a' }]); zzz.mesh.position.y = T * 1.1; zzz.mesh.visible = false;
  g.add(torso, head, cap, visor, badge, torch, beam, zzz.mesh);
  for (const o of [torso, head, cap, l]) o.castShadow = true;
  g.userData = { legs, beam, zzz: zzz.mesh };
  return g;
}
function makeCamera() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.06, T * 0.1, T * 0.7, 8), new THREE.MeshStandardMaterial({ color: 0x5a5a62, metalness: 1, roughness: 0.4 }));
  pole.position.y = T * 0.35;
  const head = new THREE.Group(); head.position.y = T * 0.75;
  const box = new THREE.Mesh(caixaArredondada(T * 0.3, T * 0.24, T * 0.45, T * 0.04, 1), new THREE.MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.4 }));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(T * 0.08, 12), new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }));
  lens.position.z = -T * 0.23; lens.rotation.y = Math.PI;
  const glow = halo('#ff3030', T * 0.6, 1); glow.position.z = -T * 0.26;
  head.add(box, lens, glow);
  g.add(pole, head);
  pole.castShadow = box.castShadow = true;
  g.userData = { head };
  return g;
}
function makeLaser(horiz) {
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 1, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.05, T * 0.06, T * 0.5, 8), postMat);
    if (horiz) p.position.set(0, T * 0.25, s * T * 0.44); else p.position.set(s * T * 0.44, T * 0.25, 0);
    p.castShadow = true;
    g.add(p);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.015, T * 0.015, T * 0.88, 6), laserOnMat);
  if (horiz) beam.rotation.x = Math.PI / 2; else beam.rotation.z = Math.PI / 2;
  beam.position.y = T * 0.32;
  const beam2 = beam.clone(); beam2.position.y = T * 0.16;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.9, T * 0.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
  glow.position.y = 0.008;
  g.add(beam, beam2, glow);
  g.userData = { beam, glow };
  beam2.material = beam.material;
  Object.defineProperty(g.userData, 'beam', { get: () => ({ set material(m) { beam.material = m; beam2.material = m; } }) });
  return g;
}
function makeCurtain() {
  const g = new THREE.Group();
  const mat = typeof ImageData !== 'undefined' ? tecido({ cor: '#6a2a8a', leve: true }) : new THREE.MeshStandardMaterial({ color: 0x6a2a8a, roughness: 0.8 });
  mat.side = THREE.DoubleSide;
  const geo = new THREE.CylinderGeometry(T * 0.42, T * 0.46, T * 0.9, 18, 1, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)); const r = 1 + Math.sin(a * 9) * 0.07; pos.setX(i, pos.getX(i) * r); pos.setZ(i, pos.getZ(i) * r); }
  geo.computeVertexNormals();
  const cloth = new THREE.Mesh(geo, mat); cloth.position.y = T * 0.45; cloth.castShadow = true;
  const rod = new THREE.Mesh(new THREE.TorusGeometry(T * 0.44, T * 0.02, 6, 20), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 }));
  rod.rotation.x = Math.PI / 2; rod.position.y = T * 0.9;
  g.add(cloth, rod);
  return g;
}
function makeJewel() {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.22, T * 0.28, T * 0.4, 12), new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.4 }));
  ped.position.y = T * 0.2; ped.castShadow = true;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(T * 0.17, 0), new THREE.MeshStandardMaterial({ color: 0x8af0ff, emissive: 0x2aa0c0, emissiveIntensity: 0.8, roughness: 0.05, metalness: 0, flatShading: true }));
  gem.scale.y = 1.3; gem.position.y = T * 0.62;
  const h = halo('#9af4ff', T * 1.6, 1.0); gem.add(h);
  g.add(ped, gem);
  g.userData = { gem };
  return g;
}
function makeCoin() {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(T * 0.14, T * 0.14, T * 0.035, 16), new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.25, emissive: 0x4a3200 }));
  c.rotation.z = Math.PI / 2;
  const g = new THREE.Group(); g.add(c);
  c.castShadow = true;
  return g;
}
function makeExit() {
  const g = new THREE.Group();
  const mat = new THREE.Mesh(new THREE.BoxGeometry(T * 0.9, 0.004, T * 0.9), new THREE.MeshStandardMaterial({ color: 0x2a9a4a, roughness: 0.6, emissive: 0x0a3a1a }));
  mat.position.y = 0.006;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(T * 0.16, T * 0.3, 4), new THREE.MeshBasicMaterial({ color: 0x5aff8a, toneMapped: false }));
  arrow.rotation.x = Math.PI; arrow.position.y = T * 0.5;
  const h = halo('#5aff8a', T * 1.2, 0.6); h.position.y = T * 0.3;
  g.add(mat, arrow, h);
  g.userData = { arrow };
  return g;
}
// Quadro abstrato pintado em código (cada um diferente)
function paintingTex(k) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 96;
  const g = cv.getContext('2d');
  const pals = [['#2a4a7a', '#e8c86a', '#c84a2a'], ['#3a6a4a', '#f2e6c8', '#8a3a5a'], ['#7a3a2a', '#f2b84a', '#2a5a8a'], ['#1a2a4a', '#8ab8e8', '#f2f2e8']];
  const p = pals[k % pals.length];
  g.fillStyle = p[0]; g.fillRect(0, 0, 128, 96);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = p[1 + (i % 2)];
    g.globalAlpha = 0.6 + hash(k * 31 + i) * 0.4;
    g.beginPath();
    g.arc(hash(k * 7 + i) * 128, hash(k * 13 + i) * 96, 6 + hash(k * 17 + i) * 26, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export { FACE_YAW, DIRS };
