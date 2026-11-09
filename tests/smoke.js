// Fumaça do main.js: carrega o jogo inteiro no Node com um navegador de mentira (sem WebGL, sem som)
// e confere que menu, partida (com o robô), andar pelo teclado, clique e VR, desfazer e as 15 fases funcionam.
import * as nodeModule from 'node:module';

// ---- navegador de mentira ----
function fakeCtx() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get(_, k) {
      if (k === 'measureText') return (t) => ({ width: String(t).length * 12 });
      if (k === 'canvas') return null;
      return fn;
    },
    set() { return true; },
    apply() { return proxy; },
  });
  return proxy;
}
function fakeElement(tag = 'div') {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', width: 300, height: 150,
    listeners,
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return fakeCtx(); },
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    dispatch(t, e) { for (const f of listeners[t] || []) f(e); },
  };
}
function installDom() {
  const els = {};
  const winListeners = {};
  const store = new Map();
  const doc = {
    createElement: (t) => fakeElement(t),
    createElementNS: (_, t) => fakeElement(t),
    getElementById: (id) => (els[id] ||= fakeElement('div')),
    body: fakeElement('body'),
    addEventListener() {},
  };
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: false,
    addEventListener(t, f) { (winListeners[t] ||= []).push(f); },
    removeEventListener() {},
    dispatch(t, e) { for (const f of winListeners[t] || []) f(e); },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.self = win;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-teste' }, configurable: true, writable: true });
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  return { els, win, store };
}

// Troca só o WebGLRenderer do Three.js por um de mentira (o resto do Three.js é o de verdade).
function installThreeStub() {
  const stub = new URL('./three-stub.js', import.meta.url).href;
  const resolve = (spec, ctx, next) => {
    if (spec.endsWith('vendor/three/three.module.js') && !String(ctx.parentURL || '').endsWith('three-stub.js')) return { url: stub, shortCircuit: true };
    return next(spec, ctx);
  };
  if (nodeModule.registerHooks) nodeModule.registerHooks({ resolve });
  else throw new Error('Node sem module.registerHooks (precisa do Node 22.15 ou mais novo)');
}

export async function smoke() {
  const out = [];
  const ok = (c, m) => out.push([!!c, m]);
  const { els, win, store } = installDom();
  installThreeStub();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  await import('../js/main.js');
  const dev = window.dev;
  const G = window.surdina;
  const THREE = await import('../vendor/three/three.module.js');
  const { LEVELS } = await import('../js/levels.js');
  ok(dev && typeof dev.advance === 'function', 'main.js carregou e criou window.dev');
  let s = dev.advance(0.5);
  ok(s.tela === 'menu' && s.painel, 'abre no menu principal');
  ok(els.vr.textContent.includes('VR'), `botão de VR avisa que não tem VR aqui ("${els.vr.textContent}")`);
  const canvasEl = G.renderer.domElement;
  const key = (k) => { win.dispatch('keydown', { key: k }); win.dispatch('keyup', { key: k }); return dev.advance(0.3); };
  const click = (p) => { canvasEl.dispatch('pointermove', { clientX: p.x, clientY: p.y }); canvasEl.dispatch('pointerdown', { clientX: p.x, clientY: p.y, button: 0 }); win.dispatch('pointerup', {}); return dev.advance(0.3); };

  // fase 1: teclado
  s = dev.loadLevel(1);
  ok(s.tela === 'play' && s.pos.join() === '1,1' && s.fase === 'move', 'fase 1 aberta com o ladrão no início');
  s = key('d');
  ok(s.pos.join() === '2,1' && s.passos === 1, 'D anda para a direita');
  s = key('w');
  ok(s.pos.join() === '2,1' && s.passos === 1, 'W contra a parede não anda');
  s = key(' ');
  ok(s.passos === 2 && s.t === 2, 'Espaço espera um turno');
  s = key('z');
  ok(s.passos === 1, 'Z desfaz');
  // clique na casa vizinha
  s = click(dev.screenOf(3, 1));
  ok(s.pos.join() === '3,1', 'clicar na casa vizinha anda');
  s = click(dev.screenOf('undo'));
  ok(s.pos.join() === '2,1', 'botão Desfazer na mesa');
  s = key('r');
  ok(s.passos === 0 && s.pos.join() === '1,1', 'R recomeça');

  // ser pego na fase 2 e desfazer
  s = dev.loadLevel(2);
  for (const k of ['w', 'w']) s = key(k);
  ok(s.pego && s.fase === 'caught', `andar na lanterna do guarda = pego (${s.pego})`);
  s = key('d');
  ok(s.passos === 2, 'depois de pego não anda');
  s = key('z');
  ok(!s.pego && s.fase === 'move', 'desfazer tira do alarme');

  // VR: pegar o ladrão e soltar na casa ao lado
  s = dev.loadLevel(1);
  const entry = G.shell.ctrls[1];
  entry.source = { handedness: 'right', gamepad: { buttons: [], axes: [0, 0, 0, 0] } };
  entry.side = 'right';
  const rigInv = new THREE.Matrix4().copy(G.shell.rig.matrixWorld).invert();
  const setGrab = (q) => { entry.grip.position.copy(q.clone().add(new THREE.Vector3(0, 0.02, 0.04)).applyMatrix4(rigInv)); entry.ctrl.position.copy(entry.grip.position); G.shell.rig.updateMatrixWorld(true); };
  dev.advance(0.4);
  const th = G.world.thief.getWorldPosition(new THREE.Vector3()); th.y += 0.03;
  setGrab(th);
  G.shell.hooks.squeezeStart(entry);
  const target = G.world.cellPos(1, 2, new THREE.Vector3()); target.y += 0.04;
  setGrab(target);
  dev.advance(0.1);
  G.shell.hooks.squeezeEnd(entry);
  s = dev.advance(0.3);
  ok(s.pos.join() === '1,2', `VR: soltar o ladrão na casa de baixo anda (${s.pos})`);
  setGrab(G.world.buttons.wait.getWorldPosition(new THREE.Vector3()));
  G.shell.hooks.squeezeStart(entry);
  G.shell.hooks.squeezeEnd(entry);
  s = dev.advance(0.3);
  ok(s.passos === 2 && s.pos.join() === '1,2', 'VR: tocar no botão Esperar');
  entry.source = null; entry.side = null;

  // robô resolve as 15 fases dentro do jogo
  dev.autoplay = true;
  const stars = [];
  for (let n = 1; n <= LEVELS.length; n++) {
    dev.loadLevel(n);
    let g = 0;
    while (dev.state().estrelas == null && g++ < 400) dev.advance(0.35);
    stars.push(dev.state().estrelas);
  }
  dev.autoplay = false;
  ok(stars.every(x => x === 3), `robô tira 3 estrelas nas ${LEVELS.length} fases dentro do jogo (${stars.join(' ')})`);
  ok(Object.keys(JSON.parse(store.get('surdinavr.v1') || '{"lv":{}}').lv).length === LEVELS.length, 'estrelas salvas no localStorage');

  dev.resetSave();
  dev.loadLevel(7);
  s = dev.win();
  ok(s.escapou && s.estrelas === 3, 'dev.win() resolve a fase');

  dev.loadLevel(3);
  dev.advance(0.2);
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'paused', 'Esc pausa');
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'play', 'Esc de novo continua');
  const loop = G.renderer._loop;
  for (let i = 0; i < 5; i++) loop?.(performance.now() + i * 16);
  ok(typeof loop === 'function', 'laço de animação ligado');
  console.error = origErr;
  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 2).join(' | ')})`);
  return out;
}
