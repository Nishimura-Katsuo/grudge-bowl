// Everyone on the County Fair's books. Temperament is fed to the brain as sensor
// input, so a single network drives all of them and only the temperament differs.
// Keep it inside the ranges below: the network was built and tested across them.

import { CAR_COUNT } from './config.js';
import { createRng } from './math.js';

export const TEMPER_RANGE = {
  aggression: [0.55, 1],
  nerve: [0.35, 1],
  vengeance: [0.3, 1],
};

export const ROSTER = [
  { name: 'KEVIN',          colour: 0xe8d6a8, temper: { aggression: 0.95, nerve: 0.35, vengeance: 1.0 } },
  { name: 'TETANUS',        colour: 0x9a4a21, temper: { aggression: 0.8, nerve: 0.8, vengeance: 0.55 } },
  { name: 'GRUDGE JUDY',    colour: 0xc4286a, temper: { aggression: 0.7, nerve: 0.6, vengeance: 1.0 } },
  { name: 'SCRAP DADDY',    colour: 0x2b6b4f, temper: { aggression: 0.9, nerve: 0.9, vengeance: 0.4 } },
  { name: 'OIL BARON',      colour: 0x20242e, temper: { aggression: 0.6, nerve: 0.95, vengeance: 0.7 } },
  { name: 'SGT. DENT',      colour: 0x57683a, temper: { aggression: 1.0, nerve: 0.7, vengeance: 0.6 } },
  { name: 'MRS. PISTON',    colour: 0xe6a117, temper: { aggression: 0.75, nerve: 0.5, vengeance: 0.85 } },
  { name: 'HEAD GASKET',    colour: 0x2a5fb8, temper: { aggression: 0.85, nerve: 0.65, vengeance: 0.75 } },
  { name: 'ROAD KAREN',     colour: 0xd8dde2, temper: { aggression: 0.65, nerve: 0.75, vengeance: 0.95 } },
  { name: 'MAD MUFFLER',    colour: 0xd03a1f, temper: { aggression: 1.0, nerve: 1.0, vengeance: 0.3 } },
  { name: "OL' SMOKEY",     colour: 0x6f6f72, temper: { aggression: 0.55, nerve: 0.55, vengeance: 0.65 } },
  { name: 'BAD NEIGHBOUR',  colour: 0x6c3fb0, temper: { aggression: 0.9, nerve: 0.45, vengeance: 0.9 } },
  { name: 'REV. LIMITER',   colour: 0x4a1f2e, temper: { aggression: 0.6, nerve: 0.7, vengeance: 0.8 } },
  { name: 'CRASH TEST DEREK', colour: 0xf2e01a, temper: { aggression: 0.85, nerve: 1.0, vengeance: 0.3 } },
  { name: 'THE LATE BARRY', colour: 0x3d3350, temper: { aggression: 0.55, nerve: 1.0, vengeance: 0.7 } },
  { name: 'ALAN IN ACCOUNTS', colour: 0x8c9ab0, temper: { aggression: 0.6, nerve: 0.4, vengeance: 1.0 } },
  { name: 'VLAD THE IMPOUNDER', colour: 0x7a0f1c, temper: { aggression: 0.9, nerve: 0.75, vengeance: 0.8 } },
  { name: 'NO BRAKES NIGEL', colour: 0xff6a00, temper: { aggression: 1.0, nerve: 0.95, vengeance: 0.35 } },
  { name: 'DISCOUNT DAVE',  colour: 0xf0409a, temper: { aggression: 0.7, nerve: 0.5, vengeance: 0.5 } },
  { name: 'SMUG HYBRID',    colour: 0x7fd6a0, temper: { aggression: 0.6, nerve: 0.6, vengeance: 0.85 } },
  { name: 'MASTER CYLINDER', colour: 0x1f8a8a, temper: { aggression: 0.55, nerve: 0.85, vengeance: 0.3 } },
  { name: 'GOOD BOY',       colour: 0xc08a48, temper: { aggression: 0.95, nerve: 0.9, vengeance: 0.3 } },
  { name: 'PARCEL PETE',    colour: 0x6b4a2b, temper: { aggression: 0.7, nerve: 0.8, vengeance: 0.45 } },
  { name: 'BINGO BEV',      colour: 0xe070e0, temper: { aggression: 0.75, nerve: 0.65, vengeance: 0.6 } },
  { name: 'CARAVAN CLIVE',  colour: 0xb8cc90, temper: { aggression: 0.55, nerve: 0.45, vengeance: 0.5 } },
  { name: 'L-PLATE LIZ',    colour: 0xfafaf0, temper: { aggression: 0.6, nerve: 0.35, vengeance: 0.4 } },
  { name: 'MINICAB MICK',   colour: 0x0f5c7a, temper: { aggression: 0.85, nerve: 0.7, vengeance: 0.7 } },
  { name: 'VANILLA VINCE',  colour: 0xf6b8c8, temper: { aggression: 0.7, nerve: 0.8, vengeance: 0.95 } },
  { name: 'JUST MARRIED',   colour: 0xa8d8ea, temper: { aggression: 0.8, nerve: 0.55, vengeance: 0.65 } },
  { name: 'ESTATE AGENT',   colour: 0x1e2f5c, temper: { aggression: 0.65, nerve: 0.5, vengeance: 0.75 } },
  { name: 'FLATPACK',       colour: 0x30a8f0, temper: { aggression: 0.75, nerve: 0.4, vengeance: 0.55 } },
  { name: 'DR. WHIPLASH',   colour: 0x20d0b8, temper: { aggression: 0.8, nerve: 0.6, vengeance: 0.6 } },
  { name: 'GREASY SPOON',   colour: 0x8f8020, temper: { aggression: 0.8, nerve: 0.7, vengeance: 0.5 } },
  { name: "LIL' LUGNUT",    colour: 0x9be22d, temper: { aggression: 1.0, nerve: 0.5, vengeance: 0.85 } },
  { name: 'HAZARD HAZEL',   colour: 0xf08048, temper: { aggression: 0.55, nerve: 0.4, vengeance: 0.7 } },
  { name: 'MR. CLIPBOARD',  colour: 0xa090d0, temper: { aggression: 0.6, nerve: 0.6, vengeance: 0.9 } },
];

// Who turns up for this race. Follows from the seed alone, with its own rng, so a
// race still replays from its seed and the draw costs the race none of its luck.
export function lineupFor(seed, count = CAR_COUNT) {
  const rng = createRng((seed ^ 0x5ca1ab1e) >>> 0);
  const deck = [...ROSTER];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (deck.length - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, count);
}
