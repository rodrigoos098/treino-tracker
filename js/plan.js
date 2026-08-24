import { state } from './store.js';
import { todayISO } from './utils.js';
import { collectLogSessions, lastSlotLog, substituteIndexFromLog, performedFromChoice } from './performed.js';

export const SCHEDULE = ['upper', 'lower', 'rest', 'pull', 'push', 'legs'];

export function getSchedule() {
  return state.plan?.schedule || SCHEDULE;
}

export function dayLabel(dayId) {
  const labels = state.plan?.dayLabels || {
    upper: 'Upper',
    lower: 'Lower',
    rest: 'Descanso',
    pull: 'Pull',
    push: 'Push',
    legs: 'Legs'
  };
  return labels[dayId] || dayId;
}

export function getWeekData(weekNum) {
  const w = weekNum || state.cfg.currentWeek || 1;
  return state.plan?.weeks?.[String(w)] || state.plan?.weeks?.[w] || null;
}

export function getDayWorkout(weekNum, dayId) {
  const week = getWeekData(weekNum);
  if (!week) return null;
  const day = week[dayId];
  if (!day) return null;
  return {
    id: dayId,
    week: Number(weekNum),
    name: day.name || (dayLabel(dayId) + (day.focus ? ' · ' + day.focus : '')),
    short: day.short || dayLabel(dayId),
    focus: day.focus || null,
    block: day.block || null,
    exercises: day.exercises || [],
    isRest: dayId === 'rest' || !(day.exercises || []).length
  };
}

/** Current program day (from cfg). */
export function getCurrentDayPlan() {
  return getDayWorkout(state.cfg.currentWeek || 1, state.cfg.currentDay || 'upper');
}

/** Selected day in Hoje (may browse within current week chips). */
export function getWorkoutPlan(workoutId) {
  const week = state.cfg.currentWeek || 1;
  const dayId = workoutId || state.selectedWorkout || state.cfg.currentDay;
  return getDayWorkout(week, dayId);
}

export function getRotation() {
  return getSchedule();
}

export function shortWorkoutName(day) {
  if (!day) return '';
  if (typeof day === 'string') return dayLabel(day);
  if (day.short) return day.short;
  return dayLabel(day.id) || (day.name || '').split(' ')[0] || day.name;
}

export function nextDayInSchedule(dayId) {
  const schedule = getSchedule();
  const idx = schedule.indexOf(dayId);
  if (idx < 0) return { weekDelta: 0, dayId: schedule[0] };
  if (idx >= schedule.length - 1) {
    return { weekDelta: 1, dayId: schedule[0] };
  }
  return { weekDelta: 0, dayId: schedule[idx + 1] };
}

/** Advance cfg after completing a workout or rest day. */
export function advanceSchedule() {
  const curDay = state.cfg.currentDay || 'upper';
  const curWeek = state.cfg.currentWeek || 1;
  const { weekDelta, dayId } = nextDayInSchedule(curDay);
  let nextWeek = curWeek + weekDelta;
  if (nextWeek > (state.plan?.weeksTotal || 12)) {
    nextWeek = 1; // loop program
  }
  state.cfg.currentWeek = nextWeek;
  state.cfg.currentDay = dayId;
  state.cfg.lastWorkoutId = curDay;
  state.selectedWorkout = dayId;
  state.browseWeek = nextWeek;
  state.browseDay = dayId;
  return { week: nextWeek, dayId };
}

export function jumpToWeekDay(week, dayId) {
  const w = Math.max(1, Math.min(12, Number(week) || 1));
  const schedule = getSchedule();
  const d = schedule.includes(dayId) ? dayId : schedule[0];
  state.cfg.currentWeek = w;
  state.cfg.currentDay = d;
  state.selectedWorkout = d;
  state.browseWeek = w;
  state.browseDay = d;
}

export function findDay(dayId) {
  return getDayWorkout(state.cfg.currentWeek || 1, dayId);
}

export function findExercise(dayId, exId) {
  const day = findDay(dayId);
  if (!day) return null;
  return day.exercises.find(e => e.id === exId) || null;
}

export function getAllExercises() {
  const seen = new Map();
  const weeks = state.plan?.weeks || {};
  Object.keys(weeks).forEach(wk => {
    const week = weeks[wk];
    ['upper', 'lower', 'pull', 'push', 'legs'].forEach(dayId => {
      const day = week[dayId];
      (day?.exercises || []).forEach(ex => {
        if (!seen.has(ex.id)) {
          seen.set(ex.id, {
            ...ex,
            dayName: day.name || dayLabel(dayId),
            dayId
          });
        }
      });
    });
  });
  return [...seen.values()];
}

export function getExerciseById(exerciseId) {
  for (const ex of getAllExercises()) {
    if (ex.id === exerciseId) return ex;
  }
  return null;
}

export function workingSetsCount(ex) {
  if (!ex) return 1;
  if (typeof ex.workingSets === 'number') return ex.workingSets;
  if (typeof ex.sets === 'number') return ex.sets;
  return 1;
}

export function warmupSetsCount(ex) {
  return warmupSetsSuggested(ex);
}

/** Prefer lower bound of warmup range for draft length. */
export function warmupSetsSuggested(ex) {
  if (!ex?.warmupSets) return 0;
  const m = String(ex.warmupSets).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

export function getDraftKey(dayId, exId) {
  const week = state.cfg.currentWeek || 1;
  return week + '::' + dayId + '::' + exId;
}

export function pruneDrafts() {
  const week = state.cfg.currentWeek || 1;
  const day = getCurrentDayPlan();
  const valid = new Set();
  if (day) {
    day.exercises.forEach(ex => valid.add(getDraftKey(day.id, ex.id)));
  }
  // Also keep drafts for other days in current week while browsing chips
  getSchedule().forEach(dayId => {
    const d = getDayWorkout(week, dayId);
    (d?.exercises || []).forEach(ex => valid.add(getDraftKey(dayId, ex.id)));
  });
  Object.keys(state.draftSets).forEach(key => {
    if (!valid.has(key)) delete state.draftSets[key];
  });
}

export function syncDraftLength(draft, targetSets, bodyweight) {
  // Warm-ups are prescribed in the UI but not tracked — keep only working sets
  const working = draft.filter(s => !s.warmup);
  while (working.length < targetSets) {
    working.push({
      reps: '',
      kg: bodyweight ? '' : '',
      done: false,
      warmup: false,
      rpe: '',
      note: ''
    });
  }
  if (working.length > targetSets) working.length = targetSets;
  draft.length = 0;
  draft.push(...working);
}

export function currentPerformed(ex) {
  const choice = state.substituteChoice[ex.id];
  return performedFromChoice(state.plan, ex, choice);
}

/** If the user hasn't picked a variant this session, restore last week's. */
export function ensureSlotSubstitute(ex) {
  if (!ex) return;
  if (Object.prototype.hasOwnProperty.call(state.substituteChoice, ex.id)) return;
  const last = lastSlotLog(state.logs, ex.id);
  if (!last) {
    state.substituteChoice[ex.id] = null;
    return;
  }
  const idx = substituteIndexFromLog(ex, last);
  state.substituteChoice[ex.id] = idx;
}

export function lastPerformedLabel(ex) {
  const last = lastSlotLog(state.logs, ex.id);
  if (!last) return null;
  return last.performedName || null;
}

export function isDraftUntouched(draft) {
  return (draft || []).every(s =>
    !s.done &&
    (s.reps === '' || s.reps === undefined || s.reps === null) &&
    !s.note &&
    (s.rpe === '' || s.rpe === undefined || s.rpe === null)
  );
}

function lastSessionForPerformed(ex) {
  const { key } = currentPerformed(ex);
  const sessions = collectLogSessions(state.logs, key);
  if (!sessions.length) return null;
  return sessions[sessions.length - 1];
}

export function seedDraftFromLast(dayId, ex) {
  const key = getDraftKey(dayId, ex.id);
  const target = workingSetsCount(ex);
  const date = todayISO();
  const { key: performedKey } = currentPerformed(ex);
  const todayLog = (state.logs[ex.id] || []).find(s => s.date === date);
  const todayKey = todayLog
    ? (todayLog.performedKey || performedFromChoice(state.plan, ex, todayLog.substituteIndex).key)
    : null;
  if (todayLog && todayKey === performedKey) {
    state.draftSets[key] = todayLog.sets
      .filter(s => !s.warmup)
      .map(s => ({
        reps: s.reps ?? '',
        kg: s.kg ?? '',
        done: !!s.done,
        warmup: false,
        rpe: s.rpe ?? '',
        note: s.note ?? ''
      }));
    syncDraftLength(state.draftSets[key], target, ex.bodyweight);
    return;
  }
  const last = lastSessionForPerformed(ex);
  const prevWorking = (last?.sets || []).filter(s => !s.warmup);
  state.draftSets[key] = Array.from({ length: target }, (_, i) => {
    const prev = prevWorking[i];
    return {
      reps: '',
      kg: ex.bodyweight ? '' : (prev?.kg ?? ''),
      done: false,
      warmup: false,
      rpe: '',
      note: ''
    };
  });
}

export function initDraftForDay(day) {
  if (!day || day.isRest) return;
  pruneDrafts();
  day.exercises.forEach(ex => {
    ensureSlotSubstitute(ex);
    const key = getDraftKey(day.id, ex.id);
    const target = workingSetsCount(ex);
    if (state.draftSets[key]) {
      syncDraftLength(state.draftSets[key], target, ex.bodyweight);
      return;
    }
    seedDraftFromLast(day.id, ex);
  });
}

/** Resolve display name / youtube for session (with optional substitute). */
export function resolveExerciseDisplay(ex) {
  const choice = state.substituteChoice[ex.id];
  if (choice == null || choice === '' || choice < 0) {
    return { name: ex.name, youtubeUrl: ex.youtubeUrl, usingSubstitute: false };
  }
  const sub = (ex.substitutes || [])[Number(choice)];
  if (!sub) {
    return { name: ex.name, youtubeUrl: ex.youtubeUrl, usingSubstitute: false };
  }
  return { name: sub.name, youtubeUrl: sub.youtubeUrl || ex.youtubeUrl, usingSubstitute: true };
}

// Legacy no-ops kept so old imports don't crash during transition
export function nextWorkoutId(lastId) {
  if (!lastId) return state.cfg.currentDay || 'upper';
  return nextDayInSchedule(lastId).dayId;
}

export function moveDay() { return false; }
export function moveExercise() { return false; }
export function findDayIndex(dayId) {
  return getSchedule().indexOf(dayId);
}
