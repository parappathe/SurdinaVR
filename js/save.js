// Progresso e opções, salvos no navegador.
const KEY = 'surdinavr.v1';
const DEFAULTS = { lv: {}, best: {}, sound: true, fps: false, preview: true };

export function loadSave() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    if (typeof s.lv !== 'object' || !s.lv) s.lv = {};
    if (typeof s.best !== 'object' || !s.best) s.best = {};
    return s;
  } catch { return { ...DEFAULTS, lv: {}, best: {} }; }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}
