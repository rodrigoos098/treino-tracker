import { state, saveCfg } from '../store.js';
import {
  getDayWorkout, getSchedule, dayLabel, jumpToWeekDay, workingSetsForWeek, isDeloadWeek,
  shortWorkoutName, weeksTotal, restartCycle
} from '../plan.js';
import { esc, pageHeader, toast } from '../utils.js';
import { exerciseDetailsButton, planBadgesHtml, setsRepsLabel, showExerciseDetails } from './exercise-details.js';
import { deloadCardHtml, restartCardHtml } from './cycle.js';

export function renderPlano() {
  const el = document.getElementById('screen-plano');
  const week = state.browseWeek || state.cfg.currentWeek || 1;
  const dayId = state.browseDay || 'legs';
  const day = getDayWorkout(week, dayId);
  const schedule = getSchedule();

  const totalWeeks = weeksTotal();
  const weekChips = Array.from({ length: totalWeeks }, (_, i) => {
    const w = i + 1;
    const isProg = w === (state.cfg.currentWeek || 1);
    const deload = isDeloadWeek(w);
    return '<button type="button" class="day-chip' + (w === week ? ' active' : '') +
      (isProg ? ' current-day' : '') + (deload ? ' deload-week' : '') +
      '" data-browse-week="' + w + '"' +
      (deload ? ' aria-label="Semana ' + w + ', deload"' : '') + '>' + w + '</button>';
  }).join('');

  const dayChips = schedule.map(id => {
    const isProg = id === (state.cfg.currentDay || 'legs') && week === (state.cfg.currentWeek || 1);
    return '<button type="button" class="day-chip' + (id === dayId ? ' active' : '') +
      (isProg ? ' current-day' : '') + '" data-browse-day="' + id + '">' +
      esc(shortWorkoutName(id)) + '</button>';
  }).join('');

  let body = '';
  if (!day) {
    body = '<div class="empty-state">Semana inválida.</div>';
  } else if (day.isRest) {
    body = '<div class="card rest-day-card"><div class="card-title">' + esc(day.name || 'Descanso') + '</div>' +
      '<p class="subtitle">' + esc(day.note || 'Sem exercícios prescritos neste dia.') + '</p></div>';
  } else {
    body = '<div class="plan-day">' +
      '<div class="plan-day-header"><div class="plan-day-title">' + esc(day.name) + '</div></div>' +
      '<div class="plan-day-meta">' + esc(day.block || '') + ' · ' + day.exercises.length + ' exercícios</div>' +
      (day.note ? '<p class="subtitle day-note">' + esc(day.note) + '</p>' : '') +
      day.exercises.map(ex => {
        const en = ex.nameEn ? '<div class="exercise-en">' + esc(ex.nameEn) + '</div>' : '';
        const subs = (ex.substitutes || []).length
          ? '<div class="exercise-meta">Substituições: ' + esc(ex.substitutes.map(s => s.name).join(' · ')) + '</div>'
          : '';
        return '<div class="exercise-item">' +
          '<div class="exercise-info">' +
            '<div class="exercise-name">' + esc(ex.name) + '</div>' +
            en +
            planBadgesHtml(ex) +
            '<div class="exercise-meta">Aquecimento ' + esc(String(ex.warmupSets || '—')) +
              ' · ' + esc(setsRepsLabel(ex, workingSetsForWeek(ex, week))) +
              (ex.rest ? ' · ' + esc(ex.rest) : '') +
            '</div>' +
            (isDeloadWeek(week)
              ? '<div class="exercise-meta">Deload: ' + esc(state.plan?.deload?.effort || '3–4 RIR') + '</div>'
              : (ex.effort ? '<div class="exercise-meta">' + esc(ex.effort) + '</div>' : '')) +
            exerciseDetailsButton(ex) +
            subs +
          '</div></div>';
      }).join('') +
    '</div>';
  }

  const jumpBtn = '<button class="btn btn-primary btn-block" id="jump-week-day" style="margin-top:12px">' +
    'Treinar este dia (ir para Semana ' + week + ' · ' + esc(dayLabel(dayId)) + ')</button>';

  el.innerHTML = pageHeader('Programa', (state.plan?.name || 'Powerbuilding · 4 dias') + ' · somente leitura') +
    restartCardHtml() +
    deloadCardHtml(week) +
    '<button type="button" class="btn btn-secondary btn-block consulta-entry" id="open-consulta">Consulta do caderno</button>' +
    '<div class="program-nav">' +
      '<div class="session-meta">Semana</div>' +
      '<div class="day-picker-wrap"><div class="day-picker">' + weekChips + '</div></div>' +
      '<div class="session-meta" style="margin-top:10px">Dia</div>' +
      '<div class="day-picker-wrap"><div class="day-picker">' + dayChips + '</div></div>' +
    '</div>' +
    body + jumpBtn;

}

export function bindPlanoEvents(root, { onRenderAll }) {
  root.addEventListener('click', async (e) => {
    const detailsBtn = e.target.closest('[data-action="ex-details"]');
    if (detailsBtn) {
      const current = getDayWorkout(state.browseWeek || state.cfg.currentWeek || 1, state.browseDay);
      const ex = (current?.exercises || []).find((item) => item.id === detailsBtn.dataset.ex);
      showExerciseDetails(ex);
      return;
    }
    if (e.target.id === 'open-consulta') {
      document.querySelector('#nav button[data-tab="consulta"]')?.click();
      return;
    }
    const restartBtn = e.target.closest('[data-action="restart-cycle"]');
    if (restartBtn) {
      restartCycle();
      await saveCfg();
      toast('Semana 1');
      onRenderAll?.();
      return;
    }
    const deloadBtn = e.target.closest('[data-action="toggle-deload"]');
    if (deloadBtn) {
      const marked = Number(deloadBtn.dataset.week);
      state.cfg.deloadWeek = Number(state.cfg.deloadWeek) === marked ? null : marked;
      await saveCfg();
      onRenderAll?.();
      return;
    }
    const weekBtn = e.target.closest('[data-browse-week]');
    if (weekBtn) {
      state.browseWeek = Number(weekBtn.dataset.browseWeek);
      renderPlano();
      return;
    }
    const dayBtn = e.target.closest('[data-browse-day]');
    if (dayBtn) {
      state.browseDay = dayBtn.dataset.browseDay;
      renderPlano();
      return;
    }
    if (e.target.id === 'jump-week-day') {
      jumpToWeekDay(state.browseWeek, state.browseDay);
      await saveCfg();
      toast('Progresso: Semana ' + state.cfg.currentWeek + ' · ' + dayLabel(state.cfg.currentDay));
      onRenderAll?.();
    }
  });
}
