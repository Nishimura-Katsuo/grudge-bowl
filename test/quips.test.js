import test from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../src/sim/roster.js';
import { QUIPS, quipFor } from '../src/ui/quips.js';

const MOODS = ['any', 'clean', 'wrecked', 'brawler', 'survivor'];
const MAX_LENGTH = 90; // past this the speech bubble wraps to a third line on a phone

function world(name, car = {}, others = {}) {
  const winner = { name, alive: true, health: 0.7, knockouts: 0, progress: 3000, ...car };
  const second = { name: 'SGT. DENT', alive: true, progress: 2900, ...others };
  return { cars: [winner, second], winner: 0, finishOrder: [0, 1], laps: 3, track: { length: 1000 } };
}

const fixedRng = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('every car on the roster has its own line for every mood', () => {
  for (const { name } of ROSTER) {
    assert.ok(QUIPS[name], `${name} has no quips`);
    for (const mood of MOODS) assert.ok(QUIPS[name][mood]?.length > 0, `${name} has no ${mood} line`);
  }
});

test('no two cars share a line, and every line fits the bubble', () => {
  const seen = new Set();
  for (const [name, moods] of Object.entries(QUIPS)) {
    for (const lines of Object.values(moods)) {
      for (const line of lines) {
        assert.ok(!seen.has(line), `${name} repeats "${line}"`);
        seen.add(line);
        assert.ok(line.length <= MAX_LENGTH, `${name}: "${line}" is ${line.length} long`);
      }
    }
  }
});

test('a line with no runner-up to name is only used where one exists', () => {
  for (const [name, moods] of Object.entries(QUIPS)) {
    assert.ok(!moods.survivor.some((line) => line.includes('{second}')), `${name} names a rival in an empty field`);
  }
});

test('the mood follows how the race went', () => {
  const always = fixedRng(0);
  assert.equal(quipFor(world('OIL BARON', { health: 0.2 }), always), `Insured. All of it. Several times.`);
  assert.equal(quipFor(world('OIL BARON', { knockouts: 2 }), always), 'A hostile takeover. Those are my favourite kind.');
  assert.equal(quipFor(world('OIL BARON', { health: 1 }), always), "One doesn't get dented. One has people for that.");
  const lastCar = world('OIL BARON', { progress: 1500 }, { alive: false });
  assert.equal(quipFor(lastCar, always), 'The field has consolidated. I am pleased to report I own it.');
});

test('a runner-up is named the way people say it, and Mad Muffler shouts it', () => {
  const pick = (value) => fixedRng(value);
  assert.equal(quipFor(world('KEVIN'), pick(0.7)), "I'd like it on record that Sgt. Dent started it. I have no proof. I don't need any.");
  assert.equal(quipFor(world('MAD MUFFLER'), pick(0.4)), "IT'S NOT LOUD, SGT. DENT! YOU'RE JUST BEHIND ME!");
});

test('a race with no winner still has something to say', () => {
  const nobody = { cars: [{ name: 'KEVIN', alive: false }], winner: -1, finishOrder: [0], laps: 3, track: { length: 1000 } };
  assert.match(quipFor(nobody), /Nobody/);
});

test('an unknown car never leaves the screen blank', () => {
  const stranger = world('NEW GUY');
  assert.ok(quipFor(stranger).length > 0);
  assert.ok(!quipFor(stranger).includes('{'));
});
