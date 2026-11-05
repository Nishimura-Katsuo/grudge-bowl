# The Knot: five-lap racing with weapon-led conflict

One directly programmed recurrent network drives all twelve racers. This pass adds an open-road following-speed cap and refuses passes into occupied lanes; the elbow is restricted to crossroads. Racing-line, slip/yaw, jump, recovery and weapon circuits remain. Every policy calculation is compiled into weights and activations. No training, fitting, search, runtime rule wrapper or simulator edit was used.

## Final acceptance status

**The full targets are not met. This is not an accepted race balance.** Clock finishes remain failures. Before/after runs use the same frozen five-lap, 200 s simulator. Only seeds 1,7,42 informed equation corrections. The nine previously used seeds are the development reporting group. Eleven fresh seeds (6007,6011,6029,6043,6053,6067,6073,6089,6101,6113,6121) were reserved until the weights were frozen in road-freeze.json; no policy edits followed their measurement.

| Target | Development | Fresh held-out | All twenty |
|---|---|---|---|
| Open hits/car-lap at least halved | -45.104% FAIL | -10.607% FAIL | -26.132% FAIL |
| Open hard hits/car-lap at least halved | -39.871% FAIL | 6.114% FAIL | -15.454% FAIL |
| Crossroads rate within 15% | -60.105% FAIL | -19.712% FAIL | -40.415% FAIL |
| Every flag in 175-200 s | 7/9 flags; FAIL | 7/11 flags; FAIL | 14/20 flags; FAIL |
| At least two running every race | 2 minimum; PASS | 3 minimum; PASS | 2 minimum; PASS |
| Median flag gap no worse (flag races only) | 182.344 → 189.149 m; FAIL | 116.308 → 251.343 m; FAIL | 130.206 → 234.096 m; FAIL |
| Median leader best lap within 2% | 36.629 → 36.729 s; PASS | 36.746 → 36.767 s; PASS | 36.700 → 36.748 s; PASS |
| No stuck regression | 2.257 → 3.333%; FAIL | 2.083 → 2.732%; FAIL | 2.157 → 2.996%; FAIL |
| No stalled/car-lap regression | 0.009 → 0.030; FAIL | 0.007 → 0.012; FAIL | 0.008 → 0.020; FAIL |
| No turtled/car-lap regression | 0.102 → 0.096; PASS | 0.076 → 0.079; FAIL | 0.087 → 0.086; PASS |
| All eleven weapons used | 11/11; PASS | 11/11; PASS | 11/11; PASS |

The matched-wrapper timing mean is 0.255 → 0.329 ms: a regression, despite staying below 2 ms. Production mean/p95/max for twelve calls is 0.353/0.615/1.343 ms. No outliers were discarded.

## Runtime boundary and architecture

The simulator runs at 240 Hz, decisions at 30 Hz. OBS supplies 277 Float32 raw observations (the 24 arsenal fields are appended). The generic forward pass uses Float64 affine sums and activation/state buffers; act() copies/clamps six Float32 outputs and decodes display telemetry. No policy is in the wrapper, and telemetry never controls the car. The same tensors drive all twelve cars; temperament arrives through observations.

| Quantity | Value |
|---|---:|
| Raw observations/actions | 277/6 |
| Recurrent/total inputs | 47/324 |
| Layers/units | 128/3309 |
| Edges/parameters | 6300/9609 |

The previous network had 2967 units, 5650 edges and 45 states. This network has 3309 units, 6300 edges and 47 states. The unchanged generic runtime uses linear, ReLU, step, square, atan, reciprocal and sqrt.

State indices 0–10 are fixed-slot grudges, 11 rage, 12 slow-time accumulation, 13 recovery clock, 14 recovery gear, 15 recovery steering, 16 filtered passing offset, 17 recovery-active latch, 18 backward-turn latch, 19 phase no-motion integral, 20 route debt in metres, 21 wall-clock leg age, 22 aggression pulse/cooldown clock, 23 neutral passing offset, 24 display-only rage, and 25 previous race position. Weapon states are 26 weapon age (seconds), 27 effect-settling countdown, 28–29 previous forward/right speed, 30 hazard offset, 31–32 previous steering/throttle, and 33–43 remembered display target bits. State 44 is the filtered crate offset in metres. State 45 is crossing grace (.75 s), state 46 is flight grace (1 s). All start at zero. All old state values are read before any next state is copied. Construction-time loops merely replicate named rows across eleven fixed slots. There is no per-act allocation in the runtime or wrapper source.

Actions are steer, throttle, brake, handbrake, reverse, fire. Fire and telemetry.firing are the same binary neuron activation. Handbrake is zero. Slip feedback manages the existing tyre physics; the stronger correction produces no >10° slides in the current unarmed solo, so the numeric field slide result must not be mistaken for a demonstration of controlled solo drifting. There is no new raw sensor and no simulator edit by this implementation.

## Neuron map and arithmetic substrate

[NEURON_MAP.md](NEURON_MAP.md) lists every layer range, unit, exact row, activation and consumer. The primary interfaces are:

<!-- interfaces -->
| Block output | ID | Layer | Domain | Consumer |
|---|---:|---:|---|---|
| grudge0 | 1700 | 5 | [0,1] | Anger, reservation, memory |
| rage | 953 | 2 | [0,1] | Driving and weapons |
| shownRage | 3278 | 26 | [0,1] | Display only |
| weaponAge | 1527 | 4 | [0,20] s | Trigger comparisons |
| triggerDelay | 1268 | 3 | [.45,1.5] s | Pickup patience |
| reserveForGrudge | 2651 | 11 | bit | Tactical restraint |
| rocketOpportunity | 3270 | 26 | bit | Barn Burner |
| rearOpportunity | 1542 | 4 | bit | Four dropped classes |
| hornDefence | 437 | 1 | bit | Immediate defence |
| fire | 3329 | 31 | bit | Action 5 and HUD |
| settleClock | 2402 | 9 | [0,1.8] s | Recovery grace |
| recoveryAllowed | 2814 | 11 | bit | Recovery entry and latch |
| settleEscape | 2358 | 8 | bit | Urgent obstruction exception |
| rocketIntercept | 3212 | 22 | normalized lateral metres | Projectile corridor |
| hardExpiry | 1730 | 5 | bit | Grounded fallback |
| hazardAvoid | 3188 | 20 | bit | Detour mux |
| hazardOffset | 3232 | 23 | [-92.7,92.7] m | Filtered waypoint |
| hazardAimFloor | 2040 | 6 | [4/70,63.55/70] | Detour preview |
| oilSteer | 3625 | 123 | [-.25,.25] | Oil steering |
| oilThrottle | 3486 | 61 | [0,.35] | Oil propulsion |
| displayTarget0 | 3046 | 14 | bit | Display identity memory |
| leanClock | 3429 | 50 | [0,4.5] s | Elbow pulse/cooldown |
| traffic0.valid | 1581 | 4 | bit | Passing WTA |
| target0 | 2352 | 8 | bit | Current visible target |
| boundedOffset | 3508 | 74 | road interval | Pursuit |
| pursuitCurvature | 3576 | 97 | [-1.3829,1.3829] 1/m | Steer/yaw |
| desiredSpeed | 3378 | 38 | [0,1.35] | Pace control |
| slipAuthority | 1484 | 3 | [0,1] | Traction envelope |
| stuck | 3032 | 14 | [0,.6] s | Obstructed entry |
| routeDebt | 3181 | 20 | [0,8] m | Recovery progress |
| turnImproving | 1804 | 5 | bit | Deadline exemption |
| escapeActive | 3136 | 18 | bit | Recovery control |
| crateFiltered | 3191 | 20 | [-26.5,26.5] m | Actual-side clearance |
| crateToRight | 3205 | 21 | bit | Side ray and occupancy |
| crateReachError | 3101 | 16 | metres | Reach comparison |
| crateReachAllowance | 2227 | 7 | [0,24] m | Reach comparison |
| crateReachable | 3130 | 17 | bit | Crate eligibility |
| horizontalSpeed | 930 | 2 | [0,sqrt(4.5)] | Preview, pace, steering |
| previewMetres | 1686 | 4 | [16,65] m | Line interpolation |
| frontAxleYawTime | 2043 | 6 | [.085,1.209] | Yaw feedback |
| physicalGrip | 1482 | 3 | [.2,3] | Braking |
| brakingFeedforward | 3407 | 44 | [0,1] | Race brake demand |
| crateTimeRoom | 1473 | 3 | bit | Optional pickup veto |
| steer | 3632 | 128 | [-1,1] | Action 0 |
| throttle | 3495 | 64 | [0,1] | Action 1 |
| brake | 3487 | 61 | [0,1] | Action 2 |
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
freePace = ego.pace*share
p = min(freePace, recoveryActive ? 1.5 : trafficSpeedLimit)
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

On open road request ±3 m only if the selected lane is clear with the existing road/ray margins; otherwise request zero lateral offset and follow. Crossroads retain the original passing logic. Anger is C(.5*temperAggression+.2*drivingRage+.3*grudge). Only in the 30 m crossing approach or .75 s crossing grace, a living selected rival within 10 m may provoke narrowing if race-close/grudged and anger≥.35. The final governor additionally requires:

* At least one wheel down, no current recovery or gear/direction braking, heading error≤15°, and |slip|≤.10 rad.
* More than max(25 m, one second of travel) to the jump lip.
* No body in the selected passing lane, at least 12 m on its ±32° ray, and enough road to place the neutral ±3 m offset while retaining the 1.6 m body margin.

The clearance requirements are local geometric heuristics. The 15° heading margin and .10 rad slip threshold keep the elbow within the normal tyre-control region; they are not a proof of safe contact. Twelve metres covers the nearby rival range plus body margin approximately.

The clock implements a brief elbow and a cooldown:

```text
start = allowed AND oldLeanClock <= 0
leanClock' = start ? 4.5 : clip(oldLeanClock - 1/30, 0, 4.5)
lean = allowed AND leanClock' > 4
width = 3 - .6*G(anger, lean; 1)
request = openRoad ? G(3*direction, passing AND clearance;128) : G(passDirection*width, passing;3)
```

The comparator uses bias −4−1e−9 to exclude the endpoint at four seconds despite floating roundoff. A constant eligible fixture produces at most 15 consecutive active decisions, or .5 s, followed by at least four seconds without an elbow. The cooldown continues if the target disappears or posture becomes unsafe; those interruptions cannot restart the pulse. The .5 s pulse and 1:8 pulse/rest ratio are explicit budget heuristics, not fitted optima or a guarantee on collision consequences. The maximum instantaneous narrowing remains .6 m.

Maintain two parallel low-pass offsets, both with alpha=1/(30*.25)=2/15:

```text
aggressiveOffset' = 13/15*oldAggressiveOffset + 2/15*request
neutralOffset' = 13/15*oldNeutralOffset + 2/15*(openRoad ? politeRequest : legacyNeutralRequest)
effectiveOffset = lean ? aggressiveOffset' : neutralOffset'
```

The final mux removes even the filter's narrowing tail when the pulse ends or safety fails. It does not cancel ordinary passing. After one second a cancelled 3 m neutral excursion leaves about .041 m. The neutral state also gives a counterfactual reference for telemetry; it is computed by neurons, not by the wrapper.

Road-relative line position is (trackOffset−lineOffset)*halfWidth*10. Clamp each offset between −halfWidthMetres−linePosition+1.6 and +halfWidthMetres−linePosition−1.6. The 1.6 m margin is one metre of half-body plus .6 m clearance. At the 6.4 m funnel, a centred line permits ±4.8 m before the smaller ±3 m request; with the line 4.48 m right of centre, only .32 m of further right offset is available. This is a point-aim bound, not a proof that a colliding chassis stays on the road.

`hunt` means an eligible, safe elbow is active **and** the road-clamped aim offset is at least .01 m smaller in magnitude than its road-clamped neutral counterpart. It also requires a forward look point and |roadSteer|≤.98 so the normal steering command has not saturated. It does not claim measured wheel displacement or an actual hit. Airborne/recovering cars and completely clamped-away excursions cannot report hunt. Drift uses speedFwd²+speedRight²≥(6/40)² and |slipAngle|≥10°; it no longer mistakes a fast sideways slide for a stationary car. Mode scores are race=.5, hunt=2, drift=3, unstick=4, so recovery has priority over drifting, and drifting over an elbow.

Anger never requests reverse. Physical open-road traffic now limits desired speed via the new circuit below; weapon anger/grudge consumers are unchanged. Older aggression ablations are historical, not final-policy measurements.

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

At 30 Hz, 240 decisions give an eight-second half-life; the leak is 0.9971160533355892. A .2-strength contact adds .5, and losing one of twelve-car rank positions adds .2. Countdown observations prime previous rank without awarding rage. Rank loss can include contact/ranking consequences, so this is honestly a lost-position signal, not an inferred clean overtake. The display also reacts to a bot's own credited hit through iHit. Tests trace dependencies and prove that neither display state nor rank input reaches an action or driving-state output. The temperament/grudge controller still consumes only drivingRage. Current contact/weapon-hit samples are recorded in rage-final.jsonl; the JSONL artifact reports the samples.

Inside max(25 m, one second of horizontal travel) of a jump lip, no new pass offset is requested. The filter gives about a second to return toward the line at 25 m/s. Inside 8 m, steering demand is clipped to ±.18 before alignment compensation, corresponding to .108 rad nominal wheel angle. With no wheels down, the steering demand and brake are zero; alignment compensation still cancels bent steering. The brake is immediately available again at first wheel contact, using the current pace error, so Pancake's landing brake zone remains active. These gates cannot undo a collision at take-off or guarantee zero slip at the lip.

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

The age affine row has weight 1 from oldAge and bias .03333333333333333. Two ReLUs clip it at 0 and 20, and the signed gate uses M=20 from that ceiling. Its next state is G(age, NOT fire;20), so a consumed item resets the clock immediately. Hard expiry is H(age−19): a longer deadline than every soft deadline, leaving one second below the requested 20 s limit for normal grounding/decision delay. Fire always requires ready, raceActive, at least one wheel down and not whirling. An expired airborne or inverted car retains the item until wheel contact; this is necessary for the no-airborne-fire rule, and it means elapsed live holds can exceed 20 s. The current twenty-race sample includes a non-roof hold of 22.271 s; the old 20 s hold target is not met. This firing circuit was not changed in this pass.

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



## New open-road following circuit

For each solid, wall-visible body .5–60 m ahead, within 2.6 m laterally, and headingCos≥.5, compute:

```text
V = 40*sqrt(speedFwd² + speedRight²)
c = max(0, -40*opp.relVelFwd)
gap = 5.5 + .35*V + c²/16
cap = clip((40*speedFwd + 40*opp.relVelFwd + (100*opp.fwd-gap)/1.2)/40, 0, 1.5)
limit = min(1.5, every eligible cap)
desiredSpeed = min(freeDesiredSpeed, openRoad AND NOT recovery ? limit : 1.5)
```

5.5 m is two 2.45 m half-lengths plus .6 m clearance. The .35 s allowance covers the 30 Hz decision and .25 s passing filter with margin. Closing distance c²/(2a) uses a=8 m/s², below nominal dry grip. The 1.2 s gap-correction horizon covers lateral response, filter and braking delay; it is an engineering choice, not fitted. Actual gap weights are +14 on horizontalSpeed, +1/16 on squared closing speed, bias 5.5. The cap row weights are [1,1,100/48,-1/48] on speedFwd, relative velocity, fwd and gap. Two ReLUs clip [0,1.5]; eligibility muxes use M=1.5. Each minimum is a−ReLU(a−b). Eleven blocks are statically unrolled.

OpenRoad requires grounded, headingCos≥.8, not whirling, toCrossing≥45 m, toJump≥60 m, and expired crossing/flight grace. CrossGrace resets to .75 s whenever toCrossing≤30 m; otherwise clip(old−1/30,0,.75). FlightGrace resets to 1 s while no wheel is grounded and then counts down. Both selectors use M=1. Recovery bypasses following. The existing post-hit settling state is not a following veto: a grounded shove must not disable following for 1.8 s. New following contributes no limit while approaching a crossing or airborne/landing. This is a proved gate property, not a guarantee of unchanged arrival times or intersection collision rates.

The existing 30 m passing WTA, ±3 m lane targets, side occupancy and road clamps remain. On open road only a clear selected lane receives a request; blocked lanes get zero. Request and offset selectors have conservative M=128 over the much smaller ±3 m filtered domain. The elbow can run only in the crossing approach/grace, regardless of settling. Weapons, rage, grudge and crate construction are unchanged. No extra turning, reversing or braking to reach a victim is introduced.

The following corridor is nose-relative, not a curved swept-path planner. It cannot see smoke-hidden cars or anticipate sideways squeezes. Braking earlier can spread the field well before a crossroads, and fewer direct contacts can change later weapon trajectories. These limitations explain why circuit correctness alone cannot establish the requested physical targets.

## Worked forward pass

The first saved frame has V=20 m/s, a parallel slower car 8 m ahead, relative speed −4 m/s, no nearby crossing/jump, and zero memory. Closing=4; gap=5.5+.35×20+16/16=13.5 m. Cap=(20−4+(8−13.5)/1.2)/40=.285416667, or 11.4167 m/s. Free pace=28×.9=25.2 m/s. The existing brake controller saturates at one. The clear passing lane requests −3 m, filtered to −.4 m; the elbow is off. This is a late near-body fixture, not a guarantee of physical avoidance.

| Neuron | ID | Activation |
|---|---:|---:|
| openRoad | 2403 | 1.000000000 |
| crossGrace | 1735 | 0.000000000 |
| trafficFlightGrace | 1875 | 0.000000000 |
| follow0.valid | 1548 | 1.000000000 |
| follow0.closing | 457 | 4.000000060 |
| follow0.gap | 1316 | 13.500000030 |
| follow0.speedCap | 1737 | 0.285416661 |
| trafficSpeedLimit | 3348 | 0.285416661 |
| freeDesiredSpeed | 2245 | 0.629999989 |
| requestedOffset | 3488 | -3.000000000 |
| desiredSpeed | 3378 | 0.285416661 |
| steer | 3632 | 0.070491385 |
| throttle | 3495 | 0.000000000 |
| brake | 3487 | 1.000000000 |

Actual steer/throttle/brake/handbrake/reverse/fire: 0.070491385 / 0.000000000 / 1.000000000 / 0.000000000 / 0.000000000 / 0.000000000. trace.json contains full observations, initial/next memory and outputs for all 31 frames. NEURON_MAP.md lists every row and consumer.

## Feedback-assisted edit log

| Observation | Reasoned correction | Outcome/scope |
|---|---|---|
| First three baseline traces: 96 initially classified open events, 36 parallel front/rear contacts, only one hunt-mode event. | Add physical following and free-lane passing; retain weapon anger. | Labels describe events, not isolated causal attribution. Crate proximity alone does not establish crate-seeking blame. |
| Direct pressure prototype still cascaded after contact: settling disabled following; expanded passing mixed nose/line coordinates. | Remove settling from following, introduce explicit landing grace, restore the proven line-relative 30 m passing geometry. | Fixed development runs are preserved in road-development-initial.jsonl and road-development-pressure.jsonl. No parameter sweep. |
| Any tiny extra brake pressure also disabled propulsion despite free-pace error. | Replace direct extra braking with a speed cap feeding the existing controller. | Final development seed 1 still times out. It was not discarded or relabelled. |
| Physical jump contacts extended beyond airLength+15 m. | Final landing metric extends through landS+one second at maxSpeed. | Classification frozen before held-out measurement; no event is removed. |
| Five laps invalidate old exact checkpoint counts and three-lap test wording. | Fresh baseline counts 9 and 6; explicitly assert five laps in the solo regression. | Final finish/no-worse KO and stalled assertions retained. |

Historical edit logs are in walkthrough-before-open-road.md. The policy was frozen before fresh held-out results were inspected. No simulator balance experiment was performed.

## Verification and measurements

159 tests pass, including 63 neural/evaluation tests. Deterministic rebuild is byte-identical; 31 traces and 3542 selected activations replay exactly. New tests cover following equations, rear exclusion, crossing/landing grace, grounded-hit retention, lane refusal and contact/damage classification. Existing circuit, recovery and weapon regressions remain. No-crates seed-1 checkpoints have 9/6 KOs; final has 0. Green tests do not imply accepted gameplay.

Reproduce with road-eval.mjs baseline, road-eval.mjs final, eval.mjs --solo, grid-regression.mjs, node --test, inspect.mjs, verify.mjs and document.mjs. The final and baseline JSONL files include event snapshots and simulator manifests. Old final artifacts not referenced here are historical revisions.

### Fixed metric definitions

Car-laps sum nonnegative credited route gain from each car's own grid position divided by track length, including partial KO laps. Rates pool counts/exposure rather than averaging seed rates. Hits are damage-threshold hit events, not every touch. Hard means closing>6 m/s, matching the owner's estimate; strength≥.35 is still the separate legacy field. Crossroads means event position within 25 m of generated crossing coordinates. Landing means upper≥0 or either car in [lip, landS+maxSpeed×1 s]. Categories are exclusive: crossing, else landing, else open. Crossing landings remain in crossing; no events are discarded. Rear/braking/crate/early labels are descriptive, not causes. Stuck is running horizontal speed<3 m/s after second 5. A missing second car contributes infinite gap, never silently dropped. Timeout rows show gaps at stop, not a claimed flag. Flag-gap medians include only completed flag races; they are conditional measurements and do not excuse missing flags. The separate all-end gap includes every race. Pace compares the median leader best completed lap and separately solo; not every lap.

### Development: before → after

| Metric | Before | After |
|---|---:|---:|
| Open hits/car-lap | 0.930 | 0.510 |
| Open hard/car-lap | 0.594 | 0.357 |
| Crossroads hits/car-lap | 0.880 | 0.351 |
| Crossroads hard/car-lap | 0.591 | 0.297 |
| Landing hits/car-lap | 0.151 | 0.132 |
| Car-lap exposure | 324.839 | 333.098 |
| Stuck % | 2.257 | 3.333 |
| Stalled/car-lap | 0.009 | 0.030 |
| Turtled/car-lap | 0.102 | 0.096 |
| Median flag gap m | 182.344 | 189.149 |
| Median gap at every race end m | 182.344 | 189.149 |
| Lead changes/race | 3.889 | 2.111 |
| Median leader lap s | 36.629 | 36.729 |
| Weapons/race | 74.667 | 85.667 |
| Crate collection % | 47.574 | 57.067 |

### Fresh held-out: before → after

| Metric | Before | After |
|---|---:|---:|
| Open hits/car-lap | 0.871 | 0.779 |
| Open hard/car-lap | 0.514 | 0.545 |
| Crossroads hits/car-lap | 0.636 | 0.511 |
| Crossroads hard/car-lap | 0.449 | 0.377 |
| Landing hits/car-lap | 0.120 | 0.092 |
| Car-lap exposure | 433.984 | 432.821 |
| Stuck % | 2.083 | 2.732 |
| Stalled/car-lap | 0.007 | 0.012 |
| Turtled/car-lap | 0.076 | 0.079 |
| Median flag gap m | 116.308 | 251.343 |
| Median gap at every race end m | 116.308 | 231.874 |
| Lead changes/race | 4.818 | 1.818 |
| Median leader lap s | 36.746 | 36.767 |
| Weapons/race | 83.909 | 88.091 |
| Crate collection % | 48.109 | 54.097 |

### All twenty: before → after

| Metric | Before | After |
|---|---:|---:|
| Open hits/car-lap | 0.896 | 0.662 |
| Open hard/car-lap | 0.548 | 0.463 |
| Crossroads hits/car-lap | 0.741 | 0.441 |
| Crossroads hard/car-lap | 0.510 | 0.342 |
| Landing hits/car-lap | 0.133 | 0.110 |
| Car-lap exposure | 758.823 | 765.919 |
| Stuck % | 2.157 | 2.996 |
| Stalled/car-lap | 0.008 | 0.020 |
| Turtled/car-lap | 0.087 | 0.086 |
| Median flag gap m | 130.206 | 234.096 |
| Median gap at every race end m | 130.206 | 197.988 |
| Lead changes/race | 4.400 | 1.950 |
| Median leader lap s | 36.700 | 36.748 |
| Weapons/race | 79.750 | 87.000 |
| Crate collection % | 47.882 | 55.374 |

### Development finish table

| Seed | Race before → after s | Flag | Running before → after | Gap before → after m | Leader lap before → after s | Leads | Fired | Stuck % | Stalled/turtled |
|---:|---|---|---|---|---|---:|---:|---:|---|
| 1 | 192.475 → 200.004 | CLOCK | 3 → 5 | 922.820 → 206.827 | 36.629 → 36.904 | 0 | 85 | 4.228 | 1/5 |
| 7 | 196.204 → 192.492 | yes | 4 → 7 | 44.668 → 167.791 | 36.550 → 36.912 | 4 | 88 | 2.467 | 0/3 |
| 42 | 191.862 → 195.292 | yes | 4 → 3 | 182.344 → 449.784 | 36.554 → 36.471 | 3 | 74 | 3.305 | 0/5 |
| 1201 | 197.037 → 197.308 | yes | 4 → 5 | 395.711 → 68.437 | 36.500 → 36.833 | 1 | 82 | 2.563 | 2/2 |
| 1709 | 190.450 → 188.229 | yes | 5 → 6 | 600.094 → 189.149 | 36.754 → 36.433 | 1 | 101 | 0.841 | 0/3 |
| 2309 | 194.500 → 193.625 | yes | 4 → 4 | 17.256 → 370.004 | 36.683 → 36.588 | 2 | 104 | 3.667 | 2/4 |
| 2903 | 190.112 → 197.692 | yes | 5 → 5 | 265.393 → 236.317 | 36.771 → 36.729 | 1 | 85 | 3.093 | 0/2 |
| 3613 | 191.558 → 195.696 | yes | 5 → 6 | 85.906 → 112.634 | 36.975 → 36.617 | 4 | 79 | 4.565 | 2/3 |
| 4801 | 191.596 → 200.004 | CLOCK | 7 → 2 | 168.135 → 170.560 | 36.525 → 36.767 | 3 | 73 | 5.350 | 3/5 |

### Fresh held-out finish table

| Seed | Race before → after s | Flag | Running before → after | Gap before → after m | Leader lap before → after s | Leads | Fired | Stuck % | Stalled/turtled |
|---:|---|---|---|---|---|---:|---:|---:|---|
| 6007 | 194.958 → 200.004 | CLOCK | 5 → 4 | 146.116 → 298.997 | 36.746 → 37.825 | 2 | 77 | 2.402 | 0/5 |
| 6011 | 191.600 → 200.004 | CLOCK | 4 → 5 | 532.174 → 110.100 | 36.717 → 37.700 | 4 | 89 | 2.631 | 0/1 |
| 6029 | 193.708 → 198.325 | yes | 6 → 6 | 121.416 → 45.076 | 36.958 → 36.471 | 0 | 94 | 2.825 | 0/4 |
| 6043 | 191.296 → 192.729 | yes | 6 → 5 | 66.795 → 392.482 | 37.208 → 36.617 | 1 | 93 | 1.932 | 1/1 |
| 6053 | 192.083 → 200.004 | CLOCK | 5 → 3 | 65.345 → 15.710 | 36.550 → 36.767 | 3 | 83 | 2.920 | 0/6 |
| 6067 | 190.175 → 191.837 | yes | 6 → 9 | 52.506 → 24.678 | 37.167 → 36.921 | 2 | 102 | 1.624 | 0/2 |
| 6073 | 192.442 → 190.429 | yes | 6 → 6 | 138.995 → 466.713 | 36.588 → 36.704 | 1 | 84 | 2.961 | 1/4 |
| 6089 | 195.325 → 191.471 | yes | 1 → 6 | no rival → 231.874 | 36.979 → 37.312 | 0 | 99 | 3.077 | 0/1 |
| 6101 | 191.100 → 192.192 | yes | 8 → 4 | 116.308 → 547.401 | 36.496 → 36.646 | 2 | 60 | 4.734 | 1/5 |
| 6113 | 195.029 → 196.429 | yes | 5 → 3 | 78.858 → 251.343 | 37.100 → 37.221 | 1 | 88 | 2.219 | 0/3 |
| 6121 | 200.004 → 200.004 | CLOCK | 2 → 4 | 12.146 → 20.844 | 36.575 → 36.575 | 4 | 100 | 3.460 | 2/2 |

### Solo, weapons and attrition

Unarmed best lap 36.429 → 36.429 s; armed 36.604 → 36.604 s. All 11/11 weapons fire, mean 79.750 → 87.000 per five-lap race. Prior three-lap context was 49.333 fired/race, not a controlled lap-count ablation. Rage/grudge trigger equations are unchanged; weapon-probes.json contains independent temperament contrasts. Every per-seed weapon and crate count is in results-final.jsonl.

Actual health loss over twenty final races: car contact 56.295, wall 61.084, weapon 42.804, other 0.000 health units. Of 61 destroyed cars, 17 had a weapon as the last damaging operation. The event observer preserves pre-operation health through nested wheelOff/ko; it does not attribute a later wall crash to an earlier weapon. Health changes cannot directly cure turtling or delays from spins. This evidence does not support a specific blanket weapon-damage reduction as a cure for the failed timing/contact targets. No health/damage adjustment is recommended or applied without a separate controlled experiment.

## Contact diagnosis after the frozen comparison

Across twenty baseline races, 680 open-road events included 208 parallel front/rear contacts, 147 with a braking participant, 19 with a hunt-mode participant, and 414 in the first 40 s. The delivered network has 507 open events, but 239 front/rear contacts and 297 with braking; open hunt-mode contacts are zero. Thus the elbow was a small observed component, and the new following response worsened the rear-contact/compression problem even as total open events fell. These labels overlap and are not a controlled causal decomposition. Proximity to a crate fell from 348 to 129 events, but that alone cannot establish that crate steering caused those impacts. Crossroads and landing losses cannot be excused by unchanged local gates: earlier speed decisions change arrival timing.

## Exactness and limitations

Affine arithmetic, square-product identities, Boolean gates, min/max, clipped clocks and leak recurrences implement the stated mathematical program exactly in real arithmetic. Float64 deployment is checked at boundaries and interiors, not every floating value. Pursuit, headway, lane geometry and attribution are physical approximations or measurement conventions. No crossing-yield gate does not guarantee preserved collision counts after earlier following. Weapon outcomes and crate pickups can dominate later divergence. The tables, including clock finishes, govern acceptance. No target is weakened to turn a miss into a pass.

## Artifact identity

Simulator SHA-256: ff3833da5b4700345bb9824f2f9ef1c86c582b3b462206fb1c7a182820c4ca3e. Weights SHA-256: d75bafaa8bb7e0177fc9f029219967a98f42b97f7d17295ade504c6fb5ce2f62. Architecture: 128 layers, 3309 units, 6300 edges, 9609 parameters, 47 states. Rules are five laps and a 200 s backstop. Only src/ai, tools/nn, test/nn.test.js, docs/NEURAL_NETWORK.md and docs/NEURON_MAP.md were edited. No sim edits, training, fitting, parameter search, git initialization or commits.
