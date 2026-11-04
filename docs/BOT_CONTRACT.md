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

The world forces full brake and no throttle during the 3 s countdown (`ego.raceActive` is 0).

## Observations

`OBS` in `src/sim/sensors.js` holds the layout: `OBS.names[i]`, `OBS.index['ego.speedFwd']`, `OBS.size`. Field comments there define units and signs. Groups:

- `ego.*`: own dynamics, damage, temperament, plus the race picture: `pace`, `lineOffset`, `halfWidth`, `toCrossing`, `toJump`, `racePosition`, `raceDone`, `stallTimer`.
- `look0..4.*`: points on the racing line 8, 16, 28, 45 and 65 m ahead in the car's own frame, with the line's curvature and the pace-note speed there.
- `ray0..13`: distance to walls (0 touching, 1 at 45 m or beyond). Angles are in `RAY_ANGLES_DEG`. Crossroads open gaps in the walls, so side rays read long there.
- `opp0..10.*`: one fixed slot per rival, stable for the whole race. `alive` 0 with `solid` 1 is a wreck on the road. `solid` 0 means it has been towed, and every field in the slot reads 0. `hitMe` and `iHit` report per-rival hits for that decision tick. `trackGap` is route distance on the loop, `raceGap` is race distance including laps, so a backmarker can be close on the road and laps behind. `toMyCrossing` is how far they are from arriving at my next crossroads along the other strand.

### Pace notes

`ego.pace` is computed in `src/sim/track.js` by a backward pass over the racing line. It is the speed that still makes everything ahead, including the corners after a jump, because it allows no braking in the air. Holding it needs no prediction: full throttle below it, brake above it. Spending all of it is on the edge of grip, and the pace has margin for neither traffic nor damage.

## Rules that shape behaviour

Defined in `src/sim/world.js` and `src/sim/config.js`:

- 12 cars, 3 laps of the 1152 m Knot. First car to complete the distance wins and ends the race. Everyone is ranked by distance covered, running cars ahead of wrecks. 210 s is a backstop, and last car running also wins.
- Knockouts: health reaches 0, three or more wheels lost, on the roof or side for 4.5 s, or 12 s without gaining 4 m of route (`ego.stallTimer` reaches 1, "stalled out"). There is no hit-or-quit rule.
- Wrecks stay solid for 7 s, then they are towed and disappear.
- Laps count from the painted line at `START_LINE_S`. A car knocked onto the wrong strand of a crossroads always loses ground: skipping ahead counts as owing the rest of the lap, so a shortcut can never pay.
- Score is now only a brawling statistic: 700 × damage dealt, 300 per KO. It does not decide the race.
- Damage is the velocity change absorbed above 1.2 m/s per step, so glancing contact costs nothing and a T-bone is expensive. Front contact takes 0.5×, sides 1.2×, rear 0.85×.
- A hit is credited to a car only if it brought at least half of the closing speed.
- Damage reduces engine power, reduces steering lock, bends the alignment and can remove wheels.
- `hit` events carry `upper`, the id of a car coming down on the other, or -1.

## The Knot

Three at-grade crossroads at 60 degrees, each passed twice a lap, so a car meets cross traffic six times. Passes are at about s = 79, 129, 466, 516, 799, 850 (`track.passes`). All corners are right-handers.

- **Hump** (lip about s = 382): straight out of the Scrapyard hairpin, where exit speeds differ most, so a quick car can come down on a slow one.
- **Dropkick** (lip about s = 441): a 24 to 28 m/s take-off lands on the third crossroads.
- **Pancake** (lip about s = 890): the road funnels to about 6.4 m half width over the lip, then lands into the braking zone for the tightest hairpin on the track, so a following car can land on the one in front.
- Flight is 0.5 to 1 s and 10 to 31 m, roughly proportional to speed. There is no steering or braking in the air. Aim before the lip.
- Each jump has a `maxSpeed` (Hump 22, Dropkick 29, Pancake 31 m/s) that the pace notes hold cars to. Those are real limits: a clean car goes over at about 24 m/s on the Hump and 33 m/s on Dropkick. Pancake is stable past 32.
- Half width is 9 m, pinched to about 7.5 m at the two hairpins and the top of the north loop, and to 6.4 m at the Pancake funnel.
- Tarmac on the straights and crossroads, clay through the corners, and mud patches near the hairpins. The racing line crosses some of the mud, and the pace notes allow for it.

## Vehicle facts

1550 kg RWD. 520 N·m, tall gears, around 4.5 m/s² traction-limited out of slow corners, about 35 m/s reached on the straights of this track. Clay grip 1.0, asphalt 1.14, mud 0.62. Rear tyres have slightly less grip than the fronts, and sliding friction falls to about 72 percent of peak, so full throttle with steering lock on clay will still spin the car. Slip and throttle need managing.

A plain pure-pursuit driver holding 95% of pace with no traffic laps in 48.8 s (`test/helpers/testDriver.js`).
