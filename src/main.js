import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import '@fontsource/bowlby-one/400.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import './ui/style.css';

import { PHYSICS_DT } from './sim/config.js';
import { createWorld, stepWorld } from './sim/world.js';
import { lineupFor } from './sim/roster.js';
import { getTrack } from './sim/track.js';
import { createBrain } from './ai/index.js';
import { buildStage } from './render/stage.js';
import { createCarVisual, crumple, retireCarVisual, syncCarVisual } from './render/carModel.js';
import { Effects } from './render/effects.js';
import { ArsenalView } from './render/arsenalView.js';
import { Director } from './render/director.js';
import { Audio } from './render/audio.js';
import { WEAPONS } from './sim/arsenal.js';
import { Hud } from './ui/hud.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const FINISH_BEAT_SECONDS = 1.2;
const RESULTS_SECONDS = 22;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2000);

// Bloom blurs its input, so one bad pixel becomes a whole bad frame. Stop any
// NaN or infinity here, and keep the picture fully opaque.
const FiniteColour = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float sum = c.r + c.g + c.b;
      if (isnan(sum) || isinf(sum)) c = vec3(0.0);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass(FiniteColour));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.34, 0.65, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const track = getTrack();
let stage = null;
let effects = null;
let arsenalView = null;
const director = new Director(camera, track);
const audio = new Audio();

const state = {
  world: null,
  brains: [],
  visuals: [],
  seed: 1,
  accumulator: 0,
  speed: 1,
  paused: false,
  slowMo: 0,
  announcedFinish: false,
  lastCount: 4,
  retired: new Set(),
  running: false,
};

const HEARD_AT = 10; // metres out to which a hit plays at full level

const telemetryOf = (id) => state.brains[id]?.telemetry ?? null;

const hud = new Hud({
  start: () => {
    audio.start();
    hud.hideTitle();
    state.running = true;
    newRace();
  },
  shot: (s) => {
    director.setManual(s);
    hud.setActive('[data-shot]', 'shot', s);
  },
  speed: (v) => {
    state.speed = v;
    hud.setActive('[data-speed]', 'speed', v);
  },
  follow: (id) => director.follow(id),
  toggleMute: () => toggleMute(),
  togglePause: () => togglePause(),
});

function setPaused(paused) {
  state.paused = paused;
  document.getElementById('pause-btn').textContent = paused ? 'Resume' : 'Pause';
}

function togglePause() {
  setPaused(!state.paused);
}

function toggleMute() {
  audio.setMuted(!audio.muted);
  document.getElementById('mute-btn').textContent = audio.muted ? 'Unmute' : 'Mute';
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(Math.round(w / 2), Math.round(h / 2));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  effects?.setViewport(h * renderer.getPixelRatio(), camera.fov);
}
window.addEventListener('resize', resize);

function clearVisuals() {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const v of state.visuals) {
    scene.remove(v.root);
    v.root.traverse((o) => {
      if (!o.isMesh) return;
      geometries.add(o.geometry);
      materials.add(o.material);
      if (o.material.map) textures.add(o.material.map);
    });
  }
  for (const set of [geometries, materials, textures]) {
    for (const item of set) item.dispose();
  }
  state.visuals = [];
}

function newRace() {
  clearTimeout(state.finishTimer);
  arsenalView.reset(); // first: its blades are parented to the car visuals
  clearVisuals();
  effects.reset();
  director.endFeature();
  state.scene = null;
  setPaused(false);
  state.seed = (Math.random() * 1e9) | 0;
  state.brains = [];
  const world = createWorld({
    seed: state.seed,
    lineup: lineupFor(state.seed),
    brainFactory: (car) => {
      const brain = createBrain(car);
      state.brains[car.id] = brain;
      return brain;
    },
  });
  state.world = world;
  state.visuals = world.cars.map((car) => {
    const v = createCarVisual(car);
    scene.add(v.root);
    return v;
  });
  state.accumulator = 0;
  state.announcedFinish = false;
  state.lastCount = 4;
  state.retired = new Set();
  state.slowMo = 0;
  hud.build(world);
  director.cut(director.manualShot ?? 'chase', 0, -1);
  director.followHold = 0;
}

const pt = new THREE.Vector3();
const nv = new THREE.Vector3();

function handleEvent(e, world) {
  const heard = (x, z) => {
    const dx = x - camera.position.x, dz = z - camera.position.z;
    const d = Math.hypot(dx, dz);
    const right = camera.matrixWorld.elements;
    // Sound in the open: half as loud for each doubling of distance. Close hits sit
    // over the music and far ones drop under it.
    return { near: Math.min(1, HEARD_AT / d), pan: d > 1 ? (dx * right[0] + dz * right[2]) / d * 0.8 : 0 };
  };
  switch (e.type) {
    case 'hit': {
      const a = world.cars[e.a], b = world.cars[e.b];
      effects.impact(e.x, e.y, e.z, e.nx, e.nz, e.strength, a.colour, b.colour);
      pt.set(e.x, e.y, e.z);
      nv.set(-e.nx, -e.ny, -e.nz).negate();
      crumple(state.visuals[e.a], pt, nv, Math.min(1, e.dmgA * 5 + e.strength * 0.3));
      nv.negate();
      crumple(state.visuals[e.b], pt, nv, Math.min(1, e.dmgB * 5 + e.strength * 0.3));
      audio.crunch(e.strength, heard(e.x, e.z));
      const inFrame = e.a === director.subject || e.b === director.subject;
      if (e.upper >= 0 && state.slowMo <= 0 && inFrame) state.slowMo = 1.1;
      if (e.strength > 0.62 && inFrame && state.slowMo <= 0) state.slowMo = 0.9;
      break;
    }
    case 'wall': {
      const c = world.cars[e.car];
      effects.impact(e.x, e.y, e.z, e.nx, e.nz, e.strength * 0.7, c.colour, 0x8a7a68);
      pt.set(e.x, e.y, e.z);
      nv.set(e.nx, 0, e.nz);
      crumple(state.visuals[e.car], pt, nv, Math.min(1, e.strength * 0.7));
      audio.fence(e.strength * 0.7, heard(e.x, e.z));
      break;
    }
    case 'scrape':
      for (let i = 0; i < 4; i++) {
        effects.sparks.spawn(e.x, e.y + 0.04, e.z, Math.random() * 6 - 3, Math.random() * 4, Math.random() * 6 - 3, 0.3);
      }
      audio.scrape(e.speed, heard(e.x, e.z));
      break;
    case 'wheelOff': {
      const c = world.cars[e.car];
      effects.wheelOff(e.x, e.y, e.z, c.vx, c.vz);
      break;
    }
    case 'ko': {
      const c = world.cars[e.car];
      effects.explosion(e.x, e.y, e.z, c.colour);
      director.shake(1.0);
      audio.ko(heard(e.x, e.z));
      if (!state.retired.has(e.car)) {
        state.retired.add(e.car);
        retireCarVisual(state.visuals[e.car]);
      }
      break;
    }
    case 'jump':
      audio.cheer(0.3);
      break;
    case 'landing':
      effects.landing(e.x, e.y, e.z, e.drop);
      audio.landing(Math.min(1, e.drop * 0.1), heard(e.x, e.z));
      break;
    case 'towed':
      effects.towed(e.x, e.y, e.z);
      state.visuals[e.car].root.visible = false;
      break;
    case 'pickup':
      effects.crateBurst(e.x, e.y, e.z);
      audio.pickup(heard(e.x, e.z));
      break;
    case 'fired': {
      const key = WEAPONS[e.weapon].key;
      audio.fired(key, heard(e.x, e.z));
      if (key === 'foghorn') arsenalView.horn(e.x, e.y, e.z);
      break;
    }
    case 'blast':
      effects.blast(e.x, e.y, e.z, e.radius);
      audio.boom(heard(e.x, e.z));
      break;
    case 'hooked':
      audio.hooked(heard(e.x, e.z));
      break;
    case 'sprung':
      effects.landing(e.x, e.y, e.z, 6);
      audio.boing(heard(e.x, e.z));
      break;
    case 'slapped':
      effects.impact(e.x, e.y + 1, e.z, 0, 0, e.final ? 1 : 0.6, 0xf3e2bd, 0xd9a27e);
      effects.landing(e.x, e.y, e.z, e.final ? 9 : 5);
      audio.slap(e.final, heard(e.x, e.z));
      break;
    case 'cut':
      effects.impact(e.x, e.y, e.z, 0, 0, 0.45, 0x9aa0a6, 0x9aa0a6);
      audio.cut(heard(e.x, e.z));
      break;
    case 'pianoLands':
      effects.pianoKeys(e.x, e.y, e.z);
      audio.pianoCrash(heard(e.x, e.z));
      break;
    case 'go':
      hud.announce('Go', 900);
      break;
    case 'finish':
      audio.cheer(1);
      break;
    default:
      break;
  }
  hud.onEvent(e, world);
  director.onEvent(e, world);
}

// A beat on the finish, the winner's scene, then straight into the next race.
function runScene(scene, world, dt) {
  if (scene.beat > 0) {
    scene.beat -= dt;
    return;
  }
  if (!scene.shown) {
    scene.shown = true;
    director.feature(world.winner);
    hud.setNextRace(Math.ceil(scene.left));
    hud.showFinish(world);
    audio.cheer(1);
  }
  scene.left -= dt;
  if (scene.left <= 0) {
    newRace();
    return;
  }
  hud.setNextRace(Math.ceil(scene.left));
  const winner = world.cars[world.winner];
  scene.confetti -= dt;
  if (winner && scene.confetti <= 0) {
    scene.confetti = 0.22;
    effects.confetti(winner.px, winner.py, winner.pz);
  }
}

let last = performance.now();
let hudClock = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const world = state.world;

  if (world) {
    let scale = state.paused ? 0 : state.speed;
    if (state.slowMo > 0 && !state.paused) {
      state.slowMo -= realDt;
      scale *= 0.28;
    }
    state.accumulator += realDt * scale;
    let steps = 0;
    while (state.accumulator >= PHYSICS_DT && steps < 40) {
      stepWorld(world);
      state.accumulator -= PHYSICS_DT;
      steps++;
    }
    if (steps >= 40) state.accumulator = 0;
    const alpha = state.accumulator / PHYSICS_DT;

    for (const e of world.events) handleEvent(e, world);
    world.events.length = 0;

    const fxDt = realDt * (scale === 0 ? 0 : Math.max(scale, 0.1));
    for (const car of world.cars) {
      if (car.towed) continue;
      syncCarVisual(state.visuals[car.id], car, alpha, telemetryOf(car.id), now / 1000);
      if (scale > 0) effects.carFrame(car, fxDt);
    }
    if (world.phase === 'countdown' && state.running) {
      const c = Math.ceil(3 - world.time);
      if (c !== state.lastCount && c > 0) {
        state.lastCount = c;
        hud.announce(String(c), 800);
      }
    }
    arsenalView.sync(world, state.visuals, fxDt, now / 1000);
    effects.update(fxDt);
    const camPos = director.update(realDt, world, state.visuals, telemetryOf);
    stage.update(state.visuals[director.subject].root.position);
    effects.setViewport(window.innerHeight * renderer.getPixelRatio(), camera.fov);

    const subj = world.cars[director.subject];
    const dist = camPos.distanceTo(state.visuals[director.subject].root.position);
    const nearness = Math.max(0.1, 1 - dist / 70);
    const rearSlide = Math.max(subj.wheels[2].slide, subj.wheels[3].slide);
    audio.setEngine(subj.rpm, subj.input.throttle, rearSlide, subj.alive ? nearness : 0, Math.hypot(subj.vx, subj.vz));

    hudClock -= realDt;
    if (hudClock <= 0) {
      hudClock = 0.1;
      hud.update(world, telemetryOf, director.subject);
    }
    if (world.phase === 'finished' && !state.announcedFinish) {
      state.announcedFinish = true;
      if (state.running) {
        state.scene = { beat: FINISH_BEAT_SECONDS, left: RESULTS_SECONDS, shown: false, confetti: 0 };
      } else {
        // Behind the title card the races just keep coming.
        state.finishTimer = setTimeout(() => {
          if (state.world === world) newRace();
        }, 4000);
      }
    }
    if (state.scene && !state.paused) runScene(state.scene, world, realDt);
  }
  composer.render(realDt);
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLButtonElement && e.key === ' ') return;
  const shots = { 1: 'chase', 2: 'bumper', 3: 'trackside', 4: 'drone', 5: 'tower', 6: 'heli' };
  if (shots[e.key]) {
    director.setManual(shots[e.key]);
    hud.setActive('[data-shot]', 'shot', shots[e.key]);
  } else if (e.key === 'a' || e.key === 'A' || e.key === '0') {
    director.setManual(null);
    hud.setActive('[data-shot]', 'shot', null);
  } else if (e.key === ' ') {
    e.preventDefault();
    togglePause();
  } else if (e.key === 'm' || e.key === 'M') {
    toggleMute();
  } else if ((e.key === '[' || e.key === ']') && state.world) {
    const n = state.world.cars.length;
    director.follow((director.subject + (e.key === ']' ? 1 : n - 1)) % n);
  }
});

let dragging = false;
canvas.addEventListener('pointerdown', () => { dragging = true; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  director.userYaw += e.movementX * 0.005;
  director.userPitch = Math.max(-0.5, Math.min(2, director.userPitch - e.movementY * 0.005));
});

async function boot() {
  try {
    await document.fonts.load("40px 'Bowlby One'");
  } catch {
    // Signs fall back to the system stack; the race still runs.
  }
  stage = buildStage(scene, track);
  effects = new Effects(scene, track, renderer);
  arsenalView = new ArsenalView(scene, track, effects);
  resize();
  newRace();
  director.cut('heli', 0, -1);
  requestAnimationFrame(frame);
  document.body.classList.add('ready');
  document.getElementById('start-btn').focus();
}
boot();

window.__grudge = { state, director, audio, get world() { return state.world; }, renderer };
