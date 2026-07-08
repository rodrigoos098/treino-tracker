import { state } from '../store.js';
import { getAllExercises } from '../plan.js';
import {
  getMetricsForExercise, getMetricLabels, getExerciseStats,
  getChartData, renderChartSVG
} from '../charts.js';
import { pageHeader, formatDate, esc } from '../utils.js';

const PERIODS = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'Tudo', days: null }
];

export function renderEvolucao() {
  const el = document.getElementById('screen-evolucao');
  const exercises = getAllExercises();
  const hasLogs = exercises.some(ex => (state.logs[ex.id] || []).length > 0);

  if (!exercises.length) {
    el.innerHTML = pageHeader('Evolução') + '<div class="empty-state">Nenhum exercício no plano.</div>';
    return;
  }

  if (!state.chartExercise) {
    const firstWithData = exercises.find(ex => (state.logs[ex.id] || []).length > 0);
    state.chartExercise = firstWithData?.id || exercises[0].id;
  }

  const availableMetrics = getMetricsForExercise(state.chartExercise);
  if (!availableMetrics.includes(state.chartMetric)) {
    state.chartMetric = availableMetrics[0];
  }

  const period = state.chartPeriod === null || state.chartPeriod === undefined
    ? null
    : Number(state.chartPeriod);

  const stats = getExerciseStats(state.chartExercise);
  const data = getChartData(state.chartExercise, state.chartMetric, period);
  const metricLabels = getMetricLabels(state.chartExercise);

  const options = exercises.map(ex => {
    const count = (state.logs[ex.id] || []).length;
    return '<option value="' + ex.id + '"' + (ex.id === state.chartExercise ? ' selected' : '') + '>' +
      esc(ex.name) + (count ? ' (' + count + ')' : '') + '</option>';
  }).join('');

  let statsHtml = '';
  if (stats) {
    if (stats.bodyweight) {
      statsHtml = '<div class="stats-row">' +
        '<div class="stat-box"><div class="stat-value">' + stats.bestReps + '</div><div class="stat-label">Melhor reps (série)</div></div>' +
        '<div class="stat-box"><div class="stat-value">' + stats.bestTotalReps + '</div><div class="stat-label">Melhor total</div></div>' +
        '<div class="stat-box"><div class="stat-value">' + stats.sessionCount + '</div><div class="stat-label">Sessões</div></div>' +
        '<div class="stat-box"><div class="stat-value">' + formatDate(stats.lastDate) + '</div><div class="stat-label">Último treino</div></div></div>';
    } else {
      statsHtml = '<div class="stats-row">' +
        '<div class="stat-box"><div class="stat-value">' + stats.bestKg + state.cfg.unit + '</div><div class="stat-label">Melhor carga</div></div>' +
        '<div class="stat-box"><div class="stat-value">' + Math.round(stats.bestE1RM) + state.cfg.unit + '</div><div class="stat-label">Melhor e1RM</div></div>' +
        '<div class="stat-box"><div class="stat-value">' + stats.sessionCount + '</div><div class="stat-label">Sessões</div></div>' +
        '<div class="stat-box"><div class="stat-value">' + formatDate(stats.lastDate) + '</div><div class="stat-label">Último treino</div></div></div>';
    }
  }

  const periodTabs = PERIODS.map(p => {
    const active = (p.days === null && period === null) || p.days === period;
    return '<button class="chart-tab' + (active ? ' active' : '') + '" data-period="' +
      (p.days === null ? 'all' : p.days) + '">' + p.label + '</button>';
  }).join('');

  const tabs = availableMetrics.map(m =>
    '<button class="chart-tab' + (state.chartMetric === m ? ' active' : '') + '" data-metric="' + m + '">' +
    metricLabels[m] + '</button>'
  ).join('');

  el.innerHTML = pageHeader('Evolução', 'Acompanhe seu progresso ao longo do tempo') +
    '<div class="form-group"><label>Exercício</label><select id="chart-exercise-select">' + options + '</select></div>' +
    statsHtml +
    '<div class="period-tabs">' + periodTabs + '</div>' +
    '<div class="chart-container"><div class="chart-tabs">' + tabs + '</div>' +
    renderChartSVG(data, state.cfg.unit) +
    '<p class="subtitle" style="margin-top:8px">Pontos dourados = PR no período</p></div>' +
    (!hasLogs ? '<div class="empty-state">Registre seu primeiro treino na aba Hoje para ver os gráficos.</div>' : '');
}

export function bindEvolucaoEvents(root) {
  root.addEventListener('change', (e) => {
    if (e.target.id === 'chart-exercise-select') {
      state.chartExercise = e.target.value;
      const metrics = getMetricsForExercise(state.chartExercise);
      if (!metrics.includes(state.chartMetric)) state.chartMetric = metrics[0];
      renderEvolucao();
    }
  });

  root.addEventListener('click', (e) => {
    const periodBtn = e.target.closest('[data-period]');
    if (periodBtn) {
      const raw = periodBtn.dataset.period;
      state.chartPeriod = raw === 'all' ? null : Number(raw);
      renderEvolucao();
      return;
    }
    const chartTab = e.target.closest('[data-metric]');
    if (chartTab) {
      state.chartMetric = chartTab.dataset.metric;
      renderEvolucao();
    }
  });
}
