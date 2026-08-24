import { state } from './store.js';
import { epley1RM, formatDate } from './utils.js';
import { getAllExercises, getExerciseById } from './plan.js';
import { collectLogSessions, analyzePerformedSessions } from './performed.js';

function workingSets(sets) {
  return (sets || []).filter(s => !s.warmup);
}

function isBodyweightKey(performedKey) {
  const ex = getExerciseById(performedKey);
  if (ex) return !!ex.bodyweight;
  return false;
}

export function getMetricsForExercise(exerciseId) {
  return isBodyweightKey(exerciseId) ? ['maxReps', 'totalReps'] : ['maxKg', 'e1rm', 'volume'];
}

export function getMetricLabels(exerciseId) {
  const unit = state.cfg.unit;
  if (isBodyweightKey(exerciseId)) {
    return { maxReps: 'Reps máx.', totalReps: 'Reps totais' };
  }
  return {
    maxKg: 'Carga máx. (' + unit + ')',
    e1rm: 'e1RM (' + unit + ')',
    volume: 'Volume (' + unit + ')'
  };
}

export function getExerciseStats(exerciseId) {
  const sessions = collectLogSessions(state.logs, exerciseId);
  if (!sessions.length) return null;
  return analyzePerformedSessions(sessions, isBodyweightKey(exerciseId));
}

/** Unique movements for the Evolução picker (mains + any performed substitutes). */
export function getChartExercises() {
  const list = [];
  const seen = new Set();
  getAllExercises().forEach(ex => {
    if (seen.has(ex.id)) return;
    seen.add(ex.id);
    list.push({
      id: ex.id,
      name: ex.name,
      bodyweight: !!ex.bodyweight,
      sessionCount: collectLogSessions(state.logs, ex.id).length
    });
  });
  Object.keys(state.logs || {}).forEach(slotId => {
    (state.logs[slotId] || []).forEach(entry => {
      const key = entry.performedKey || slotId;
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push({
        id: key,
        name: entry.performedName || key,
        bodyweight: isBodyweightKey(key),
        sessionCount: collectLogSessions(state.logs, key).length
      });
    });
  });
  return list;
}

function metricValue(sets, metric) {
  let val = 0;
  workingSets(sets).forEach(set => {
    if (metric === 'maxKg') val = Math.max(val, set.kg || 0);
    else if (metric === 'e1rm') val = Math.max(val, epley1RM(set.kg, set.reps));
    else if (metric === 'volume') val += (set.kg || 0) * (set.reps || 0);
    else if (metric === 'maxReps') val = Math.max(val, set.reps || 0);
    else if (metric === 'totalReps') val += set.reps || 0;
  });
  return Math.round(val * 10) / 10;
}

function cutoffISO(periodDays) {
  if (periodDays == null) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (Number(periodDays) - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/**
 * @param {string} exerciseId
 * @param {string} metric
 * @param {number|null} periodDays 30, 90, or null for all
 * @returns {{ date: string, value: number, isPR?: boolean }[]}
 */
export function getChartData(exerciseId, metric, periodDays = null) {
  const cutoff = cutoffISO(periodDays);
  let sessions = collectLogSessions(state.logs, exerciseId);
  if (cutoff) {
    sessions = sessions.filter(s => s.date >= cutoff);
  }
  const points = sessions.map(s => ({
    date: s.date,
    value: metricValue(s.sets, metric)
  }));

  // Mark PR points (running max / global max markers)
  let runningMax = -Infinity;
  return points.map(p => {
    const isPR = p.value > runningMax && p.value > 0;
    if (p.value > runningMax) runningMax = p.value;
    return { ...p, isPR };
  });
}

/**
 * @param {{ date: string, value: number, isPR?: boolean }[]} data
 * @param {string} [unit]
 * @param {{ markPRs?: boolean }} [opts]
 */
export function renderChartSVG(data, unit, opts = {}) {
  const markPRs = opts.markPRs !== false;
  if (!data.length) return '<div class="empty-state">Sem dados ainda. Registre treinos na aba Hoje.</div>';
  const W = 340, H = 180, pad = { t: 16, r: 12, b: 28, l: 40 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  const vals = data.map(d => d.value);
  let minV, maxV;
  if (data.length === 1) {
    minV = 0;
    maxV = Math.max(vals[0] * 1.2, 1);
  } else {
    minV = Math.min(...vals);
    maxV = Math.max(...vals);
  }
  const range = maxV - minV || 1;
  const pts = data.map((d, i) => {
    const x = pad.l + (data.length === 1 ? cw / 2 : (i / (data.length - 1)) * cw);
    const y = pad.t + ch - ((d.value - minV) / range) * ch;
    return { x, y, ...d };
  });
  const polyline = pts.map(p => p.x + ',' + p.y).join(' ');
  const area = pad.l + ',' + (pad.t + ch) + ' ' + polyline + ' ' + (pad.l + cw) + ',' + (pad.t + ch);
  let labels = '';
  const step = Math.max(1, Math.floor(data.length / 5));
  data.forEach((d, i) => {
    if (i % step === 0 || i === data.length - 1) {
      const x = pad.l + (data.length === 1 ? cw / 2 : (i / (data.length - 1)) * cw);
      labels += '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" fill="#9aa3b5" font-size="9" font-family="Barlow,sans-serif">' + formatDate(d.date) + '</text>';
    }
  });
  const yLabels = [minV, minV + range / 2, maxV].map((v, i) => {
    const y = pad.t + ch - (i / 2) * ch;
    return '<text x="' + (pad.l - 6) + '" y="' + (y + 4) + '" text-anchor="end" fill="#9aa3b5" font-size="9" font-family="Barlow,sans-serif">' + Math.round(v) + '</text>';
  }).join('');
  const circles = pts.map(p => {
    if (markPRs && p.isPR) {
      return '<circle cx="' + p.x + '" cy="' + p.y + '" r="5.5" fill="#fbbf24" stroke="var(--surface)" stroke-width="1.5"/>';
    }
    return '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="var(--accent)"/>';
  }).join('');
  return '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
    '<line x1="' + pad.l + '" y1="' + pad.t + '" x2="' + pad.l + '" y2="' + (pad.t + ch) + '" stroke="var(--border)" stroke-width="1"/>' +
    '<line x1="' + pad.l + '" y1="' + (pad.t + ch) + '" x2="' + (pad.l + cw) + '" y2="' + (pad.t + ch) + '" stroke="var(--border)" stroke-width="1"/>' +
    yLabels + labels +
    '<polygon points="' + area + '" fill="rgba(249,115,22,0.10)"/>' +
    '<polyline points="' + polyline + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    circles +
    '</svg>';
}
