// The Grudge Board and everything else that sits over the picture. Red yarn runs
// from each bot to whoever its brain is hunting at this moment.

import { raceOrder } from '../sim/world.js';

const SVG = 'http://www.w3.org/2000/svg';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function readableInk(n) {
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#1a1b20' : '#f3e2bd';
}

const TAUNTS = [
  (a, b) => `${a} would like a word with ${b}`,
  (a, b) => `${a} has not forgiven ${b}`,
  (a, b) => `${b} is on ${a}'s list`,
  (a, b) => `${a} remembers what ${b} did`,
  (a, b) => `${a} is coming for ${b}`,
];

export class Hud {
  constructor(handlers) {
    this.handlers = handlers;
    this.el = (id) => document.getElementById(id);
    this.rows = [];
    this.order = [];
    this.lastTaunt = 0;
    this.prevTargets = [];
    this.feedItems = [];
    this.bindControls();
  }

  bindControls() {
    const { handlers } = this;
    this.el('start-btn').addEventListener('click', () => handlers.start());
    this.el('again-btn').addEventListener('click', () => handlers.restart());
    document.querySelectorAll('[data-shot]').forEach((b) => {
      b.addEventListener('click', () => handlers.shot(b.dataset.shot || null));
    });
    document.querySelectorAll('[data-speed]').forEach((b) => {
      b.addEventListener('click', () => handlers.speed(Number(b.dataset.speed)));
    });
    this.el('mute-btn').addEventListener('click', () => handlers.toggleMute());
    this.el('pause-btn').addEventListener('click', () => handlers.togglePause());
  }

  build(world) {
    const list = this.el('board-rows');
    list.textContent = '';
    this.rows = world.cars.map((car) => {
      const li = document.createElement('li');
      li.className = 'row';
      const btn = document.createElement('button');
      btn.className = 'row-btn';
      btn.type = 'button';
      btn.title = `Follow ${car.name}`;
      btn.addEventListener('click', () => this.handlers.follow(car.id));

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = car.id + 1;
      num.style.background = hex(car.colour);
      num.style.color = readableInk(car.colour);

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = car.name;

      const meters = document.createElement('span');
      meters.className = 'meters';
      const hp = document.createElement('i');
      hp.className = 'hp';
      const rage = document.createElement('i');
      rage.className = 'rage';
      meters.append(hp, rage);

      const score = document.createElement('span');
      score.className = 'score';

      btn.append(num, name, meters, score);
      li.append(btn);
      list.append(li);
      return { li, hp, rage, score, name };
    });
    this.order = world.cars.map((c) => c.id);
    const yarn = this.el('yarn');
    yarn.textContent = '';
    this.yarn = world.cars.map(() => {
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('class', 'strand');
      yarn.append(path);
      const knot = document.createElementNS(SVG, 'circle');
      knot.setAttribute('class', 'knot');
      knot.setAttribute('r', '3');
      yarn.append(knot);
      return { path, knot };
    });
    this.el('board').style.setProperty('--rows', world.cars.length);
    this.el('feed').textContent = '';
    this.el('finish').hidden = true;
    this.lastTaunt = -999;
    this.syncInert();
    this.prevTargets = world.cars.map(() => -1);
  }

  update(world, telemetryOf, focusId) {
    const cars = world.cars;
    const rowHeight = parseFloat(getComputedStyle(this.el('board')).getPropertyValue('--row')) || 34;
    this.order = raceOrder(cars).map((c) => c.id);
    const leader = cars[this.order[0]];
    const lapLength = world.track.length;

    this.order.forEach((id, rank) => {
      const row = this.rows[id];
      const car = cars[id];
      const tele = telemetryOf(id);
      row.li.style.transform = `translateY(${rank * rowHeight}px)`;
      row.hp.style.transform = `scaleX(${car.health.toFixed(3)})`;
      row.rage.style.transform = `scaleX(${(tele?.rage ?? 0).toFixed(3)})`;
      row.score.textContent = this.gapText(car, leader, rank, lapLength, world.laps);
      row.li.classList.toggle('dead', !car.alive);
      row.li.classList.toggle('focus', id === focusId);
    });

    // Strands run down the right edge from hunter to quarry.
    const rankOf = new Int32Array(cars.length);
    this.order.forEach((id, r) => { rankOf[id] = r; });
    for (const car of cars) {
      const strand = this.yarn[car.id];
      const tele = telemetryOf(car.id);
      const target = tele?.targetId ?? -1;
      if (!car.alive || target < 0 || target >= cars.length || !cars[target].alive) {
        strand.path.style.opacity = 0;
        strand.knot.style.opacity = 0;
        continue;
      }
      const y1 = rankOf[car.id] * rowHeight + rowHeight / 2;
      const y2 = rankOf[target] * rowHeight + rowHeight / 2;
      const bulge = 8 + Math.abs(y2 - y1) * 0.28;
      strand.path.setAttribute('d', `M0 ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, 0 ${y2}`);
      const fury = tele?.rage ?? 0;
      strand.path.style.opacity = 0.45 + fury * 0.55;
      strand.path.style.strokeWidth = `${1.4 + fury * 2.2}px`;
      strand.knot.setAttribute('cx', 1.5);
      strand.knot.setAttribute('cy', y2);
      strand.knot.style.opacity = 0.9;

      if (target !== this.prevTargets[car.id]) {
        this.prevTargets[car.id] = target;
        if (world.time - this.lastTaunt > 7 && (tele?.rage ?? 0) > 0.4 && world.phase === 'racing') {
          this.lastTaunt = world.time;
          const line = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
          this.feed(line(car.name, cars[target].name), 'taunt');
        }
      }
    }

    const remaining = Math.max(0, world.timeLimit - world.raceTime);
    const m = Math.floor(remaining / 60), s = Math.floor(remaining % 60);
    this.el('clock').textContent = `${m}:${String(s).padStart(2, '0')}`;
    const alive = cars.filter((c) => c.alive).length;
    this.el('alive').textContent = `${alive} still running`;
    this.el('lap').textContent = `Lap ${Math.min(world.leaderLaps + 1, world.laps)} of ${world.laps}`;

    const c = cars[focusId];
    const tele = telemetryOf(focusId);
    this.el('focus-name').textContent = c.name;
    const mph = Math.round(Math.hypot(c.vx, c.vz) * 2.237);
    this.el('focus-speed').textContent = `${mph} mph`;
    const target = tele?.targetId ?? -1;
    const mode = tele?.mode ?? '';
    const modeText = {
      hunt: target >= 0 ? `hunting ${cars[target].name}` : 'hunting',
      race: 'racing',
      drift: 'sideways',
      unstick: 'backing out',
    }[mode] ?? '';
    this.el('focus-mode').textContent = c.alive ? modeText : c.koReason ?? 'out';
    this.el('focus-hp').style.transform = `scaleX(${c.health.toFixed(3)})`;
    this.el('focus-cold').textContent = c.alive
      ? `P${c.racePos + 1}, lap ${Math.min(c.laps + 1, world.laps)}`
      : '';
  }

  // Running order column: the leader's lap, then everyone's distance behind.
  gapText(car, leader, rank, lapLength, laps) {
    if (!car.alive) return 'OUT';
    if (rank === 0) return `L${Math.min(car.laps + 1, laps)}`;
    const gap = leader.progress - car.progress;
    return gap >= lapLength ? `+${Math.floor(gap / lapLength)}L` : `-${Math.round(gap)}m`;
  }

  feed(text, kind = '') {
    const list = this.el('feed');
    const li = document.createElement('li');
    li.className = kind;
    li.textContent = text;
    list.prepend(li);
    while (list.children.length > 5) list.lastElementChild.remove();
    setTimeout(() => li.classList.add('gone'), 7000);
    setTimeout(() => li.remove(), 7800);
  }

  announce(text, duration = 1100) {
    const el = this.el('announce');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  onEvent(e, world) {
    const name = (id) => world.cars[id].name;
    switch (e.type) {
      case 'hit':
        if (e.upper >= 0) {
          const lower = e.upper === e.a ? e.b : e.a;
          this.feed(`${name(e.upper)} landed on ${name(lower)}`, 'hit');
        } else if (e.strength > 0.55) {
          const victim = e.dmgA > e.dmgB ? e.a : e.b;
          const attacker = victim === e.a ? e.b : e.a;
          this.feed(`${name(attacker)} folded ${name(victim)}`, 'hit');
        }
        break;
      case 'ko':
        this.feed(
          e.killer >= 0 ? `${name(e.car)} is out. Credit to ${name(e.killer)}.` : `${name(e.car)} ${e.reason}`,
          'ko',
        );
        break;
      case 'landing':
        if (e.drop > 7 && Math.random() < 0.35) this.feed(`${name(e.car)} came down hard`);
        break;
      case 'wheelOff':
        this.feed(`${name(e.car)} lost a wheel`, 'hit');
        break;
      case 'lap':
        if (e.lap === world.leaderLaps && e.lap > 0 && e.lap < world.laps) {
          this.feed(`${name(e.car)} leads lap ${e.lap + 1}`);
        }
        break;
      default:
        break;
    }
  }

  showFinish(world) {
    const box = this.el('finish');
    const winner = world.cars[world.winner];
    this.el('finish-name').textContent = winner ? winner.name : 'Nobody';
    this.el('finish-note').textContent = winner
      ? `Won in ${this.raceClock(world.raceTime)}. ${winner.knockouts} knockouts, ${Math.round(winner.health * 100)}% of the car left`
      : 'Everyone wrecked.';
    const list = this.el('finish-list');
    list.textContent = '';
    world.finishOrder.slice(0, 12).forEach((id, place) => {
      const c = world.cars[id];
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${place + 1}. ${c.name}`;
      const pts = document.createElement('span');
      pts.textContent = c.alive ? `${c.laps} ${c.laps === 1 ? 'lap' : 'laps'}` : c.koReason ?? 'out';
      li.append(label, pts);
      list.append(li);
    });
    box.hidden = false;
    this.syncInert();
    this.el('again-btn').focus();
  }

  raceClock(seconds) {
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }

  hideTitle() {
    this.el('title').hidden = true;
    this.syncInert();
  }

  // While a poster is up, the board and controls behind it are out of the tab order.
  syncInert() {
    const open = !this.el('title').hidden || !this.el('finish').hidden;
    this.el('board').inert = open;
    this.el('controls').inert = open;
  }

  setActive(selector, attr, value) {
    document.querySelectorAll(selector).forEach((b) => {
      b.setAttribute('aria-pressed', String((b.dataset[attr] || '') === String(value ?? '')));
    });
  }
}
