# The Knot: programming racing and weapons into weights

The same neural network drives and arms all twelve racers. For the faster car, it now uses a continuous one-second preview, front-axle slip/yaw correction and braking derived from the upcoming pace gradient. Grip is decoded as twice the sensor value; gravity and simulation time are unchanged. I first wrote the behaviour as arithmetic: pursue the racing line, control slip, pass slower traffic, and recover only with evidence of obstruction or a backward heading. Weapons add a pickup clock, eleven trigger predicates, temperament-dependent patience, a defensive Foghorn gate, and hazard/effect handling. Empty-handed cars now seek nearby crates through a lateral lane-change circuit, below passing and hazards in priority. Each expression becomes named affine rows and activation functions; recurrent neurons carry the clocks, grudges and latches. Every weight is assigned from those equations by the construction script. There is no policy hidden in `act()`.

Bots still race first. They use weapons from their current course; they never turn around, reverse or brake to reach a victim. A brief passing elbow supplies personal conflict, and the track supplies crossroads and landing collisions. Weapons are opportunistic; hard expiry eventually releases ready, grounded items, while items without wheel contact remain held. The measurements below distinguish reliable circuit behaviour from the much less reliable physical outcome of a shot or detour.

No training, fitting, gradients, optimizers or parameter search was used. The deterministic construction is [build.mjs](../tools/nn/build.mjs). Fixed-policy measurements informed the explicitly logged equation corrections below. Random test inputs check identities; they do not set weights.

## Final acceptance status

**The complete floor is not met.** These are the faster-car brief's floors: 37 s leader laps (34 s stretch), 130 s races, mean turtled≤3, mean stalled≤1.5, stuck≤7%, at least two running at every flag, and the weapon/slide limits below. The earlier 65% crate collection target is now a reported metric, not an acceptance item. Gravity and physics-step timing were never changed by this implementation.

With identical weights, the wall-lever simulator change gives mean race time 119.124 → 114.744 s, mean turtled 5.556 → 2.889, mean stalled 0.556 → 0.222, and pooled stuck 3.980 → 2.510%. Only measurement/report artifacts and exact baseline test expectations changed in this refresh.

On this same final simulator, the saved pre-speed network versus the final network has mean race time 143.284 → 114.744 s, pooled stuck 10.695 → 2.510%, mean turtled 2.667 → 2.889, and mean fired 55.667 → 49.333. These full-grid comparisons include chaotic contact/weapon divergence; they are not isolated causal estimates of one coefficient.

Development seeds: 1, 7, 42, 1201, 1709, 2309, 2903. The requested reserved seeds 3613 and 4801 are reported separately. They were used in earlier reviews and repeatedly measured here, so “held-out” in the JSON is a role label, not a claim of pristine one-shot validation. The weapons edits used mechanical evidence and the stated development examples; no policy candidates were ranked by seed score.

| Requirement | Development | Reserved | All nine |
|---|---|---|---|
| Three-lap finishes, every race | 7/7 · Pass | 2/2 · Pass | 9/9 · Pass |
| Leader best lap ≤37 s, every race | 37.425 max · FAIL | 37.383 max · FAIL | 37.425 max · FAIL |
| Winner ≤130 s, every race | 117.708 max · Pass | 116.492 max · Pass | 117.708 max · Pass |
| Mean turtled ≤3 | 3.143 · FAIL | 2.000 · Pass | 2.889 · Pass |
| Mean stalled ≤1.5 | 0.143 · Pass | 0.500 · Pass | 0.222 · Pass |
| Stuck car-time ≤7% | 2.403% · Pass | 2.817% · Pass | 2.510% · Pass |
| At least 2 running in EVERY race | 5 min · Pass | 7 min · Pass | 5 min · Pass |
| ≥30 weapons, every race | 41 min · Pass | 41 min · Pass | 41 min · Pass |
| All eleven types used | 11/11 · Pass | 11/11 · Pass | 11/11 · Pass |
| Barn Burner damaging shots ≥30% | 62.162% · Pass | 76.923% · Pass | 66.000% · Pass |
| Drops with tail rival ≥60% | 86.620% · Pass | 100.000% · Pass | 89.840% · Pass |
| No non-roof live hold >20 s | 19.667 max · Pass | 19.267 max · Pass | 19.667 max · Pass |
| Median pickup→fire ≤7 s | 2.433 · Pass | 2.533 · Pass | 2.467 · Pass |
| Moving slip >10° for ≥8% | 8.004% · Pass | 6.482% · FAIL | 7.615% · FAIL |
| Twelve act() calls well under 2 ms | 0.604 p95 ms · Pass | 0.604 p95 ms · Pass | 0.604 p95 ms · Pass |

Dwell median is pooled over fired items; the per-seed medians below also expose individual misses. Rocket/drop percentages pool shot counts, not seed percentages. Stuck pools living car-seconds. The slide floor uses moving horizontal speed>6 m/s and slip>10°. Upper-hit and general-contact rates remain reported without new floors. Maximum hold includes unfinished live holds; KO and race finish end observation, not an invented successful firing. The roof exception is measured at each sample: only body-up dot world-up≤0 is exempt; an airborne upright car is not exempt, and a later upright sample after 20 s fails. All-hold maxima are still shown.

## Runtime boundary and architecture

The simulator runs at 240 Hz, decisions at 30 Hz. OBS supplies 277 Float32 raw observations (the 24 arsenal fields are appended). The generic forward pass uses Float64 affine sums and activation/state buffers; act() copies/clamps six Float32 outputs and decodes display telemetry. No policy is in the wrapper, and telemetry never controls the car. The same tensors drive all twelve cars; temperament arrives through observations.

<!-- architecture -->
| Quantity | Value |
|---|---:|
| Observations / actions | 277 / 6 |
| Computed neurons | 2967 |
| Layers with earlier-layer skip connections | 125 |
| Nonzero edges | 5650 |
| Stored parameters, edges plus biases | 8617 |
| Recurrent state values | 45 |
| Generated weights bytes | 132587 |
<!-- /architecture -->

The pre-crate weapons network had 2644 computed neurons, 5056 edges and 44 states. The crate review brought this to 2936 neurons, 5603 edges and 45 states. The faster-car changes bring it to 2967 neurons and 5650 edges with the same 45 states. Its new rows compute horizontal speed, interpolate the racing line, apply front-axle feedback, anticipate falling pace and veto optional detours with too little approach time. It remains smaller than the former 4737-unit derby hunter. The generic sparse runtime adds one scalar sqrt activation; no game-specific control enters the runtime. Activations are linear, ReLU, step, square, atan, reciprocal and sqrt. A mixed-activation circuit is deliberate: a finite ReLU-only network does not exactly implement discontinuous comparisons or division.

State indices 0–10 are fixed-slot grudges, 11 rage, 12 slow-time accumulation, 13 recovery clock, 14 recovery gear, 15 recovery steering, 16 filtered passing offset, 17 recovery-active latch, 18 backward-turn latch, 19 phase no-motion integral, 20 route debt in metres, 21 wall-clock leg age, 22 aggression pulse/cooldown clock, 23 neutral passing offset, 24 display-only rage, and 25 previous race position. Weapon states are 26 weapon age (seconds), 27 effect-settling countdown, 28–29 previous forward/right speed, 30 hazard offset, 31–32 previous steering/throttle, and 33–43 remembered display target bits. State 44 is the filtered crate offset in metres. All start at zero. All old state values are read before any next state is copied. Construction-time loops merely replicate named rows across eleven fixed slots. There is no per-act allocation in the runtime or wrapper source.

Actions are steer, throttle, brake, handbrake, reverse, fire. Fire and telemetry.firing are the same binary neuron activation. Handbrake is zero. Slip feedback manages the existing tyre physics; the stronger correction produces no >10° slides in the current unarmed solo, so the numeric field slide result must not be mistaken for a demonstration of controlled solo drifting. There is no new raw sensor and no simulator edit by this implementation.

## Neuron map and arithmetic substrate

[NEURON_MAP.md](NEURON_MAP.md) lists every layer range, unit, exact row, activation and consumer. The primary interfaces are:

<!-- interfaces -->
| Block output | ID | Layer | Domain | Consumer |
|---|---:|---:|---|---|
| grudge0 | 1526 | 5 | [0,1] | Anger, reservation, memory |
| rage | 872 | 2 | [0,1] | Driving and weapons |
| shownRage | 2985 | 26 | [0,1] | Display only |
| weaponAge | 1390 | 4 | [0,20] s | Trigger comparisons |
| triggerDelay | 1159 | 3 | [.45,1.5] s | Pickup patience |
| reserveForGrudge | 2372 | 11 | bit | Tactical restraint |
| rocketOpportunity | 2981 | 26 | bit | Barn Burner |
| rearOpportunity | 1405 | 4 | bit | Four dropped classes |
| hornDefence | 435 | 1 | bit | Immediate defence |
| fire | 3031 | 31 | bit | Action 5 and HUD |
| settleClock | 2122 | 9 | [0,1.8] s | Recovery grace |
| recoveryAllowed | 2532 | 11 | bit | Recovery entry and latch |
| settleEscape | 2077 | 8 | bit | Urgent obstruction exception |
| rocketIntercept | 2926 | 22 | normalized lateral metres | Projectile corridor |
| hardExpiry | 1556 | 5 | bit | Grounded fallback |
| hazardAvoid | 2894 | 20 | bit | Detour mux |
| hazardOffset | 2948 | 23 | [-92.7,92.7] m | Filtered waypoint |
| hazardAimFloor | 1795 | 6 | [4/70,63.55/70] | Detour preview |
| oilSteer | 3281 | 120 | [-.25,.25] | Oil steering |
| oilThrottle | 3114 | 49 | [0,.35] | Oil propulsion |
| displayTarget0 | 2765 | 14 | bit | Display identity memory |
| leanClock | 3119 | 50 | [0,4.5] s | Elbow pulse/cooldown |
| traffic0.valid | 1407 | 4 | bit | Passing WTA |
| target0 | 2071 | 8 | bit | Current visible target |
| boundedOffset | 3164 | 71 | road interval | Pursuit |
| pursuitCurvature | 3232 | 94 | [-1.3829,1.3829] 1/m | Steer/yaw |
| desiredSpeed | 1976 | 7 | [0,1.35] | Pace control |
| slipAuthority | 1347 | 3 | [0,1] | Traction envelope |
| stuck | 2749 | 14 | [0,.6] s | Obstructed entry |
| routeDebt | 2892 | 20 | [0,8] m | Recovery progress |
| turnImproving | 1606 | 5 | bit | Deadline exemption |
| escapeActive | 2853 | 18 | bit | Recovery control |
| crateFiltered | 2897 | 20 | [-26.5,26.5] m | Actual-side clearance |
| crateToRight | 2915 | 21 | bit | Side ray and occupancy |
| crateReachError | 2819 | 16 | metres | Reach comparison |
| crateReachAllowance | 1958 | 7 | [0,24] m | Reach comparison |
| crateReachable | 2847 | 17 | bit | Crate eligibility |
| horizontalSpeed | 849 | 2 | [0,sqrt(4.5)] | Preview, pace, steering |
| previewMetres | 1512 | 4 | [16,65] m | Line interpolation |
| frontAxleYawTime | 1798 | 6 | [.085,1.209] | Yaw feedback |
| physicalGrip | 1345 | 3 | [.2,3] | Braking |
| brakingFeedforward | 2720 | 13 | [0,1] | Race brake demand |
| crateTimeRoom | 1336 | 3 | bit | Optional pickup veto |
| steer | 3288 | 125 | [-1,1] | Action 0 |
| throttle | 3129 | 52 | [0,1] | Action 1 |
| brake | 3142 | 55 | [0,1] | Action 2 |
<!-- /interfaces -->

Let R(x)=max(0,x), H(x)=1 if x≥0 else 0, C(x)=clip(x,0,1). Affine rows have W[out,in] orientation. Missing edges are zero.

* Absolute value: R(x)+R(−x), weights +1 and −1 into two hinges, then [1,1] readout.
* Clip to [a,b]: a+R(x−a)−R(x−b). A steering clip uses biases +1,−1 and output bias −1.
* Product: ((x+y)²−(x−y)²)/4. Two square units have rows [1,1] and [1,−1]; readout weights are [.25,−.25]. This is algebraically exact, with floating cancellation in deployment.
* Signed Boolean gate G(x,g;M)=R(x+Mg−M)−R(−x+Mg−M). At g=0 and |x|≤M both hinges vanish; at g=1 their difference is x. Raw sensor selectors use M=1.5; passing offsets M=3; steering muxes M=12; Boolean latches M=1. The phase-clock gate uses M=2 because its clipped maximum is 1.8 s; Boolean latch gates use M=1. Route-debt gates use M=8, the clipped debt bound. The aggression-clock mux uses M=4.5, its exact countdown ceiling. Lost-place gating uses M=11 because twelve cars span eleven positions.
* Mux(g,x,y)=G(x,g;M)+G(y,1−g;M).
* AND of n bits is H(sum(bits)−n+.5); OR is H(sum(bits)−.5). Half-unit margins separate Boolean cases.
* WTA compares every pair. H(score_i−score_j) awards equality to the smaller slot; its affine complement awards the other side. AND of all pairwise wins produces exactly one winner. Eleven-way selection has 55 comparisons, 55 complementary rows and 11 conjunctions. No runtime argmax selects control targets.

## Racing line and speed become steering and pedals

The faster car still uses real 240 Hz physics and 30 Hz decisions. No gravity, flight-time or simulation-rate multiplier is in the network. Raw speed components remain m/s/40. Let F and R be those components and V=40*sqrt(F²+R²), the horizontal speed in m/s. Two square neurons with weight +1 feed one sqrt neuron with weights [1,1], bias 0. Its input is nonnegative. This new generic scalar activation has no game-specific code in the runtime.

### Preview without speed-threshold jumps

The preview distance is L=clip(V,16,65) metres: a **one-second** spatial horizon, bounded by the available line points. This is a declared control-design choice, motivated by the trace: the old 28→45→65 m switches cut tight exits at the new corner speeds. Increasing preview indiscriminately would skip more of those bends. For field z (forward or right), interpolate the existing 16,28,45,65 m observations:

```text
r_j = C((L-d_j)/(d_(j+1)-d_j))
look.z = look1.z + sum_j r_j*(look_(j+2).z-look_(j+1).z)
```

The distances are [16,28,45,65], so ramp slopes are 1/12,1/17,1/20 and biases −16/12,−28/17,−45/20. Each product is the square identity. The interpolation is continuous at every boundary. At 50 m/s it blends the 45 and 65 m points with t=.25. At 58 m/s the last available point remains more than a second ahead; no invented track extension or extra sensor is used. Passing adds its filtered lateral offset; hazard and crate logic retain their stated priority.

### Steering at the front axle

For normalized aim(x,y), metres/70:

```text
kappa = 2*y / (70*max(x*x+y*y,(4/70)^2))
wheel = atan(2.85*kappa)
expectedYaw = kappa*(40*F)/3
frontAxleYawTime = (3*1.45)/(.6*max(6,V))
followingSteer = (1.25/.6)*wheel + slipAngle/.6
                 + frontAxleYawTime*(expectedYaw-yawRate)
```

The wheelbase is 1.45−(−1.4)=2.85 m and lock is .6 rad. The denominator floor is .00326530612245, inverse≤306.25. The factor 2/70 converts normalized aim into curvature. The retained 1.25 is a heuristic allowance for understeer, not a measured fit.

A front axle 1.45 m ahead of the centre sees yaw-induced lateral velocity 1.45*r. Dividing by speed gives its small-angle direction correction. Therefore the damping time is 1.45/max(6,V), and multiplying by 3/.6 converts normalized yaw input into action units. The construction uses the normalized-speed reciprocal with coefficient 1.45*3/(40*.6)=.18125. The 6 m/s floor prevents division by zero and preserves bounded low-speed control. The slip term now corrects the entire velocity/nose angle in wheel radians: coefficient 1/.6=1.666666667. The former .95 action gain corrected only .57 of that physical angle. This front-point model is approximate; it is not a tyre-stability proof.

The stronger correction requires larger selector bounds. Ordinary pursuit curvature≤.5 m⁻¹. The maximum crate correction is .75*9.81*3/25=.8829, so total absolute curvature≤1.3829. The wheel term is below 3.273, slip term≤2.5, expected-yaw correction≤(1.45/.6)*1.3829=3.343, and measured-yaw correction≤(3*1.45/(.6*6))*1.5=1.813. Adding wall reflex≤.232 gives <11.161. Thus M=12 covers race/jump/recovery/ground steering gates over the stated raw domain. A regression supplies a following command above the old M=6 and verifies zero airborne steering and no leakage into selected recovery.

If aim lies behind the car, the graph substitutes ±.7 toward its side. Walls add 4R(2.6/45−ray8)−4R(2.6/45−ray7). Alignment compensation remains −ego.alignment/3 after selection: physical bias is input/5 and nominal lock .6, hence 1/(5*.6)=1/3. Damaged steering lock makes this approximate.

### Pace tracking without waiting for overspeed

Pace share is .9, reserving 1−.9²=.19 of the notes' lateral load for correcting the line. It does not assume that the new grip makes a larger slip angle safe: the tyre's peak slip location is unchanged.

```text
nearCrossing = C(1 - 120*toCrossing/12)
share = .9 - nearCrossing*.012*(1-nerve) - .08*blinded - .5*oiled
p = ego.pace*share
q = look0.pace*share
error = p - sqrt(F²+R²)
mu = max(.2, 2*ego.surfaceGrip)
paceDeceleration = max(0,100*(p²-q²))
brakingFeedforward = C(paceDeceleration/(9.81*mu))
raceBrake = C(brakingFeedforward - 14*error)
demand = C(20*error + .04 + .15*F²), gated by error>=0 AND raceBrake=0
fastSlipGrip = C(1 - 6*R(abs(slipAngle)-.10))
slipAuthority = C((1600*(F²+R²)-4)/32)
slipGrip = 1 - slipAuthority*(1-fastSlipGrip)
spinGrip = C(1 - 5*R(rearSlip-.12))
throttle = demand*slipGrip*spinGrip
```

The pace notes already solve braking before corners and account for no braking in air. The added term follows a=d(v²)/(2 ds), using the next note eight metres away: 40²/(2*8)=100. Difference-of-square rows therefore use +100 and −100, followed by ReLU. Divide by nominal friction-limited deceleration mu*g and clip. Error feedback corrects force-model mismatch; it no longer needs the car to overshoot pace before requesting deceleration. At a desired 32.4 m/s now and 30.6 m/s eight metres ahead, required deceleration is (32.4²−30.6²)/16=7.0875 m/s². Clay grip 2.2 gives feed-forward brake 7.0875/(2.2*9.81)≈.328399. Airborne control still forces brake zero.

The parent corrected the grip sensor after this pass found all new surfaces clipped to 1.5. Its final encoding is **grip/2**: mud .85, clay 1.1, asphalt 1.25. The decode is a weight 2, not a hidden wrapper. The .2 denominator floor handles finite domain-boundary fixtures; actual surface readings are well above it.

Speed feedback gains remain .5 throttle and .35 brake per m/s (normalized weights 20 and 14). The small .04+.15*F² positive-demand bias is retained as a coarse cruising heuristic from the older car, not claimed as an accurate force/torque model of the 1350 N·m engine. Brake priority prevents simultaneous commanded driving and pace braking. The unchanged rear-slip .12 is the tyre peak; full suppression is at .32. Body-slip reduction spans .10–.266667 rad. These thresholds did not scale with grip because the peak slip curve did not move. Stronger front-axle correction produces much less natural solo drifting; field slip also includes weapon/contact motion.

The low-speed authority ramp remains (V²−4)/32, clipped, so normal full-lock kinematic slip does not choke a drive-out. Recovery still regulates around 4 m/s with its existing gear and route-progress conditions: faster road pace is not a reason to reverse faster next to a wall. A nervous driver still lifts by at most 1.2 percentage points within 12 m of a crossing; nerve 1 lifts none. Cross traffic remains part of the race.

## Passing and opportunistic anger

Each passing candidate must be solid, wall-visible, within 30 m, at least 1.5 m ahead, and within 3.5 m laterally. It must be a wreck or at least 1 m/s slower along the ego heading. Living candidates must also point within 60° of the ego heading; wrecks qualify at any heading. **All of these predicates precede the traffic WTA.** A nearer rear-quarter car therefore cannot mask a wreck ahead. Cross traffic is not chased, and an all-zero towed slot is absent. Wrecks influence avoidance but are never displayed as living targets.

Traffic score is 4*eligible−4−distance. Distance spans 0..1.5, so the four-point eligibility margin dominates it; nearest eligible traffic wins. A living backmarker remains a physical obstacle. Anger requires |raceGap|≤.12 laps or selected grudge≥.1. This is a race-distance proxy for nearby position, not exact rank reconstruction.

Two side scores combine the ±32° wall rays with −2 per solid body overlapping a 3 m offset corridor. Occupancy still includes rear-quarter bodies: −4..18 m longitudinally and within 2.5 m of the candidate side. A two-point penalty dominates the ray's 0..1 range; a .01 left tie bias resolves ties. Candidate selection and lane occupancy deliberately use different longitudinal domains.

Normally request ±3 m. Anger is C(.5*temperAggression+.2*drivingRage+.3*grudge). A living selected rival within 10 m may provoke narrowing if race-close/grudged and anger≥.35. The final governor additionally requires:

* At least one wheel down, no current recovery or gear/direction braking, heading error≤15°, and |slip|≤.10 rad.
* More than 25 m to the jump lip, the existing passing condition.
* No body in the selected passing lane, at least 12 m on its ±32° ray, and enough road to place the neutral ±3 m offset while retaining the 1.6 m body margin.

The clearance requirements are local geometric heuristics. The 15° heading margin and .10 rad slip threshold keep the elbow within the normal tyre-control region; they are not a proof of safe contact. Twelve metres covers the nearby rival range plus body margin approximately.

The clock implements a brief elbow and a cooldown:

```text
start = allowed AND oldLeanClock <= 0
leanClock' = start ? 4.5 : clip(oldLeanClock - 1/30, 0, 4.5)
lean = allowed AND leanClock' > 4
width = 3 - .6*G(anger, lean; 1)
request = G(passDirection*width, passing; 3)
```

The comparator uses bias −4−1e−9 to exclude the endpoint at four seconds despite floating roundoff. A constant eligible fixture produces at most 15 consecutive active decisions, or .5 s, followed by at least four seconds without an elbow. The cooldown continues if the target disappears or posture becomes unsafe; those interruptions cannot restart the pulse. The .5 s pulse and 1:8 pulse/rest ratio are explicit budget heuristics, not fitted optima or a guarantee on collision consequences. The maximum instantaneous narrowing remains .6 m.

Maintain two parallel low-pass offsets, both with alpha=1/(30*.25)=2/15:

```text
aggressiveOffset' = 13/15*oldAggressiveOffset + 2/15*request
neutralOffset' = 13/15*oldNeutralOffset + 2/15*(passing ? 3*direction : 0)
effectiveOffset = lean ? aggressiveOffset' : neutralOffset'
```

The final mux removes even the filter's narrowing tail when the pulse ends or safety fails. It does not cancel ordinary passing. After one second a cancelled 3 m neutral excursion leaves about .041 m. The neutral state also gives a counterfactual reference for telemetry; it is computed by neurons, not by the wrapper.

Road-relative line position is (trackOffset−lineOffset)*halfWidth*10. Clamp each offset between −halfWidthMetres−linePosition+1.6 and +halfWidthMetres−linePosition−1.6. The 1.6 m margin is one metre of half-body plus .6 m clearance. At the 6.4 m funnel, a centred line permits ±4.8 m before the smaller ±3 m request; with the line 4.48 m right of centre, only .32 m of further right offset is available. This is a point-aim bound, not a proof that a colliding chassis stays on the road.

`hunt` means an eligible, safe elbow is active **and** the road-clamped aim offset is at least .01 m smaller in magnitude than its road-clamped neutral counterpart. It also requires a forward look point and |roadSteer|≤.98 so the normal steering command has not saturated. It does not claim measured wheel displacement or an actual hit. Airborne/recovering cars and completely clamped-away excursions cannot report hunt. Drift uses speedFwd²+speedRight²≥(6/40)² and |slipAngle|≥10°; it no longer mistakes a fast sideways slide for a stationary car. Mode scores are race=.5, hunt=2, drift=3, unstick=4, so recovery has priority over drifting, and drifting over an elbow.

Neither target position nor anger changes desired speed or requests reverse. Rear blocking and a separate PIT manoeuvre are not implemented. A universal one-second aggression cost bound was not established in earlier paired traffic experiments. The current measurement section refreshes the input-clamp ablation. With weapons and crates, it also changes their temperament-dependent timing/range, so its cost is not an isolated aggression-governor effect.

## Grudges, rage and jumps

Per-rival memory is C(2^(−1/540)*oldGrudge + hitMe*(.5+1.5*vengeance)). At 30 Hz, 540 decisions are 18 s, so the leak has exactly an 18-second half-life without hits. DrivingRage=C(2^(−1/180)*oldDrivingRage+.65*hitTaken+.008*stallTimer), with a 6-second half-life and a small frustration input. This existing control state is unchanged. Neither state creates a hunt target off the route. Grudges remain tied to fixed rival slots through towing.

Display rage has its own recurrence, so a more expressive Grudge Board cannot alter the car:

```text
contact = max(hitTaken, opp0.iHit, ..., opp10.iHit)
lostPlaces = G(max(0, 11*(racePosition-oldRacePosition)), raceActive; 11)
displayRage' = C(2^(-1/240)*oldDisplayRage + 2.5*contact + .2*lostPlaces)
shownRage = max(drivingRage, displayRage')
oldRacePosition' = racePosition
```

At 30 Hz, 240 decisions give an eight-second half-life; the leak is 0.9971160533355892. A .2-strength contact adds .5, and losing one of twelve-car rank positions adds .2. Countdown observations prime previous rank without awarding rage. Rank loss can include contact/ranking consequences, so this is honestly a lost-position signal, not an inferred clean overtake. The display also reacts to a bot's own credited hit through iHit. Tests trace dependencies and prove that neither display state nor rank input reaches an action or driving-state output. The temperament/grudge controller still consumes only drivingRage. Current contact/weapon-hit samples are recorded in rage-final.jsonl; the measurements section reports their means.

Inside 25 m of a jump lip, no new pass offset is requested. The filter gives about a second to return toward the line at 25 m/s. Inside 8 m, steering demand is clipped to ±.18 before alignment compensation, corresponding to .108 rad nominal wheel angle. With no wheels down, the steering demand and brake are zero; alignment compensation still cancels bent steering. The brake is immediately available again at first wheel contact, using the current pace error, so Pancake's landing brake zone remains active. These gates cannot undo a collision at take-off or guarantee zero slip at the lip.

## Weapons become trigger circuits

[arms.mjs](../tools/nn/arms.mjs) builds the arsenal rows; it is not shipped as a policy. Let A, N, V be aggression, nerve and vengeance, each in [0,1], and r the six-second **driving** rage state. Eleven one-hot flags sum to held. All distances below are converted to metres explicitly; the behind sensor uses /40, unlike the /100 ahead sensor.

```text
age = G(clip(oldAge + 1/30, 0, 20), held; 20)
delay = 1.5 - .75*A - .3*r
waited = age >= delay
settled = grounded AND abs(slipAngle) <= .3
nearGrudge[k] = solid[k] AND alive[k] AND distance[k] <= 50 m AND grudge[k] >= .2
inAim[k] = nearGrudge[k] AND forward[k] >= 2 m AND abs(right[k]) <= 4 m
reserve = any(nearGrudge) AND NOT any(inAim) AND V >= .5 AND age <= delay+3*V
```

The age affine row has weight 1 from oldAge and bias .03333333333333333. Two ReLUs clip it at 0 and 20, and the signed gate uses M=20 from that ceiling. Its next state is G(age, NOT fire;20), so a consumed item resets the clock immediately. Hard expiry is H(age−19): a longer deadline than every soft deadline, leaving one second below the requested 20 s limit for normal grounding/decision delay. Fire always requires ready, raceActive, at least one wheel down and not whirling. An expired airborne or inverted car retains the item until wheel contact; this is necessary for the no-airborne-fire rule, and it means elapsed live holds can exceed 20 s. Previous missed deadlines remain in the historical log; the current sample has no non-roof hold over 20 s, without proving a universal bound.

The delay row has weights −.75,−.3 and bias 1.5: calm A=0,r=0 waits 1.5 s; A=1,r=1 waits .45 s (the simulator's .5 s ready lock may dominate). Anger changes patience without modifying the race destination. Vengeance briefly reserves a weapon for a strong nearby grudge that is not yet in the forward corridor; it adds at most three seconds and never overrides grounded hard expiry. A hidden grudge has no trustworthy geometry, so it cannot reserve fire. The circuit does not aim a Seeker itself: that weapon's simulator targeting uses lastHitter.

| Class | Normal tactical opportunity, after delay and outside reserve | Soft deadline age, seconds |
|---|---|---|
| Barn Burner | Grounded/settled; ahead ≤20+25A+10r m; bearing and predicted intercept inside the corridor described below | 18−4A−r (13–18) |
| Repo Hook | Grounded/settled; ahead ≥10 m and ≤40+20A m | 18−4A−r (13–18) |
| Grudge Seeker, Prize Bull, Grand Piano | Grounded/settled; incoming≤.4+.3N | 12−4A−r (7–12) |
| Welcome Mat, Oil Slick, Smoke Bomb, Bedspring | Present tail rival: behindRange<1 and distance≤20+16A+4r m | 12−4A+2V (8–14) |
| Threshing Whirl | At least one rival within the 7 m sensor radius, grounded/settled | 12−4A−r (7–12) |
| Foghorn | At least one close rival, or incoming≥.72+.08N−.02A | 12−4A−r (7–12) |

Soft deadlines only remove patience and grudge reservation. They do **not** bypass opportunity or posture:

```text
permission = softDeadline OR (waited AND NOT reserve)
tacticalUse = permission AND opportunity
use[k] = heldFlag[k] AND (hardExpiry OR tacticalUse OR hornDefence[k])
fire = ready AND raceActive AND grounded AND NOT whirling AND any(use)
```

Dropped items require both settled posture and a present tail rival through their soft limit; absent tail traffic is not manufactured by timeout. Foghorn's incoming threat bypasses patience/reservation but still passes the final ready/ground gates. A threshold .72 corresponds to a shot about 16.8 m away because incoming=1−distance/60. Nerve 1 waits to about 12 m; aggression 1 expands that by 1.2 m. These lie inside the current 18 m swat radius. The .5 piano warning cannot invoke this missile-specific defence. CloseRivals is count/4, so H(closeRivals−.125) separates zero from the first rival's .25 even in smoke; close-range Horn use also requires settled posture.

### A straight rocket must actually intersect a car

The original angular tolerance could fire past a car: at range 30 m and lateral offset 3 m, bearing≈.09967 rad passed an aggressive driver's cone. But the simulator only detonates within a 2.3 m direct-hit radius, at a wall, or at lifetime expiry. The seven-metre blast radius is not a proximity fuse.

Keep the temperament cone, then add H(.02−aheadRange*abs(aheadBearing)). Since aheadRange is metres/100, this is a conservative small-angle two-metre corridor. At the largest permitted .15 rad cone, range×angle overestimates true lateral distance by at most about .031 m at 55 m. The .3 m difference from the physical 2.3 m hit radius supplies margin.

A separate eleven-slot WTA matches the visible ahead reading. A candidate must be solid, alive, have wall LOS, be at least one metre forward, satisfy abs(right)≤tan(.35)*forward, and have abs(dist−aheadRange)≤.001 (0.1 m tolerance for the shared Float32 geometry). Scores are 4*match−4−dist, so the four-point validity margin exceeds the 1.5 distance span. This only chooses firing geometry; none of its outputs reaches steering, throttle, brake, handbrake or reverse.

For the selected rival, in physical metres and seconds:

```text
closing = max(2, 92 - 40*relVelFwd)
time = max(0, 100*forward - 3.4) / closing
predictedRight = 100*right + 40*relVelRight*time
interceptOK = abs(predictedRight) <= 2 AND time <= 1.6
```

The projectile inherits ego velocity, so relative rival velocity is the appropriate subtraction. The 92 m/s speed, 3.4 m muzzle origin and 1.6 s lifetime come directly from the current arsenal. Since relVelFwd≤1.5 after sensor clipping, 92−40*relVelFwd≥32; the denominator floor preserves a finite reciprocal even for absence/invalid rows. The actual normalized lateral affine readout is `right + .4*(relVelRight*time)`, tested against .02. Products use the two-square identity. A present match and interceptOK are required for a tactical Barn Burner shot.

At forward=30 m and zero relative forward speed, time=(30−3.4)/92≈.28913 s. A 20.5 m/s lateral rival moves about 5.927 m during that interval, so it is rejected even if currently on the nose. A stationary rival one metre aside passes. This is a constant-velocity forecast, not a guarantee through corners, flight or subsequent impacts. Hard expiry can still waste a grounded shot.

Real deadline rows remain H(age+4A−2V−12) for drops and H(age+4A+r−18) for aimed weapons, but now feed permission rather than the final fire OR. AND/OR rows retain half-unit Boolean margins. The trigger computations are exact for these chosen equations; hit probability is measured, never fitted.

## Crates become a low-priority lane change

`crates.mjs` reads the existing raw fields; there is no sensor or simulator change. `arms.toCrate` is **route arc metres /120**, whereas `arms.crateRight` is **nose-relative right metres /local half-width**. Treating the first as nose-forward distance would mix coordinate frames on bends.

Let D=120×toCrate, h=10×halfWidth, s=headingSin, c=headingCos, and e=h×lineOffset. The point on the racing line at the current route station is approximately `(e*s,−e*c)` in nose metres. Together with the five supplied line points, it gives vertices at route stations `[0,8,16,28,45,65]`. For each interval j:

```text
r_j = clip((D − station_j)/(station_(j+1) − station_j), 0, 1)
line(D) = point_0 + sum_j r_j * (point_(j+1) − point_j)
error = (h*crateRight − 70*line(D).right) / max(c,.5)
```

For the 28–45 m interval, the affine ramp has weight 1/17 and bias −28/17, followed by the two ReLU clip hinges. Products use the square identity above. Interpolation is exact for the piecewise-linear samples; the curve between samples and the projection on the current road normal are geometric approximations. The .5 denominator floor makes every forward pass finite, including rejected backward-facing inputs. Seeking itself requires c≥cos(30°).

The future line tangent is selected from the same segment differences using threshold muxes. `tan(30°)*deltaForward − abs(deltaRight) ≥ 0` requires the line at the crate to lie within 30° of the nose. This prevents the nearest-nose-lateral crate around a sharp bend from becoming a misleading cross-road target. It is a conservative gate, not a path planner.

Aggression A controls range and the threshold for leaving the line:

```text
range = 45 + 15*A metres
ramp = clip((range − D)/20, 0, 1)
moveNeeded = H(abs(error) − (2.2 − .4*A))
request = ramp * (e + clip(error − e, −4, 4))
filtered = (13/15)*oldOffset + (2/15)*request
offset = G(filtered, crateSeeking; 32)
```

The 45–60 m range gives roughly 1.5–2 s at 30 m/s. The faster-car acquisition gate requires range≥1.5*horizontalSpeedMetresPerSecond, so aggressive cars may seek at up to 40 m/s and the least aggressive at up to 30 m/s. Faster optional pickups keep the racing line. This is an acquisition-window test, distinct from the late retarget reach cone below. The 20 m ramp avoids a step at first sight. The activation threshold was derived from the original 2.7 m pickup radius, less .5–.9 m tracking margin. The simulator now uses 3.3 m reach; the unchanged threshold therefore leaves 1.1–1.5 m margin. Once committed, the target is the crate's centre. The ±4 m limit is a requested step **from the car**, so a partly completed crossing can continue. It is not a permanent ±4 m limit from the original racing line. The filter's half-life is `log(.5)/log(13/15)/30 = .1615 s`; its time constant is .233 s. With sensor bounds |e|≤22.5 m, request and recurrent offset remain within ±26.5 m, hence M=32 safely disables the signed gate. Off clears memory immediately; no detour remains latched after collection or a passed/absent crate.

`crateSeeking` ANDs these conditions: empty hands, grounded, not whirling/oiled/recovering, >max(25 m, one second of horizontal travel) from a jump lip, no hazard detour, no active pass, passing offset settled within .25 m, heading within 30°, slip≤.2 rad, speed≤ego pace, crate in range, moveNeeded, future tangent aligned, a reachable full lateral change, and a clear chosen side. The side is the sign of filtered−e, **not** raw request−e or the offset's sign about the racing line. It uses the existing solid-car/wreck lane occupancy checks, including rear-quarter cars. The ±32° wall ray must exceed `2.6/sin(32°)=4.906 m`. The requested offset is clamped to the road interval leaving 2.6 m on either side, one metre more than passing. Hazard control overrides crates; recovery and jump control retain their later action overrides. This orders the policy: road/walls, recovery, jump alignment, hazards, passing, crates.

The side comparator is now wired to the same filtered target used for control:

```text
crateToRight = H((2/15)*request + (13/15)*oldOffset − e)
reachError = abs(error − e)
reachSpeed = max(abs(speedFwd), .75)       // speedFwd is v/40
reachAllowance = .15*D / reachSpeed
crateReachable = H(reachAllowance − reachError)
```

The first correction has weights +1 from `crateFiltered` and −1 from `crateEgoLine`, bias 0. Equivalently its expanded coefficients are 2/15, 13/15 and −1. For e=+2.5 m, request=+6.5 m and oldOffset=0, filtered=.866667 m: the actual target lies 1.633333 m left of the car, so the left lane must be checked. A left-side rival now vetoes the detour; a right-side rival alone does not. Road clamping and the later steering controller still apply, so the sign is a target-side predicate, not a claim about every final wheel angle.

The reach limit comes from the existing maximum 4 m requested step over the existing 20 m ramp: slope 4/20=.2, or an 11.31° approach. At a representative 30 m/s it asks for at most 6 m/s average lateral travel. Above that speed, preserve that lateral-speed limit by using `min(.2*D,6*D/abs(v))`; below it retain the gentle .2 cone instead of permitting a late lunge. In normalized speed, 30/40=.75 and 6/40=.15 produce the exact weights shown above. ReLU abs/max rows, one reciprocal and the square-product identity implement the expression; the reciprocal input is never below .75. With D≤120, allowance≤24 m. The final step has weights +1/−1, bias 0; equality is accepted. Adding its bit to the eligibility AND adds weight +1 and decreases the AND bias by one.

The gate uses the **full unfiltered** required change from the car to the new crate row. A clipped 4 m request or an old filtered offset could conceal an infeasible retarget. At D=3.64 m and v=29.63 m/s, allowance=.728 m, so a 7.76 m change is rejected and the racing line remains in control. This is a conservative approach-cone heuristic, not an acceleration/reachability proof. Existing heading/slip/pace/traction gates remain necessary. The gate can switch off a legitimate but unfinished approach near a crate; the pickup radius may still collect it. The measured collection loss remains in the reported denominator.

The normal continuously interpolated one-second racing preview is retained. Shortening that preview to the crate hid the next corner and was removed after a physical regression. Instead, the lane controller replaces only the return-to-line component of pursuit:

```text
laneError = roadClampedOffset − e
laneHorizon = max(D,16)
shortLane = 2*laneError/(laneHorizon² + laneError²)
cancelOldReturn = 2*e/(4900*normalAimRadiusSquared)
correction = (shortLane + cancelOldReturn)*headingCos
v² = max(25,1600*(speedFwd² + speedRight²))
budget = max(0, .75*9.81*(2*surfaceGrip)/v² − abs(baseCurvature))
curvature = baseCurvature + G(clip(correction,−budget,budget), crateSeeking; 1)
```

`normalAimRadiusSquared` retains the existing 4 m denominator floor. The 16 m lane horizon is the driver's shortest ordinary preview. The .75 gravity multiplier reserves 25% of nominal surface traction; subtracting the ordinary pursuit load gives crates only the remaining curvature allowance. This is an approximate load budget, not a tyre-force proof: damage, suspension load and transient slip still matter. At valid input maxima, the correction allowance is at most `.75*9.81*3/25=.8829 m⁻¹`, so M=1 is sufficient after decoding the new grip sensor. Crates do not directly alter pace, pedals, weapon firing or recovery; the faster-car corrections to those shared controls are described above. The crate circuit never orders a stop, reverse, weapon shot or new telemetry mode.

## Hazards, smoke, oil and forced motion

The hazard sensor reports one location in the **nose frame**, without its type or radius. Road width and line offset use the **road frame**. They must not be added directly. Let F=60*toHazard, R=10*hazardRight, c=headingCos, s=headingSin, and e=ego.lineOffset*halfWidthMetres. Rotate first:

```text
roadForward = F*c + R*s
roadRight = R*c - F*s
hazardLinePosition = e + roadRight
candidateLeft  = hazardLinePosition - 7.2
candidateRight = hazardLinePosition + 7.2
```

The 7.2 m clearance remains oil radius 6 m plus one metre half-body and .2 m margin. Candidate viability requires the existing road interval and a 12 m clear ±32° ray. Scores are 100*viable−100−abs(candidate), with a .01 left tie bias; WTA chooses one side. The raw products assign coefficients +10 to hazardRight*headingCos and −60 to toHazard*headingSin. For a hazard 40 m along the road with the nose 15° right: F≈38.637, R≈−10.353, c≈.965926, s≈−.258819. The rotated lateral terms cancel to zero. The old direct sum incorrectly reported −10.353 m and disabled avoidance.

Current half width≤9 m, |lineOffset|≤1.5, F≤60 m, |R|<12 m and |c|,|s|≤1 imply |candidate|≤13.5+12+60+7.2=92.7 m, even without using c²+s²=1. M=100 bounds the signed selector, request and offset mux; the convex filter preserves the bound. The 100-point viability margin exceeds the 92.7 m distance-score span plus tie bias. Valid actual road geometry is narrower, but the larger bound avoids silently clipping a rejected candidate before its mask.

Avoidance requires grounded, outside recovery, more than 25 m before a jump, a viable side, a hazard at most 55 m ahead of the nose and ahead on the road tangent, and a centre within 7.2 m of the line. Filter the selected line offset by 13/15 old +2/15 request, then clamp it to the passing road interval.

To clear the whole patch, aim to finish the excursion **before its near edge**, not at its centre plane. The near-face allowance is 6 m oil radius plus 2.45 m half-car length, or 8.45 m. Build a waypoint in road coordinates, then rotate back:

```text
U = max(4, roadForward - 8.45) / 70
V = (boundedOffset - egoLineMetres) / 70
xAim = U*c - V*s
yAim = U*s + V*c
```

The four-metre floor matches pursuit's existing geometric minimum radius. It replaces the old 16 m detour-preview floor, which cut the remaining lateral correction near the oil edge. The backward rotation is built from four square-product blocks and two affine readouts. The ordinary racing preview is unchanged when avoidance is inactive. A corrected physical fixture now clears both mine and oil, but this remains a local waypoint heuristic, not a swept-path planner. Sharp bends, other cars, narrow roads and hazards masked by a nearer one can still defeat it.

Oil chooses a damped version of the existing commands:

```text
oilSteer = clip(previousSteer + clip(drySteer-previousSteer,-.04,.04), -.25,.25)
oilThrottle = clip(min(dryThrottle, previousThrottle+.08), 0,.35)
oilBrake = min(dryBrake,.2)
```

The turn cap is .15 rad nominal wheel angle; the per-decision increment is .024 rad, or .72 rad/s. The .08 throttle increment limits a rise to 2.4 action units/s; cuts remain immediate. Engaging the cap can cut a previously large command abruptly, so this is not a globally symmetric slew bound. The pace multiplier loses .5 on oil and .08 in smoke. Those fractions and input caps are declared conservative heuristics, not fitted tyre laws. Whirl forces steering and brake to zero; airborne braking remains zero.

Smoke leaves the road sensors usable. Passing and recovery geometry still require solid; all-zero slots never become zero-distance obstacles. Grudges continue their normal leak without an absence reset. Eleven display-target memories retain the last selected identity when that slot is unobserved, replace it when another visible candidate is selected, and clear it when visible but no longer selected. This deliberately cannot distinguish a permanently towed car from a hidden one. Stored target identity never supplies stale geometry to control.

Weapon damage enters the existing hitTaken/hitMe recurrence, tested with an actual weaponHit. But smoke zeros the whole opponent slot, including hitMe; a newly hidden attacker cannot be identified by this network from the available observations. Global rage still rises, and existing grudges survive. No JS reconstruction from world.lastHitter is used.

Recovery receives a settling gate:

```text
disturbed = whirling OR airborne OR hitTaken>=.25
            OR abs(speedFwd-oldFwd)+abs(speedRight-oldRight)>=.25
settle = disturbed ? 1.8 : max(0,oldSettle-1/30)
settleEscape = grounded AND upright>=cos(45°) AND horizontalSpeed<=3 m/s
               AND forwardBlocked AND NOT whirling AND stallTimer>.5
recoveryAllowed = (settle == 0) OR settleEscape
```

Velocity is /40, so the impulse threshold is a 10 m/s L1 change per decision. It is a coarse detector, not identification of every Hook yank. Airborne covers jumps, blasts and springs; whirl has an explicit flag. The 1.8 s grace is renewed during the effect. Its expiry normally enables new entry and retention of recovery; active recovery is cleared during genuine forced-motion inhibition.

The exception recognizes a real late obstruction: at least one grounded wheel, upright≥cos(45°)=.7071067812, horizontal speed≤3 m/s, the **same** forwardBlocked geometry used by recovery, not whirling, and more than six seconds of stall debt. The strict comparison is `1−H(.5−stallTimer)`; equality does not qualify. Its six-input AND bias is −5.5. OR with settleReady is H(sum−.5). It lets the existing .5 s obstruction integral accumulate and retains an already active recovery despite repeated hit pulses. Removing the grace wholesale would allow Whirl/launch heading to request reverse, so those protections remain. This exception is not a guarantee of total recovery or of restoring the old race trajectory; the no-crates regression reports the current full-grid result without claiming universal recovery.

## Recovery: evidence, clearance and a three-point turn

Low speed alone is not a failure. [recovery.mjs](../tools/nn/recovery.mjs) first asks whether something blocks the nose or the car faces backwards. All expressions below are neurons; the JavaScript module only emits graph rows.

A solid rival's projected half-length and half-width in the ego frame are:

```text
L = 2.45*abs(opp.headingCos) + 1.0*abs(opp.headingSin)
W = 2.45*abs(opp.headingSin) + 1.0*abs(opp.headingCos)
front body = solid AND 0 <= 100*fwd <= 2.45+L+.5
                   AND abs(100*right) <= 1+W+.25
rear body = same lateral predicate, -(2.45+L+.5) <= 100*fwd <= 0
```

The length row has weights .0245 and .01, bias .0295, then compares against the /100 forward observation. The width row uses .0245 and .01 in the opposite order, bias .0125. Abs uses two ReLUs. The .5 m longitudinal and .25 m lateral padding are declared clearance heuristics. The solid bit excludes all-zero towed slots. Wrecks and living bodies have identical recovery geometry.

Nose-wall evidence is OR(ray0, ray1, ray2 ≤3.2/45). The 3.2 m threshold leaves .75 m beyond the 2.45 m half-body. Rear-wall evidence uses ray13 ≤3.2/45. Rays at ±150° can hit a parallel side wall outside the body and are deliberately excluded from the straight reverse-path predicate. Side clearance instead decides the steering lock. ForwardBlocked is nose-wall OR any front body; rearBlocked is rear-wall OR any rear body.

The entry equations are:

```text
slow = H((3/40)^2 - speedFwd^2 - speedRight^2)
backwards = H(-headingCos)
forwardProgress = H(speedFwd-1/40) AND H(progressRate-.5/40)
integrate = slow AND (forwardBlocked OR backwards) AND NOT forwardProgress
            AND raceActive AND grounded AND recoveryAllowed AND NOT oldRecoveryActive
stuck' = G(clip(oldStuck+1/30, 0, .6), integrate; 1)
trigger = H(stuck'-.5) AND H(stallTimer-.1) AND NOT oldRecoveryActive
```

The .1 stall sensor means 1.2 s without four metres of route, protecting launch. The .5 s integral is consecutive obstructed low-speed evidence, not a decaying debt that can trip on the next launch. A clear, forward-facing car cannot enter recovery, even with stale stallTimer=.95 and oldStuck=.6. Forward route motion above the stated thresholds prevents new entry while a car pulls away.

Release has geometric hysteresis. All three nose rays must clear 6.4 m and no front body may overlap. This is a 4.9 m body length plus 1.5 m margin; at the 4 m/s recovery cap, nominal stopping distance at roughly 5 m/s² is 1.6 m. Ordinary wall recovery releases when that corridor is clear and headingCos>0. Recovery that began facing backwards retains a turn latch until headingCos≥cos(30°)=.866025404 and the corridor is clear. Reaching a few m/s beside the same corner no longer bypasses clearance and drives back into it.

A trigger requests reverse only when the nose is blocked and the rear path is clear. A backward-facing car with a clear nose starts a forward turn. With both ±80° side clearances at least 2.6 m and |headingSin|≥sin(10°)=.173648178, the selected forward-turn sign is exactly sign(headingSin), the shorter rotation. If the current latch disagrees and horizontal speed≤6 m/s, the network reconsiders it immediately. Trigger, leg replan and failed motion also reconsider the sign. Thus a post-collision −138° heading cannot retain a +1 latch merely because the car moves.

When the shortest turn is not clear or its sign is ambiguous, left/right scores use their ±80° ray, subtract four for clearance≤2.6 m, and add ±.25 for a preferred direction. The preference is heading sign except within 30° of parallel/antiparallel, where the passing-side winner breaks ambiguity. Ray span 1 plus preference span .5 is less than the four-point wall penalty. WTA chooses one sign; it is held between these explicit reconsideration events.

Steering is forwardTurn in drive and −forwardTurn in reverse: opposing full locks rotate the nose in the same direction. Alignment compensation remains after selection. The useful reverse-driving phase expires at 1.7 s, derived from sqrt(2*4.9/4.5)=1.48 s to back one body length plus margin. A blocked leg or .8 s below .2 m/s can still change gear after .5 s of useful motion. The no-motion threshold is below the .4 m/s static-friction band; .8 s covers at most .16 m. Physical movement is no longer the only failure test.

Two extra recurrent rows measure recovery quality:

```text
routeDebt' = G(clip(oldDebt - (40/30)*progressRate, 0, 8), recoveryActive; 8)
routeConcern = (routeDebt' >= 2.45) OR (stallTimer >= .5)
headingYawAgreement = headingSin * yawRate
turnImproving = gearMatches AND headingYawAgreement > 0
routeFailed = oldRecoveryActive AND routeConcern AND NOT turnImproving
              AND progressRate <= .5/40 AND oldLegTime >= 1.7
legTime' = (active AND NOT replan) ? min(2, oldLegTime+1/30) : 0
```

The debt coefficient −40/30 converts normalized route velocity to metres per decision. Positive route motion repays it; it survives leg changes and clears only when recovery releases. The 2.45 m threshold is half a car length, and the eight-metre cap bounds its gate. This integrates the supplied local route velocity; it does not reconstruct discontinuous wrong-strand penalties. stallTimer supplies the complementary rule-level deadline: .5 means six seconds without gaining four metres, leaving six seconds before the KO deadline. The .5 m/s route-progress threshold matches the existing forward-progress release evidence.

A successful turn can initially lose route: at a +151.2° error the nose points mostly backwards, but positive yaw is reducing the error. For a locally fixed route direction, d(cos(error))/dt = sin(error)*physicalYawRate. The observation yawRate is physical rad/s divided by three, so the factor of three cannot change this sign. The guard therefore uses headingSin*yawRate>0, provided the **requested gear is actually engaged**. A failed shift earns no exemption.

The product uses two square rows with [1,1] and [1,−1], then [.25,−.25] readout. Strict positivity is 1−H(−product): weight −1, bias zero into the step, followed by an affine complement. Zero yaw or zero heading sine is not improving. AND with gearMatches uses two +1 weights and bias −1.5. The final complement enters routeFailed as one extra +1 input; its five-input AND bias changes from −3.5 to −4.5. That deadline repair added seven rows and modified one existing row; it remains intact in this weapons version.

The sign is a local angular-progress heuristic, not a prediction of recovery completion. It ignores rotation of the route tangent itself, and any positive yaw alignment qualifies, however small. Existing obstruction, no-motion and 1.7 s useful-reverse-phase transitions remain in force; only the route-loss deadline is inhibited. The 90-decision regression follows a forward turn through about 67° while it initially loses route, then mismatches the gear and verifies that the deadline still fires.

Leg age is wall time, including shifts and opposite travel. Unlike the useful-motion timer, it cannot remain at zero while a gear request is failing. A route-failure replan bypasses the .5 s useful-motion minimum. If facing backwards and the rear is clear, it requests reverse; otherwise it requests forward, and in either case it recomputes the turn. Ordinary blocked/no-motion replans alternate gear. The two clocks therefore have different jobs: preserve enough actual reverse motion to manoeuvre, but prevent a motion-only failure detector from accepting endless route loss.

The phase clock advances by 1/30 only when observed gear matches requested gear and longitudinal velocity is not more than .2 m/s in the opposite direction. It saturates at 1.8 s and resets on leg replans, including replans that retain the same gear. A mismatch requests brake=.7 and throttle=0; this lets the physical gearbox change instead of spending the useful phase while travelling the other way. Recovery throttle is clip(20*(4/40−abs(speedFwd)),0,.8), with brake C(14*(abs(speedFwd)−4/40)) above 4 m/s. At nominal turn radius 2.85/tan(.6)=4.17 m, this caps lateral acceleration near 3.84 m/s² before damage or slip.

These equations bound the useful reverse phase, no-motion dwell, clocks, and the age of a route-failing leg once route concern is present and no engaged improving turn exempts it. **They do not bound total physical recovery time or guarantee regained route.** Repeated blocked legs, a side-corner obstruction missed by the forward rays, or insufficient space can still cause a stalled KO. The final measurements include these failures. The turn latch is for reorientation only; it is not an attack lock or a request to approach a rival.

## Worked forward pass

[trace.json](../tools/nn/trace.json) contains complete Float32 observations, initial and next state, intermediate activations and actions for thirty-one reproducible frames. The passing example starts at 20 m/s, pace 28 m/s, zero slip, zero memory and all wall rays clear. A living parallel rival is 8 m ahead, 4 m/s slower; aggression=.8, nerve=.7, vengeance=.7. Racing-line look points have lateral coordinate .03, or 2.1 m. Half width is 9 m, and the line is centred in the road. Arsenal distance fields default to 1 (absent); the remaining unspecified fields are zero. The initial velocity difference primes the effect-settling grace but does not alter normal racing control.

The first trace presents a slower rival 8 m ahead with aggression=.8. Eligibility and the WTA pick slot 0; the left-side tie wins. Grudge/rage start at zero, so aggression=.4, pass width=3−.6*.4=2.76 m. The first aggressive offset is −.368 m and neutral offset −.4 m, giving .032 m effective narrowing and hunt telemetry. At 20 m/s the new preview interpolates 16 and 28 m with fraction 1/3. Desired speed is 28*.9=25.2 m/s; constant pace ahead gives zero braking feed-forward. The table below contains the exact final Float32-input/Float64-network activations, including the new preview, horizontal speed and steering terms.

<!-- trace -->
| Neuron, passing frame | ID | Value |
|---|---:|---:|
| horizontalSpeed | 849 | 0.500000000 |
| previewMetres | 1512 | 20.000000000 |
| steeringSpeedFloor | 1516 | 0.500000000 |
| frontAxleYawTime | 1798 | 0.362500000 |
| frontAxleYawFeedback | 3240 | 0.020772547 |
| physicalGrip | 1345 | 2.000000000 |
| previewPace | 1977 | 0.629999989 |
| paceDeceleration | 2165 | 0.000000000 |
| brakingFeedforward | 2720 | 0.000000000 |
| jumpSettleDistance | 1367 | 0.625000000 |
| awayFromJump | 1525 | 1.000000000 |
| crateTimeRoom | 1336 | 1.000000000 |
| settleEscape | 2077 | 0.000000000 |
| rocketCorridor | 1550 | 1.000000000 |
| rocketIntercept | 2926 | 0.000000000 |
| rocketFlightTime | 2865 | 0.000000000 |
| hardExpiry | 1556 | 0.000000000 |
| hazardRoadForward | 1301 | 60.000000000 |
| hazardLinePosition | 1480 | 0.000000000 |
| hazardAimForward | 3181 | 0.736428571 |
| hazardAimRight | 3182 | -0.005257143 |
| fire | 3031 | 0.000000000 |
| weaponAge | 1390 | 0.000000000 |
| triggerDelay | 1159 | 0.899999991 |
| rocketOpportunity | 2981 | 0.000000000 |
| rearOpportunity | 1405 | 0.000000000 |
| reserveForGrudge | 2372 | 0.000000000 |
| settleClock | 2122 | 1.800000000 |
| recoveryAllowed | 2532 | 0.000000000 |
| hazardAvoid | 2894 | 0.000000000 |
| hazardOffset | 2948 | 0.000000000 |
| oilSteer | 3281 | 0.040000000 |
| oilThrottle | 3114 | 0.080000000 |
| grudge0 | 1526 | 0.000000000 |
| rage | 872 | 0.000000000 |
| displayRage | 2971 | 0.000000000 |
| shownRage | 2985 | 0.000000000 |
| leanSafe | 3086 | 1.000000000 |
| leanClock | 3119 | 4.500000000 |
| leaning | 3128 | 1.000000000 |
| neutralOffset | 2873 | -0.400000000 |
| boundedNeutral | 2919 | -0.400000000 |
| effectiveNarrowing | 3179 | 1.000000000 |
| routeDebt | 2892 | 0.000000000 |
| headingYawAgreement | 1061 | 0.000000000 |
| turnImproving | 1606 | 0.000000000 |
| routeFailed | 2947 | 0.000000000 |
| legTime | 3033 | 0.000000000 |
| turnReconsider | 2869 | 0.000000000 |
| traffic0.valid | 1407 | 1.000000000 |
| target0 | 2071 | 1.000000000 |
| trafficExists | 2192 | 1.000000000 |
| passDirection | 2340 | -1.000000000 |
| passing | 2812 | 1.000000000 |
| aggression | 2748 | 0.400000006 |
| activeLean | 3260 | 1.000000000 |
| passWidth | 3140 | 2.759999996 |
| requestedOffset | 3148 | -2.759999996 |
| passOffset | 3149 | -0.368000000 |
| passLower | 1478 | -7.399999762 |
| passUpper | 1479 | 7.399999762 |
| boundedOffset | 3164 | -0.368000000 |
| look.fwd.2 | 2163 | 0.285714289 |
| aimRight | 3193 | 0.024742856 |
| aimRadius2 | 3198 | 0.082244864 |
| pursuitCurvature | 3232 | 0.008595537 |
| pursuitWheel | 3233 | 0.024492381 |
| expectedYaw | 3236 | 0.057303579 |
| followingSteer | 3241 | 0.071798342 |
| wallReflex | 1111 | 0.000000000 |
| jumpSteer | 3261 | 0.071798342 |
| ground | 329 | 1.000000000 |
| paceShare | 1647 | 0.900000000 |
| desiredSpeed | 1976 | 0.629999989 |
| speedError | 2105 | 0.129999989 |
| throttleDemand | 2358 | 1.000000000 |
| slipAuthority | 1347 | 1.000000000 |
| fastSlipGrip | 1648 | 1.000000000 |
| slipGrip | 2166 | 1.000000000 |
| spinGrip | 1348 | 1.000000000 |
| forwardBlocked | 1942 | 0.000000000 |
| rearBlocked | 1943 | 0.000000000 |
| releaseRoad | 2148 | 1.000000000 |
| forwardProgress | 1049 | 0.000000000 |
| stuck | 2749 | 0.000000000 |
| escapeTrigger | 2813 | 0.000000000 |
| escapeActive | 2853 | 0.000000000 |
| turning | 2866 | 0.000000000 |
| escapeTimer | 3032 | 0.000000000 |
| phaseSlow | 3022 | 0.000000000 |
| phaseChange | 2982 | 0.000000000 |
| escapeTurn | 3048 | 0.000000000 |
| recoveryBrake | 3080 | 0.000000000 |
| reverse | 3057 | 0.000000000 |
| steer | 3288 | 0.071798342 |
| throttle | 3129 | 1.000000000 |
| brake | 3142 | 0.000000000 |

The Barn Burner frame has A=.8, r=0.000, age input=2 s, ready=1, rival range=.2 (20 m), bearing=.05, grounded with zero slip. Age advances to 2.033333333; delay is .9 s; range limit is 40 m and bearing limit .112 rad. The matched visible slot is about 19.975 m forward and .9996 m right with zero relative velocity. Flight time=(19.975−3.4)/92≈.18016 s; predicted lateral miss≈.9996 m, within the 2 m corridor. All opportunity bits are true, reservation is false, so fire=1 and next weapon age=0. This does not steer toward the firing target. Exact selected activations:

| Weapon neuron | ID | Value |
|---|---:|---:|
| rocketCorridor | 1550 | 1.000000000 |
| rocketIntercept | 2926 | 0.009995834 |
| rocketFlightTime | 2865 | 0.180163099 |
| fire | 3031 | 1.000000000 |
| weaponAge | 1390 | 2.033333333 |
| triggerDelay | 1159 | 0.899999991 |
| rocketOpportunity | 2981 | 1.000000000 |
| reserveForGrudge | 2372 | 0.000000000 |
| settleClock | 2122 | 1.800000000 |
| steer | 3288 | 0.086744195 |
| throttle | 3129 | 1.000000000 |
| brake | 3142 | 0.000000000 |

| Frame | Action steer / throttle / brake / handbrake / reverse / fire |
|---|---|
| Passing a slower rival | 0.071798 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Airborne overspeed | 0.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Clear road rejects stale stuck evidence | 0.079375 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Nose-wall recovery requests reverse | 1.000000 / 0.000000 / 0.700000 / 0.000000 / 1.000000 / 0.000000 |
| Reverse gear uses the opposing lock | 1.000000 / 0.500000 / 0.000000 / 0.000000 / 1.000000 / 0.000000 |
| Back-off complete: shift to forward | -1.000000 / 0.000000 / 0.700000 / 0.000000 / 0.000000 / 0.000000 |
| Clearance releases recovery | -0.041585 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Kinematic low-speed slip keeps drive | 0.495938 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Stale turn and moving route debt replan | 1.000000 / 0.000000 / 0.700000 / 0.000000 / 1.000000 / 0.000000 |
| Engaged improving turn suppresses route deadline | 1.000000 / 0.250000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Wrong engaged gear preserves failed-shift deadline | -1.000000 / 0.000000 / 0.700000 / 0.000000 / 1.000000 / 0.000000 |
| Barn Burner aligned at twenty metres | 0.086744 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 1.000000 |
| Foghorn defends against close incoming shot | 0.086744 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 1.000000 |
| Whirl cancels recovery | 0.000000 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Hazard offset uses clear road | -0.173968 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Oil limits steering and throttle | -0.213968 / 0.000000 / 0.200000 / 0.000000 / 0.000000 / 0.000000 |
| Urgent grounded obstruction overrides settling | 1.000000 / 0.000000 / 0.700000 / 0.000000 / 1.000000 / 0.000000 |
| Yawed nose sees a centred road hazard | -0.108281 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Three-metre rocket fly-by is rejected | 0.095695 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Targetless soft expiry waits | 0.095695 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Airborne hard expiry waits for grounding | 0.000000 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Grounded hard expiry releases the item | 0.095695 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 1.000000 |
| Empty car approaches a crate forty metres ahead and 4.5 metres right | 0.004733 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Pickup immediately removes the crate detour | 0.000000 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Passed or absent crate cannot remain a target | 0.000000 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Filtered crate target goes left: left-side rival vetoes the detour | -0.066164 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Opposite-side rival leaves the filtered crate lane clear | -0.022229 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Late row change is unreachable: keep the racing line | 0.000000 / 1.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Fast car anticipates falling pace before a jump | 0.000000 / 0.000000 / 0.328399 / 0.000000 / 0.000000 / 0.000000 |
| Sideways forty metres per second still needs braking | 1.000000 / 0.000000 / 1.000000 / 0.000000 / 0.000000 / 0.000000 |
| Optional high-speed crate is skipped for insufficient approach time | 0.000000 / 0.000000 / 0.229999 / 0.000000 / 0.000000 / 0.000000 |

### Faster-car forward pass

A straight grounded clay approach is travelling at 32.4 m/s. Current pace is 36 m/s, the eight-metre pace note is 34 m/s, encoded grip is 1.1, and the jump is 20 m away. The graph computes horizontal speed .81, chooses a 32.4 m preview, decodes grip 2.2, and requests .9×36=32.4 m/s. The next desired speed is .9×34=30.6 m/s. Thus paceDeceleration=100×(.81²−.765²)=7.0875 m/s² and brakingFeedforward=7.0875/(2.2×9.81)≈.328399. Despite essentially zero current speed error, the car brakes before exceeding the falling note. The noRaceBrake gate removes throttle. Jump distance 20 m is inside the one-second 32.4 m alignment window, so lateral detours are off. Straight geometry produces zero steering and no weapon is held. Selected actual activations, including Float32 input rounding:

| Fast-frame neuron | ID | Value |
|---|---:|---:|
| horizontalSpeed | 849 | 0.810000002 |
| previewMetres | 1512 | 32.400000095 |
| frontAxleYawTime | 1798 | 0.223765431 |
| physicalGrip | 1345 | 2.200000048 |
| previewPace | 1977 | 0.765000021 |
| paceDeceleration | 2165 | 7.087493241 |
| brakingFeedforward | 2720 | 0.328398345 |
| jumpSettleDistance | 1367 | 0.810000002 |
| awayFromJump | 1525 | 0.000000000 |
| paceShare | 1647 | 0.900000000 |
| desiredSpeed | 1976 | 0.809999979 |
| speedError | 2105 | -0.000000024 |
| steer | 3288 | 0.000000000 |
| throttle | 3129 | 0.000000000 |
| brake | 3142 | 0.328398679 |

Action is 0.000000000 / 0.000000000 / 0.328398679 / 0.000000000 / 0.000000000 / 0.000000000 in steer/throttle/brake/handbrake/reverse/fire order.
<!-- /trace -->

The subsequent trace frames cover airborne braking, genuine obstruction, released recovery, forward progress, a stale turn with route debt, the engaged-turn exemption, weapon opportunities and expiry, smoke/effect protection, and the two retained crate-review defects. Their full observations, old/new state vectors and every displayed activation are in trace.json; the verification script replays all six output actions exactly. The frame descriptions identify synthetic circuit fixtures, not necessarily situations sampled from a race.




### Crate trace: the same final weights

A grounded car travels at 25 m/s on a straight, 9 m half-width road, with pace 36 m/s and aggression .8. It holds nothing. A live crate is 40 m ahead and 4.5 m right. Every ray is clear, and there is no traffic, hazard or nearby jump. Previous state is zero. The interpolated line is centred, so the lateral error is 4.5 m. The search range is 45+15×.8=57 m, the ramp is (57−40)/20=.85, and the requested offset is .85×min(4,4.5)=3.4 m. The first filtered offset is (2/15)×3.4=.453333 m, so clearance tests the right lane. Reach allowance is .2×40=8 m at this speed; the full 4.5 m required change is reachable. Float32 observation rounding accounts for the final digits below.

The ordinary one-second preview is 25 m in this frame. The short lateral component is 2×.453333/(40²+.453333²)≈.00056659 m⁻¹. Straight-road return cancellation is zero. The synthetic encoded surfaceGrip=1 means physical grip=2, so spare-grip curvature is .75×9.81×2/25²=.023544 m⁻¹, so this first command is not capped. The pursuit wheel is atan(2.85×curvature); the existing slip/yaw controller produces the six actions below. On the next frame a held Barn Burner makes crateSeeking=0 and clears the offset, without changing weapon-trigger rules.

| Crate neuron | ID | Activation |
|---|---:|---:|
| crateTimeRoom | 1336 | 1.000000000 |
| fire | 3031 | 0.000000000 |
| pursuitCurvature | 3232 | 0.000566594 |
| steer | 3288 | 0.004733416 |
| throttle | 3129 | 1.000000000 |
| brake | 3142 | 0.000000000 |
| crateDistance | 780 | 40.000001192 |
| crateLine.right | 2353 | 0.000000000 |
| crateLineError | 2719 | 4.499999881 |
| crateAllowance | 790 | 1.879999995 |
| crateRange | 791 | 57.000000179 |
| crateRamp | 1334 | 0.849999949 |
| crateFutureAligned | 2929 | 1.000000000 |
| crateTrafficClear | 2978 | 1.000000000 |
| crateEgoLine | 1302 | 0.000000000 |
| crateFiltered | 2897 | 0.453333306 |
| crateToRight | 2915 | 1.000000000 |
| crateReachError | 2819 | 4.499999881 |
| crateReachAllowance | 1958 | 8.000000238 |
| crateReachable | 2847 | 1.000000000 |
| crateSeeking | 2991 | 1.000000000 |
| crateRequest | 2877 | 3.399999797 |
| crateOffset | 3019 | 0.453333306 |
| crateBounded | 3037 | 0.453333306 |
| crateLaneError | 3044 | 0.453333306 |
| crateHorizon | 1340 | 40.000001192 |
| crateLaneCurvature | 3070 | 0.000566594 |
| crateCancelReturn | 3217 | 0.000000000 |
| crateCurvatureBudget | 3225 | 0.023544000 |
| crateAppliedCurvature | 3231 | 0.000566594 |

## Feedback-assisted edit log

All rows below are human-style equation changes, not trials in an automated selection loop. Earlier racer observations refer to their original simulator revisions; they are not current weapons results. The final tables are authoritative.

### Retained racer construction and review history

| Step | Evidence or derivation | Assigned change |
|---|---|---|
| Initial racer rewrite | New contract removed cold urgency and interception; tested reference uses preview pursuit and pace/slip envelopes. | Replace the derby modules with the equations above; choose .97 pace share, .95 slip gain and .12 residual-yaw damping as explicit engineering heuristics. Initial reverse clock 1.1 s. |
| Launch grace | Initial solo was repeatedly reversed below 3 m/s and eventually stalled; trace showed the first reverse at about .5 s. | Require the raw 1.2 s route-stall grace in addition to integrated low speed. Solo then completed three laps with 48.871 s best and 7.376% moving slip. |
| Protected recovery launch | A seed 7 trace showed a side-wall car repeatedly shifting and reversing before it could accelerate forward. | Derive roughly 1.5 s to back a 4.9 m car at 4.5 m/s², add .2 s gear prefix, then protect 1.5 s of forward launch. Total clock 3.2 s; no attack logic. |
| Passing smoothing and speed load | Immediate side/eligibility changes gave a discontinuous lateral aim; a pure proportional speed loop requires error to supply road load. | Add.25 s offset filter. Add nominal rolling/drag feed-forward .04+.15*v², gated below pace. Hunt display now requires an actual narrowed pass. |
| Wall margin | The diagnostic car was beside a wall at sdf≈2.2 m, with tiny heading-based recovery steering, repeatedly returning to the same obstruction. | Add the racing line's2.6 m clearance reflex to normal steering and the recovery latch. No speed, damage or sim constants changed. |
| Jump-cap notice | Parent restored jump maximum speeds through the air zones after smoothing. | Reread/re-measure the frozen simulator; do not alter policy constants to compensate. |
| Measurement correction | Seed 2903 had 81 raw leader-ID switches;41 had zero route advantage due to quantized ties. | Keep the incumbent at ties within 1e−6 m; count actual changes after 5 s. Added a metric regression and reran the fixed network. |
| Static wreck audit | The initial traffic heading test excluded sideways wrecks even though solid obstacles must count. | Apply heading eligibility only to living traffic. Add perpendicular/reversed-wreck tests and rerun all seeds; no constants selected from race scores. |
| Final simulator review | Parent changed pace to use the actual line surface including mud, repaired grazing rays, made route progress continuous with wrong-strand penalties, and corrected ranking. The artifact hash check detected the change. | Keep neural weights unchanged; rerun all tests, solo/reference and all nine race measurements on the new simulator. Prior development timings are not causal comparisons to this final table. |

| Three-jump recovery baseline | Parent added Hump, the 6.4 m Pancake funnel, low contact lever and fromAbove. Current-sim baseline seeds 7/1709 had 5/1 stalled KOs and 10.680/8.330% stuck. Old trigger used low speed without obstruction. | Add projected solid-body and wall evidence, consecutive slow-time integration, forward-progress inhibition, active/turn latches and opposing full locks. No sensor or simulator change. |
| Successful turns were timed out | Initial new wall fixtures showed a car turning at 3.7 m/s with open road; a 1.7 s forward timeout reversed it before the heading recovered. | Only the reverse leg expires by time. Forward turns continue until heading/corridor release or physical failure. Stop opposite-direction velocity before driving; pause phase clock during shifts. |
| Clear rays missed a pinned chassis | Seed 7 OL' SMOKEY stayed around .02–.03 m/s under full lock with centre rays clear. | Add a per-leg no-motion integral: .8 s initially below 1 m/s triggered the alternate leg. This was too broad for damaged launch, corrected below. |
| Side-wall lock and slow damaged launch | Seed 42 showed full lock grinding beside a side wall; MAD MUFFLER at engineHealth=.379 was making .4 m/s reverse motion but the 1 m/s detector called it failed. | Choose full-lock direction with a 4-point side-wall penalty, larger than the 1.5-point score span. Define failed motion below .2 m/s, matching the gear deadband and below the .4 m/s friction band; retain .8 s dwell. |
| Repeated corner return | Seed 7 OIL BARON and GRUDGE JUDY released as nose clearance crossed 3.2 m, then drove back into the same corner. Seed 42 ROAD KAREN later bypassed the new clearance check merely by reaching 3 m/s. | Require 6.4 m release clearance: body length 4.9 m plus 1.5 m margin. Remove the moving-speed bypass for an already active recovery. New entry is still inhibited by forward progress. |
| Rear rays reported a side wall | Seed 42 TETANUS had rear centre clearance about 28 m while the ±150° predicate said blocked. The fixed right-wall fixture also wasted a reverse leg despite a clear nose. | Use the rear centre ray plus projected bodies for reverse-path blockage. Start reverse only for a blocked nose with clear rear; otherwise turn forward. This fixed the physical fixture regression without weakening its check. |
| Low-speed kinematic slip | Fixed nose-wall fixture was free by about 3 s but crept near 1 m/s for several seconds with throttle zero. Full-lock kinematic beta≈.324 rad exceeds the old all-off threshold .266667 rad. | Fade body-slip authority from 2 to 6 m/s using C(10*abs(speedFwd)−.5). Those speeds span about .1g to .88g lateral acceleration at full lock. Keep wheelspin suppression and all high-speed equations unchanged. The final domain correction below replaces the initial forward-only ramp. |
| Horizontal-speed domain audit | Synthetic vf=0, vr=8 m/s exposed that a forward-only low-speed ramp would remove body-slip protection during a fast sideways slide. | Use squared horizontal speed: C(50*(speedFwd²+speedRight²)−.125), with the same 2 and 6 m/s endpoints. This follows lateral load and is invariant under horizontal velocity rotation. Add multi-direction boundary tests and remeasure every final artifact. |
| Final evidence | Same nine seeds, fixed weights; aggression-off changes only harness observations from decision zero. | Record fromAbove, completed car-lap times and paired costs. Measure both all-cars-off and a preselected car-0-only clamp with all opponents unchanged. No further weights changed after these final measurements. |

| Evidence | Reasoned equation change | Verification scope |
|---|---|---|
| Reviewer observed a stale +1 turn at −138° and a moving car losing route. | Choose signed heading when both side corridors clear; reconsider a disagreeing latch below 6 m/s. Add half-body route debt, six-second rule urgency and a 1.7 s wall-clock failed-leg deadline. | Mirrored frozen fixtures, including 5.2 m/s physical movement with negative route rate; deadline while gear never engages; controlled physical stale-latch spawn. |
| Construction audit showed the useful-motion minimum could still block a deadline during a failed shift. | Let routeFailed bypass that minimum; leg wall time advances independently of useful motion. This is an equation correction, not a candidate score choice. | Regression requires both routeFailed and phaseChange under a permanently mismatched gear. |
| Rear-quarter car at (−3.5,+3.5) m masks wreck at (12,0) m. | Move ahead, lateral and slower-or-wreck predicates before the WTA; retain rear-quarter occupancy in side scores. | Old checkpoint selects rear car/no pass; final selects wreck/−3 m pass, with rear lane occupied. |
| Ungoverned narrowing had large collision/recovery cost; airborne and clamped passes could report hunt. | Add posture/recovery/clearance gates and a .5 s pulse with ≥4 s rest. Compare the actual bounded aim with a parallel neutral aim. Use squared horizontal speed for drift. | Safety masks, pulse duration/cooldown, road-clamp and airborne fixtures, sideways drift, both ablation arms. |
| Algebraic audit: filtering only the narrowed request leaves a narrowing tail after safety fails. | Mux back to the neutral offset whenever lean is false, after both filters and before road clamping. No race scores selected this change. | Every cooldown decision has identical effective and neutral bounded offset. |
| Early rage display was weak, while changing control rage would alter driving. | Add display-only eight-second leak, +2.5×contact and +.2 per lost rank place; retain the six-second driving-rage equation. | Exact recurrence/half-life tests and dependency-graph exclusion from all action and driving-state outputs. |
| Parent reverted temporary raised floor, set ground friction=.3, changed descending-hit attribution to upper, running-only finish and rare grazing rays. | No neural retuning for these changes. Count event.upper≥0, including car ID 0; require a living winner with progress≥laps×track.length. Discard earlier final-number attempts and remeasure the frozen revision. | Hash manifests on race and ablation runs; results below. |

The later deadline review found that route debt could interrupt an engaged turn whose heading error was shrinking. The correction exempts only gearMatches AND headingSin*yawRate>0; failed shifts still expire. Mirrored and multi-tick fixtures preserve that repair. The parent subsequently finalized the three 1.75 m kickers and progress-based finish rules. No race-only constants were retuned for this weapons task.

### Weapons construction and feedback

The immediate pre-weapons spec is retained in pre-weapons.json solely for inspection. The new input layout appends 24 fields; existing observation indices remain unchanged. Construction begins from named equations, not that checkpoint's numerical outputs. Rebuilding restores the current weights deterministically.

| Observation / derivation | Reasoned edit | Evidence and scope |
|---|---|---|
| Contract adds ready-gated fire, eleven held-item flags, raw danger/effect readings. | Add one held clock, class trigger circuits, bounded deadlines, temperament/grudge/rage thresholds, effect grace, oil input slew limits, smoke identity retention and road-bounded detours. | Fixed-input tests cover every class, absence, deadlines, temperament, oil, throws and weapon credit. Initial constants are declared design heuristics. |
| Development seeds 1/7/42: seven of eleven Barn Burner shots were forced with no visible rival or well outside useful range; observed damage fractions 25/0/20%. | Extend aimed-only fallback from 12−4A−rage to 18−4A−rage seconds. Eighteen leaves two seconds below the required maximum; other classes keep their own deadlines. | Retained initial measurements in weapons-development.jsonl. This was a reasoned dwell edit, not a range sweep. |
| The initial dropped-item deadline was 6−2A+2V, and those three development seeds released only 57.1/48.0/70.6% with a tailing rival. | Replace it with 12−4A+2V (8–14 s). A rival closing through a 40 m tail corridor at an assumed 5 m/s needs 8 s; impatience removes up to four seconds, vengeance adds up to two. Give drops their own fallback, so the general deadline cannot pre-empt it. | Final fixed-policy measurements below. The 5 m/s encounter model is heuristic; changed race outcomes are not proof of an isolated causal gain. |
| Boundary audit: absence is behindRange=1, equal to the maximum aggression/rage range threshold. | Require behindRange<1 before the rear opportunity comparator. | An endpoint regression at A=rage=1 rejects absence and accepts .99. |
| Initial hazard measurements showed very few clears. A controlled 25 m/s straight-road approach to a hazard 55 m away passed within .9 m: the 35 m warning and 45 m racing preview aimed the lateral excursion beyond the obstacle. | Start at 55 m and use the hazard's longitudinal plane as the detour waypoint, with a 16 m preview floor. Moving 7.2 m laterally at an assumed 8 m/s² needs sqrt(2*7.2/8)=1.34 s; at 35 m/s plus .25 s filter response this is 55.7 m, near the 60 m sensor range. | Same fixed fixture after correction clears the mine at about 5.52 m and retains >2.7 m road clearance. Oil still clips: no claim of complete avoidance. This is one derived correction, not a search over horizons. |
| Initial hazard observer could count the same car/hazard pair repeatedly after timeout and lacked per-kind results. | Count each pair once; report mine/oil separately; retain only completed encounters, recording censoring. | Measurement-only change, no control dependency. Local steering/clearance is observational, not causal attribution. |
| Weapons make the former solo driving test fire a compulsory Whirl in an empty field, so it no longer isolates steering/pace. | Restore its original sub-50 s threshold with an explicit no-crates test fixture. Also report armed solo separately with all weapons enabled. | No production mask; final armed-grid floors are never excluded or relaxed. |
| Parent's arsenal review changes blasts to 3D, restricts Hook/Bull to the back half, ends dead whirls, repairs oiled-during-whirl, prevents spring stacking, aims Piano along the road and fixes burnouts. | Reread the simulator, update the blast observer to use 3D geometry, discard the preceding final results and rerun the fixed policy. | All final manifests below use this revision. No simulator file was edited by this implementation. |

Random values occur only in independent arithmetic tests and the simulator's seeded races. No gradients, optimizers, fitting, candidate ranking or automatic parameter search were used.

### Final weapons review: corrections and measured scope

The saved pre-review checkpoint is weights SHA-256 `a189490e49a6cb6046d7a0044c77d1fb837bed8c173fb55393c7f5f1d302b2fa`, retained in weapons-review-baseline.json. At that historical weapons-review checkpoint the simulator was frozen. These repairs added 483 computed rows and 1005 edges; the 44 recurrent states are unchanged. No unrelated race, slip, passing or aggression constants were tuned.

| Evidence | Derived correction | Verification / limit |
|---|---|---|
| Reviewer and reproduced no-crates seed 1: pre-weapons racer 0 KOs; weapons checkpoint 3. A repeating hit/air grace can erase genuine recovery. | OR the strict grounded/upright/slow/blocked/not-whirling/stall>.5 exception into recoveryAllowed, using existing blockage and speed neurons. | Repeated-hit entry and active-latch retention pass; each necessary condition has a rejecting fixture. The full no-crates seed still has 3 KOs, so the old grid gap is not claimed fixed. |
| A centred hazard at road distance 40 m with nose 15° right appeared at −10.353 m laterally. | Rotate nose measurements into road coordinates before offset tests, and rotate the final waypoint back before pursuit. Expand signed bounds to M=100 from the new 92.7 m component bound. | Mirrored/offset Float32 transform identities; old fixture avoid=0, final avoid=1. |
| With only that rotation repair, the fixed oil case still clipped at 4.740 m centre clearance. The waypoint and 16 m floor postponed full lateral clearance until inside the patch. | Place the waypoint 6+2.45=8.45 m before the hazard centre and use pursuit's existing 4 m geometric floor. | One equation correction from footprint geometry, not a horizon sweep. Fixed mine and oil now clear at 7.296 m with 2.245 m minimum road clearance. |
| A 30 m/3 m stationary rival passed the old cone but the projectile flew by. A 20.5 m/s lateral rival also passed. | Add the two-metre range×bearing corridor, match a visible fixed slot, and gate on the relative-velocity intercept and projectile lifetime. No connection to driving outputs. | Both old fire=1 cases become fire=0; a forced real fly-by does zero damage, while the central shot hits. |
| Aimed/other deadlines bypassed posture and could fire targetless while airborne. | Soft limits only bypass patience/reservation. Require opportunity/posture until a separate 19 s hard expiry; final ready/race/ground/not-whirling gates always apply. | Targetless soft and airborne hard fixtures reject. Grounded hard release and the 570–571 tick clock boundary pass. That checkpoint had a measured inverted-car 21.4375 s hold and failed the 20 s floor. |
| wheelOff emitted inside damage handling reset the observer's health snapshot before blast. | Preserve the snapshot through nested wheelOff and ko; rebase on the enclosing operation event. | Actual rocket blast with .098 damage and wheel loss counts one damaging shot; three-metre fly-by counts zero. Policy weights do not read the observer. |
| Encounter “room” also combined road offset with nose lateral distance. | Apply the same coordinate rotation in the measurement observer before its road-room and encounter predicates. | Measurement-only correction; current shares are not directly comparable to the former 6.5% oil denominator. |

review-fixtures.json records the old/new neuron results on identical inputs. grid-final.jsonl records all three named no-crates revisions. Final races use only the fixed final policy. Rocket-rate changes mix a policy repair with corrected attribution, so they are not presented as an isolated causal gain from aiming. No candidate selection or parameter search ran.

### Crate-seeking construction and feedback

The pre-crate weights are SHA-256 `2fc10422769ec82f158b25c621fe88c35d7d2c39a9f6c1a3a9fae0694b7c262a`, saved as pre-crates.json. During the original construction pass the simulator stayed frozen. The original seven-seed measurement reproduces 886 empty-handed passes, 314 collections (35.44%) and 551 live-crate misses (62.19%). Baseline weapons, wall events, stuck time and armed solo results were captured before changing any weights. Every row below describes a hand edit to an equation or a correction to measurement code. No loop tries constants or retains a best-scoring candidate.

| Observation | Reasoning | Programmed change and checked scope |
|---|---|---|
| Neither crate sensor reached a control neuron. | A crate is a lateral race-line target, below safety and traffic. Its arc distance is not a forward projection. | Add piecewise line interpolation, empty/priority gates, temperament range, one filtered offset, and road bounds. Initially use a short crate waypoint and an absolute ±4 m offset. The physical 4.5 m fixture collects, while held/blind controls do not; the first grid improves collection to roughly 48%, below the floor. |
| Seed-1 failed approaches include error −10.7 m with offset stuck at −4 m; a safe side near the wall repeatedly fails the 12 m ray gate. | An absolute line-relative cap prevents completing a crossing already in progress. A 12 m diagonal ray demands much more than body clearance. | Bound the incremental request from current e by ±4 m; retain road clamp. Derive diagonal clearance from 2.6 m / sin32°. Limit the short preview to 10 m to prevent a last-metre full-lock command. |
| The revised driving-only solo has nine wall events and 19.067 stuck seconds versus zero/zero before. The trace shows a crate preview delaying turn-in; the armed solo grows to 182.692 s. | A collection point is not a replacement for the normal corner preview. Aggregate pickup gains do not justify the driving regression. | Remove short full-path pursuit. Retain the ordinary preview and initially use only a normal offset. The isolated drive returns to zero wall events and zero stuck time, but the physical crate remains 3.673 m away: lateral convergence is too slow. |
| Normal-preview offset alone misses the fixed crate despite the right sign. | The turn-ahead term and lateral convergence need separate horizons. | Add the finite-distance lateral correction while preserving the ordinary corner term. A boundary target misses by 3.504 m; aiming at the centre still misses by 3.346 m with an arbitrary 3 m/s² correction cap. Keep pickup reach as an activation threshold, not the aimed boundary. |
| The physical trace shows the lane correction pinned at .0032–.0041 m⁻¹ while ordinary heading feedback partly cancels it. | A flat 3 m/s² cap ignores the available traction and load already used by the racing path. | Replace it with `.75*g*surfaceGrip/v² − abs(baseCurvature)`, floored at zero. The fixed crate is collected at 2.613 m minimum distance, without damage or wall contact. No fitted response gain is used. |
| Driving isolation still has four wall events after detours around curved crate approaches. The nose-relative nearest crate can switch rows while the future road is angled sharply. | Current heading alignment does not establish alignment at the future crate station. | Select the interpolated segment tangent and require it within 30° of the nose. The resulting isolated three-lap drive has zero wall events and zero stuck time. |
| Live-grid stuck time remains high; crate clearance checks see walls but omit passing's existing side-car occupancy. Also an offset's sign can disagree with movement from an already displaced car. | Crates must not use an occupied lane, including a rear-quarter rival, just because no slower forward target requests a pass. | Gate on the selected passing-lane occupancy predicate. Choose side from request−e. Add explicit alongside-car and curved-road regressions. Final races are measured as delivered, with all remaining misses reported; no survival or firing change is made. |
| The requested finish condition changed from mean-six running to two in every race. | Mean survival can conceal an empty finish; the user explicitly prefers conflict. | Change the reporting predicate to `every(running>=2)`. Add first/second credited-progress margin and retain lead changes. No weight depends on this reporting threshold. |

The test fixture's held-item control uses a long fire lock only to keep that synthetic item held throughout the two-second drive. Crate-driving isolation discards pickups before firing only in its harness. Neither behavior ships. The final physical, circuit, full-grid and solo results are distinct evidence; the controlled detour success does not establish the requested 65% pickup rate or no-harm grid result.

### Historical crate-rule measurement refresh

The game-side rules changed crate reach from 2.7 to 3.3 m and respawn from 9 to 4 s. That measurement-only pass changed no weights, construction behavior, driver wrapper or generic forward runtime. It reran the nine-seed races, both policies for the before/after comparisons, armed solo, physical fixtures and all report dependencies on the current simulator. Earlier construction observations remain historical; they are not recast as measurements on the new rules. The synthetic traces and neuron map were unchanged in that pass. The later review below changes the circuit and regenerates both.

### Final crate review edit log

The saved pre-fix network is `crate-review-baseline.json`, weights SHA-256 `cbb6f1a57ce230d1eeffaf4c20a9dbbf1159b1d6f73ee9f9a370642ea7688f70`. It and the pre-crate checkpoint were measured on the new mud **before** applying the two repairs. Both repairs were then implemented together, with no parameter candidates, search or follow-on tuning. `crate-review-final.json` reproduces both defects before and after; the final measured comparison is below.

| Observation | Reasoning | Direct edit / validation |
|---|---|---|
| Reset offset 0, ego +2.5 m and request +6.5 m produce a filtered target +.866667 m, but the old predicate checks right and misses a left-side rival. | The safety predicate must follow the target actually consumed by steering. | Wire `crateToRight` to filtered−egoLine. Mirrored reset/history fixtures require the movement-side lane and permit the opposite-side lane. |
| A disappearing middle crate leaves 7.76 m lateral change with 3.64 m left at 29.63 m/s; the old graph still seeks. | The full new row must be reachable under a gentle approach cone, not hidden behind a clipped/filtered request. | Add .2×distance allowance, tightened above 30 m/s to 6×distance/speed; derive .2 from existing 4 m /20 m ramp. Reject this late row; compare independent expressions at boundaries and deterministic random interiors. No steering gain changed. |
| Reviewer found many suppressed approaches, and suggested testing a smaller traffic veto if appropriate. | The existing code already checks one selected side, including a rear-quarter rival; there is no all-nearby-traffic veto to remove. | Retain it. No further safety relaxation or candidate evaluation was performed. Final pickup-rate misses are reported rather than removing unsafe passes from the metric. |
| Parent changed mud grip/drag to .78/.03; exact no-crate KO assertions were stale. | Historical race counts cannot be treated as a property of a different simulator. | Remeasure the three fixed checkpoints: pre-weapons 1 KO, pre-weapons-review 2, final 2; all have zero stalled KOs. Pin fresh baseline counts, retain no-worse current assertions and the three-lap finish requirement. |
| Physical crate regression still collects, but its centre-line displacement is 1.433 m because reach is now 3.3 m, not the old hardcoded 2.7. | Test actual pickup geometry and the real event, not an obsolete radius. | Require collected=true, minimum distance≤ARSENAL.crateReach, movement past 4.5−crateReach, zero walls, full health and >2.6 m road clearance. Held/blind trajectories remain exactly equal. |

### Faster-car feedback-assisted edit log

The starting full policy is pre-speed.json, weights SHA-256 `6b38a67d6d19db488536b73de835a82d8479e58b5b1ce62178d5f3b44ba03079`. Earlier log rows refer to earlier frozen simulators. The following are sequential equation corrections from concrete traces, never a list of parameter candidates ranked by score. Development used seeds 1/7/42 and controlled solo fixtures; all nine final runs follow the delivered equations.

| Evidence | Reasoned edit | Measured scope / limitation |
|---|---|---|
| The initial unarmed solo lap is 41.721 s with 8.729% stuck and 12 wall events. During a spin, forward speed falls below pace while large lateral velocity remains. | Compute sqrt(F²+R²) inside the network for pace control. Reserve 19% of pace-note lateral load with a .9 speed share. | The first control-only attempt still turtles in the unarmed solo; speed magnitude alone does not cure yaw instability. Retained for its correct velocity semantics, not claimed sufficient. |
| Corner-exit trace has yaw about 1.7 rad/s against a .4 rad/s target, and the old .95 action slip coefficient cancels only .57 of the physical angle. | Full slip-angle compensation in wheel units, plus front-axle yaw-velocity correction 1.45/max(6,V). | Unarmed best lap 37.246 s and .408% stuck, but 28 wall events; stronger feedback reduces spins without solving geometric corner cutting. |
| Discrete preview changes skip through tight exits at higher speeds, producing line offsets of several metres. | Replace speed-threshold point selection with continuous one-second interpolation, bounded 16–65 m. | Unarmed best 36.138 s, zero stuck and 4 wall contacts, all near the Hump. No lookahead sweep was used. |
| Jump approach still needs positive overspeed to produce braking; optional offsets have only half a second to decay at 50 m/s. | Add d(v²)/(2 ds) braking feed-forward from the 8 m pace note. End passing/hazard/crate eligibility max(25 m,1 s*V) before a lip. | Unarmed best 36.421 s with zero stuck and zero wall contacts in this diagnostic; armed outcomes still diverge and rollovers remain frequent. |
| New grip multipliers all arrive as 1.5 because of the raw clamp. | Report to parent; parent changes sensor to grip/2. Decode with weight 2 in braking and crate capacity; widen the crate signed gate to M=1. | No simulator file was edited here. Final results and exact-grid baselines use the corrected sensor hash. |
| The rocket circuit still uses old projectile speed/lifetime. | Read 92 m/s and 1.6 s from ARSENAL at construction time. Preserve the two-metre static/intercept corridor and no steering connection. | Arithmetic and physical rocket regressions pass. No target range or timing sweep. |
| The optional crate window is only .9–1.2 s at 50 m/s. A three-seed no-seeking ablation shows fewer wall events, though crashes diverge. | Require range/V≥1.5 s: H(range−60*horizontalSpeed). This keeps the path/ramp/sign/reach equations and weakens optional detours above 30–40 m/s by temperament. | Fixed off-line pickup still collects; the held/blind path remains identical. Full race collection is reported, not excluded as unsafe. |
| A declared-domain fixture can produce followingSteer>6 after the stronger front-axle feedback. | Recompute the signed-selector bound from the program; choose M=12 above the <11.161 bound. | Airborne and recovery gates no longer leak rejected candidates in the boundary fixture. No physical gain changed. |
| The old no-crates test pinned 1/2 KOs on another vehicle. | Remeasure the three named checkpoints on the current sim, pin 3/4, and retain finish/no-worse final assertions. Tighten the solo lap regression from 50 to 37 s. | Exact checkpoint assertions and physical regressions remain mandatory; no acceptance threshold is weakened. |

No changes to the slip-curve thresholds, weapon patience, aggression pulse, grudge memory or recovery timers were justified by these traces. They remain as documented. In particular, the network does not claim that higher grip moved the tyre's peak slip angle. Final misses, including weak natural drifting and frequent turtling, are reported below.

### Final wall-contact measurement refresh

The parent lowered wall-contact torque with CONTACT.wallContactLever=.12 and repaired a temporary collision-module syntax error before these measurements began. This is a simulator-only change: weights, construction behavior, runtime, neuron map and algebraic traces are unchanged. The previous simulator's final tables are preserved in results-before-wall-lever.jsonl and verification-before-wall-lever.json. Every current race table, physical trace, baseline comparison and ablation is rerun on the new simulator, without choosing or modifying a policy. The exact no-crates checkpoint test now pins 5 pre-weapons KOs and 4 pre-review KOs from fresh measurements; its final finish and no-worse KO/stalled assertions remain. The delivered network has one KO in this case. Old edit-log measurements remain historical observations on their named revisions.

## Verification and measurements

Regenerate in order:

```text
node tools/nn/build.mjs
node --test > tools/nn/test-final.txt
node tools/nn/crate-case.mjs > tools/nn/crate-cases-final.jsonl
node tools/nn/crate-driving.mjs > tools/nn/crate-driving-final.json
node tools/nn/crate-review.mjs > tools/nn/crate-review-final.json
node tools/nn/crate-diagnose.mjs 1 > tools/nn/crate-diagnosis-final.json
node tools/nn/inspect.mjs
node tools/nn/weapon-probes.mjs
node tools/nn/eval.mjs > tools/nn/results-final.jsonl
node tools/nn/eval.mjs --solo > tools/nn/solo-final.jsonl
node tools/nn/hazard-cost.mjs > tools/nn/hazard-cost-final.jsonl
node tools/nn/aggression.mjs > tools/nn/aggression-final.jsonl
node tools/nn/hazard-case.mjs > tools/nn/hazard-after.jsonl
node tools/nn/recovery-cases.mjs > tools/nn/recovery-final.jsonl
node tools/nn/display-rage.mjs > tools/nn/rage-final.jsonl
node tools/nn/grid-regression.mjs > tools/nn/grid-final.jsonl
node tools/nn/rocket-case.mjs > tools/nn/rocket-final.jsonl
node tools/nn/hold-review.mjs > tools/nn/hold-final.json
node tools/nn/review-fixtures.mjs
node tools/nn/verify.mjs
node tools/nn/document.mjs
```

155 tests pass, including 59 neural/evaluation tests. Arithmetic is compared with independent expressions at domain bounds and random interiors; WTA includes ties. Existing passing, recovery, engaged-turn, gear, telemetry, alignment, horizontal-speed and output-reuse regressions remain. The faster-car tests independently check continuous preview interpolation, horizontal speed, front-axle feedback, pace-gradient braking with the grip/2 encoding, acquisition/alignment time gates and the enlarged steering mux bound. The unarmed solo test now requires a lap ≤37 s, zero stuck time and zero KOs. Weapon tests cover all eleven weapon opportunities and ready/deadline gates, age reset, temperament, the tail absence sentinel, hidden-slot memory, oil inputs, forced-motion suppression with a strict urgent-obstruction exception, and actual mine/oil detours. A graph check proves rocket interception cannot alter driving actions. Review regressions also cover round-trip coordinate transforms, rocket corridor/intercept rejection, soft versus hard expiry including airborne retention, a real blast containing wheelOff, and the three-revision no-crates grid. Crate tests cover opposite-sign raw/filtered transients in both directions, opposite-side traffic permission, reach-cone boundaries and deterministic random interiors, late retarget cancellation, and a physical pickup versus held/blind controls. A test suite passing is not a claim that the separate acceptance floor passes.

The rebuild is byte-identical. 31 complete traces replay exactly, including 3232 selected intermediate activations, next state and six actions. Browser ESM bundle: 167795 bytes. No policy code from test/helpers/gunner.js ships.

### Faster-car adaptation: pickup and driving comparisons

An alive car enters a spot's observation window at route distance below 30 m. When route distance wraps above 500 m, record whether it was empty on entry and whether it now holds an item. If still empty, distinguish a live crate remaining from no crate remaining. Sample at 30 Hz after race second 3. This deliberately reproduces the supplied classifier: it can count a fast pickup-and-fire as a miss and does not count an approach censored by KO/finish. It does not reclassify unsafe or obstructed opportunities out of the denominator. The baseline is pre-speed.json, the preceding complete crate/weapons network, rerun on the current simulator in speed-before-final.jsonl. It records 720 development empty passes. The original pre-crate 886-pass result is historical and is not used as this adaptation baseline.

| Seed | Empty passes | Collected / empty | Collected % before → after | Live miss % before → after | Fired before → after | Wall hits before → after | Stuck % before → after |
|---:|---:|---|---|---|---|---|---|
| 1 | 86 | 45 / 86 | 42.982 → 52.326 | 57.018 → 44.186 | 48 → 45 | 270 → 116 | 8.622 → 3.225 |
| 7 | 127 | 54 / 127 | 55.670 → 42.520 | 44.330 → 57.480 | 52 → 53 | 186 → 113 | 11.899 → 1.999 |
| 42 | 91 | 42 / 91 | 52.294 → 46.154 | 47.706 → 53.846 | 58 → 43 | 246 → 102 | 8.657 → 1.836 |
| 1201 | 139 | 44 / 139 | 58.333 → 31.655 | 30.208 → 68.345 | 57 → 41 | 258 → 127 | 9.560 → 2.337 |
| 1709 | 118 | 66 / 118 | 58.025 → 55.932 | 39.506 → 44.068 | 45 → 68 | 148 → 143 | 6.056 → 2.654 |
| 2309 | 110 | 49 / 110 | 49.565 → 44.545 | 49.565 → 55.455 | 60 → 45 | 277 → 136 | 11.510 → 2.713 |
| 2903 | 128 | 54 / 128 | 61.111 → 42.188 | 36.111 → 57.813 | 66 → 52 | 315 → 125 | 12.151 → 2.098 |
| 3613 reserved | 157 | 42 / 157 | 63.291 → 26.752 | 27.848 → 73.248 | 50 → 41 | 208 → 106 | 12.187 → 3.650 |
| 4801 reserved | 147 | 49 / 147 | 56.757 → 33.333 | 33.333 → 63.265 | 65 → 56 | 296 → 154 | 13.894 → 1.984 |

| Group | Pickup % before → after | Live miss % before → after | Mean fired before → after | Wall events before → after | Pooled stuck % before → after |
|---|---|---|---|---|---|
| Development | 53.611 → 44.305 | 44.028 → 55.319 | 55.143 → 49.571 | 1700 → 862 | 9.951 → 2.403 |
| Reserved | 59.474 → 29.934 | 31.053 → 68.421 | 57.500 → 48.500 | 504 → 260 | 13.164 → 2.817 |
| All nine | 54.835 → 40.345 | 41.319 → 58.930 | 55.667 → 49.333 | 2204 → 1122 | 10.695 → 2.510 |

Armed solo, crates enabled, pre-speed → current policy on this simulator: best completed winner lap **46.900 → 36.604 s**; **154.554 s to three laps → 114.029 s to three laps**. Wall events 24 → 2; stuck 14.286 → 0.000%. A dash means no completed lap, not a zero or excluded result. This is the requested real weapon-enabled comparison.

The older pre-crate checkpoint is used only for a separate steering isolation, which discards each pickup before firing so weapon feedback cannot cause later divergence: three laps 128.508 → 116.808 s, wall events 13 → 5, stuck 10.167 → 0.000 car-seconds. This isolated comparison does **not** establish a no-harm result in the full grid. Extra weapons, traffic interactions and different crashes are not separated by the race comparison.

The physical 4.5 m off-line fixture collects with minimum crate distance 3.190 m, road clearance 2.783 m, full health and 0 wall events. Its crate-blind control misses at 4.527 m. Holding a weapon produces the same physical trajectory as the blind control. Tests also exercise priority gates, turning road geometry, lane occupancy, arithmetic boundaries and the spare-grip bound. Safety gates intentionally leave unsafe opportunities uncollected. The new acquisition-time veto makes optional detours weaker above 30–40 m/s, depending on temperament; collection is reported without a target in the latest brief.

### Retained crate-review regressions

The side-clearance and late-retarget fixes remain active. The same original synthetic fixtures still exercise them after the high-speed changes:

| Review fixture | Before crate review | Current |
|---|---|---|
| Filtered target goes left while raw request goes right | crateToRight=1.000, crateTrafficClear=1.000, crateSeeking=1.000 | crateToRight=0.000, crateTrafficClear=0.000, crateSeeking=0.000 |
| Disappearing middle crate leaves an unreachable late target | crateReachAllowance=—, crateReachError=—, crateReachable=—, crateSeeking=1.000 | crateReachAllowance=0.728, crateReachError=7.760, crateReachable=0.000, crateSeeking=0.000 |

### Every race: speed, survival and weapons

| Seed / role | Finish | Race s | Leader lap s | Running | KO / stalled / turtled | Stuck % | Longest stop s | Fired | Margin m | Lead changes |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| 1 dev | 3 laps | 111.946 | 36.629 | 5 | 7 / 1 / 4 | 3.225 | 4.867 | 45 | 249.646 | 1 |
| 7 dev | 3 laps | 114.954 | 36.550 | 9 | 3 / 0 / 2 | 1.999 | 2.867 | 53 | 189.400 | 2 |
| 42 dev | 3 laps | 113.171 | 36.554 | 6 | 6 / 0 / 5 | 1.836 | 2.267 | 43 | 219.062 | 1 |
| 1201 dev | 3 laps | 117.708 | 36.500 | 7 | 5 / 0 / 4 | 2.337 | 3.433 | 41 | 199.983 | 4 |
| 1709 dev | 3 laps | 113.946 | 36.754 | 9 | 3 / 0 / 1 | 2.654 | 2.767 | 68 | 108.902 | 4 |
| 2309 dev | 3 laps | 115.412 | 36.683 | 8 | 4 / 0 / 2 | 2.713 | 3.667 | 45 | 135.013 | 4 |
| 2903 dev | 3 laps | 116.404 | 37.425 | 7 | 5 / 0 / 4 | 2.098 | 2.833 | 52 | 204.185 | 4 |
| 3613 reserved | 3 laps | 116.492 | 37.383 | 8 | 4 / 0 / 2 | 3.650 | 3.633 | 41 | 0.193 | 8 |
| 4801 reserved | 3 laps | 112.662 | 36.525 | 7 | 5 / 1 / 2 | 1.984 | 2.967 | 56 | 164.183 | 5 |

Margin is the credited progress of the first running finisher minus the second running car at the final physics step, in metres. Lead changes use progress leadership after five seconds with incumbent ties retained.

| Seed | Pickup→fire median s | Longest / non-roof hold s | Rocket damaging / fired | Rocket % | Drops with tail / total | Tail % | Foghorn swats |
|---:|---:|---:|---|---:|---|---:|---:|
| 1 | 2.833 | 19.000 / 19.000 | 1 / 5 | 20.000 | 18 / 20 | 90.000 | 0 |
| 7 | 1.100 | 19.687 / 19.033 | 0 / 2 | 0.000 | 21 / 24 | 87.500 | 2 |
| 42 | 2.500 | 19.000 / 19.000 | 3 / 6 | 50.000 | 12 / 15 | 80.000 | 0 |
| 1201 | 2.367 | 19.000 / 19.000 | 5 / 5 | 100.000 | 16 / 17 | 94.118 | 0 |
| 1709 | 3.033 | 19.000 / 19.000 | 6 / 9 | 66.667 | 18 / 19 | 94.737 | 2 |
| 2309 | 2.500 | 19.000 / 19.000 | 4 / 5 | 80.000 | 16 / 22 | 72.727 | 0 |
| 2903 | 1.800 | 19.667 / 19.667 | 4 / 5 | 80.000 | 22 / 25 | 88.000 | 0 |
| 3613 | 1.167 | 19.000 / 19.000 | 4 / 4 | 100.000 | 18 / 18 | 100.000 | 1 |
| 4801 | 3.767 | 19.267 / 19.267 | 6 / 9 | 66.667 | 27 / 27 | 100.000 | 2 |

| Group | Mean fired | Mean running | Mean stalled | Mean turtled | Stuck % | Pooled dwell s | Rocket % | Tail-drop % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Development | 49.571 | 7.286 | 0.143 | 3.143 | 2.403 | 2.433 | 62.162 | 86.620 |
| Reserved | 48.500 | 7.500 | 0.500 | 2.000 | 2.817 | 2.533 | 76.923 | 100.000 |
| All nine | 49.333 | 7.333 | 0.222 | 2.889 | 2.510 | 2.467 | 66.000 | 89.840 |

Weapon totals, in contract order (Barn Burner, Grudge Seeker, Welcome Mat, Oil Slick, Smoke Bomb, Threshing Whirl, Repo Hook, Bedspring, Prize Bull, Grand Piano, Foghorn): **50, 44, 56, 39, 54, 40, 15, 38, 20, 41, 47**.

The observer records pickup/fired events and watches immediate health changes when a Barn Burner blast event is emitted, before that step's later car collisions. Nested wheelOff and ko events do not refresh the pre-operation snapshot; the enclosing blast does. Other completed operation events refresh it normally. It requires another car inside the 3D blast radius with reduced health. This measures at least one damaged rival per shot, not the number of victims; shots still flying at the flag remain in the denominator. This matches the current simulator's synchronous operation/event order. It remains an event/health observer rather than an explicit simulator damage tag, so future changes to nested events must preserve that boundary. The real stationary-target fixture emits wheelOff inside the damaging blast operation; the corrected observer reports one damaging shot. Its current damage is recorded in rocket-final.jsonl. A forced three-metre fly-by reports zero. Tail presence uses physical living rivals within 40 m and the sensor's .6 rad tail cone, including smoke-hidden rivals. Foghorn swats count nearby non-owned, non-bull projectiles removed at that firing event; the data show 7 such saves.

### Hazard encounters and cost

| Kind | Completed encounters with local room | Body-clear passes | Steered and body-clear | Share steered clear | Mean speed loss m/s |
|---|---:|---:|---:|---:|---:|
| mine | 61 | 40 | 40 | 65.574% | 2.205 |
| oil | 165 | 23 | 22 | 13.333% | 3.766 |

Each car/hazard pair is counted once, sampled at 30 Hz. Entry requires an armed mine/oil 10–55 m along the local road tangent, within radius+1 m laterally in that road frame, and a side destination at radius+1.2 m fitting current half width minus 1.6 m. The observer rotates nose-frame distances into the road frame before combining them with trackOffset; it uses the actual hazard radius; it does not assert a clear future road, available tyre grip or jump eligibility. A successful clear keeps centre separation>radius+1 m, and “steered” additionally observes input.steer pointing away at some sample. It does not prove that the circuit caused the clear. Removed nearby mines count as failed encounters; externally removed distant hazards are discarded. There are 5 unfinished encounters at flags. Mean speed loss is entry speed minus the minimum during the encounter (floored at zero); braking for the road and collisions can contribute.

The controlled physical fixture uses a 25 m/s spawn and hazard 55 m ahead. Correct frame rotation alone still clipped oil at 4.74 m; placing the waypoint before the near edge clears its full seven-metre body corridor. Final on/off results on the same frozen simulator:

| Hazard / avoidance | Centre clearance m | Minimum road clearance m | Time to 70 m route s | Body-clear |
|---|---:|---:|---:|---|
| mine on | 9.022 | 2.271 | 2.150 | Pass |
| mine off | 0.079 | 2.413 | 2.063 | FAIL |
| oil on | 9.022 | 2.271 | 2.150 | Pass |
| oil off | 0.072 | 2.413 | 2.112 | FAIL |

[hazard-cost.mjs](../tools/nn/hazard-cost.mjs) repeats the fixed seeds with only toHazard=1 and hazardRight=0 in a harness copy of the observations; production has no such mask. Match laps by car ID and lap number. Across 144 pairs, mean on−off cost is **-0.270 s/lap**, range -26.387 to 19.975 s. 31 on-laps and 37 off-laps have no match. Contact, pickups and weapon outcomes diverge, and matching survivors adds survivorship bias. This is the observed traffic-level counterfactual cost, not an isolated path-length penalty or a fitted coefficient.

| Seed | Matched laps | Mean avoidance on−off s/lap | Largest cost s |
|---:|---:|---:|---:|
| 1 | 13 | 1.188 | 16.929 |
| 7 | 16 | -2.483 | 11.892 |
| 42 | 15 | 1.031 | 7.196 |
| 1201 | 17 | -1.790 | 6.254 |
| 1709 | 18 | 0.196 | 4.691 |
| 2309 | 14 | 1.493 | 12.334 |
| 2903 | 15 | 0.694 | 8.646 |
| 3613 | 18 | -1.329 | 19.975 |
| 4801 | 18 | -0.588 | 2.496 |

### Temperament: controlled contrasts and actual drivers

All controlled contrasts use identical weights and fixed observations, changing only the stated input/state. The N=1 Foghorn case deliberately holds incoming=.75: it tolerates that threat until the 19 s hard expiry. A closer incoming shot would cross its defensive threshold immediately.

| Fixed situation | First fire s |
|---|---:|
| Aggression 0: rocket, rival 15 m ahead | 1.500 |
| Aggression 1: rocket, rival 15 m ahead | 0.767 |
| Vengeance 0: grudge at rear quarter | 0.767 |
| Vengeance 1: grudge at rear quarter | 3.767 |
| Nerve 0: Foghorn, incoming=.75 | 0.033 |
| Nerve 1: Foghorn, incoming=.75 | 19.000 |
| Initial driving rage 0: rocket, rival 35 m ahead | 19.000 |
| Initial driving rage 1: rocket, rival 35 m ahead | 0.867 |

| Driver | A / N / V | Fired across nine races | Median dwell s | Mean rocket firing range m |
|---|---|---:|---:|---:|
| OL' SMOKEY | 0.550 / 0.550 / 0.650 | 35 | 2.933 | 19.456 |
| TETANUS | 0.800 / 0.800 / 0.550 | 54 | 2.100 | 19.233 |
| MRS. PISTON | 0.750 / 0.500 / 0.850 | 33 | 3.300 | 37.331 |
| BAD NEIGHBOUR | 0.900 / 0.450 / 0.900 | 44 | 2.433 | 54.154 |
| ROAD KAREN | 0.650 / 0.750 / 0.950 | 37 | 3.633 | 6.471 |
| SCRAP DADDY | 0.900 / 0.900 / 0.400 | 37 | 0.833 | 23.260 |
| SGT. DENT | 1.000 / 0.700 / 0.600 | 36 | 2.367 | 62.322 |
| GRUDGE JUDY | 0.700 / 0.600 / 1.000 | 51 | 2.833 | 38.079 |
| KEVIN | 0.950 / 0.350 / 1.000 | 32 | 3.767 | 70.987 |
| OIL BARON | 0.600 / 0.950 / 0.700 | 23 | 3.133 | 38.633 |
| MAD MUFFLER | 1.000 / 1.000 / 0.300 | 33 | 0.767 | 72.290 |
| HEAD GASKET | 0.850 / 0.650 / 0.750 | 29 | 4.667 | 52.622 |

Actual driver counts are not controlled causal comparisons: rank, item mix, damage, pickup opportunity and survival differ. Rocket range=100 m means no visible ahead target, so forced shots raise the range mean. The fixed contrasts establish the temperament effect without using those confounders to fit weights.

### Racing, slides and recovery retained

| Seed | Hits/min | Hard/min | Crossroads % | Upper hits | Lead changes | Moving slip % | Winner |
|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 33.766 | 12.863 | 44.444 | 1 | 1 | 8.316 | MRS. PISTON |
| 7 | 23.488 | 12.527 | 13.333 | 2 | 2 | 6.918 | BAD NEIGHBOUR |
| 42 | 16.966 | 7.953 | 12.500 | 2 | 1 | 8.133 | HEAD GASKET |
| 1201 | 35.681 | 13.253 | 30.000 | 4 | 4 | 8.177 | OL' SMOKEY |
| 1709 | 31.594 | 15.270 | 15.000 | 1 | 4 | 8.207 | OL' SMOKEY |
| 2309 | 51.468 | 20.795 | 55.556 | 1 | 4 | 8.318 | KEVIN |
| 2903 | 32.989 | 13.917 | 45.313 | 1 | 4 | 8.070 | MRS. PISTON |
| 3613 | 35.539 | 14.937 | 23.188 | 1 | 8 | 6.379 | TETANUS |
| 4801 | 33.019 | 12.782 | 37.097 | 1 | 5 | 6.583 | KEVIN |

Stuck means a running car below 3 m/s horizontal speed after the first 5 s. Longest stop uses the same samples and includes gear shifts, oil and weapon effects. Moving slip requires horizontal speed>6 m/s and abs(slip)>10°, with the horizontal heading normalized. Hard contact strength≥.35; crossroad contacts lie within 16 m. Upper hits read event.upper≥0 (the legacy JSON aggregate name fromAbove remains). A lap finish requires a living winner's credited progress≥laps×track.length. Lead changes begin after 5 s and retain the incumbent at route ties. Leader best lap is a completed lap by a car leading at its lap event; lap one includes launch/grid offset.

Armed solo: 114.029 s to three laps; 3 completed laps, best 36.604 s. No-crates driving isolation: best 36.429 s, three laps 112.296 s, moving slip 0.000%. The same no-crates reference driver at paceShare=.8: best 38.412 s, three laps 119.525 s. Weapon effects and expiry shots remain enabled in armed solo and grid results. Pooled grid moving slip is 7.615% and includes externally forced spins.

| Fixed recovery case | First forward s | Route gain after 10 s | Reverse entries |
|---|---:|---:|---:|
| A: clear aligned launch | 0.238 | 276.449 | 0 |
| B: backward beside left wall | 2.304 | 210.861 | 0 |
| B: backward beside right wall | 5.937 | 65.925 | 0 |
| C: oblique clear launch | 0.604 | 258.477 | 0 |
| C: shallow clear launch | 0.238 | 263.918 | 0 |
| C: thirty degrees | 0.371 | 202.276 | 0 |
| D: stale post-collision turn with route debt | 5.771 | 104.470 | 1 |

### Aggression ablation on the current simulator

This harness clamps aggression, vengeance and hitMe inputs to zero from decision zero. In the current armed network this changes firing patience and crate range as well as the lean policy. It is an end-to-end temperament counterfactual, **not** an isolated narrowing or path-length cost. Rage and nerve remain active. Traffic, weapon outcomes and surviving matched laps diverge; the largest lap differences do not prove a stuck governor. No one-second bound is claimed.

| Seed | Matched laps | Mean on−off s/lap | Largest cost s | Fixed car 0 mean cost s |
|---:|---:|---:|---:|---:|
| 1 | 15 | 2.014 | 27.283 | -4.962 |
| 7 | 11 | -2.312 | 11.267 | — |
| 42 | 9 | 2.933 | 17.650 | — |
| 1201 | 17 | -1.631 | 9.721 | 2.895 |
| 1709 | 17 | 0.852 | 13.600 | — |
| 2309 | 12 | 5.497 | 25.070 | -6.518 |
| 2903 | 14 | -0.306 | 6.725 | -2.819 |
| 3613 | 20 | 0.294 | 21.421 | 0.090 |
| 4801 | 22 | -2.464 | 4.975 | -0.132 |

### Review reproductions and remaining hold/recovery limits

The same synthetic inputs through the saved pre-review checkpoint and the final network give:

| Review fixture | Before | After |
|---|---|---|
| Urgent obstruction during settling | recoveryAllowed=0.000, escapeActive=0.000 | recoveryAllowed=1.000, escapeActive=1.000 |
| Centred road hazard with nose fifteen degrees right | hazardLinePosition=-10.353, hazardAvoid=0.000 | hazardLinePosition=-0.000, hazardAvoid=1.000 |
| Rocket misses three metres sideways | rocketOpportunity=1.000, fire=1.000 | rocketOpportunity=0.000, fire=0.000 |
| Rocket crosses fast lateral traffic | rocketOpportunity=1.000, fire=1.000 | rocketOpportunity=0.000, fire=0.000 |
| Targetless soft deadline | rocketOpportunity=0.000, fire=1.000 | rocketOpportunity=0.000, fire=0.000 |
| Airborne hard expiry | rocketOpportunity=0.000, fire=1.000 | rocketOpportunity=0.000, fire=0.000 |

| Seed 1, no crates | KOs | Stalled | Stuck % | Race s |
|---|---:|---:|---:|---:|
| Pre-weapons racer | 5 | 1 | 7.577 | 130.229 |
| Before this review | 4 | 2 | 9.380 | 133.646 |
| Final | 1 | 0 | 4.253 | 111.175 |

The urgent exception is verified at the neuron/action boundary, including retention of active recovery under repeated hit pulses. On the current faster-car simulator, the no-crates exact checkpoints have 5 and 4 KOs, respectively, and the final network has 1. The regression pins those freshly measured baseline counts and still requires the final network to finish with no greater KO/stalled counts than the weapons checkpoint. The final network has fewer KOs than both saved checkpoints in this measured case; this does not prove recovery on every track state or seed.

The current maximum observed live hold is 19.687 s. The earlier pre-crate seed-7 run had a real 21.4375 s hold by an upside-down HEAD GASKET; this is historical evidence, not a claim about the current run. The grounded-only fire gate is unchanged. Hard expiry bounds patience, **not time until physical contact is available**. A universal 20 s bound and unconditional no-airborne-fire cannot both be guaranteed for arbitrary no-wheel-contact inputs. The refreshed seed-7 diagnostic is hold-final.json.

At 30 race seconds the 98 still-running sampled cars average 0.738 shown rage versus 0.558 driving rage. Display-only state has no graph path to control. Inference over 10,000 batches of twelve act() calls, including telemetry, measured alone after validation jobs completed: mean 0.395 ms, p95 0.604 ms, maximum 2.658 ms. No outliers discarded. The earlier concurrently loaded-host benchmark is preserved separately in results-final.jsonl; this is not a hard scheduling guarantee.

## Exactness, approximations and limitations

Exact in real arithmetic on the declared domains: affine transforms, abs/clips, square products, Boolean gates, WTA tie rule, finite clocks, half-life recurrences and fixed-slot masks. Finite-precision tests cover boundaries/interiors, not every possible float. Runtime assumes finite valid observations and physically consistent geometry.

Approximate: bicycle/front-axle steering, nominal bent-steering cancellation, friction-limited braking feed-forward, drag bias, sampled recovery, lateral filtering, the short hazard waypoint and the crate reach cone. The cone is a conservative desired approach slope, not a proof that available lateral acceleration can complete a manoeuvre. Heuristic: pace share, slip/yaw gains, traffic corridors, weapon ranges/delays/reservation, effect detection and detour room. No threshold is a learned estimate of hit probability. The complete policy remains a real neural program, but neither hand programming nor exact Boolean logic guarantees good physical outcomes.

The measured misses are: Leader best lap ≤37 s, every race (37.425 max); Moving slip >10° for ≥8% (7.615%). The fastest leader lap is 36.500 s against the 34 s stretch. The held-out label is only the requested reporting group. Rocket aim now includes a constant-relative-velocity intercept check, but cannot predict turns, target height or later collisions; the grounded hard expiry can still force wasted shots; drops can expire without a rival. The corrected controlled oil detour now clears. Grid oil avoidance is still imperfect: road curvature, traffic, narrow corridors and local waypoint approximations remain. Hazard-type absence forces mine avoidance to use oil-sized clearance. The local room classifier is more permissive than the controller near jumps. Waypoint detours can add time or put a car into other traffic; the paired costs show those consequences. Oil and external spins contribute to stuck and slip metrics without being excluded.

A smoke-hidden new attacker is unidentifiable from zeroed hitMe fields, though existing grudges and target identity survive. Display identity can outlive a towed rival until replaced or observed. The effect grace can postpone recovery until the urgent grounded/upright/slow/obstructed exception applies; the no-crates seed-1 grid now completes with 1 KO(s), and armed-grid failures remain. Slow Hook pulls below the impulse threshold are not explicitly identified. Recovery clocks bound individual phases, not physical completion before the stall deadline. Foghorn opportunity is verified and actual swats counted; it cannot defend without holding Foghorn. No weapon fires without wheel contact, even at hard expiry; consequently physical holds can exceed the 20 s floor, as demonstrated at the previous checkpoint.

Crate collection remains incomplete; the latest brief requests its rate rather than a minimum. The raw sensor reports only the nearest live crate in nose-lateral distance, so rivals can consume it before arrival and force a late change to a farther row. Unreachable late changes are now skipped rather than chased. Passing, occupied lanes, jumps, hazards, slip and corner gates deliberately veto detours. Clearance follows the filtered target side, including its reset transient. No all-traffic veto was removed: the existing occupancy test already selects only the movement-side lane. The new reach gate also rejects some collectable approaches; it does not optimize pickup rate. Interpolated geometry and the lateral-load estimate remain approximate. Neither individual physical pickups nor the steering-isolation harness establishes a no-harm guarantee; the full-grid comparisons and failures remain explicit above.

The final unarmed solo has 0.000% time above the ten-degree slide threshold: natural drifting is a weakness of the stronger stabilizing feedback. Grid slip includes weapon-induced motion, so the numeric result does not establish stylish controlled drifting. Armed solo is also slower than the bare driving case; all of its pickup, expiry-shot and weapon feedback is retained in the reported number. No universal one-second aggression cost guarantee is claimed. No simulator retuning is recommended to disguise misses. The 55 m hazard warning is only .95 s at 58 m/s; without a hazard-radius field, the conservative oil-sized clearance can fail at that speed. Passing remains a brief local lateral heuristic rather than a multi-car trajectory plan.

## Artifact identity

Simulator SHA-256: **b454261acdb7f5c27390be20d99ba34c5aabd8c96388e880d8372a00e1937241**. Weights SHA-256: **52821dc504857b9873f6d32def4759d5ca291281c88f33295b013cf138272d05**. The sorted source-file hash/mtime manifest is in results-final.jsonl. Evaluation rejects a simulator change during its run; documentation checks every final manifest against verification. Final weights use 2967 computed units and 45 state values; no original observation index moved.

This run includes the parent's final arsenal review: 3D blast range, back-half Hook/Bull pickups, dead-whirl shutdown, reliable oiled during whirl, nonstacking springs, road-projected Piano and burnout repair. Ground friction remains .3; all three kickers remain 1.75 m tall. The final wall impulse lever is CONTACT.wallContactLever=0.12. Current jump caps are Hump 27 m/s, Dropkick 31 m/s, Pancake 42 m/s. Arsenal constants are recorded below for reproduction; they are read only, never changed by this implementation.

The faster-car pass uses reach 3.3 m, respawn 4 s, mud grip 1.7/drag 0.03, and the parent's surfaceGrip/2 sensor encoding. The earlier faster-car circuit changes regenerated weights, traces and the neuron map. This final wall-lever pass changes measurement artifacts and exact-checkpoint test expectations only; weights and construction behavior are unchanged. The algebraic traces and neuron map have no simulator hash and remain byte-identical. The preceding complete network is pre-speed.json; speed-before-final.jsonl reruns it on this final simulator. The saved crate-review-baseline.json and crate-review-before.jsonl preserve the pre-fix policy and its same-simulator measurements. Files ending in reach27-respawn9 and before-mud-review are historical. Baseline and current-policy comparisons in the final tables were all rerun on this revision.

```json
{
  "crateReach": 3.3,
  "crateRespawn": 4,
  "fireLock": 0.5,
  "rocket": {
    "speed": 92,
    "life": 1.6,
    "hitReach": 2.3,
    "radius": 7,
    "push": 13,
    "lift": 3.5,
    "spin": 2,
    "damage": 0.14
  },
  "seeker": {
    "speed": 66,
    "life": 4,
    "turn": 4.4,
    "reach": 110,
    "dive": 26,
    "cruise": 6,
    "hitReach": 2.4,
    "radius": 6,
    "push": 10,
    "lift": 4.5,
    "spin": 2.5,
    "damage": 0.12
  },
  "mine": {
    "radius": 3.4,
    "life": 26,
    "arm": 0.7,
    "push": 4,
    "lift": 8,
    "spin": 1.5,
    "damage": 0.11
  },
  "oil": {
    "radius": 6,
    "life": 13,
    "grip": 0.2
  },
  "smoke": {
    "radius": 12,
    "life": 8
  },
  "whirl": {
    "seconds": 1.3,
    "turns": 2,
    "grip": 0.14,
    "reach": 4,
    "push": 11,
    "lift": 2.5,
    "damage": 0.09,
    "cutEvery": 0.04,
    "rehit": 0.45
  },
  "hook": {
    "speed": 130,
    "life": 0.9,
    "reach": 70,
    "hitReach": 2.5,
    "reel": 1.5,
    "snug": 5.5,
    "snap": 95,
    "pullOwner": 30,
    "pullVictim": 13,
    "damage": 0.02
  },
  "spring": {
    "radius": 2.8,
    "life": 24,
    "arm": 0.5,
    "launch": 13
  },
  "bull": {
    "speed": 82,
    "life": 10,
    "hitReach": 3,
    "gore": 12,
    "goreLift": 5,
    "goreDamage": 0.07,
    "radius": 6,
    "push": 14,
    "lift": 6,
    "spin": 3,
    "damage": 0.17
  },
  "piano": {
    "fall": 1.7,
    "radius": 5,
    "push": 6,
    "lift": -6,
    "spin": 2,
    "damage": 0.3
  },
  "horn": {
    "radius": 18,
    "push": 15,
    "lift": 3
  }
}
```

Production files: src/ai/index.js, src/ai/weights.js; generic src/ai/network.js remains the forward runtime, with one added scalar sqrt activation. Construction/measurement sources and artifacts live in tools/nn. Tests: test/nn.test.js. Documentation: this walkthrough and NEURON_MAP.md. **Nothing was edited outside the authorized paths; no simulator or sensor edits, git initialization or commits.**

