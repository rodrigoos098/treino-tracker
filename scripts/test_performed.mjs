#!/usr/bin/env node
import {
  performedKeyFromName, backfillPerformedMeta, collectLogSessions,
  analyzePerformedSessions, substituteIndexFromLog, performedFromChoice
} from '../js/performed.js';

function emptyDays() {
  return { lower: { exercises: [] }, pull: { exercises: [] }, push: { exercises: [] }, legs: { exercises: [] } };
}

const plan = {
  weeks: {
    1: {
      ...emptyDays(),
      upper: {
        exercises: [{
          id: 'cable-crossover-ladder',
          name: 'Cable Crossover Ladder',
          substitutes: [{ name: 'Pec Deck' }, { name: 'Bottom-Half DB Flye' }]
        }]
      }
    },
    7: {
      ...emptyDays(),
      upper: {
        exercises: [{
          id: 'pec-deck',
          name: 'Pec Deck',
          substitutes: [{ name: 'Cable Crossover Ladder' }]
        }]
      }
    }
  }
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(performedKeyFromName(plan, 'Pec Deck', 'cable-crossover-ladder') === 'pec-deck', 'pec deck key');
assert(performedKeyFromName(plan, 'Cable Crossover Ladder', 'x') === 'cable-crossover-ladder', 'cable key');

const slot = plan.weeks[1].upper.exercises[0];
const pec = performedFromChoice(plan, slot, 0);
assert(pec.name === 'Pec Deck' && pec.key === 'pec-deck' && pec.substituteIndex === 0, 'choice pec');
const book = performedFromChoice(plan, slot, null);
assert(book.name === 'Cable Crossover Ladder' && book.key === 'cable-crossover-ladder', 'choice book');

const logs = {
  'cable-crossover-ladder': [
    { date: '2026-08-10', sets: [{ kg: 50, reps: 12 }] },
    { date: '2026-08-17', sets: [{ kg: 45, reps: 10 }] }
  ]
};
const sessions = [
  {
    date: '2026-08-10',
    exercises: [{ id: 'cable-crossover-ladder', name: 'Pec Deck', sets: [{ kg: 50, reps: 12 }] }]
  },
  {
    date: '2026-08-17',
    exercises: [{ id: 'cable-crossover-ladder', name: 'Pec Deck', sets: [{ kg: 45, reps: 10 }] }]
  }
];

assert(backfillPerformedMeta(logs, sessions, plan) === true, 'backfill changed');
assert(logs['cable-crossover-ladder'][0].performedKey === 'pec-deck', 'tagged pec');
assert(logs['cable-crossover-ladder'][0].performedName === 'Pec Deck', 'named pec');
assert(logs['cable-crossover-ladder'][0].substituteIndex === 0, 'sub index');

const pecSessions = collectLogSessions(logs, 'pec-deck');
const cableSessions = collectLogSessions(logs, 'cable-crossover-ladder');
assert(pecSessions.length === 2, 'pec collected');
assert(cableSessions.length === 0, 'cable empty');

const stats = analyzePerformedSessions(pecSessions, false);
assert(stats.bestSet.kg === 50 && stats.bestSet.reps === 12, 'best set');
assert(stats.bestSession.date === '2026-08-10', 'best session date');
assert(stats.lastSession.date === '2026-08-17', 'last session date');

assert(substituteIndexFromLog(slot, logs['cable-crossover-ladder'][1]) === 0, 'restore sub');

console.log('OK performed');
