import { state, saveLogs, saveCfg, saveSessions } from '../store.js';
import {
  getRotation, shortWorkoutName, getWorkoutPlan,
  getDraftKey, initDraftForDay, workingSetsCount,
  advanceSchedule, resolveExerciseDisplay, dayLabel,
  currentPerformed, lastPerformedLabel, isDraftUntouched, seedDraftFromLast
} from '../plan.js';
import {
  activeSession, startSession, endSession, getSessionDurationSec,
  formatDuration, startRestTimer, skipRest, syncRestToast,
  detectPRs, suggestProgression, buildSessionRecord,
  restSecondsForExercise
} from '../session.js';
import {
  esc, escAttr, pageHeader, ICON_HISTORY, toast, lightHaptic,
  formatDate, todayISO, openModal, closeModal
} from '../utils.js';
import { workingSets } from '../performed.js';
import { getExerciseStats } from '../charts.js';

function unit() { return state.cfg.unit || 'kg'; }

function hapticIfEnabled() {
  if (state.cfg.vibrate) lightHaptic();
}

let lastStaggerWorkout = null;

function ensureDraftSet(key, idx) {
  if (!state.draftSets[key]) state.draftSets[key] = [];
  if (!state.draftSets[key][idx]) {
    state.draftSets[key][idx] = { reps: '', kg: '', done: false, warmup: false, rpe: '', note: '' };
  }
  return state.draftSets[key][idx];
}

const ICON_CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="9 18 15 12 9 6"/></svg>';

function compareLine(ex) {
  const stats = getExerciseStats(currentPerformed(ex).key);
  if (!stats) return 'Sem histórico';
  if (stats.bodyweight) {
    return 'Melhor: ' + stats.bestReps + ' reps';
  }
  const set = stats.bestSet;
  if (set && set.reps) {
    return 'Melhor: ' + set.kg + unit() + ' × ' + set.reps + ' · e1RM ' + Math.round(set.e1rm) + unit();
  }
  return 'Melhor: ' + stats.bestKg + unit() + ' · e1RM ' + Math.round(stats.bestE1RM) + unit();
}

function formatCompareSets(sets, highlightIndex, bodyweight) {
  return workingSets(sets).map((s, i) => {
    const parts = ['#' + (i + 1)];
    if (!bodyweight && s.kg != null && s.kg !== '') parts.push(s.kg + unit());
    parts.push((s.reps || 0) + ' reps');
    if (s.rpe != null && s.rpe !== '') parts.push('RPE ' + s.rpe);
    if (s.note) parts.push('· ' + s.note);
    return '<div class="compare-set' + (i === highlightIndex ? ' is-pr' : '') + '">' +
      esc(parts.join(' · ')) +
      (i === highlightIndex ? ' <span class="badge accent">PR</span>' : '') +
      '</div>';
  }).join('');
}

function compareBlock(title, session, highlightIndex, bodyweight) {
  if (!session) return '';
  return '<div class="compare-block">' +
    '<div class="compare-block-kicker">' + esc(title) + '</div>' +
    '<div class="compare-block-date">' + formatDate(session.date) + '</div>' +
    (formatCompareSets(session.sets, highlightIndex, bodyweight) ||
      '<div class="exercise-meta">Sem séries</div>') +
    '</div>';
}

function showCompareModal(ex) {
  const performed = currentPerformed(ex);
  const stats = getExerciseStats(performed.key);
  if (!stats) return;
  const same = stats.bestSession?.date && stats.bestSession.date === stats.lastSession?.date;
  const lastTitle = same ? 'Última sessão (também é a melhor)' : 'Última sessão';
  openModal(
    '<h3>' + esc(performed.name) + '</h3>' +
    '<p class="subtitle" style="margin-bottom:12px">Melhor sessão vs última sessão</p>' +
    compareBlock('Melhor sessão', stats.bestSession, stats.bestSet?.index ?? -1, stats.bodyweight) +
    compareBlock(lastTitle, stats.lastSession, same ? (stats.bestSet?.index ?? -1) : -1, stats.bodyweight) +
    '<button class="btn btn-secondary btn-block" id="compare-close" style="margin-top:12px">Fechar</button>'
  );
  const closeBtn = document.getElementById('compare-close');
  if (closeBtn) closeBtn.onclick = closeModal;
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

function renderSetRow(ex, key, s, i, isLastWorking) {
  const done = !!s.done;
  const fieldsClass = ex.bodyweight ? 'set-row-fields bw' : 'set-row-fields';
  const targetRpe = isLastWorking && ex.lastSetRpe ? ex.lastSetRpe : (ex.earlySetRpe || '');
  return '<div class="set-row-v2' + (done ? ' done' : '') + (isLastWorking ? ' last-working' : '') + '" data-key="' + key + '" data-set="' + i + '">' +
    '<div class="set-row-top">' +
      '<span class="set-num">' + (i + 1) + (isLastWorking ? ' · last' : '') + '</span>' +
      '<div class="set-actions-row">' +
        (i > 0 ? '<button type="button" class="chip-btn" data-action="copy-prev" data-key="' + key + '" data-set="' + i + '">Copiar ant.</button>' : '') +
        '<button type="button" class="set-check' + (done ? ' on' : '') + '" data-action="toggle-done" data-key="' + key + '" data-set="' + i + '" data-ex="' + escAttr(ex.id) + '" aria-label="Marcar série">' + (done ? '✓' : '') + '</button>' +
      '</div>' +
    '</div>' +
    (targetRpe ? '<div class="set-rpe-target">Alvo RPE ' + esc(String(targetRpe)) + (isLastWorking ? ' (última série)' : '') + '</div>' : '') +
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
      '<div><div class="session-meta">Pronto para treinar</div><strong>' + esc(dayPlan?.short || dayPlan?.name || '') + '</strong></div>' +
      '<button class="btn btn-primary btn-sm" id="start-session">Iniciar</button></div>';
  }
  return '<div class="session-bar">' +
    '<div><div class="session-meta">Sessão ativa</div><div class="session-timer" id="session-clock">' + formatDuration(getSessionDurationSec()) + '</div></div>' +
    '<button class="btn btn-secondary btn-sm" id="end-session-only">Encerrar</button></div>';
}

function prescribedMeta(ex) {
  const parts = [];
  parts.push('WU ' + (ex.warmupSets || '—'));
  parts.push(workingSetsCount(ex) + '×' + ex.reps);
  if (ex.earlySetRpe) parts.push('Early RPE ' + ex.earlySetRpe);
  if (ex.lastSetRpe) parts.push('Last RPE ' + ex.lastSetRpe);
  if (ex.rest) parts.push(ex.rest);
  return parts.join(' · ');
}

function exerciseCard(dayPlan, ex, stagger) {
  const key = getDraftKey(dayPlan.id, ex.id);
  const draft = (state.draftSets[key] || []).filter(s => !s.warmup);
  const display = resolveExerciseDisplay(ex);
  const restSec = restSecondsForExercise(ex);
  const lastWorkingIdx = draft.length ? draft.length - 1 : -1;

  const setsHtml = draft.map((s, i) => renderSetRow(ex, key, s, i, i === lastWorkingIdx)).join('');

  const yt = display.youtubeUrl
    ? '<a class="chip-btn youtube-link" href="' + escAttr(display.youtubeUrl) + '" target="_blank" rel="noopener">YouTube</a>'
    : '';

  const inten = ex.intensityTechnique
    ? '<span class="badge inten">' + esc(ex.intensityTechnique) + '</span>'
    : '';

  const lastLabel = lastPerformedLabel(ex);
  const choice = state.substituteChoice[ex.id];
  const bookSelected = choice == null || choice === '';
  const markLast = (name) => lastLabel && lastLabel === name ? ' · última vez' : '';
  const subs = (ex.substitutes || []).length
    ? '<div class="form-group sub-picker" style="margin:8px 0 0"><label>Substitute</label>' +
      '<select data-action="pick-sub" data-ex="' + escAttr(ex.id) + '">' +
      '<option value=""' + (bookSelected ? ' selected' : '') + '>' +
        esc(ex.name) + ' (livro)' + markLast(ex.name) + '</option>' +
      ex.substitutes.map((s, i) =>
        '<option value="' + i + '"' + (String(choice) === String(i) ? ' selected' : '') + '>' +
        esc(s.name) + markLast(s.name) + '</option>'
      ).join('') +
      '</select>' +
      (lastLabel ? '<div class="last-variant-hint">Última vez: ' + esc(lastLabel) + '</div>' : '') +
      '</div>'
    : '';

  const notes = ex.notes
    ? '<details class="ex-notes"><summary>Notas do livro</summary><p>' + esc(ex.notes) + '</p></details>'
    : '';

  const hasStats = !!getExerciseStats(currentPerformed(ex).key);
  const bestLine = compareLine(ex);
  const compareHtml = hasStats
    ? '<button type="button" class="last-session has-data" data-action="compare-best" data-ex="' +
      escAttr(ex.id) + '" aria-label="' + escAttr(bestLine + '. Ver melhor e última sessão') + '">' +
      ICON_HISTORY + ' <span>' + bestLine + '</span>' + ICON_CHEVRON + '</button>'
    : '<div class="last-session">' + ICON_HISTORY + ' ' + bestLine + '</div>';

  return '<div class="card' + (stagger ? ' stagger-item' : '') + '" data-exercise="' + escAttr(ex.id) + '">' +
    '<div class="card-header">' +
      '<span class="card-title">' + esc(display.name) +
        (display.usingSubstitute ? ' <span class="sub-tag">sub</span>' : '') +
      '</span>' +
      '<span class="badge accent">' + workingSetsCount(ex) + '×' + esc(ex.reps) + '</span>' +
    '</div>' +
    '<div class="ex-meta-row">' + inten + yt + '</div>' +
    '<div class="prescribed">' + esc(prescribedMeta(ex)) + '</div>' +
    subs +
    notes +
    compareHtml +
    '<div class="sets-grid">' + setsHtml + '</div>' +
    '<div class="set-actions-row" style="margin-top:8px">' +
      '<button type="button" class="chip-btn" data-action="start-rest" data-ex="' + escAttr(ex.id) + '">Descanso ' + restSec + 's</button>' +
    '</div>' +
    progressionHint(ex, draft) +
  '</div>';
}

function restDayHtml(dayPlan) {
  const next = (() => {
    const schedule = getRotation();
    const idx = schedule.indexOf(dayPlan.id);
    const nextId = schedule[(idx + 1) % schedule.length];
    return dayLabel(nextId);
  })();
  return '<div class="card rest-day-card">' +
    '<div class="card-title" style="font-size:1.25rem;margin-bottom:8px">Dia de descanso</div>' +
    '<p class="subtitle" style="margin-bottom:16px">Semana ' + (state.cfg.currentWeek || 1) +
    '/12 · recupere bem. Próximo: <strong>' + esc(next) + '</strong>.</p>' +
    '<button class="btn btn-primary btn-block" id="advance-rest">Avançar para ' + esc(next) + '</button>' +
  '</div>';
}

export function renderHoje() {
  const el = document.getElementById('screen-hoje');
  const week = state.cfg.currentWeek || 1;
  const dayPlan = getWorkoutPlan(state.selectedWorkout);

  const chips = getRotation().map(id => {
    const isCurrent = id === (state.cfg.currentDay || 'upper');
    const isSelected = id === state.selectedWorkout;
    return '<button class="day-chip' + (isSelected ? ' active' : '') + (isCurrent ? ' current-day' : '') +
      '" data-workout="' + id + '">' + esc(shortWorkoutName(id)) + '</button>';
  }).join('');

  let content = '';
  if (!dayPlan) {
    content = '<div class="empty-state">Programa não carregado.</div>';
  } else if (dayPlan.isRest) {
    // Keep session controls visible if a workout session is still running
    content = (activeSession.startedAt ? sessionBarHtml(dayPlan) : '') + restDayHtml(dayPlan);
  } else {
    initDraftForDay(dayPlan);
    const doStagger = lastStaggerWorkout !== state.selectedWorkout;
    lastStaggerWorkout = state.selectedWorkout;
    content = sessionBarHtml(dayPlan);
    content += '<div class="exercise-list">' +
      dayPlan.exercises.map(ex => exerciseCard(dayPlan, ex, doStagger)).join('') +
      '</div>';
    content += '<div class="save-wrap"><button class="btn btn-primary btn-block" id="save-session">Salvar sessão</button>' +
      '<div class="saved-indicator" id="saved-indicator">Sessão salva</div></div>';
  }

  const focusLine = dayPlan
    ? (dayPlan.short || dayLabel(dayPlan.id)) + (dayPlan.focus ? ' · ' + dayPlan.focus : '')
    : null;
  const dateStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const headerSub = 'Semana ' + week + '/12' + (dayPlan?.block ? ' · ' + dayPlan.block : '');

  el.innerHTML = pageHeader('Hoje', headerSub, focusLine) +
    '<p class="subtitle hoje-date">' + esc(dateStr) + '</p>' +
    '<div class="day-picker-wrap"><div class="day-picker">' + chips + '</div></div>' + content;

  syncRestToast();

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
  if (!dayPlan || dayPlan.isRest) return;
  await startSession(dayPlan.id);
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch { /* ignore */ }
  }
  hapticIfEnabled();
  toast('Sessão iniciada');
  renderHoje();
}

export async function handleAdvanceRest() {
  const dayPlan = getWorkoutPlan(state.selectedWorkout);
  if (!dayPlan || !dayPlan.isRest) return;
  if (dayPlan.id !== state.cfg.currentDay) {
    toast('Este não é o dia atual do programa. Use “Treinar este dia” na aba Programa.');
    return;
  }

  const record = buildSessionRecord({
    workoutId: 'rest',
    workoutName: 'Descanso · Semana ' + (state.cfg.currentWeek || 1),
    startedAt: Date.now(),
    endedAt: Date.now(),
    exercises: [],
    week: state.cfg.currentWeek,
    dayId: 'rest',
    isRest: true
  });
  state.sessions.unshift(record);
  if (state.sessions.length > 200) state.sessions.length = 200;
  await saveSessions();

  const next = advanceSchedule();
  await saveCfg();
  hapticIfEnabled();
  toast('Descanso registrado · próximo: ' + dayLabel(next.dayId));
  renderHoje();
}

export async function handleSaveSession() {
  const dayPlan = getWorkoutPlan(state.selectedWorkout);
  if (!dayPlan || dayPlan.isRest) return;
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
    const display = resolveExerciseDisplay(ex);
    const performed = currentPerformed(ex);
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

    const prs = detectPRs(ex.id, sets, performed.key);
    if (prs.length) prMessages.push(display.name.split(' ')[0] + ': ' + prs.map(p => p.label).join(', '));

    const prog = suggestProgression(ex, sets);
    if (prog) progressMessages.push(display.name.split(' ')[0] + ': ' + prog.suggestedKg + unit());

    if (!state.logs[ex.id]) state.logs[ex.id] = [];
    const idx = state.logs[ex.id].findIndex(s => s.date === date);
    const entry = {
      date,
      sets,
      performedName: performed.name,
      performedKey: performed.key,
      substituteIndex: performed.substituteIndex
    };
    if (idx >= 0) state.logs[ex.id][idx] = entry;
    else state.logs[ex.id].push(entry);
    exerciseSnapshots.push({
      id: ex.id,
      name: performed.name,
      performedKey: performed.key,
      substituteIndex: performed.substituteIndex,
      sets
    });
    saved++;
  });

  if (saved > 0) {
    const ended = await endSession();
    const record = buildSessionRecord({
      workoutId: dayPlan.id,
      workoutName: 'S' + (state.cfg.currentWeek || 1) + ' · ' + (dayPlan.short || dayPlan.name),
      startedAt: ended.startedAt,
      endedAt: ended.endedAt,
      exercises: exerciseSnapshots,
      week: state.cfg.currentWeek,
      dayId: dayPlan.id
    });
    state.sessions.unshift(record);
    if (state.sessions.length > 200) state.sessions.length = 200;
    await saveSessions();

    // Only advance if saving the scheduled current day
    if (dayPlan.id === state.cfg.currentDay) {
      advanceSchedule();
    } else {
      state.cfg.lastWorkoutId = dayPlan.id;
    }
    await saveCfg();
    await saveLogs();
    hapticIfEnabled();
  }

  const indicator = document.getElementById('saved-indicator');
  if (indicator) {
    indicator.classList.add('show');
    setTimeout(() => indicator.classList.remove('show'), 2000);
  }

  if (prMessages.length) toast('PR! ' + prMessages.join(' · '));
  else if (progressMessages.length) toast('Progressão: ' + progressMessages.join(' · '));
  else toast(saved ? 'Sessão salva (' + saved + ' exercícios)' : 'Nenhum dado para salvar');

  Object.keys(state.draftSets).forEach(k => {
    if (k.includes('::' + dayPlan.id + '::')) delete state.draftSets[k];
  });
  renderHoje();
}

function findExInDay(dayPlan, exId) {
  return (dayPlan?.exercises || []).find(e => e.id === exId) || null;
}

function handleRestToastClick(e) {
  if (e.target.id === 'skip-rest') {
    skipRest();
    syncRestToast();
    return;
  }
  if (e.target.id === 'add-rest-30') {
    if (activeSession.restEndsAt) {
      activeSession.restEndsAt += 30000;
      syncRestToast();
    } else {
      startRestTimer((state.cfg.restSeconds || 90) + 30, () => {
        toast('Descanso finalizado');
        syncRestToast();
      });
    }
  }
}

export function bindHojeEvents(root, { onRenderAll }) {
  const restToast = document.getElementById('rest-toast');
  if (restToast && !restToast.dataset.bound) {
    restToast.dataset.bound = '1';
    restToast.addEventListener('click', handleRestToastClick);
  }

  root.addEventListener('click', async (e) => {
    const chip = e.target.closest('.day-chip');
    if (chip) {
      state.selectedWorkout = chip.dataset.workout;
      renderHoje();
      return;
    }
    if (e.target.id === 'start-session') { await handleStartSession(); return; }
    if (e.target.id === 'save-session') { await handleSaveSession(); onRenderAll?.(); return; }
    if (e.target.id === 'advance-rest') { await handleAdvanceRest(); onRenderAll?.(); return; }
    if (e.target.id === 'end-session-only') {
      await endSession();
      toast('Sessão encerrada');
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
    const { action, key, set: setStr, ex: exId } = actionBtn.dataset;
    const setIdx = setStr !== undefined ? parseInt(setStr, 10) : -1;
    const dayPlan = getWorkoutPlan(state.selectedWorkout);
    const ex = exId ? findExInDay(dayPlan, exId) : null;

    if (action === 'compare-best' && ex) {
      showCompareModal(ex);
      return;
    }
    if (action === 'toggle-done' && key) {
      const row = ensureDraftSet(key, setIdx);
      row.done = !row.done;
      if (row.done) {
        const secs = restSecondsForExercise(ex);
        startRestTimer(secs, () => {
          toast('Descanso finalizado');
          renderHoje();
        });
      }
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
    if (action === 'start-rest') {
      const secs = restSecondsForExercise(ex);
      startRestTimer(secs, () => {
        toast('Descanso finalizado');
        renderHoje();
      });
      renderHoje();
    }
  });

  root.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-action="pick-sub"]');
    if (!sel) return;
    const exId = sel.dataset.ex;
    const val = sel.value;
    if (val === '') state.substituteChoice[exId] = null;
    else state.substituteChoice[exId] = Number(val);
    const dayPlan = getWorkoutPlan(state.selectedWorkout);
    const ex = findExInDay(dayPlan, exId);
    if (ex && dayPlan) {
      const draftKey = getDraftKey(dayPlan.id, ex.id);
      if (isDraftUntouched(state.draftSets[draftKey])) {
        seedDraftFromLast(dayPlan.id, ex);
      }
    }
    renderHoje();
  });

  root.addEventListener('input', (e) => {
    const inp = e.target;
    if (!inp.dataset.key) return;
    const row = ensureDraftSet(inp.dataset.key, parseInt(inp.dataset.set, 10));
    row[inp.dataset.field] = inp.value;
  });
}
