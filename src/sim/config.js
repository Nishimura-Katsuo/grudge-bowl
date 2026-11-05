// Every tunable constant in the simulation. Units are SI unless noted.

export const PHYSICS_HZ = 240;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
export const DECISION_HZ = 30;
export const STEPS_PER_DECISION = Math.round(PHYSICS_HZ / DECISION_HZ);
export const GRAVITY = 9.81;

export const CAR = {
  mass: 1550,
  inertia: { roll: 620, yaw: 2900, pitch: 2900 },
  // Collision box, relative to the centre of gravity.
  box: { halfLength: 2.45, halfHeight: 0.58, halfWidth: 1.0, centreY: 0.06 },
  wheelFrontX: 1.45,
  wheelRearX: -1.4,
  wheelZ: 0.86,
  hardpointY: -0.04,
  wheelRadius: 0.36,
  wheelInertia: 1.3,
  suspRestLength: 0.35,
  suspTravel: 0.3,
  suspStiffness: 30000,
  suspDampCompress: 3000,
  suspDampRebound: 3800,
  bumpStopStiffness: 150000,
  antiRollFront: 9000,
  antiRollRear: 5000,
  maxSteer: 0.6,
  steerRate: 6.2, // rad/s at the road wheels
  dragArea: 0.56, // 0.5 * rho * Cd * A
  rollingResistance: 0.016,
  brakeTorqueFront: 5600,
  brakeTorqueRear: 3600,
  handbrakeTorque: 9200,
};

export const TIRE = {
  peakSlipRatio: 0.12,
  peakSlipTan: 0.158, // tan(9 deg)
  shapeB: 1.73,
  shapeC: 1.5,
  frontGrip: 1.08,
  rearGrip: 1.05,
  loadReference: 3800,
  loadSensitivity: 0.09, // grip lost per unit of extra relative load
  // Share of the height of a tyre's contact patch that its road forces lever the
  // body through. These cars corner past 2 g, which would tip a real one over.
  forceLever: 0.4,
  lowSpeedFloor: 2.0, // m/s, slip denominator floor
};

export const ENGINE = {
  idleRpm: 900,
  limitRpm: 6100,
  stallRpm: 1900, // torque converter flash speed at light throttle
  peakTorque: 1350,
  converterBoost: 1.15,
  gears: [1.55, 1.25, 1.02, 0.85],
  reverseGear: 2.0,
  finalDrive: 3.4,
  upshiftRpm: 5300,
  downshiftRpm: 2300,
  shiftTime: 0.14,
  lsdLock: 90, // N*m per rad/s across the rear axle
  lsdMaxTorque: 900,
};

export const SURFACE = {
  CLAY: 0,
  ASPHALT: 1,
  MUD: 2,
};

export const SURFACE_PROPS = [
  { name: 'clay', grip: 2.3, drag: 0.012, dust: 1 },
  { name: 'asphalt', grip: 2.6, drag: 0.0, dust: 0 },
  { name: 'mud', grip: 1.77, drag: 0.03, dust: 0.4 },
];

export const CONTACT = {
  carRestitution: 0.14,
  carFriction: 0.42,
  carContactLever: 0.3,
  wallContactLever: 0.12,
  wallRestitution: 0.2,
  wallFriction: 0.34,
  groundRestitution: 0.1,
  groundFriction: 0.3, // steel on road. Any higher and a car beached on a jump can't drive off
  positionCorrection: 0.35,
  maxCorrectionPerStep: 0.06,
  solverIterations: 3,
};

export const DAMAGE = {
  deltaVThreshold: 2, // m/s absorbed per step before metal starts to complain
  exponent: 1.3,
  scale: 0.00464,
  zoneMultiplier: { front: 0.5, side: 1.2, rear: 0.85 },
  wallMultiplier: 0.42,
  wheelHitScale: 1.5,
  flatTireAt: 0.45,
  // A hit only credits the attacker when they brought at least this share of
  // the closing speed. Below it the hit counts as mutual.
  attackerShare: 0.5,
  lastHitterWindow: 6,
};

export const RULES = {
  countdown: 3,
  laps: 5,
  timeLimit: 200,
  stalledKoSeconds: 12, // no route gained for this long and the marshals wave you off
  flippedKoSeconds: 4.5,
  wreckTowSeconds: 7, // wrecks stay on the road this long, then the tractor has them
  points: { damagePerUnit: 700, knockout: 300 },
};

export const ARSENAL = {
  crateReach: 3.3,
  crateHeight: 2.6, // a car this far above or below a crate passes it by
  crateRespawn: 4,
  fireLock: 0.5, // seconds before a fresh pickup can be used
  rocket: { speed: 92, life: 1.6, hitReach: 2.3, radius: 7, push: 13, lift: 3.5, spin: 2, damage: 0.112 },
  seeker: { speed: 66, life: 4, turn: 4.4, reach: 110, dive: 26, cruise: 6, hitReach: 2.4, radius: 6, push: 10, lift: 4.5, spin: 2.5, damage: 0.096 },
  mine: { radius: 3.4, life: 26, arm: 0.7, push: 4, lift: 8, spin: 1.5, damage: 0.088 },
  oil: { radius: 6, life: 13, grip: 0.2 },
  smoke: { radius: 12, life: 8 },
  whirl: { seconds: 1.3, turns: 2, grip: 0.14, reach: 4, height: 2.4, push: 11, lift: 2.5, damage: 0.072, cutEvery: 0.04, rehit: 0.45 },
  hook: { speed: 130, life: 0.9, reach: 70, hitReach: 2.5, reel: 1.5, snug: 5.5, snap: 95, pullOwner: 30, pullVictim: 13, damage: 0.016 },
  spring: { radius: 2.8, life: 24, arm: 0.5, launch: 13 },
  bull: { speed: 82, life: 10, hitReach: 3, height: 2.6, gore: 12, goreLift: 5, goreDamage: 0.056, radius: 6, push: 14, lift: 6, spin: 3, damage: 0.136 },
  piano: { fall: 1.7, radius: 5, push: 6, lift: -6, spin: 2, damage: 0.24 },
  horn: { radius: 18, push: 15, lift: 3 },
};

// The Knot. Jumps and pinches hang off crossroads passes, numbered in route
// order from the start of the lap, so they stay put if the layout changes.
export const TRACK = {
  halfWidth: 9,
  lineMargin: 2.6,
  paceGrip: 0.95, // share of the available grip the pace notes spend
  paceBrake: 0.8, // share of that they spend on braking
  topSpeed: 58,
  bankPerCurvature: 3.4,
  maxBank: 0.1,
  flatAroundCrossing: 40,
  rampCurveShare: 0.45,
  tarmacCurvature: 0.009,
  jumps: [
    // Out of the Scrapyard hairpin, where exit speeds differ most: the quick car
    // flies further and comes down on the slow one.
    { name: 'Hump', pass: 1, lipOffset: 272, ramp: 18, fall: 11, height: 1.75, airLength: 20, maxSpeed: 27 },
    // Comes down on the third crossroads, into whoever is crossing it.
    { name: 'Dropkick', pass: 2, lipOffset: -25, ramp: 18, fall: 11, height: 1.75, airLength: 28, maxSpeed: 31 },
    // Comes down braking for the hairpin, so the next car lands on the last one.
    { name: 'Pancake', pass: 5, lipOffset: 40, ramp: 18, fall: 11, height: 1.75, airLength: 46, maxSpeed: 42 },
  ],
  crates: [
    { pass: 1, offset: 20 },
    { pass: 1, offset: 130 },
    { pass: 3, offset: 30 },
    { pass: 3, offset: 165 },
    { pass: 4, offset: -30 },
    { pass: 5, offset: 190 },
  ],
  widthZones: [
    { pass: 5, offset: 42, halfWidth: 6.4, span: 34 }, // funnels traffic into one lane over the Pancake
    { pass: 5, offset: 118, halfWidth: 7.4, span: 42 }, // the Pancake hairpin
    { pass: 1, offset: 212, halfWidth: 7.8, span: 34 }, // Scrapyard hairpin
    { pass: 3, offset: 130, halfWidth: 7.6, span: 26 }, // the Neck, over the top
  ],
  mud: [
    { pass: 1, offset: 236, side: -5, r: 8 },
    { pass: 3, offset: 128, side: 4, r: 7 },
    { pass: 5, offset: 150, side: 5, r: 8 },
  ],
};

// Painted finish line on the back straight, ahead of the grid, so the first lap is
// short and five laps fit the race clock. Laps count from here, for every grid slot.
export const FINISH_LINE_S = 1030;
// Painted start line, level with the front row of the grid.
export const GRID_LINE_S = 52;

export const CAR_COUNT = 12;
