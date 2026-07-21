/* ============================================================
   db.js – IndexedDB wrapper for audio blobs + localStorage for pins
   ============================================================ */

const VoiceMapDB = (() => {
  const DB_NAME    = 'VoiceMapDB';
  const DB_VERSION = 1;
  const STORE      = 'audioFiles';
  let db = null;

  async function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB open blocked — another tab is holding an older version open'));
      req.onsuccess = e => { db = e.target.result; resolve(); };
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE))
          d.createObjectStore(STORE, { keyPath: 'pinId' });
      };
    });
  }

  function tx(mode = 'readonly') {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  async function saveAudio(pinId, blob) {
    return new Promise((resolve, reject) => {
      const req = tx('readwrite').put({ pinId, blob, ts: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror  = () => reject(req.error);
    });
  }

  async function getAudio(pinId) {
    return new Promise((resolve, reject) => {
      const req = tx().get(pinId);
      req.onsuccess = () => resolve(req.result?.blob ?? null);
      req.onerror  = () => reject(req.error);
    });
  }

  async function hasAudio(pinId) {
    const blob = await getAudio(pinId);
    return blob !== null;
  }

  async function deleteAudio(pinId) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).delete(pinId);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  return { init, saveAudio, getAudio, hasAudio, deleteAudio };
})();


/* ── Pin metadata stored in localStorage ─────────────────── */
const PinStorage = (() => {
  const KEY = 'voiceMapPins_v2';

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }

  function save(pins) { localStorage.setItem(KEY, JSON.stringify(pins)); }

  function add(pin) {
    const pins = getAll();
    pins.push(pin);
    save(pins);
    return pin;
  }

  function update(id, data) {
    const pins = getAll();
    const i = pins.findIndex(p => p.id === id);
    if (i !== -1) { pins[i] = { ...pins[i], ...data }; save(pins); return pins[i]; }
    return null;
  }

  function del(id) {
    save(getAll().filter(p => p.id !== id));
    VoiceMapDB.deleteAudio(id).catch(() => {});
  }

  function genId() {
    return 'pin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  return { getAll, save, add, update, del, genId };
})();


/* ── Visit history stored in localStorage ─────────────────── */
const VisitHistory = (() => {
  const KEY      = 'voiceMapVisitHistory';
  const MAX_ENTRIES = 100;

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }

  function record(pin) {
    const history = getAll();
    history.unshift({
      pinId:     pin.id,
      pinName:   pin.name,
      visitedAt: Date.now(),
      lat:       pin.lat,
      lng:       pin.lng
    });
    localStorage.setItem(KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
  }

  /* Unique pin IDs that have ever been visited */
  function visitedIds() {
    return new Set(getAll().map(h => h.pinId));
  }

  function clear() { localStorage.removeItem(KEY); }

  return { getAll, record, visitedIds, clear };
})();
