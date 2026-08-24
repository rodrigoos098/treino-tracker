import { epley1RM } from './utils.js';

const DAY_IDS = ['upper', 'lower', 'pull', 'push', 'legs'];

function workingSets(sets) {
  return (sets || []).filter(s => !s.warmup);
}

export function normExerciseName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slugExerciseName(name) {
  return normExerciseName(name).replace(/\s+/g, '-');
}

/**
 * Map display name → canonical id (prefer a program main id when the
 * same movement appears as a substitute in another week).
 */
export function buildNameCatalog(plan) {
  const byName = new Map();
  const weeks = plan?.weeks || {};
  Object.keys(weeks).forEach(wk => {
    const week = weeks[wk];
    DAY_IDS.forEach(dayId => {
      (week?.[dayId]?.exercises || []).forEach(ex => {
        const n = normExerciseName(ex.name);
        if (n && !byName.has(n)) byName.set(n, ex.id);
      });
    });
  });
  Object.keys(weeks).forEach(wk => {
    const week = weeks[wk];
    DAY_IDS.forEach(dayId => {
      (week?.[dayId]?.exercises || []).forEach(ex => {
        (ex.substitutes || []).forEach(sub => {
          const n = normExerciseName(sub.name);
          if (n && !byName.has(n)) byName.set(n, slugExerciseName(sub.name));
        });
      });
    });
  });
  return byName;
}

export function performedKeyFromName(plan, name, fallbackSlotId) {
  if (!name && fallbackSlotId) return fallbackSlotId;
  const catalog = buildNameCatalog(plan);
  const mapped = catalog.get(normExerciseName(name));
  if (mapped) return mapped;
  const slug = slugExerciseName(name);
  return slug || fallbackSlotId || '';
}

export function performedFromChoice(plan, ex, choice) {
  let name = ex?.name || '';
  let substituteIndex = null;
  if (choice != null && choice !== '' && Number(choice) >= 0) {
    const sub = (ex?.substitutes || [])[Number(choice)];
    if (sub) {
      name = sub.name;
      substituteIndex = Number(choice);
    }
  }
  return {
    name,
    key: performedKeyFromName(plan, name, ex?.id),
    substituteIndex
  };
}

function findSlotInPlan(plan, slotId) {
  const weeks = plan?.weeks || {};
  for (const wk of Object.keys(weeks)) {
    for (const dayId of DAY_IDS) {
      const found = (weeks[wk][dayId]?.exercises || []).find(e => e.id === slotId);
      if (found) return found;
    }
  }
  for (const day of (plan?.days || [])) {
    const found = (day.exercises || []).find(e => e.id === slotId);
    if (found) return found;
  }
  return null;
}

function inferSubstituteIndex(slotEx, performedName, performedKey) {
  if (!slotEx) return null;
  if (!performedName && !performedKey) return null;
  if (performedName && performedName === slotEx.name) return null;
  if (performedKey && performedKey === slotEx.id && (!performedName || performedName === slotEx.name)) {
    return null;
  }
  if (performedName) {
    const byName = (slotEx.substitutes || []).findIndex(s => s.name === performedName);
    if (byName >= 0) return byName;
  }
  if (performedKey) {
    const byKey = (slotEx.substitutes || []).findIndex(s => slugExerciseName(s.name) === performedKey);
    if (byKey >= 0) return byKey;
  }
  return null;
}

/**
 * Stamp performedName / performedKey / substituteIndex on log entries.
 * Uses session snapshots (which already store the display name) when present.
 * @returns {boolean} whether any entry changed
 */
export function backfillPerformedMeta(logs, sessions, plan) {
  if (!logs || typeof logs !== 'object') return false;
  const fromSessions = new Map();
  (sessions || []).forEach(sess => {
    (sess.exercises || []).forEach(ex => {
      if (!ex?.id || !ex?.name || !sess?.date) return;
      fromSessions.set(sess.date + '|' + ex.id, ex.name);
    });
  });

  let changed = false;
  Object.keys(logs).forEach(slotId => {
    const entries = logs[slotId];
    if (!Array.isArray(entries)) return;
    const slotEx = findSlotInPlan(plan, slotId);
    const slotName = slotEx?.name || slotId;
    entries.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      const sessionName = fromSessions.get(entry.date + '|' + slotId);
      const name = entry.performedName || sessionName || slotName;
      const key = performedKeyFromName(plan, name, slotId);
      const subIdx = entry.substituteIndex !== undefined
        ? entry.substituteIndex
        : inferSubstituteIndex(slotEx, name, key);

      if (entry.performedName !== name) {
        entry.performedName = name;
        changed = true;
      }
      if (entry.performedKey !== key) {
        entry.performedKey = key;
        changed = true;
      }
      if (entry.substituteIndex !== subIdx) {
        entry.substituteIndex = subIdx;
        changed = true;
      }
    });
  });
  return changed;
}

export function collectLogSessions(logs, performedKey) {
  if (!performedKey || !logs) return [];
  const out = [];
  Object.keys(logs).forEach(slotId => {
    const entries = logs[slotId];
    if (!Array.isArray(entries)) return;
    entries.forEach(entry => {
      const key = entry?.performedKey || slotId;
      if (key === performedKey) out.push({ ...entry, slotId });
    });
  });
  out.sort((a, b) => {
    const d = String(a.date || '').localeCompare(String(b.date || ''));
    if (d !== 0) return d;
    return 0;
  });
  return out;
}

export function lastSlotLog(logs, slotId) {
  const entries = logs?.[slotId];
  if (!entries || !entries.length) return null;
  return entries[entries.length - 1];
}

export function substituteIndexFromLog(ex, log) {
  if (!ex || !log) return null;
  if (log.substituteIndex != null && log.substituteIndex !== '') {
    const idx = Number(log.substituteIndex);
    if (idx >= 0 && (ex.substitutes || [])[idx]) return idx;
  }
  if (log.performedName) {
    if (log.performedName === ex.name) return null;
    const idx = (ex.substitutes || []).findIndex(s => s.name === log.performedName);
    if (idx >= 0) return idx;
  }
  if (log.performedKey && log.performedKey !== ex.id) {
    const idx = (ex.substitutes || []).findIndex(s => slugExerciseName(s.name) === log.performedKey);
    if (idx >= 0) return idx;
  }
  return null;
}

export function bestSetInSets(sets, bodyweight) {
  let best = null;
  let bestScore = -Infinity;
  workingSets(sets).forEach((set, i) => {
    const kg = Number(set.kg) || 0;
    const reps = Number(set.reps) || 0;
    const e1 = bodyweight ? reps : epley1RM(kg, reps);
    const score = bodyweight ? reps : e1;
    if (score > bestScore || (score === bestScore && kg > (best?.kg || 0))) {
      bestScore = score;
      best = { kg, reps, e1rm: e1, index: i };
    }
  });
  return best;
}

export function analyzePerformedSessions(sessions, bodyweight) {
  if (!sessions?.length) return null;
  const last = sessions[sessions.length - 1];
  let bestSession = last;
  let bestSet = bestSetInSets(last.sets, bodyweight);
  let bestScore = bestSet ? (bodyweight ? bestSet.reps : bestSet.e1rm) : -Infinity;

  let bestKg = 0, bestE1RM = 0, bestVol = 0, bestReps = 0, bestTotalReps = 0;
  sessions.forEach(s => {
    const setBest = bestSetInSets(s.sets, bodyweight);
    let maxKg = 0, vol = 0, maxE1 = 0, maxReps = 0, totalReps = 0;
    workingSets(s.sets).forEach(set => {
      const reps = Number(set.reps) || 0;
      const kg = Number(set.kg) || 0;
      maxReps = Math.max(maxReps, reps);
      totalReps += reps;
      if (!bodyweight) {
        maxKg = Math.max(maxKg, kg);
        vol += kg * reps;
        maxE1 = Math.max(maxE1, epley1RM(kg, reps));
      }
    });
    bestReps = Math.max(bestReps, maxReps);
    bestTotalReps = Math.max(bestTotalReps, totalReps);
    bestKg = Math.max(bestKg, maxKg);
    bestE1RM = Math.max(bestE1RM, maxE1);
    bestVol = Math.max(bestVol, vol);

    const score = setBest ? (bodyweight ? setBest.reps : setBest.e1rm) : -Infinity;
    if (score > bestScore) {
      bestScore = score;
      bestSession = s;
      bestSet = setBest;
    }
  });

  return {
    bodyweight: !!bodyweight,
    bestKg,
    bestE1RM,
    bestVol,
    bestReps,
    bestTotalReps,
    lastDate: last.date,
    sessionCount: sessions.length,
    bestSet,
    bestSession,
    lastSession: last
  };
}

export { workingSets };
