import { state, saveCfg } from '../store.js';
import {
  getDayWorkout, getSchedule, dayLabel, jumpToWeekDay, workingSetsCount, shortWorkoutName
} from '../plan.js';
import { esc, pageHeader, toast, youtubeDropdownHtml, hydrateYoutubeEmbeds, bindYoutubeDropdown } from '../utils.js';

export function renderPlano() {
  const el = document.getElementById('screen-plano');
  const week = state.browseWeek || state.cfg.currentWeek || 1;
  const dayId = state.browseDay || 'upper';
  const day = getDayWorkout(week, dayId);
  const schedule = getSchedule();

  const weekChips = Array.from({ length: 12 }, (_, i) => {
    const w = i + 1;
    const isProg = w === (state.cfg.currentWeek || 1);
    return '<button type="button" class="day-chip' + (w === week ? ' active' : '') +
      (isProg ? ' current-day' : '') + '" data-browse-week="' + w + '">' + w + '</button>';
  }).join('');

  const dayChips = schedule.map(id => {
    const isProg = id === (state.cfg.currentDay || 'upper') && week === (state.cfg.currentWeek || 1);
    return '<button type="button" class="day-chip' + (id === dayId ? ' active' : '') +
      (isProg ? ' current-day' : '') + '" data-browse-day="' + id + '">' +
      esc(shortWorkoutName(id)) + '</button>';
  }).join('');

  let body = '';
  if (!day) {
    body = '<div class="empty-state">Semana inválida.</div>';
  } else if (day.isRest) {
    body = '<div class="card rest-day-card"><div class="card-title">Descanso</div>' +
      '<p class="subtitle">Sem exercícios prescritos neste dia.</p></div>';
  } else {
    body = '<div class="plan-day">' +
      '<div class="plan-day-header"><div class="plan-day-title">' + esc(day.name) + '</div></div>' +
      '<div class="plan-day-meta">' + esc(day.block || '') + ' · ' + day.exercises.length + ' exercícios</div>' +
      day.exercises.map(ex => {
        const inten = ex.intensityTechnique
          ? '<span class="badge inten">' + esc(ex.intensityTechnique) + '</span>'
          : '';
        const yt = youtubeDropdownHtml(ex.youtubeUrl, 'plano:' + ex.id);
        const subs = (ex.substitutes || []).length
          ? '<div class="exercise-meta">Subs: ' + esc(ex.substitutes.map(s => s.name).join(' · ')) + '</div>'
          : '';
        return '<div class="exercise-item">' +
          '<div class="exercise-info">' +
            '<div class="exercise-name">' + esc(ex.name) + ' ' + inten + '</div>' +
            '<div class="exercise-meta">WU ' + esc(String(ex.warmupSets || '—')) +
              ' · ' + workingSetsCount(ex) + '×' + esc(ex.reps) +
              (ex.earlySetRpe ? ' · Early ' + esc(String(ex.earlySetRpe)) : '') +
              (ex.lastSetRpe ? ' · Last ' + esc(String(ex.lastSetRpe)) : '') +
              (ex.rest ? ' · ' + esc(ex.rest) : '') +
            '</div>' +
            yt +
            subs +
            (ex.notes ? '<div class="exercise-meta">' + esc(ex.notes) + '</div>' : '') +
          '</div></div>';
      }).join('') +
    '</div>';
  }

  const jumpBtn = '<button class="btn btn-primary btn-block" id="jump-week-day" style="margin-top:12px">' +
    'Treinar este dia (ir para Semana ' + week + ' · ' + esc(dayLabel(dayId)) + ')</button>';

  el.innerHTML = pageHeader('Programa', 'BBTS Beginner · somente leitura') +
    '<div class="program-nav">' +
      '<div class="session-meta">Semana</div>' +
      '<div class="day-picker-wrap"><div class="day-picker">' + weekChips + '</div></div>' +
      '<div class="session-meta" style="margin-top:10px">Dia</div>' +
      '<div class="day-picker-wrap"><div class="day-picker">' + dayChips + '</div></div>' +
    '</div>' +
    body + jumpBtn;

  hydrateYoutubeEmbeds(el);
}

export function bindPlanoEvents(root, { onRenderAll }) {
  bindYoutubeDropdown(root);
  root.addEventListener('click', async (e) => {
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
