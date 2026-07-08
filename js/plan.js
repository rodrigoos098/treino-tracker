import { state } from './store.js';
import { todayISO } from './utils.js';

export function getRotation() {
  return (state.plan?.days || []).map(d => d.id);
}

export function nextWorkoutId(lastId) {
  const rotation = getRotation();
  if (!rotation.length) return null;
  if (!lastId) return rotation[0];
  const idx = rotation.indexOf(lastId);
  if (idx < 0) return rotation[0];
  return rotation[(idx + 1) % rotation.length];
}

export function shortWorkoutName(day) {
  if (!day) return '';
  if (day.short) return day.short;
  return (day.name || '').split(' ')[0] || day.name;
}

export function getWorkoutPlan(workoutId) {
  return state.plan?.days?.find(d => d.id === workoutId) || null;
}

export function findDayIndex(dayId) {
  return (state.plan?.days || []).findIndex(d => d.id === dayId);
}

export function findDay(dayId) {
  return (state.plan?.days || []).find(d => d.id === dayId) || null;
}

export function findExercise(dayId, exId) {
  const day = findDay(dayId);
  if (!day) return null;
  return day.exercises.find(e => e.id === exId) || null;
}

export function getAllExercises() {
  const list = [];
  (state.plan?.days || []).forEach(day => {
    day.exercises.forEach(ex => {
      list.push({ ...ex, dayName: day.name, dayId: day.id });
    });
  });
  return list;
}

export function getExerciseById(exerciseId) {
  for (const day of (state.plan?.days || [])) {
    const ex = day.exercises.find(e => e.id === exerciseId);
    if (ex) return ex;
  }
  return null;
}

export function getDraftKey(dayId, exId) {
  return dayId + '::' + exId;
}

export function pruneDrafts() {
  const valid = new Set();
  (state.plan?.days || []).forEach(day => {
    day.exercises.forEach(ex => valid.add(getDraftKey(day.id, ex.id)));
  });
  Object.keys(state.draftSets).forEach(key => {
    if (!valid.has(key)) delete state.draftSets[key];
  });
}

export function syncDraftLength(draft, targetSets, bodyweight) {
  const warmups = draft.filter(s => s.warmup);
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
  draft.push(...warmups, ...working);
}

function getLastSession(exerciseId) {
  const sessions = state.logs[exerciseId];
  if (!sessions || !sessions.length) return null;
  return sessions[sessions.length - 1];
}

export function initDraftForDay(day) {
  if (!day) return;
  pruneDrafts();
  const date = todayISO();
  day.exercises.forEach(ex => {
    const key = getDraftKey(day.id, ex.id);
    if (state.draftSets[key]) {
      syncDraftLength(state.draftSets[key], ex.sets, ex.bodyweight);
      return;
    }
    const todayLog = (state.logs[ex.id] || []).find(s => s.date === date);
    if (todayLog) {
      state.draftSets[key] = todayLog.sets.map(s => ({
        reps: s.reps ?? '',
        kg: s.kg ?? '',
        done: !!s.done,
        warmup: !!s.warmup,
        rpe: s.rpe ?? '',
        note: s.note ?? ''
      }));
      syncDraftLength(state.draftSets[key], ex.sets, ex.bodyweight);
    } else {
      const last = getLastSession(ex.id);
      state.draftSets[key] = Array.from({ length: ex.sets }, (_, i) => {
        const prev = last?.sets?.[i];
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
  });
}

export function moveDay(dayId, dir) {
  const idx = findDayIndex(dayId);
  const newIdx = idx + dir;
  if (idx < 0 || newIdx < 0 || newIdx >= state.plan.days.length) return false;
  const tmp = state.plan.days[idx];
  state.plan.days[idx] = state.plan.days[newIdx];
  state.plan.days[newIdx] = tmp;
  return true;
}

export function moveExercise(dayId, exId, dir) {
  const day = findDay(dayId);
  if (!day) return false;
  const idx = day.exercises.findIndex(e => e.id === exId);
  const newIdx = idx + dir;
  if (idx < 0 || newIdx < 0 || newIdx >= day.exercises.length) return false;
  const tmp = day.exercises[idx];
  day.exercises[idx] = day.exercises[newIdx];
  day.exercises[newIdx] = tmp;
  return true;
}
