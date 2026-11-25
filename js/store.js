import { DEFAULT_PROGRAM, PROGRAM_ID } from './defaults.js';
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

const DATA_VERSION = 5;

const DEFAULT_CFG = {
  theme: 'dark',
  unit: 'kg',
  lastWorkoutId: null,
  restSeconds: 90,
  vibrate: true,
  lastBackupAt: null,
  wakeLock: true,
  currentWeek: 1,
  currentDay: 'legs',
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
  selectedWorkout: 'legs',
  browseWeek: 1,
  browseDay: 'legs',
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
  if (plan.id !== PROGRAM_ID || !plan.weeks || typeof plan.weeks !== 'object') return false;
  if (!Array.isArray(plan.schedule) || !plan.schedule.length) return false;
  const total = plan.weeksTotal || 12;
  for (let w = 1; w <= total; w++) {
    const week = plan.weeks[String(w)] || plan.weeks[w];
    if (!week) return false;
    for (const d of plan.schedule) {
      const day = week[d];
      if (!day || !Array.isArray(day.exercises) || !day.exercises.every(isValidExercise)) {
        return false;
      }
    }
  }
  return true;
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

const REST_DAY_IDS = new Set(['rest', 'rest-qui', 'rest-sab', 'rest-dom']);

function isStoredRestDay(dayId) {
  return REST_DAY_IDS.has(dayId);
}

function nextTrainingAfter(schedule, dayId) {
  const list = Array.isArray(schedule) ? schedule : [];
  const training = list.filter((id) => !isStoredRestDay(id));
  const fallback = training[0] || 'legs';
  const idx = list.indexOf(dayId);
  if (idx < 0) return { dayId: fallback, weekDelta: 0 };
  for (let i = idx + 1; i < list.length; i++) {
    if (!isStoredRestDay(list[i])) return { dayId: list[i], weekDelta: 0 };
  }
  return { dayId: fallback, weekDelta: 1 };
}

/** Tira dias de descanso do programa salvo e avança o dia atual para o próximo treino. */
export function stripRestDaysFromProgram(plan, cfg) {
  if (!plan || typeof plan !== 'object') return;
  const oldSchedule = Array.isArray(plan.schedule) ? plan.schedule.slice() : [];
  const hadRest = oldSchedule.some(isStoredRestDay);

  if (Array.isArray(plan.schedule)) {
    plan.schedule = plan.schedule.filter((id) => !isStoredRestDay(id));
  }
  if (plan.dayLabels && typeof plan.dayLabels === 'object') {
    for (const id of Object.keys(plan.dayLabels)) {
      if (isStoredRestDay(id)) delete plan.dayLabels[id];
    }
  }
  const weeks = plan.weeks;
  if (weeks && typeof weeks === 'object') {
    for (const week of Object.values(weeks)) {
      if (!week || typeof week !== 'object' || Array.isArray(week)) continue;
      for (const id of Object.keys(week)) {
        if (isStoredRestDay(id)) delete week[id];
      }
    }
  }

  if (!cfg || typeof cfg !== 'object' || !hadRest) return;
  if (isStoredRestDay(cfg.lastWorkoutId)) cfg.lastWorkoutId = null;
  if (!isStoredRestDay(cfg.currentDay)) return;

  const moved = nextTrainingAfter(oldSchedule, cfg.currentDay);
  const total = plan.weeksTotal || 12;
  const week = Number(cfg.currentWeek) || 1;
  if (moved.weekDelta && week >= total) {
    const training = oldSchedule.filter((id) => !isStoredRestDay(id));
    cfg.currentWeek = total;
    cfg.currentDay = training[training.length - 1] || moved.dayId;
    cfg.awaitingCycleRestart = true;
    return;
  }
  if (moved.weekDelta) cfg.currentWeek = week + moved.weekDelta;
  cfg.currentDay = moved.dayId;
}

function migrateToV3(cfg, meta, plan) {
  const nextCfg = { ...DEFAULT_CFG, ...(cfg && typeof cfg === 'object' ? cfg : {}) };
  const nextMeta = {
    ...DEFAULT_META,
    ...(meta && typeof meta === 'object' ? meta : {})
  };

  const swapped = !isValidProgram(plan);
  const nextPlan = swapped ? freshProgram() : plan;
  if (!swapped) stripRestDaysFromProgram(nextPlan, nextCfg);
  const schedule = nextPlan.schedule || ['legs'];
  const firstDay = schedule[0] || 'legs';

  if (swapped) {
    nextCfg.currentWeek = 1;
    nextCfg.currentDay = firstDay;
    nextCfg.lastWorkoutId = null;
    nextCfg.programStartedAt = new Date().toISOString();
  } else {
    const total = nextPlan.weeksTotal || 12;
    if (!nextCfg.currentWeek || nextCfg.currentWeek < 1 || nextCfg.currentWeek > total) {
      nextCfg.currentWeek = 1;
    }
    if (!nextCfg.currentDay || !schedule.includes(nextCfg.currentDay)) {
      nextCfg.currentDay = firstDay;
    }
    if (!nextCfg.programStartedAt) {
      nextCfg.programStartedAt = new Date().toISOString();
    }
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
  state.selectedWorkout = state.cfg.currentDay || 'legs';
  state.browseWeek = state.cfg.currentWeek || 1;
  state.browseDay = state.cfg.currentDay || 'legs';
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
