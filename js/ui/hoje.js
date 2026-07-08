import { state, saveLogs, saveCfg, saveSessions } from '../store.js';
import {
  getRotation, shortWorkoutName, getWorkoutPlan,
  getDraftKey, initDraftForDay
} from '../plan.js';
import {
  activeSession, startSession, endSession, getSessionDurationSec,
  formatDuration, startRestTimer, skipRest,
  getRestRemainingSec, detectPRs, suggestProgression, buildSessionRecord
} from '../session.js';
import {
  esc, escAttr, pageHeader, ICON_HISTORY, toast,
  formatDate, todayISO
} from '../utils.js';
import { getExerciseStats } from '../charts.js';

function unit() { return state.cfg.unit || 'kg'; }

function ensureDraftSet(key, idx) {
  if (!state.draftSets[key]) state.draftSets[key] = [];
  if (!state.draftSets[key][idx]) {
    state.draftSets[key][idx] = { reps: '', kg: '', done: false, warmup: false, rpe: '', note: '' };
  }
  return state.draftSets[key][idx];
}

function compareLine(ex) {
  const stats = getExerciseStats(ex.id);
  if (!stats) return 'Sem histórico';
  if (stats.bodyweight) {
    return 'Melhor: ' + stats.bestReps + ' reps · Último: ' + formatDate(stats.lastDate);
  }
  return 'Melhor: ' + stats.bestKg + unit() + ' · e1RM ' + Math.round(stats.bestE1RM) + unit() + ' · Último: ' + formatDate(stats.lastDate);
}

function progressionHint(ex, draft) {
  const hint = suggestProgression(ex, draft || []);
  if (!hint) return '';
  return '<div class="progress-hint">' + esc(hint.message) + '</div>';
}

function renderStepper(key, setIdx, field, value, step, bodyweight) {
  if (bodyweight && field === 'kg') return '';
  const label = field === 'kg' ? 'Carga (' + unit() + ')' : (field === 'rpe' ? 'RPE' : 'Reps');
  const stepVal = field === 'kg' ? 2.5 : 1;
  const s = step || stepVal;
  return '<div class="field"><label>' + label + '</label><div class="stepper">' +
    '<button type="button" data-step="-1" data-key="' + key + '" data-set="' + setIdx + '" data-field="' + field + '" data-stepval="' + s + '">−</button>' +
    '<input type="number" inputmode="decimal" step="' + s + '" min="0" data-key="' + key + '" data-set="' + setIdx + '" data-field="' + field + '" value="' + (value !== '' && value !== undefined ? value : '') + '" placeholder="0">' +
    '<button type="button" data-step="1" data-key="' + key + '" data-set="' + setIdx + '" data-field="' + field + '" data-stepval="' + s + '">+</button>' +
    '</div></div>';
}

function renderSetRow(ex, key, s, i) {
  const done = !!s.done;
  const warmup = !!s.warmup;
  const fieldsClass = ex.bodyweight ? 'set-row-fields bw' : 'set-row-fields';
  return '<div class="set-row-v2' + (done ? ' done' : '') + (warmup ? ' warmup' : '') + '" data-key="' + key + '" data-set="' + i + '">' +
    '<div class="set-row-top">' +
      '<span class="set-num">' + (i + 1) + (warmup ? ' W' : '') + '</span>' +
      '<div class="set-actions-row">' +
        '<button type="button" class="chip-btn' + (warmup ? ' active' : '') + '" data-action="toggle-warmup" data-key="' + key + '" data-set="' + i + '">Warm-up</button>' +
        (i > 0 ? '<button type="button" class="chip-btn" data-action="copy-prev" data-key="' + key + '" data-set="' + i + '">Copiar ant.</button>' : '') +
        '<button type="button" class="set-check' + (done ? ' on' : '') + '" data-action="toggle-done" data-key="' + key + '" data-set="' + i + '" aria-label="Marcar série">' + (done ? '✓' : '') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="' + fieldsClass + '">' +
      renderStepper(key, i, 'kg', s.kg, 2.5, ex.bodyweight) +
      renderStepper(key, i, 'reps', s.reps, 1, false) +
    '</div>' +
    '<div class="set-row-fields">' +
      renderStepper(key, i, 'rpe', s.rpe, 0.5, false) +
      '<div class="field"><label>Nota</label><input type="text" data-key="' + key + '" data-set="' + i + '" data-field="note" value="' + escAttr(s.note || '') + '" placeholder="Opcional"></div>' +
    '</div>' +
  '</div>';
}

function sessionBarHtml(dayPlan) {
  if (!activeSession.startedAt) {
    return '<div class="session-bar">' +
      '<div><div class="session-meta">Pronto para treinar</div><strong>' + esc(dayPlan?.name || '') + '</strong></div>' +
      '<button class="btn btn-primary btn-sm" id="start-session">Iniciar</button></div>';
  }
  return '<div class="session-bar">' +
    '<div><div class="session-meta">Sessão ativa</div><div class="session-timer" id="session-clock">' + formatDuration(getSessionDurationSec()) + '</div></div>' +
    '<button class="btn btn-secondary btn-sm" id="end-session-only">Encerrar</button></div>';
}

function restBarHtml() {
  const rem = getRestRemainingSec();
  const active = rem > 0;
  return '<div class="rest-timer-bar' + (active ? ' active' : '') + '" id="rest-timer-bar" aria-live="polite">' +
    '<div class="session-meta">Descanso</div>' +
    '<div class="rest-timer-value" id="rest-timer-value">' + formatDuration(rem) + '</div>' +
    '<div class="rest-timer-actions">' +
      '<button class="btn btn-secondary btn-sm" id="skip-rest">Pular</button>' +
      '<button class="btn btn-secondary btn-sm" id="add-rest-30">+30s</button>' +
    '</div></div>';
}

export function renderHoje() {
  const el = document.getElementById('screen-hoje');
  const dayPlan = getWorkoutPlan(state.selectedWorkout);

  const chips = getRotation().map(id => {
    const dp = getWorkoutPlan(id);
    return '<button class="day-chip' + (id === state.selectedWorkout ? ' active' : '') + '" data-workout="' + id + '">' + esc(shortWorkoutName(dp)) + '</button>';
  }).join('');

  let content = '';
  if (!dayPlan) {
    content = '<div class="empty-state">Nenhum plano cadastrado. Crie um na aba Plano.</div>';
  } else {
    initDraftForDay(dayPlan);
    content = sessionBarHtml(dayPlan) + restBarHtml();
    content += dayPlan.exercises.map(ex => {
      const key = getDraftKey(dayPlan.id, ex.id);
      const draft = state.draftSets[key] || [];
      const setsHtml = draft.map((s, i) => renderSetRow(ex, key, s, i)).join('');
      return '<div class="card" data-exercise="' + ex.id + '">' +
        '<div class="card-header"><span class="card-title">' + esc(ex.name) + '</span><span class="badge accent">' + ex.sets + '×' + ex.reps + '</span></div>' +
        '<div class="last-session">' + ICON_HISTORY + ' ' + compareLine(ex) + '</div>' +
        '<div class="sets-grid">' + setsHtml + '</div>' +
        '<div class="set-actions-row" style="margin-top:8px">' +
          '<button type="button" class="chip-btn" data-action="add-warmup" data-key="' + key + '" data-ex="' + ex.id + '">+ Warm-up</button>' +
          '<button type="button" class="chip-btn" data-action="start-rest">Descanso ' + (state.cfg.restSeconds || 90) + 's</button>' +
        '</div>' +
        progressionHint(ex, draft) +
      '</div>';
    }).join('');
    content += '<div class="save-wrap"><button class="btn btn-primary btn-block" id="save-session">Salvar sessão</button>' +
      '<div class="saved-indicator" id="saved-indicator">Sessão salva</div></div>';
  }

  const dateStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  el.innerHTML = pageHeader('Hoje', dateStr, dayPlan ? dayPlan.name : null) +
    '<div class="day-picker-wrap"><div class="day-picker">' + chips + '</div></div>' + content;

  if (activeSession.startedAt) {
    if (!window.__sessionClock) {
      window.__sessionClock = setInterval(() => {
        const clock = document.getElementById('session-clock');
        if (clock && activeSession.startedAt) clock.textContent = formatDuration(getSessionDurationSec());
      }, 1000);
    }
  }
}

export async function handleStartSession() {
  const dayPlan = getWorkoutPlan(state.selectedWorkout);
  if (!dayPlan) return;
  await startSession(dayPlan.id);
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch { /* ignore */ }
  }
  toast('Sessão iniciada');
  renderHoje();
}

export async function handleSaveSession() {
  const dayPlan = getWorkoutPlan(state.selectedWorkout);
  if (!dayPlan) return;
  const date = todayISO();
  let saved = 0;
  const prMessages = [];
  const progressMessages = [];
  const exerciseSnapshots = [];

  if (!activeSession.startedAt) await startSession(dayPlan.id);

  dayPlan.exercises.forEach(ex => {
    const key = getDraftKey(dayPlan.id, ex.id);
    const draft = state.draftSets[key];
    if (!draft) return;
    const sets = draft
      .filter(s => s.reps !== '' && s.reps !== undefined && Number(s.reps) > 0)
      .map(s => ({
        reps: Number(s.reps),
        kg: ex.bodyweight ? undefined : Number(s.kg || 0),
        done: !!s.done,
        warmup: !!s.warmup,
        rpe: s.rpe !== '' && s.rpe !== undefined ? Number(s.rpe) : undefined,
        note: s.note || undefined
      }));
    if (!sets.length) return;

    const prs = detectPRs(ex.id, sets);
    if (prs.length) prMessages.push(ex.name.split(' ')[0] + ': ' + prs.map(p => p.label).join(', '));

    const prog = suggestProgression(ex, sets);
    if (prog) progressMessages.push(ex.name.split(' ')[0] + ': ' + prog.suggestedKg + unit());

    if (!state.logs[ex.id]) state.logs[ex.id] = [];
    const idx = state.logs[ex.id].findIndex(s => s.date === date);
    const entry = { date, sets };
    if (idx >= 0) state.logs[ex.id][idx] = entry;
    else state.logs[ex.id].push(entry);
    exerciseSnapshots.push({ id: ex.id, name: ex.name, sets });
    saved++;
  });

  if (saved > 0) {
    state.cfg.lastWorkoutId = dayPlan.id;
    await saveCfg();
    await saveLogs();
    const ended = await endSession();
    const record = buildSessionRecord({
      workoutId: dayPlan.id,
      workoutName: dayPlan.name,
      startedAt: ended.startedAt,
      endedAt: ended.endedAt,
      exercises: exerciseSnapshots
    });
    state.sessions.unshift(record);
    if (state.sessions.length > 200) state.sessions.length = 200;
    await saveSessions();
  }

  const indicator = document.getElementById('saved-indicator');
  if (indicator) {
    indicator.classList.add('show');
    setTimeout(() => indicator.classList.remove('show'), 2000);
  }

  if (prMessages.length) toast('PR! ' + prMessages.join(' · '));
  else if (progressMessages.length) toast('Progressão: ' + progressMessages.join(' · '));
  else toast(saved ? 'Sessão salva (' + saved + ' exercícios)' : 'Nenhum dado para salvar');

  // clear done flags but keep values for reference
  Object.keys(state.draftSets).forEach(k => {
    if (k.startsWith(dayPlan.id + '::')) delete state.draftSets[k];
  });
  renderHoje();
}

export function bindHojeEvents(root, { onRenderAll }) {
  root.addEventListener('click', async (e) => {
    const chip = e.target.closest('.day-chip');
    if (chip) {
      state.selectedWorkout = chip.dataset.workout;
      renderHoje();
      return;
    }
    if (e.target.id === 'start-session') { await handleStartSession(); return; }
    if (e.target.id === 'save-session') { await handleSaveSession(); onRenderAll?.(); return; }
    if (e.target.id === 'end-session-only') {
      await endSession();
      toast('Sessão encerrada');
      renderHoje();
      return;
    }
    if (e.target.id === 'skip-rest') { skipRest(); renderHoje(); return; }
    if (e.target.id === 'add-rest-30') {
      if (activeSession.restEndsAt) activeSession.restEndsAt += 30000;
      else startRestTimer((state.cfg.restSeconds || 90) + 30, () => renderHoje());
      renderHoje();
      return;
    }

    const stepBtn = e.target.closest('[data-step]');
    if (stepBtn) {
      const key = stepBtn.dataset.key;
      const setIdx = parseInt(stepBtn.dataset.set, 10);
      const field = stepBtn.dataset.field;
      const dir = Number(stepBtn.dataset.step);
      const stepVal = Number(stepBtn.dataset.stepval) || 1;
      const row = ensureDraftSet(key, setIdx);
      const cur = Number(row[field]) || 0;
      const next = Math.max(0, Math.round((cur + dir * stepVal) * 100) / 100);
      row[field] = next;
      renderHoje();
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const { action, key, set: setStr } = actionBtn.dataset;
    const setIdx = setStr !== undefined ? parseInt(setStr, 10) : -1;

    if (action === 'toggle-done' && key) {
      const row = ensureDraftSet(key, setIdx);
      row.done = !row.done;
      if (row.done) {
        startRestTimer(state.cfg.restSeconds || 90, () => {
          toast('Descanso finalizado');
          renderHoje();
        });
      }
      renderHoje();
      return;
    }
    if (action === 'toggle-warmup' && key) {
      const row = ensureDraftSet(key, setIdx);
      row.warmup = !row.warmup;
      renderHoje();
      return;
    }
    if (action === 'copy-prev' && key && setIdx > 0) {
      const prev = state.draftSets[key][setIdx - 1];
      const row = ensureDraftSet(key, setIdx);
      row.kg = prev.kg;
      row.reps = prev.reps;
      row.rpe = prev.rpe;
      renderHoje();
      return;
    }
    if (action === 'add-warmup' && key) {
      if (!state.draftSets[key]) state.draftSets[key] = [];
      state.draftSets[key].unshift({ reps: '', kg: '', done: false, warmup: true, rpe: '', note: '' });
      renderHoje();
      return;
    }
    if (action === 'start-rest') {
      startRestTimer(state.cfg.restSeconds || 90, () => {
        toast('Descanso finalizado');
        renderHoje();
      });
      renderHoje();
    }
  });

  root.addEventListener('input', (e) => {
    const inp = e.target;
    if (!inp.dataset.key) return;
    const row = ensureDraftSet(inp.dataset.key, parseInt(inp.dataset.set, 10));
    row[inp.dataset.field] = inp.value;
  });
}
