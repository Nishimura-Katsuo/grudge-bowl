import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moodOf } from '../src/ui/hud.js';

test('rage picks one of three faces', () => {
  assert.equal(moodOf(0), 'calm');
  assert.equal(moodOf(0.39), 'calm');
  assert.equal(moodOf(0.4), 'irritated');
  assert.equal(moodOf(0.74), 'irritated');
  assert.equal(moodOf(0.75), 'pissed');
  assert.equal(moodOf(1), 'pissed');
});

test('every face has a picture', () => {
  const css = readFileSync(new URL('../src/ui/style.css', import.meta.url), 'utf8');
  for (const mood of ['calm', 'irritated', 'pissed']) {
    assert.ok(css.includes(`url(faces/${mood}.png)`), mood);
    assert.ok(readFileSync(new URL(`../src/ui/faces/${mood}.png`, import.meta.url)).length > 0, mood);
  }
});
