import test from 'node:test';
import assert from 'node:assert/strict';
import { lineupFor, ROSTER, TEMPER_RANGE } from '../src/sim/roster.js';
import { CAR_COUNT } from '../src/sim/config.js';
import { createWorld } from '../src/sim/world.js';
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

test('names with small words in them are read naturally', () => {
  const said = (second) => quipFor(world('KEVIN', {}, { name: second }), fixedRng(0.7));
  assert.match(said('VLAD THE IMPOUNDER'), /Vlad the Impounder started it/);
  assert.match(said('ALAN IN ACCOUNTS'), /Alan in Accounts started it/);
  assert.match(said('THE LATE BARRY'), /The Late Barry started it/);
});

test('an unknown car never leaves the screen blank', () => {
  const stranger = world('NEW GUY');
  assert.ok(quipFor(stranger).length > 0);
  assert.ok(!quipFor(stranger).includes('{'));
});

test('the roster is three times the size of the grid, and every name and colour is its own', () => {
  assert.equal(ROSTER.length, CAR_COUNT * 3);
  assert.equal(new Set(ROSTER.map((c) => c.name)).size, ROSTER.length);
  const rgb = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (let i = 0; i < ROSTER.length; i++) {
    for (let j = 0; j < i; j++) {
      const d = Math.hypot(...rgb(ROSTER[i].colour).map((v, k) => v - rgb(ROSTER[j].colour)[k]));
      assert.ok(d >= 30, `${ROSTER[i].name} and ${ROSTER[j].name} look alike`);
    }
  }
});

test('every temper stays inside what the network was built for', () => {
  for (const { name, temper } of ROSTER) {
    for (const [key, [low, high]] of Object.entries(TEMPER_RANGE)) {
      assert.ok(temper[key] >= low && temper[key] <= high, `${name} ${key} ${temper[key]}`);
    }
  }
});

test('a lineup is twelve different cars, the same for a seed and different between seeds', () => {
  const names = (seed) => lineupFor(seed).map((c) => c.name);
  assert.deepEqual(names(7), names(7));
  assert.equal(new Set(names(7)).size, CAR_COUNT);
  const seen = new Set();
  const overlaps = [];
  for (let seed = 1; seed <= 200; seed++) {
    names(seed).forEach((name) => seen.add(name));
    const previous = new Set(names(seed - 1));
    overlaps.push(names(seed).filter((name) => previous.has(name)).length);
  }
  assert.equal(seen.size, ROSTER.length, 'everyone gets a race');
  assert.ok(Math.max(...overlaps) < CAR_COUNT, 'never the same twelve twice running');
});

test('a world races the lineup it is given, without changing the race the seed deals', () => {
  const lineup = lineupFor(11);
  const drawn = createWorld({ seed: 11, lineup });
  assert.deepEqual(drawn.cars.map((c) => c.name), lineup.map((c) => c.name));
  const plain = createWorld({ seed: 11 });
  assert.deepEqual(plain.cars.map((c) => [c.px, c.pz]), drawn.cars.map((c) => [c.px, c.pz]));
  assert.equal(plain.rng(), drawn.rng());
});
