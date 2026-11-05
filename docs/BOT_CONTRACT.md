# Bot brain contract

The boundary between the game (`src/sim`, `src/render`, `src/ui`) and the bot brain (`src/ai`).

## Interface

`src/ai/index.js` must export:

```js
createBrain(car) // car: the sim car object; read only car.id and car.temper
  -> {
       act(obs),   // obs: Float32Array(OBS.size). Returns an indexable [steer, throttle, brake, handbrake, reverse]
       telemetry,  // plain object updated by act(), for the spectator UI only
     }
```

`src/sim/world.js` calls `act` at 30 Hz (`DECISION_HZ`) for each living car. Physics runs at 240 Hz; the action is held between decisions.

## Actions

| index | name | range | meaning |
|---|---|---|---|
| 0 | steer | -1..1 | + is right. Rate limited by a physical actuator (`steerRate`). |
| 1 | throttle | 0..1 | Engine torque request. In reverse gear it drives backwards. |
| 2 | brake | 0..1 | All four wheels. |
| 3 | handbrake | 0..1 | Locks the rears, and above 0.5 also disconnects drive. Provokes drift entry. |
| 4 | reverse | 0..1 | Above 0.5 selects reverse once forward speed < 2 m/s. Below 0.5 selects drive once speed > -2 m/s. |
| 5 | fire | 0..1 | Above 0.5 uses the held weapon, if it can be used. A brain that returns five actions simply never fires. |

The world forces full brake and no throttle during the 3 s countdown (`ego.raceActive` is 0).

## Observations

`OBS` in `src/sim/sensors.js` holds the layout: `OBS.names[i]`, `OBS.index['ego.speedFwd']`, `OBS.size`. Field comments there define units and signs. Groups:

- `ego.*`: own dynamics, damage, temperament, plus the race picture: `pace`, `lineOffset`, `halfWidth`, `toCrossing`, `toJump`, `racePosition`, `raceDone`, `stallTimer`.
- `look0..4.*`: points on the racing line 8, 16, 28, 45 and 65 m ahead in the car's own frame, with the line's curvature and the pace-note speed there.
- `ray0..13`: distance to walls (0 touching, 1 at 45 m or beyond). Angles are in `RAY_ANGLES_DEG`. Crossroads open gaps in the walls, so side rays read long there.
- `opp0..10.*`: one fixed slot per rival, stable for the whole race. `alive` 0 with `solid` 1 is a wreck on the road. `solid` 0 means it has been towed, and every field in the slot reads 0. `hitMe` and `iHit` report per-rival hits for that decision tick. `trackGap` is route distance on the loop, `raceGap` is race distance including laps, so a backmarker can be close on the road and laps behind. `toMyCrossing` is how far they are from arriving at my next crossroads along the other strand.

- `arms.*`: appended after the rivals, so every field above keeps its index. One flag per weapon, plus the situation around the car. See Weapons below.

### Pace notes

`ego.pace` is computed in `src/sim/track.js` by a backward pass over the racing line. It is the speed that still makes everything ahead, including the corners after a jump, because it allows no braking in the air. Holding it needs no prediction: full throttle below it, brake above it. Spending all of it is on the edge of grip, and the pace has margin for neither traffic nor damage.

## Rules that shape behaviour

Defined in `src/sim/world.js` and `src/sim/config.js`:

- 12 cars, 5 laps of the 1152 m Knot. First car to complete the distance wins and ends the race. Everyone is ranked by distance covered, running cars ahead of wrecks. 200 s is a backstop, and last car running also wins.
- Knockouts: health reaches 0, three or more wheels lost, on the roof or side for 4.5 s, or 12 s without gaining 4 m of route (`ego.stallTimer` reaches 1, "stalled out"). There is no hit-or-quit rule.
- Wrecks stay solid for 7 s, then they are towed and disappear.
- Laps count from the painted line at `FINISH_LINE_S`. A car knocked onto the wrong strand of a crossroads always loses ground: skipping ahead counts as owing the rest of the lap, so a shortcut can never pay.
- Score is now only a brawling statistic: 700 × damage dealt, 300 per KO. It does not decide the race.
- Damage is the velocity change absorbed above 2 m/s per step, so glancing contact costs nothing and a T-bone is expensive. Front contact takes 0.5×, sides 1.2×, rear 0.85×.
- A hit is credited to a car only if it brought at least half of the closing speed.
- Damage reduces engine power, reduces steering lock, bends the alignment and can remove wheels.
- `hit` events carry `upper`, the id of a car coming down on the other, or -1.

## Weapons

Defined in `src/sim/arsenal.js`, numbers in `ARSENAL` in `src/sim/config.js`. Six spots round the lap have three crates across the road. Driving through a live crate gives a random weapon, weighted by race position, unless the car already holds one. Crates return after 4 s. A car collects within 3.3 m. A new weapon can be used after 0.5 s. A car holds one weapon. Using it clears the slot.

| `arms.` flag | Name | Use it when | What it does |
|---|---|---|---|
| `barnBurner` | Barn Burner | A rival is in `aheadRange`, within about 45 m | Straight rocket along the nose. Blast radius 7 m. |
| `grudgeSeeker` | Grudge Seeker | Any time | Homes on whoever hit you last, else a rival ahead, else the next car up. Climbs, then dives. |
| `welcomeMat` | Welcome Mat | Rival behind (`behindRange`) | Mine dropped 4.5 m behind. Arms in 0.7 s. Launches and hurts whoever touches it, including you. |
| `oilSlick` | Oil Slick | Rival behind | 6 m patch for 13 s. Tyres on it keep 20% of their grip. |
| `smokeBomb` | Smoke Bomb | Rival behind | 12 m cloud for 8 s. See below. |
| `threshingWhirl` | Threshing Whirl | `closeRivals` above 0 | 1.3 s, two full spins. The car keeps its direction of travel with almost no tyre grip, finishes facing where it started, and cuts everything within 4 m. Steering does nothing during it. |
| `repoHook` | Repo Hook | Rival 10 to 60 m ahead | Harpoon. If it hits, the two cars are reeled together for 1.5 s, mostly by pulling you forward. Only cars in the back half of the field find it. |
| `bedspring` | Bedspring | Rival behind | Trap dropped behind. Fires the next car over it straight up, no damage. |
| `prizeBull` | Prize Bull | Any time | Charges along the road at 82 m/s after the race leader, goring what it meets. Only cars in the back half find it. |
| `grandPiano` | Grand Piano | Any time | Lands 1.7 s later where the next car up is heading. |
| `foghorn` | Foghorn | `closeRivals` above 0, or `incoming` high | Shoves everything within 18 m, swats rockets, harpoons and missiles out of the air. No damage. Does not move you. |

Sensors:

- `arms.ready` is 1 when firing would do something. Fire below 1 does nothing, so it is safe to hold fire high.
- `arms.incoming` rises as a shot aimed at you closes, and reads 0.5 while a piano falls on you.
- `arms.toCrate`, `arms.crateRight` point at the nearest live crate on the next spot. The three crates span the road, but the car in front usually takes the one on your line, so it pays to move across to `crateRight`.
- `arms.toHazard`, `arms.hazardRight` give the nearest armed mine, oil or spring in your road. Mines and oil are worth dodging. Springs are funny.
- `arms.aheadRange`, `arms.aheadBearing`, `arms.behindRange`, `arms.closeRivals` are the firing picture. The first three skip anything smoke hides. `closeRivals` does not: you can hear them.
- Smoke: inside a cloud `arms.blinded` is 1. Any rival inside a cloud, behind one, or anywhere at all while you are blinded reads as absent: its whole `opp` slot reads 0, like a towed car. The road sensors keep working, so a bot in smoke still knows the way, it just can't see who it's about to hit.
- `arms.oiled` is 1 while on oil, and `arms.whirling` during your own whirl.

Hits from weapons are credited like car hits, so a weapon kill counts and sets `lastHitter`, which drives the Grudge Seeker. Events: `pickup`, `fired`, `blast`, `hooked`, `sprung`, `gored`, `cut`, `pianoLands`.

## The Knot

Three at-grade crossroads at 60 degrees, each passed twice a lap, so a car meets cross traffic six times. Passes are at about s = 79, 129, 466, 516, 799, 850 (`track.passes`). All corners are right-handers.

- **Hump** (lip about s = 401): straight out of the Scrapyard hairpin, where exit speeds differ most, so a quick car can come down on a slow one.
- **Dropkick** (lip about s = 441): a 24 to 31 m/s take-off lands on the third crossroads.
- **Pancake** (lip about s = 890): the road funnels to about 6.4 m half width over the lip, then lands into the braking zone for the tightest hairpin on the track, so a following car can land on the one in front.
- Flight is 0.5 to 1.3 s and 10 to 56 m, roughly proportional to speed. There is no steering or braking in the air. Aim before the lip.
- Each jump has a `maxSpeed` (Hump 27, Dropkick 31, Pancake 42 m/s) that the pace notes hold cars to. Those are real limits on the first two: a clean car rolls over at about 34 m/s on either. Pancake is stable to 50.
- Half width is 9 m, pinched to about 7.5 m at the two hairpins and the top of the north loop, and to 6.4 m at the Pancake funnel.
- Tarmac on the straights and crossroads, clay through the corners, and mud patches near the hairpins. The racing line crosses some of the mud, and the pace notes allow for it.

## Vehicle facts

1550 kg RWD race car in ordinary gravity. 1350 N·m, 0-100 km/h in about 2.2 s, 58 m/s pace-note ceiling. Clay grip 2.3, asphalt 2.6, mud 1.77, so about 2 g in corners, and tyre forces act through a reduced lever (`TIRE.forceLever`) so cars don't tip. Brakes and steering rate are scaled to match. Rear tyres have slightly less grip than the fronts, and sliding friction falls to about 72 percent of peak, so throttle still needs managing out of slow corners.

Gravity is real, so air time and flight arcs are unchanged, while cars arrive at jumps faster than a jump can safely take. The caps in the pace notes matter: Hump 27, Dropkick 31, Pancake 42 m/s. A clean car rolls over on the Hump above about 34 and on Dropkick above about 34.

A plain pure-pursuit driver holding 80% of pace with no traffic laps in 38.5 s, and the pace notes themselves add up to about 30.5 s (`test/helpers/testDriver.js`).
