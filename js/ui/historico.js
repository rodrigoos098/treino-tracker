import { state } from '../store.js';
import { pageHeader, formatDate, esc, escAttr, openModal, closeModal, todayISO } from '../utils.js';
import { formatDuration } from '../session.js';

function localISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function weekSummary() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  const startISO = localISO(start);
  const sessions = (state.sessions || []).filter(s => s.date >= startISO);
  const volume = sessions.reduce((acc, s) => acc + (s.totalVolume || 0), 0);
  return { count: sessions.length, volume: Math.round(volume) };
}

function streakDays() {
  const dates = [...new Set((state.sessions || []).map(s => s.date))].sort().reverse();
  if (!dates.length) return 0;
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (dates[0] !== todayISO()) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (const d of dates) {
    const iso = localISO(cursor);
    if (d === iso) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (d < iso) break;
  }
  return streak;
}

function showSessionDetail(session) {
  const sets = (session.exercises || []).map(ex => {
    const lines = (ex.sets || []).map((s, i) => {
      const parts = ['#' + (i + 1)];
      if (s.warmup) parts.push('W');
      if (s.kg != null) parts.push(s.kg + 'kg');
      parts.push((s.reps || 0) + ' reps');
      if (s.rpe != null) parts.push('RPE ' + s.rpe);
      if (s.note) parts.push('· ' + s.note);
      return '<div class="exercise-meta">' + esc(parts.join(' ')) + '</div>';
    }).join('');
    return '<div class="card" style="margin-bottom:8px"><div class="card-title">' + esc(ex.name) + '</div>' + lines + '</div>';
  }).join('');
  openModal('<h3>' + esc(session.workoutName || 'Sessão') + '</h3>' +
    '<p class="subtitle" style="margin-bottom:12px">' + formatDate(session.date) + ' · ' +
    (session.durationMin || Math.round((session.durationSec || 0) / 60)) + ' min · ' +
    (session.totalVolume || 0) + ' ' + (state.cfg.unit || 'kg') + '</p>' +
    (sets || '<div class="empty-state">Sem detalhes de exercícios</div>') +
    '<button class="btn btn-secondary btn-block" id="hist-close" style="margin-top:12px">Fechar</button>');
  document.getElementById('hist-close').onclick = closeModal;
}

export function renderHistorico() {
  const el = document.getElementById('screen-historico');
  const sessions = state.sessions || [];
  const week = weekSummary();
  const streak = streakDays();

  let list = '';
  if (!sessions.length) {
    list = '<div class="empty-state">Nenhuma sessão salva ainda. Treine na aba Hoje e salve.</div>';
  } else {
    list = '<div class="card" style="padding:0">' + sessions.map(s =>
      '<div class="history-item" data-session="' + escAttr(s.id) + '">' +
        '<div class="history-item-title">' + esc(s.workoutName || 'Treino') + '</div>' +
        '<div class="history-item-meta">' + formatDate(s.date) + ' · ' +
        formatDuration(s.durationSec || (s.durationMin || 0) * 60) + ' · ' +
        (s.totalSets || 0) + ' séries · ' + (s.totalVolume || 0) + ' ' + (state.cfg.unit || 'kg') +
        '</div></div>'
    ).join('') + '</div>';
  }

  el.innerHTML = pageHeader('Histórico', 'Sessões salvas no dispositivo') +
    '<div class="stats-row">' +
      '<div class="stat-box"><div class="stat-value">' + week.count + '</div><div class="stat-label">Sessões (semana)</div></div>' +
      '<div class="stat-box"><div class="stat-value">' + week.volume + '</div><div class="stat-label">Volume (semana)</div></div>' +
      '<div class="stat-box"><div class="stat-value">' + streak + '</div><div class="stat-label">Streak (dias)</div></div>' +
    '</div>' + list;
}

export function bindHistoricoEvents(root) {
  root.addEventListener('click', (e) => {
    const item = e.target.closest('[data-session]');
    if (!item) return;
    const session = (state.sessions || []).find(s => s.id === item.dataset.session);
    if (session) showSessionDetail(session);
  });
}
