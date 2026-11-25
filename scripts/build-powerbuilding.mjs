#!/usr/bin/env node
/**
 * Lê o caderno HTML e gera js/data/powerbuilding-4d.js no modelo do app.
 * Semanas 1–12 repetem a mesma prescrição (o caderno não varia exercícios por semana).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'consulta/plano-treino.html'), 'utf8');

const start = html.indexOf('const V = {');
const end = html.indexOf('function renderCard');
if (start < 0 || end < 0) throw new Error('Não achei DAYS no HTML');
const { V, DAYS } = new Function(html.slice(start, end) + '\nreturn { V, DAYS };')();

function slug(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function restSeconds(rest) {
  const nums = [...String(rest).matchAll(/(\d+)(?:,(\d+))?/g)].map((m) =>
    m[2] ? Number(m[1] + '.' + m[2]) : Number(m[1])
  );
  if (!nums.length) return 90;
  const minutes = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.round(minutes * 60);
}

function exercise(raw) {
  const sections = [
    {
      heading: 'Esforço por série (RIR = repetições em reserva)',
      text: raw.rir
    },
    {
      heading: 'Aquecimento específico',
      text: raw.warm
    },
    {
      heading: 'Pontos de execução',
      items: raw.cues || []
    },
    {
      heading: 'Justificativa científica (acervo Jeff Nippard)',
      text: raw.why,
      linksLabel: 'Vídeos de referência',
      links: (raw.refs || []).map((k) => ({
        href: 'https://youtu.be/' + V[k][0],
        label: V[k][1]
      }))
    },
    {
      heading: 'Substituições equivalentes',
      pairs: (raw.subs || []).map(([name, tier]) => ({ name, tier }))
    }
  ];
  if (raw.advtxt) {
    sections.push({
      heading: 'Técnica de intensidade',
      text: raw.advtxt
    });
  }

  return {
    id: slug(raw.n),
    name: raw.n,
    nameEn: raw.en || null,
    tier: raw.tier || null,
    must: !!raw.must,
    biSet: !!raw.ss,
    intensityTechnique: raw.adv ? 'Técnica na última série' : null,
    warmupSets: raw.warm,
    workingSets: parseInt(raw.sets, 10),
    reps: raw.reps,
    earlySetRpe: null,
    lastSetRpe: null,
    effort: raw.rir,
    rest: raw.rest,
    restSeconds: restSeconds(raw.rest),
    substitutes: (raw.subs || []).map(([name, tier]) => ({ name, tier })),
    sections
  };
}

function trainingDay(key, short) {
  const d = DAYS[key];
  return {
    name: d.title,
    short,
    focus: d.focus,
    block: d.time,
    note: d.note,
    exercises: d.ex.map(exercise)
  };
}

const WEEK = {
  legs: trainingDay('legs', 'Legs'),
  push: trainingDay('push', 'Push'),
  pull: trainingDay('pull', 'Pull'),
  'rest-qui': {
    name: 'Quinta · Descanso programado',
    short: 'Qui',
    focus: 'Recuperação',
    block: 'Descanso',
    note: 'Recuperação glicogênica e neural completa antes dos cinco levantamentos básicos de sexta-feira.',
    exercises: []
  },
  power: trainingDay('full', 'Power'),
  'rest-sab': {
    name: 'Sábado · Descanso livre',
    short: 'Sáb',
    focus: 'Recuperação',
    block: 'Descanso',
    note: 'Recuperação muscular e sistêmica pós-Powerlift (cardio leve opcional).',
    exercises: []
  },
  'rest-dom': {
    name: 'Domingo · Descanso livre',
    short: 'Dom',
    focus: 'Recuperação',
    block: 'Descanso',
    note: 'Prontidão total para abrir a próxima semana no treino de pernas de segunda-feira.',
    exercises: []
  }
};

const ids = new Set();
for (const day of Object.values(WEEK)) {
  for (const ex of day.exercises) {
    if (ids.has(ex.id)) throw new Error('id duplicado: ' + ex.id);
    ids.add(ex.id);
    if (!ex.sections.some((s) => s.heading === 'Pontos de execução')) {
      throw new Error('sem pontos: ' + ex.name);
    }
  }
}

const program = {
  id: 'powerbuilding-4d-2026',
  name: 'Powerbuilding · 4 dias',
  level: 'Powerbuilding',
  weeksTotal: 12,
  schedule: ['legs', 'push', 'pull', 'rest-qui', 'power', 'rest-sab', 'rest-dom'],
  dayLabels: {
    legs: 'Legs',
    push: 'Push',
    pull: 'Pull',
    'rest-qui': 'Qui',
    power: 'Power',
    'rest-sab': 'Sáb',
    'rest-dom': 'Dom'
  },
  weeks: { '1': WEEK }
};

const out = `/** Gerado por scripts/build-powerbuilding.mjs a partir de consulta/plano-treino.html. */
const WEEK = ${JSON.stringify(WEEK, null, 2)};

export const POWERBUILDING_4D = {
  "id": ${JSON.stringify(program.id)},
  "name": ${JSON.stringify(program.name)},
  "level": ${JSON.stringify(program.level)},
  "weeksTotal": 12,
  "schedule": ${JSON.stringify(program.schedule)},
  "dayLabels": ${JSON.stringify(program.dayLabels, null, 2)},
  "weeks": Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), structuredClone(WEEK)]))
};

export default POWERBUILDING_4D;
`;

const dest = path.join(root, 'js/data/powerbuilding-4d.js');
fs.writeFileSync(dest, out);
console.log('exercícios', ids.size, '→', dest);
