import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/math.js';
import { Radio, SONGS, shuffled } from '../src/render/radio.js';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

function rig({ online = true } = {}) {
  const frames = [];
  const host = {
    children: [],
    replaceChildren(...next) { this.children = next; },
  };
  const backup = {
    played: 0, paused: 0, muted: false,
    play() { this.played++; return Promise.resolve(); },
    pause() { this.paused++; },
  };
  const net = { online };
  globalThis.fetch = async () => {
    if (!net.online) throw new Error('offline');
    return {};
  };
  globalThis.document = {
    createElement() {
      const frame = {
        listeners: {},
        addEventListener(type, fn) { this.listeners[type] = fn; },
        load() { this.listeners.load(); },
      };
      frames.push(frame);
      return frame;
    },
  };
  return { radio: new Radio(host, backup), host, backup, frames, net };
}

const playing = (frame) => frame.src.split('/embed/')[1].split('?')[0];
const song = (frame) => SONGS.find((s) => s.id === playing(frame));

test('each pass plays all eight songs once and never repeats across a reshuffle', () => {
  const rng = createRng(11);
  let last = null;
  for (let pass = 0; pass < 500; pass++) {
    const deck = shuffled(SONGS, last, rng);
    assert.equal(new Set(deck).size, SONGS.length);
    assert.notEqual(deck[0], last);
    last = deck[deck.length - 1];
  }
});

test('the song list is complete and every id is usable', () => {
  assert.equal(SONGS.length, 8);
  assert.equal(new Set(SONGS.map((s) => s.id)).size, 8);
  for (const s of SONGS) {
    assert.match(s.id, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    assert.ok(s.seconds > 30);
  }
});

test('starts an autoplaying player, and the next song follows when this one ends', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { radio, host, backup, frames } = rig();
    radio.start();
    await flush();
    assert.equal(host.children.length, 1);
    assert.match(frames[0].src, /^https:\/\/suno\.com\/embed\/.+\?autoplay=1$/);
    assert.match(frames[0].allow, /autoplay/);
    assert.equal(backup.paused, 1, 'the backup must not play over the song');
    frames[0].load();
    mock.timers.tick((song(frames[0]).seconds + 3) * 1000);
    await flush();
    assert.equal(frames.length, 1, 'cut the song off before it finished');
    mock.timers.tick(1100);
    await flush();
    assert.equal(frames.length, 2);
    assert.notEqual(playing(frames[1]), playing(frames[0]));
    assert.equal(backup.played, 1);
  } finally {
    mock.timers.reset();
  }
});

test('with Suno out of reach the bundled track plays, and it can be heard', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { radio, host, backup, frames } = rig({ online: false });
    radio.start();
    await flush();
    assert.equal(frames.length, 0);
    assert.equal(host.children.length, 0);
    assert.equal(backup.played, 2);
    assert.equal(backup.muted, false);
    assert.equal(radio.onBackup, true);
  } finally {
    mock.timers.reset();
  }
});

test('a player that never loads hands over to the bundled track', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { radio, host, backup } = rig();
    radio.start();
    await flush();
    mock.timers.tick(10100);
    assert.equal(radio.onBackup, true);
    assert.equal(host.children.length, 0);
    assert.equal(backup.played, 2);
    assert.equal(backup.muted, false);
  } finally {
    mock.timers.reset();
  }
});

test('losing Suno between songs hands over too', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { radio, frames, net } = rig();
    radio.start();
    await flush();
    frames[0].load();
    net.online = false;
    mock.timers.tick((song(frames[0]).seconds + 5) * 1000);
    await flush();
    assert.equal(radio.onBackup, true);
  } finally {
    mock.timers.reset();
  }
});

test('the backup is temporary: the playlist comes back once Suno does', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { radio, backup, frames, net } = rig({ online: false });
    radio.start();
    await flush();
    assert.equal(radio.onBackup, true);
    mock.timers.tick(61000);
    await flush();
    assert.equal(radio.onBackup, true, 'still down, so it stays on the backup');
    net.online = true;
    mock.timers.tick(61000);
    await flush();
    assert.equal(radio.onBackup, false);
    assert.equal(frames.length, 1);
    assert.equal(backup.paused, 1, 'the backup has to stop when the song starts');
  } finally {
    mock.timers.reset();
  }
});

test('a muted game does not bring the playlist back by itself', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { radio, frames, net } = rig({ online: false });
    radio.start();
    await flush();
    radio.setMuted(true);
    net.online = true;
    mock.timers.tick(61000);
    await flush();
    assert.equal(frames.length, 0);
    radio.setMuted(false);
    mock.timers.tick(61000);
    await flush();
    assert.equal(frames.length, 1);
  } finally {
    mock.timers.reset();
  }
});

test('mute removes the player, stops the queue, and unmute moves to the next song', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { radio, host, frames } = rig();
    radio.start();
    await flush();
    frames[0].load();
    radio.setMuted(true);
    assert.equal(host.children.length, 0);
    mock.timers.tick(600000);
    await flush();
    assert.equal(frames.length, 1, 'a muted game started a song');
    radio.setMuted(false);
    await flush();
    assert.equal(frames.length, 2);
    assert.equal(host.children.length, 1);
  } finally {
    mock.timers.reset();
  }
});

test('muting while Suno is still answering does not start a song afterwards', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { radio, frames } = rig();
    radio.start();
    radio.setMuted(true);
    await flush();
    assert.equal(frames.length, 0);
  } finally {
    mock.timers.reset();
  }
});

test('mute works on the bundled track, and muting before the start holds', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const offline = rig({ online: false });
    offline.radio.start();
    await flush();
    offline.radio.setMuted(true);
    assert.equal(offline.backup.muted, true);
    offline.radio.setMuted(false);
    assert.equal(offline.backup.muted, false);

    const early = rig();
    early.radio.setMuted(true);
    early.radio.start();
    await flush();
    assert.equal(early.frames.length, 0);
    assert.equal(early.backup.paused, 1);
    early.radio.setMuted(false);
    await flush();
    assert.equal(early.frames.length, 1);
  } finally {
    mock.timers.reset();
  }
});
