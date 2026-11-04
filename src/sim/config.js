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
  steerRate: 3.4, // rad/s at the road wheels
  dragArea: 0.56, // 0.5 * rho * Cd * A
  rollingResistance: 0.016,
  brakeTorqueFront: 2300,
  brakeTorqueRear: 1500,
  handbrakeTorque: 4200,
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
  lowSpeedFloor: 2.0, // m/s, slip denominator floor
};

export const ENGINE = {
  idleRpm: 900,
  limitRpm: 6100,
  stallRpm: 1900, // torque converter flash speed at light throttle
  peakTorque: 520,
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
  { name: 'clay', grip: 1.0, drag: 0.012, dust: 1 },
  { name: 'asphalt', grip: 1.14, drag: 0.0, dust: 0 },
  { name: 'mud', grip: 0.62, drag: 0.075, dust: 0.4 },
];

export const CONTACT = {
  carRestitution: 0.14,
  carFriction: 0.42,
  carContactLever: 0.3,
  wallRestitution: 0.2,
  wallFriction: 0.34,
  groundRestitution: 0.1,
  groundFriction: 0.3, // steel on road. Any higher and a car beached on a jump can't drive off
  positionCorrection: 0.35,
  maxCorrectionPerStep: 0.06,
  solverIterations: 3,
};

export const DAMAGE = {
  deltaVThreshold: 1.2, // m/s absorbed per step before metal starts to complain
  exponent: 1.3,
  scale: 0.011,
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
  laps: 3,
  timeLimit: 210,
  stalledKoSeconds: 12, // no route gained for this long and the marshals wave you off
  flippedKoSeconds: 4.5,
  wreckTowSeconds: 7, // wrecks stay on the road this long, then the tractor has them
  points: { damagePerUnit: 700, knockout: 300 },
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
    { name: 'Hump', pass: 1, lipOffset: 253, ramp: 18, fall: 11, height: 1.75, airLength: 20, maxSpeed: 22 },
    // Comes down on the third crossroads, into whoever is crossing it.
    { name: 'Dropkick', pass: 2, lipOffset: -25, ramp: 18, fall: 11, height: 1.75, airLength: 26, maxSpeed: 29 },
    // Comes down braking for the hairpin, so the next car lands on the last one.
    { name: 'Pancake', pass: 5, lipOffset: 40, ramp: 18, fall: 11, height: 1.75, airLength: 24, maxSpeed: 31 },
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

// Painted start/finish line: laps count from here, for every grid slot.
export const START_LINE_S = 52;

export const CAR_COUNT = 12;
