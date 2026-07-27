#!/usr/bin/env node
/** Smoke test BBTS program runtime without a browser (Node ESM). */
import { BBTS_BEGINNER } from '../js/data/bbts-beginner.js';

const days = ['upper', 'lower', 'pull', 'push', 'legs'];
let total = 0;
let missingYt = 0;
let missingReps = 0;

for (let w = 1; w <= 12; w++) {
  const week = BBTS_BEGINNER.weeks[String(w)];
  if (!week) throw new Error('missing week ' + w);
  if (!week.rest) throw new Error('missing rest W' + w);
  for (const d of days) {
    const day = week[d];
    if (!day?.exercises?.length) throw new Error(`empty ${w}/${d}`);
    for (const ex of day.exercises) {
      total++;
      if (!ex.youtubeUrl) missingYt++;
      if (!ex.reps) missingReps++;
      if (!ex.id || !ex.name) throw new Error('bad ex');
      if (typeof ex.workingSets !== 'number') throw new Error('no workingSets ' + ex.name);
    }
  }
}

console.log('OK program', BBTS_BEGINNER.id);
console.log('exercises', total, 'missingYt', missingYt, 'missingReps', missingReps);
console.log('schedule', BBTS_BEGINNER.schedule.join(' → '));
console.log('W1 upper', BBTS_BEGINNER.weeks['1'].upper.exercises.map(e => e.name).join(' | '));
console.log('W7 upper inten', BBTS_BEGINNER.weeks['7'].upper.exercises.filter(e => e.intensityTechnique).map(e => e.name + ':' + e.intensityTechnique).join(', '));
console.log('W12 push', BBTS_BEGINNER.weeks['12'].push.exercises.map(e => `${e.name} ${e.workingSets}x${e.reps}`).join(' | '));
