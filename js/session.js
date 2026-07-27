import { state } from './store.js';
import { epley1RM, todayISO } from './utils.js';
import { getWorkoutPlan, shortWorkoutName } from './plan.js';

/** @type {{ workoutId: string|null, startedAt: number|null, restEndsAt: number|null, restIntervalId: number|null, wakeLock: any }} */
export const activeSession = {
  workoutId: null,
  startedAt: null,
  restEndsAt: null,
  restIntervalId: null,
  wakeLock: null
};

let restTickCallback = null;

export function parseRepsRange(repsStr) {
  if (!repsStr || typeof repsStr !== 'string') return { min: 0, max: 0 };
  const cleaned = repsStr.trim();
  const range = cleaned.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return { min: Math.min(min, max), max: Math.max(min, max) };
  }
  const single = cleaned.match(/^(\d+)$/);
  if (single) {
    const n = Number(single[1]);
    return { min: n, max: n };
  }
  return { min: 0, max: 0 };
}

async function requestWakeLock() {
  if (!state.cfg.wakeLock) return null;
  if (!('wakeLock' in navigator)) return null;
  try {
    return await navigator.wakeLock.request('screen');
  } catch (err) {
    console.warn('Wake Lock unavailable', err);
    return null;
  }
}

async function releaseWakeLock() {
  if (activeSession.wakeLock) {
    try {
      await activeSession.wakeLock.release();
    } catch {
      /* ignore */
    }
    activeSession.wakeLock = null;
  }
}

export async function startSession(workoutId) {
  stopRestTimer();
  await releaseWakeLock();
  activeSession.workoutId = workoutId;
  activeSession.startedAt = Date.now();
  activeSession.restEndsAt = null;
  activeSession.wakeLock = await requestWakeLock();
  return activeSession;
}

export async function endSession() {
  stopRestTimer();
  await releaseWakeLock();
  const record = {
    workoutId: activeSession.workoutId,
    startedAt: activeSession.startedAt,
    endedAt: Date.now(),
    durationSec: getSessionDurationSec()
  };
  activeSession.workoutId = null;
  activeSession.startedAt = null;
  activeSession.restEndsAt = null;
  activeSession.wakeLock = null;
  return record;
}

export function getSessionDurationSec() {
  if (!activeSession.startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - activeSession.startedAt) / 1000));
}

function notifyRestDone() {
  if (state.cfg.vibrate && navigator.vibrate) {
    try { navigator.vibrate([120, 60, 120]); } catch { /* ignore */ }
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('Descanso finalizado', { body: 'Hora da próxima série', silent: false });
    } catch { /* ignore */ }
  }
}

export function onRestTick(cb) {
  restTickCallback = cb;
}

export function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

export function startRestTimer(seconds, onDone) {
  const secs = Math.max(1, Number(seconds) || state.cfg.restSeconds || 90);
  stopRestTimer(false);
  activeSession.restEndsAt = Date.now() + secs * 1000;
  activeSession.restIntervalId = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((activeSession.restEndsAt - Date.now()) / 1000));
    if (restTickCallback) restTickCallback(remaining);
    const valueEl = document.getElementById('rest-timer-value');
    if (valueEl) valueEl.textContent = formatDuration(remaining);
    if (remaining <= 0) {
      stopRestTimer(false);
      activeSession.restEndsAt = null;
      notifyRestDone();
      if (restTickCallback) restTickCallback(0);
      if (typeof onDone === 'function') onDone();
    }
  }, 250);
  if (restTickCallback) restTickCallback(secs);
  return secs;
}

export function skipRest() {
  stopRestTimer();
  if (restTickCallback) restTickCallback(0);
}

export function stopRestTimer(clearEndsAt = true) {
  if (activeSession.restIntervalId) {
    clearInterval(activeSession.restIntervalId);
    activeSession.restIntervalId = null;
  }
  if (clearEndsAt) activeSession.restEndsAt = null;
}

export function getRestRemainingSec() {
  if (!activeSession.restEndsAt) return 0;
  return Math.max(0, Math.ceil((activeSession.restEndsAt - Date.now()) / 1000));
}

function workingSets(sets) {
  return (sets || []).filter(s => !s.warmup);
}

function sessionMetrics(sets, bodyweight) {
  const ws = workingSets(sets);
  let maxKg = 0;
  let maxReps = 0;
  let volume = 0;
  let maxE1RM = 0;
  let totalReps = 0;
  ws.forEach(s => {
    const reps = Number(s.reps) || 0;
    const kg = Number(s.kg) || 0;
    maxReps = Math.max(maxReps, reps);
    totalReps += reps;
    if (!bodyweight) {
      maxKg = Math.max(maxKg, kg);
      volume += kg * reps;
      maxE1RM = Math.max(maxE1RM, epley1RM(kg, reps));
    }
  });
  return { maxKg, maxReps, volume, maxE1RM, totalReps };
}

/**
 * Compare current working sets against previous log sessions (ignore warmup).
 * @returns {{ type: string, value: number, label: string }[]}
 */
export function detectPRs(exerciseId, sets) {
  const ex = (() => {
    const weeks = state.plan?.weeks || {};
    for (const wk of Object.keys(weeks)) {
      for (const dayId of ['upper', 'lower', 'pull', 'push', 'legs']) {
        const found = (weeks[wk][dayId]?.exercises || []).find(e => e.id === exerciseId);
        if (found) return found;
      }
    }
    for (const day of (state.plan?.days || [])) {
      const found = day.exercises.find(e => e.id === exerciseId);
      if (found) return found;
    }
    return null;
  })();
  const bodyweight = !!ex?.bodyweight;
  const current = sessionMetrics(sets, bodyweight);
  const history = (state.logs[exerciseId] || []).slice();
  const prs = [];

  if (!workingSets(sets).length) return prs;

  if (bodyweight) {
    let bestReps = 0;
    let bestTotal = 0;
    history.forEach(s => {
      const m = sessionMetrics(s.sets, true);
      bestReps = Math.max(bestReps, m.maxReps);
      bestTotal = Math.max(bestTotal, m.totalReps);
    });
    if (current.maxReps > bestReps) {
      prs.push({ type: 'maxReps', value: current.maxReps, label: 'PR reps: ' + current.maxReps });
    }
    if (current.totalReps > bestTotal) {
      prs.push({ type: 'totalReps', value: current.totalReps, label: 'PR total reps: ' + current.totalReps });
    }
  } else {
    let bestKg = 0;
    let bestE1 = 0;
    let bestVol = 0;
    history.forEach(s => {
      const m = sessionMetrics(s.sets, false);
      bestKg = Math.max(bestKg, m.maxKg);
      bestE1 = Math.max(bestE1, m.maxE1RM);
      bestVol = Math.max(bestVol, m.volume);
    });
    if (current.maxKg > bestKg) {
      prs.push({ type: 'maxKg', value: current.maxKg, label: 'PR carga: ' + current.maxKg + (state.cfg.unit || 'kg') });
    }
    if (current.maxE1RM > bestE1) {
      prs.push({ type: 'e1rm', value: Math.round(current.maxE1RM * 10) / 10, label: 'PR e1RM: ' + Math.round(current.maxE1RM) + (state.cfg.unit || 'kg') });
    }
    if (current.volume > bestVol) {
      prs.push({ type: 'volume', value: current.volume, label: 'PR volume: ' + Math.round(current.volume) });
    }
  }
  return prs;
}

/**
 * If all working sets hit the top of the reps range, suggest +2.5 kg.
 */
export function suggestProgression(exercise, sets) {
  if (!exercise || exercise.bodyweight) return null;
  const { max } = parseRepsRange(exercise.reps);
  if (!max) return null;
  const ws = workingSets(sets).filter(s => Number(s.reps) > 0);
  if (!ws.length) return null;
  const allHitTop = ws.every(s => Number(s.reps) >= max);
  if (!allHitTop) return null;
  const loads = ws.map(s => Number(s.kg) || 0).filter(k => k > 0);
  if (!loads.length) return null;
  const base = Math.max(...loads);
  const next = Math.round((base + 2.5) * 10) / 10;
  return {
    currentKg: base,
    suggestedKg: next,
    message: 'Bateu ' + max + ' reps em todas as séries — tente ' + next + (state.cfg.unit || 'kg') + ' na próxima'
  };
}

export function buildSessionRecord({ workoutId, workoutName, startedAt, endedAt, exercises, week, dayId, isRest }) {
  const day = getWorkoutPlan(workoutId || dayId);
  const start = startedAt || Date.now();
  const end = endedAt || Date.now();
  const durationSec = Math.max(0, Math.floor((end - start) / 1000));
  let totalVolume = 0;
  let totalSets = 0;
  (exercises || []).forEach(ex => {
    workingSets(ex.sets).forEach(s => {
      const reps = Number(s.reps) || 0;
      const kg = Number(s.kg) || 0;
      if (reps > 0) {
        totalSets++;
        totalVolume += kg * reps;
      }
    });
  });
  return {
    id: 'sess-' + start + '-' + Math.random().toString(36).slice(2, 8),
    date: todayISO(),
    workoutId: workoutId || dayId || null,
    workoutName: workoutName || (day ? (day.name || shortWorkoutName(day)) : ''),
    week: week ?? state.cfg.currentWeek ?? null,
    dayId: dayId || workoutId || null,
    isRest: !!isRest,
    startedAt: start,
    endedAt: end,
    durationSec,
    durationMin: Math.round(durationSec / 60),
    totalVolume: Math.round(totalVolume * 10) / 10,
    totalSets,
    exercises: exercises || []
  };
}

/** Rest seconds for an exercise (book mid-range) with cfg fallback. */
export function restSecondsForExercise(ex) {
  if (ex && typeof ex.restSeconds === 'number' && ex.restSeconds > 0) return ex.restSeconds;
  return state.cfg.restSeconds || 90;
}
