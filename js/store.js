import { DEFAULT_PROGRAM } from './defaults.js';
import { toast } from './utils.js';
import { backfillPerformedMeta } from './performed.js';

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

const DATA_VERSION = 4;

const DEFAULT_CFG = {
  theme: 'dark',
  unit: 'kg',
  lastWorkoutId: null,
  restSeconds: 90,
  vibrate: true,
  lastBackupAt: null,
  wakeLock: true,
  currentWeek: 1,
  currentDay: 'upper',
  programStartedAt: null
};

const DEFAULT_META = {
  dataVersion: DATA_VERSION,
  migratedAt: null
};

export const state = {
  plan: null,
  logs: {},
  cfg: { ...DEFAULT_CFG },
  sessions: [],
  meta: { ...DEFAULT_META },
  activeTab: 'hoje',
  selectedWorkout: 'upper',
  browseWeek: 1,
  browseDay: 'upper',
  chartMetric: 'maxKg',
  chartExercise: null,
  chartPeriod: 90,
  draftSets: {},
  /** session-only substitute override: { [exId]: substituteIndex|null } */
  substituteChoice: {}
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

function isValidExercise(ex) {
  return !!(
    ex &&
    typeof ex.id === 'string' &&
    typeof ex.name === 'string' &&
    (typeof ex.workingSets === 'number' || typeof ex.sets === 'number') &&
    typeof ex.reps === 'string'
  );
}

export function isValidProgram(plan) {
  if (!plan || typeof plan !== 'object') return false;
  if (plan.id === 'bbts-beginner-2025' && plan.weeks && typeof plan.weeks === 'object') {
    const days = ['upper', 'lower', 'pull', 'push', 'legs'];
    for (let w = 1; w <= 12; w++) {
      const week = plan.weeks[String(w)] || plan.weeks[w];
      if (!week) return false;
      for (const d of days) {
        const day = week[d];
        if (!day || !Array.isArray(day.exercises) || !day.exercises.every(isValidExercise)) {
          return false;
        }
      }
    }
    return true;
  }
  // Legacy flat plan (import backups only)
  return !!(
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

/** @deprecated Use isValidProgram */
export const isValidPlan = isValidProgram;

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

function freshProgram() {
  return structuredClone(DEFAULT_PROGRAM);
}

function migrateToV3(cfg, meta, plan) {
  const nextCfg = { ...DEFAULT_CFG, ...(cfg && typeof cfg === 'object' ? cfg : {}) };
  const nextMeta = {
    ...DEFAULT_META,
    ...(meta && typeof meta === 'object' ? meta : {})
  };

  const needsProgramSwap = !isValidProgram(plan) || plan?.id !== 'bbts-beginner-2025' || Array.isArray(plan?.days);
  const nextPlan = needsProgramSwap ? freshProgram() : plan;

  if (!nextCfg.currentWeek || nextCfg.currentWeek < 1 || nextCfg.currentWeek > 12) {
    nextCfg.currentWeek = 1;
  }
  const schedule = nextPlan.schedule || ['upper', 'lower', 'rest', 'pull', 'push', 'legs'];
  if (!nextCfg.currentDay || !schedule.includes(nextCfg.currentDay)) {
    // Restore next day from last completed workout (legacy nextWorkoutId behavior)
    if (nextCfg.lastWorkoutId && schedule.includes(nextCfg.lastWorkoutId)) {
      const idx = schedule.indexOf(nextCfg.lastWorkoutId);
      nextCfg.currentDay = idx >= schedule.length - 1 ? schedule[0] : schedule[idx + 1];
    } else {
      nextCfg.currentDay = 'upper';
    }
  }
  if (!nextCfg.programStartedAt) {
    nextCfg.programStartedAt = new Date().toISOString();
  }

  nextMeta.dataVersion = DATA_VERSION;
  return { plan: nextPlan, cfg: nextCfg, meta: nextMeta };
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
    if (plan == null) plan = await readKey(KEYS.plan, null);
    if (logs == null) logs = await readKey(KEYS.logs, null);
    if (cfg == null) cfg = await readKey(KEYS.cfg, null);
    if (sessions == null) sessions = await readKey(KEYS.sessions, null);
    if (meta == null) meta = await readKey(KEYS.meta, null);
  }

  const migrated = migrateToV3(cfg, meta, plan);
  state.plan = migrated.plan;
  state.cfg = migrated.cfg;
  state.meta = migrated.meta;
  state.logs = isValidLogs(logs) ? logs : {};
  state.sessions = Array.isArray(sessions) ? sessions : [];
  state.selectedWorkout = state.cfg.currentDay || 'upper';
  state.browseWeek = state.cfg.currentWeek || 1;
  state.browseDay = state.cfg.currentDay || 'upper';
  state.substituteChoice = {};
  backfillPerformedMeta(state.logs, state.sessions, state.plan);

  if (!state.meta.migratedAt) {
    state.meta.migratedAt = new Date().toISOString();
  }

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
    toast('Não foi possível salvar o programa (armazenamento cheio?)');
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

export function getDefaultCfg() {
  return { ...DEFAULT_CFG };
}

export { DATA_VERSION };
