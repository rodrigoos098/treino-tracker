import { state } from './store.js';
import { epley1RM, formatDate } from './utils.js';
import { getExerciseById } from './plan.js';

function workingSets(sets) {
  return (sets || []).filter(s => !s.warmup);
}

export function getMetricsForExercise(exerciseId) {
  const ex = getExerciseById(exerciseId);
  return ex?.bodyweight ? ['maxReps', 'totalReps'] : ['maxKg', 'e1rm', 'volume'];
}

export function getMetricLabels(exerciseId) {
  const unit = state.cfg.unit;
  const ex = getExerciseById(exerciseId);
  if (ex?.bodyweight) {
    return { maxReps: 'Reps máx.', totalReps: 'Reps totais' };
  }
  return {
    maxKg: 'Carga máx. (' + unit + ')',
    e1rm: 'e1RM (' + unit + ')',
    volume: 'Volume (' + unit + ')'
  };
}

export function getExerciseStats(exerciseId) {
  const sessions = state.logs[exerciseId] || [];
  if (!sessions.length) return null;
  const ex = getExerciseById(exerciseId);
  const last = sessions[sessions.length - 1];

  if (ex?.bodyweight) {
    let bestReps = 0, bestTotalReps = 0;
    sessions.forEach(s => {
      let maxReps = 0, totalReps = 0;
      workingSets(s.sets).forEach(set => {
        maxReps = Math.max(maxReps, set.reps || 0);
        totalReps += set.reps || 0;
      });
      if (maxReps > bestReps) bestReps = maxReps;
      if (totalReps > bestTotalReps) bestTotalReps = totalReps;
    });
    return { bodyweight: true, bestReps, bestTotalReps, lastDate: last.date, sessionCount: sessions.length };
  }

  let bestKg = 0, bestE1RM = 0, bestVol = 0;
  sessions.forEach(s => {
    let maxKg = 0, vol = 0, maxE1 = 0;
    workingSets(s.sets).forEach(set => {
      if (set.kg > maxKg) maxKg = set.kg;
      vol += (set.kg || 0) * (set.reps || 0);
      const e1 = epley1RM(set.kg, set.reps);
      if (e1 > maxE1) maxE1 = e1;
    });
    if (maxKg > bestKg) bestKg = maxKg;
    if (maxE1 > bestE1RM) bestE1RM = maxE1;
    if (vol > bestVol) bestVol = vol;
  });
  return { bodyweight: false, bestKg, bestE1RM, bestVol, lastDate: last.date, sessionCount: sessions.length };
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
  let sessions = (state.logs[exerciseId] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
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
      labels += '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" fill="#9aa3b5" font-size="9" font-family="Plus Jakarta Sans,sans-serif">' + formatDate(d.date) + '</text>';
    }
  });
  const yLabels = [minV, minV + range / 2, maxV].map((v, i) => {
    const y = pad.t + ch - (i / 2) * ch;
    return '<text x="' + (pad.l - 6) + '" y="' + (y + 4) + '" text-anchor="end" fill="#9aa3b5" font-size="9" font-family="JetBrains Mono,monospace">' + Math.round(v) + '</text>';
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
    '<polygon points="' + area + '" fill="rgba(52,211,153,0.08)"/>' +
    '<polyline points="' + polyline + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    circles +
    '</svg>';
}
