import { DEFAULT_PLAN } from './defaults.js';
import { toast } from './utils.js';

// Nunca renomeie essas chaves: deploys/atualizações do PWA devem preservar os dados do usuário.
export const KEYS = {
  plan: 'tt_plan_v1',
  logs: 'tt_logs_v1',
  cfg: 'tt_cfg_v1',
  sessions: 'tt_sessions_v1',
  meta: 'tt_meta_v1'
};

const IDB_NAME = 'treino-tracker';
const IDB_VERSION = 1;
const IDB_STORE = 'kv';

const DEFAULT_CFG = {
  theme: 'dark',
  unit: 'kg',
  lastWorkoutId: null,
  restSeconds: 90,
  vibrate: true,
  lastBackupAt: null,
  wakeLock: true
};

const DEFAULT_META = {
  dataVersion: 2,
  migratedAt: null
};

export const state = {
  plan: null,
  logs: {},
  cfg: { ...DEFAULT_CFG },
  sessions: [],
  meta: { ...DEFAULT_META },
  activeTab: 'hoje',
  selectedWorkout: 'push',
  chartMetric: 'maxKg',
  chartExercise: null,
  chartPeriod: 90,
  draftSets: {}
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function idbGet(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('idbGet', key, err);
    return null;
  }
}

export async function idbSet(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('idbSet', key, err);
    return false;
  }
}

export async function idbDelete(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('idbDelete', key, err);
    return false;
  }
}

export function isValidPlan(plan) {
  return !!(
    plan &&
    Array.isArray(plan.days) &&
    plan.days.every(d =>
      d &&
      typeof d.id === 'string' &&
      typeof d.name === 'string' &&
      Array.isArray(d.exercises) &&
      d.exercises.every(ex =>
        ex &&
        typeof ex.id === 'string' &&
        typeof ex.name === 'string' &&
        typeof ex.sets === 'number' &&
        typeof ex.reps === 'string'
      )
    )
  );
}

export function isValidLogs(logs) {
  return !!(logs && typeof logs === 'object' && !Array.isArray(logs));
}

export function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function dualWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('localStorage write failed', key, err);
  }
  return idbSet(key, value);
}

export async function migrateFromLocalStorage() {
  const migrated = {};
  for (const key of Object.values(KEYS)) {
    const raw = localStorage.getItem(key);
    if (raw == null) continue;
    const parsed = safeParse(raw, null);
    if (parsed !== null) {
      await idbSet(key, parsed);
      migrated[key] = parsed;
    }
  }
  return migrated;
}

async function readKey(key, fallback) {
  let value = await idbGet(key);
  if (value == null) {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      value = safeParse(raw, null);
      if (value != null) await idbSet(key, value);
    }
  }
  return value == null ? fallback : value;
}

export async function loadAll() {
  let plan = await idbGet(KEYS.plan);
  let logs = await idbGet(KEYS.logs);
  let cfg = await idbGet(KEYS.cfg);
  let sessions = await idbGet(KEYS.sessions);
  let meta = await idbGet(KEYS.meta);

  const idbEmpty = plan == null && logs == null && cfg == null && sessions == null && meta == null;
  if (idbEmpty) {
    const migrated = await migrateFromLocalStorage();
    plan = migrated[KEYS.plan] ?? null;
    logs = migrated[KEYS.logs] ?? null;
    cfg = migrated[KEYS.cfg] ?? null;
    sessions = migrated[KEYS.sessions] ?? null;
    meta = migrated[KEYS.meta] ?? null;
  } else {
    // Fill any missing keys from localStorage (partial migration)
    if (plan == null) plan = await readKey(KEYS.plan, null);
    if (logs == null) logs = await readKey(KEYS.logs, null);
    if (cfg == null) cfg = await readKey(KEYS.cfg, null);
    if (sessions == null) sessions = await readKey(KEYS.sessions, null);
    if (meta == null) meta = await readKey(KEYS.meta, null);
  }

  state.plan = isValidPlan(plan) ? plan : structuredClone(DEFAULT_PLAN);
  state.logs = isValidLogs(logs) ? logs : {};
  state.cfg = { ...DEFAULT_CFG, ...(cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {}) };
  state.sessions = Array.isArray(sessions) ? sessions : [];
  state.meta = {
    ...DEFAULT_META,
    ...(meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}),
    dataVersion: 2
  };

  if (!state.meta.migratedAt && idbEmpty) {
    state.meta.migratedAt = new Date().toISOString();
  }

  // Ensure dual-write baseline so both stores stay in sync
  await Promise.all([
    dualWrite(KEYS.plan, state.plan),
    dualWrite(KEYS.logs, state.logs),
    dualWrite(KEYS.cfg, state.cfg),
    dualWrite(KEYS.sessions, state.sessions),
    dualWrite(KEYS.meta, state.meta)
  ]);

  document.documentElement.setAttribute('data-theme', state.cfg.theme);
  return state;
}

export async function savePlan() {
  try {
    await dualWrite(KEYS.plan, state.plan);
  } catch (err) {
    toast('Não foi possível salvar o plano (armazenamento cheio?)');
    console.error(err);
  }
}

export async function saveLogs() {
  try {
    await dualWrite(KEYS.logs, state.logs);
  } catch (err) {
    toast('Não foi possível salvar o histórico (armazenamento cheio?)');
    console.error(err);
  }
}

export async function saveCfg() {
  try {
    await dualWrite(KEYS.cfg, state.cfg);
    document.documentElement.setAttribute('data-theme', state.cfg.theme);
  } catch (err) {
    toast('Não foi possível salvar as configurações');
    console.error(err);
  }
}

export async function saveSessions() {
  try {
    await dualWrite(KEYS.sessions, state.sessions);
  } catch (err) {
    toast('Não foi possível salvar as sessões');
    console.error(err);
  }
}

export async function saveMeta() {
  try {
    await dualWrite(KEYS.meta, state.meta);
  } catch (err) {
    console.error(err);
  }
}
