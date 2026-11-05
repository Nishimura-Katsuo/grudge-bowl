# The Knot: directly programmed racing and weapon conflict

The network is an executable program written into weights. Racing-line pursuit and slip/yaw feedback drive the car; neural comparisons select a free passing lane, a relative braking-distance circuit handles imminent closing, and a geometric guard prevents merging into an alongside body. Recurrent neurons keep grudges, rage, recovery and weapon timing. One generic forward pass drives all twelve cars. No training, fitting, parameter search or simulator edit was used.

## Final status

**The complete acceptance target is not met.** The revised metric confirms that the old 25 m crossing window confused launch packs with cross traffic. Passing and braking fixes remove the demonstrated preferred-gap delay, but the race tables still contain failures. No clock or attrition finish counts as a flag. Minimum running at shutdown does not substitute for the requirement to reach the flag.

| Target | Original twenty development | Fresh held-out |
|---|---|---|
| Every flag below 200 s | 15/20; FAIL | 5/8; FAIL |
| At least two running at every flag | 1 at race end; FAIL | 2 at race end; FAIL |
| Median flag gap no worse than original 9 m | 130.206 → 144.846 m; FAIL | 60.933 → 377.348 m; FAIL |
| Lead changes at least original 9 m / 14 m | 4.400 / 5.050 → 5.850; PASS | 4.500 / 5.375 → 6.750; PASS |
| Open hits at least halved vs original 9 m | -26.5%; FAIL | 7.5%; FAIL |
| Open hard hits at least halved vs original 9 m | -21.2%; FAIL | 7.5%; FAIL |
| Later crossing rate at least original 9 m / 14 m | 0.212 / 0.228 → 0.197; FAIL | 0.229 / 0.291 → 0.247; FAIL |
| Stuck no worse than original 14 m | 2.748 → 2.358%; PASS | 2.762 → 3.199%; FAIL |
| Stalled rate no worse than original 14 m | 0.019 → 0.011; PASS | 0.013 → 0.018; FAIL |
| Turtled rate no worse than original 14 m | 0.105 → 0.089; PASS | 0.094 → 0.107; FAIL |
| Weapons/race no worse than pass 1 | 84.650 → 80.550; FAIL | 80.750 → 71.625; FAIL |
| Crate collection no worse than pass 1 | 51.718 → 46.918%; FAIL | 55.166 → 46.376%; FAIL |

The 185–195 s aim is reached by 8/20 original development races and 3/8 held-outs. Timing also regresses: matched-wrapper mean for twelve calls is 0.252 ms original, 0.363 ms pass 1, 0.465 ms final. Production mean/p95/max is 0.476/0.726/1.373 ms. The repeat with no other local measurement jobs stays below 2 ms in this sample, but does not meet a literal no-increase target. The earlier shared-load run is retained in road2-timing-shared-load.json: production p95 1.477 ms and maximum 61.337 ms (the original network also recorded a 54.731 ms maximum). Those wall-clock outliers are not discarded or attributed solely to the graph.

## Runtime boundary and architecture

The simulator runs at 240 Hz, decisions at 30 Hz. OBS supplies 277 Float32 raw observations (the 24 arsenal fields are appended). The generic forward pass uses Float64 affine sums and activation/state buffers; act() copies/clamps six Float32 outputs and decodes display telemetry. No policy is in the wrapper, and telemetry never controls the car. The same tensors drive all twelve cars; temperament arrives through observations.

| Quantity | Value |
|---|---:|
| Raw observations/actions | 277/6 |
| Recurrent/total inputs | 47/324 |
| Layers/units | 131/4155 |
| Edges/parameters | 7896/12051 |

The pre-open-road network had 2967 units, 5650 edges and 45 states; the first open-road candidate had 3309 units, 6300 edges and 47 states. The final network has 4155 units, 7896 edges and 47 states. No new state was needed for this pass. The runtime and activations are unchanged.

State indices 0–10 are fixed-slot grudges, 11 rage, 12 slow-time accumulation, 13 recovery clock, 14 recovery gear, 15 recovery steering, 16 filtered passing offset, 17 recovery-active latch, 18 backward-turn latch, 19 phase no-motion integral, 20 route debt in metres, 21 wall-clock leg age, 22 aggression pulse/cooldown clock, 23 neutral passing offset, 24 display-only rage, and 25 previous race position. Weapon states are 26 weapon age (seconds), 27 effect-settling countdown, 28–29 previous forward/right speed, 30 hazard offset, 31–32 previous steering/throttle, and 33–43 remembered display target bits. State 44 is the filtered crate offset in metres. State 45 is crossing grace (.75 s), state 46 is flight grace (1 s). All start at zero. All old state values are read before any next state is copied. Construction-time loops merely replicate named rows across eleven fixed slots. There is no per-act allocation in the runtime or wrapper source.

Actions are steer, throttle, brake, handbrake, reverse, fire. Fire and telemetry.firing are the same binary neuron activation. Handbrake is zero. Slip feedback manages the existing tyre physics; the stronger correction produces no >10° slides in the current unarmed solo, so the numeric field slide result must not be mistaken for a demonstration of controlled solo drifting. There is no new raw sensor and no simulator edit by this implementation.

## Neuron map and arithmetic substrate

[NEURON_MAP.md](NEURON_MAP.md) lists every layer range, unit, exact row, activation and consumer. The primary interfaces are:

<!-- interfaces -->
| Block output | ID | Layer | Domain | Consumer |
|---|---:|---:|---|---|
| grudge0 | 1970 | 5 | [0,1] | Anger, reservation, memory |
| rage | 1069 | 2 | [0,1] | Driving and weapons |
| shownRage | 4074 | 26 | [0,1] | Display only |
| weaponAge | 1726 | 4 | [0,20] s | Trigger comparisons |
| triggerDelay | 1442 | 3 | [.45,1.5] s | Pickup patience |
| reserveForGrudge | 2909 | 11 | bit | Tactical restraint |
| rocketOpportunity | 4065 | 26 | bit | Barn Burner |
| rearOpportunity | 1741 | 4 | bit | Four dropped classes |
| hornDefence | 437 | 1 | bit | Immediate defence |
| fire | 4127 | 31 | bit | Action 5 and HUD |
| settleClock | 2780 | 9 | [0,1.8] s | Recovery grace |
| recoveryAllowed | 3060 | 11 | bit | Recovery entry and latch |
| settleEscape | 2735 | 8 | bit | Urgent obstruction exception |
| rocketIntercept | 3817 | 22 | normalized lateral metres | Projectile corridor |
| hardExpiry | 2000 | 5 | bit | Grounded fallback |
| hazardAvoid | 3615 | 20 | bit | Detour mux |
| hazardOffset | 3961 | 23 | [-92.7,92.7] m | Filtered waypoint |
| hazardAimFloor | 2379 | 6 | [4/70,63.55/70] | Detour preview |
| oilSteer | 4471 | 126 | [-.25,.25] | Oil steering |
| oilThrottle | 4329 | 62 | [0,.35] | Oil propulsion |
| displayTarget0 | 4054 | 25 | bit | Display identity memory |
| leanClock | 4264 | 50 | [0,4.5] s | Elbow pulse/cooldown |
| traffic0.valid | 3319 | 15 | bit | Passing WTA |
| target0 | 3557 | 19 | bit | Current visible target |
| boundedOffset | 4354 | 77 | road interval | Pursuit |
| pursuitCurvature | 4422 | 100 | [-1.3829,1.3829] 1/m | Steer/yaw |
| desiredSpeed | 4192 | 39 | [0,1.35] | Pace control |
| slipAuthority | 1683 | 3 | [0,1] | Traction envelope |
| stuck | 3295 | 14 | [0,.6] s | Obstructed entry |
| routeDebt | 3614 | 20 | [0,8] m | Recovery progress |
| turnImproving | 2114 | 5 | bit | Deadline exemption |
| escapeActive | 3537 | 18 | bit | Recovery control |
| crateFiltered | 3618 | 20 | [-26.5,26.5] m | Actual-side clearance |
| crateToRight | 3800 | 21 | bit | Side ray and occupancy |
| crateReachError | 3390 | 16 | metres | Reach comparison |
| crateReachAllowance | 2573 | 7 | [0,24] m | Reach comparison |
| crateReachable | 3472 | 17 | bit | Crate eligibility |
| horizontalSpeed | 1046 | 2 | [0,sqrt(4.5)] | Preview, pace, steering |
| previewMetres | 1956 | 4 | [16,65] m | Line interpolation |
| frontAxleYawTime | 2382 | 6 | [.085,1.209] | Yaw feedback |
| physicalGrip | 1681 | 3 | [.2,3] | Braking |
| brakingFeedforward | 4240 | 45 | [0,1] | Race brake demand |
| crateTimeRoom | 1672 | 3 | bit | Optional pickup veto |
| steer | 4478 | 131 | [-1,1] | Action 0 |
| throttle | 4338 | 65 | [0,1] | Action 1 |
| brake | 4330 | 62 | [0,1] | Action 2 |
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

## Traffic: pass first, brake for closing speed, merge only into clear space

The previous controller imposed a preferred gap even behind equal-speed or pulling-away cars. That could cut propulsion throughout launch, and braking made the passing predicate lose its slower target. The current circuit separates three computations: select an obstacle early enough to move around it, reduce genuinely imminent closing speed, and keep the lateral lane until a neighbouring body clears. None picks an attack destination. Rage and grudge remain weapon inputs; the small elbow is confined to the existing crossroads approach/grace.

### When the new traffic rules apply

`openRoad` requires a grounded wheel, headingCos≥.8, no Whirl, at least 45 m to the next crossing pass, at least 60 m to a jump lip, and expired crossing/flight grace. Crossing grace resets to .75 s within 30 m before a pass; flight grace resets to 1 s while airborne. Each countdown subtracts 1/30 per decision and clips at zero. The selector bounds are M=1. No general hit/settling veto suppresses following after a grounded contact. Recovery bypasses the speed limit.

Crossroads retain the previous passing/side selection. The new speed limit is exactly 1.5 there, which cannot lower the ordinary desired speed. This proves no **new local crossing yielding**, not unchanged collision outcomes: earlier traffic decisions change arrival times. Landing grace also exempts the new response for one second after wheel contact.

### Braking distance replaces preferred headway

For a solid, visible body .5–60 m ahead, at most 2.6 m sideways, and pointing within 60° of the ego heading, compute in metres and seconds:

```text
v = 40*ego.speedFwd
delta = 40*opp.relVelFwd
c = max(0, -delta)
clearance = max(0, 100*opp.fwd - 5.5)
gap = 5.5 + .25*c + c²/16
urgent = c > 1.000001 AND 100*opp.fwd <= gap
safeClosing = sqrt(4 + 16*clearance) - 2
cap = clip((v + delta + safeClosing)/40, 5/40, 1.5)
limit = min(1.5, each eligible urgent cap)
desiredSpeed = min(freeDesiredSpeed, openRoad AND NOT recovery ? limit : 1.5)
```

The 5.5 m body allowance is two 2.45 m half-lengths plus .6 m. The .25 s reaction allowance is the existing lateral filter time constant rounded conservatively. Deceleration a=8 m/s² is the previous construction's conservative assumption, below the nominal grip limit; damage, oil and flight can invalidate it. Relative stopping distance is c²/(2a), hence the square-row readout coefficient 1/16. **Absolute ego speed is absent from the gap.** Matched-speed and pulling-away cars cannot activate it, regardless of spacing.

Solve `clearance = .25*c + c²/16`: completing the square gives `(c+2)² = 4+16*clearance`, hence the square-root row above. Its affine input has weight 16 and bias 4. The cap row has weights 1,1,1/40 on forward speed, relative velocity and the root, and bias −2/40. ReLU hinges clip [.125,1.5]. Eligibility selectors use M=1.5. Eleven minima use `a−ReLU(a−b)`. The closing comparator's extra 1e−6 m/s margin makes the declared strict threshold robust to the Float32 observation representation.

This is not a full stopping-distance guarantee. The decision can arrive after the safe envelope has already been crossed, the lead car can brake, and the body corridor is nose-relative. The 5 m/s floor deliberately prevents this reflex from parking the car; it permits low-speed contact if lateral escape fails. Actual motion can still stop through collisions or other controllers. There is no clock that limits total braking time: braking ends when closing speed becomes safe or the body leaves the corridor. Tests prove the equation and exclusions, while the measured episode durations describe only the observed races.

### Early selection and a usable free lane

Passing candidates remain solid, wall-visible, at least 1.5 m ahead and within 3.5 m sideways. Wrecks qualify at every heading; living cars must point within 60°. On open road the distance window is `max(30,1.25*V)` metres, with horizontal V. A .25 s filter plus roughly one second to move laterally motivates that horizon; it is a control heuristic, not fitted. At 40 m/s the window is 50 m. Other zones retain 30 m. Over the bounded input domain its maximum is 106.07 m, so M=120 covers the range selector.

A candidate is needed if it is a wreck or at least 1 m/s slower. On open road it also remains needed when its projected velocity is at least 1 m/s below `.9*ego.pace` and either an excursion is already committed (`abs(oldPassOffset)≥.25 m`) or its raceGap≤−.5 laps. This prevents braking-induced speed matching from cancelling an overtake, and lets physically nearby backmarkers be passed. The half-lap raceGap test is a declared backmarker proxy. It never makes a distant rival a destination. No separate dwell or waiting-for-tow state exists; geometry is reconsidered every decision. Towed and smoke-hidden slots have solid=0 and cannot be obstacles.

The winner score is `4*eligible−4−distance`. The 4-point margin exceeds the bounded distance span of 1.5. Pairwise step comparisons and complementary bits implement WTA; the lower slot wins exact ties. Every eligibility condition precedes WTA, so a rear-quarter car cannot hide a front obstacle.

Let e be ego lineOffset in metres, s=headingSin and c=headingCos. For each nearby body rotate nose geometry into the local road frame:

```text
F = 100*(opp.fwd*c + opp.right*s)
R = e + 100*(opp.right*c - opp.fwd*s)
```

Products use `(x+y)²/4 − (x−y)²/4`. This is an exact rotation for the supplied angle but approximates a curved road by its local tangent. The two destination offsets are −3 and +3 m **from the racing line**, not from the ego nose. A destination corridor is occupied for −6≤F≤18 m and |R−destination|≤2.5 m. Two one-metre half-widths plus .5 m give the lateral margin. Six metres covers combined half-lengths with 1.1 m extra clearance; the 18 m front range is the retained local occupancy horizon. A second predicate checks the interval from e to the destination, expanded by 1.25 m, for bodies with −6≤F≤2 m. This refuses a lane change across an alongside car. These rectangles are local clearance approximations, not swept rigid-body collision prediction.

The lane must also fit the road with the existing 1.6 m margin and have at least 12 m on its ±32° ray. WTA scores add 4 for a clear usable lane, then the ray distance and −2 per occupying body, with .01 left tie bias. Four exceeds the valid ray span plus tie bias, so a free usable lane wins over a tempting ray into a lane that cannot fit. On open road, no free lane means no new lateral request. Crate-seeking keeps its original ego-relative side occupancy inputs; the corrected road-relative arrays belong to passing only.

### Do not merge while still alongside

When openRoad and an excursion is committed, `returnBlocked` checks any solid body with |F|≤6 m and R in the interval from the racing line (0) to e, expanded by 1.25 m. If present, the two offset filters receive their own old offsets as requests. Otherwise normal passing resumes. Therefore a car moving from ahead to alongside does not cause immediate return toward it. Once its full body is behind the six-metre margin, this latch-free geometric hold releases. Recovery still overrides steering and the final road clamp still applies.

```text
request = returnBlocked ? oldPassOffset : normalPassingRequest
passOffset' = 13/15*oldPassOffset + 2/15*request
neutralRequest = returnBlocked ? oldNeutralOffset : ordinaryNeutralRequest
neutralOffset' = 13/15*oldNeutralOffset + 2/15*neutralRequest
```

The return hold reuses the existing two filter states; no target timer or extra memory was added. Requests and reachable filter states are within ±3 m; conservative M=128 selectors cover them. The final bounds are `−halfWidth−linePosition+1.6` and `halfWidth−linePosition−1.6`, where `linePosition=(trackOffset−lineOffset)*halfWidth`. This limits the point target, not a colliding chassis.

### Anger and telemetry remain meaningful

Only within the 30 m crossing approach or .75 s crossing grace can a living target within 10 m receive an elbow. It still requires a nearby raceGap or grudge, anger≥.35, a usable lane, grounded/aligned/low-slip posture, no recovery or shifting, and distance from the jump lip. Anger is `clip(.5*aggression+.2*rage+.3*grudge)`. The existing 4.5 s clock permits 15 ticks of narrowing by at most .6 m, then four seconds of cooldown. No new crossing lift was added. Weapon anger/grudge equations are unchanged.

`hunt` requires that eligible elbow to produce at least .01 m of actual narrowing after the road clamp, a forward look point, and unsaturated steering. Drift uses horizontal speed above 6 m/s and slip above 10°. Mode scores remain race=.5, hunt=2, drift=3, unstick=4. Display state never feeds back into control.


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

The age affine row has weight 1 from oldAge and bias .03333333333333333. Two ReLUs clip it at 0 and 20, and the signed gate uses M=20 from that ceiling. Its next state is G(age, NOT fire;20), so a consumed item resets the clock immediately. Hard expiry is H(age−19): a longer deadline than every soft deadline, leaving one second below the requested 20 s limit for normal grounding/decision delay. Fire always requires ready, raceActive, at least one wheel down and not whirling. An expired airborne or inverted car retains the item until wheel contact; this is necessary for the no-airborne-fire rule, and it means elapsed live holds can exceed 20 s. Observed maximum non-roof hold is 25.071 s. The historical 20 s hold target is not guaranteed; the trigger circuits were not changed in this pass.

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

The first saved frame is a grounded car at 20 m/s approaching a parallel rival at 16 m/s, seven metres ahead. There is no crossing or lip nearby. Closing speed c=4; required gap=5.5+.25×4+16/16=7.5 m. Actual clearance is 7−5.5=1.5 m. Solve its safe closing speed: sqrt(4+16×1.5)−2=sqrt(28)−2=3.291502622 m/s. The cap is (16+3.291502622)/40=.482287566. Free desired speed is .7×.9=.63. Desired speed is the cap; the speed error is −.017712434, so brake=14×.017712434≈.247974082. Pace feed-forward is zero here because the next free pace is higher. The left clear lane requests −3 m, filtered to −.4 m on the first decision; the elbow is off. Float32 observation representation introduces the small differences shown below.

| Neuron | ID | Activation |
|---|---:|---:|
| openRoad | 2781 | 1.000000000 |
| follow0.valid | 2007 | 1.000000000 |
| follow0.closing | 457 | 4.000000060 |
| follow0.gap | 1490 | 7.500000045 |
| follow0.speedCap | 1748 | 0.482287565 |
| trafficSpeedLimit | 4154 | 0.482287565 |
| freeDesiredSpeed | 2591 | 0.629999989 |
| freePass | 4095 | 1.000000000 |
| requestedOffset | 4337 | -3.000000000 |
| passOffset | 4339 | -0.400000000 |
| desiredSpeed | 4192 | 0.482287565 |
| steer | 4478 | 0.070491385 |
| throttle | 4338 | 0.000000000 |
| brake | 4330 | 0.247974087 |
| follow0.clearance | 463 | 1.500000030 |
| follow0.safeRoot | 1132 | 5.291502667 |
| follow0.urgent | 1747 | 1.000000000 |
| passRange | 3195 | 30.000000000 |
| returnBlocked | 2897 | 0.000000000 |

Steer/throttle/brake/handbrake/reverse/fire: 0.070491385 / 0.000000000 / 0.247974087 / 0.000000000 / 0.000000000 / 0.000000000. All 31 saved frames include their complete observations and initial/next recurrent vectors. NEURON_MAP.md gives every layer range, affine row and consumer.

## Feedback-assisted edit log

| Evidence | Reasoned edit | Validation and limits |
|---|---|---|
| The 25 m crossing window included same-strand launch packs. | Require two distinct route passes of the same crossing, within the event window. Keep launch and later-lap totals separate. | Re-ran original 9 m, original 14 m and pass-1 14 m policies; no events discarded. |
| Pass-1 seeds 1/7/42 accumulated 521.1 capped car-seconds, including 114.6 at roughly matched speed. Some episodes lasted 7–8 s. | Remove absolute-speed preferred headway; require positive closing above 1 m/s. Keep a 5 m/s floor. | Matched/pulling-away fixtures cannot receive new traffic slowing. |
| Following cancelled the slower predicate; side WTA could choose a lane that did not fit while another did. | Retain committed below-pace passes, recognize physically nearby lapped traffic, start at a 1.25 s range, and prioritize a genuinely usable lane. | Predicate/WTA boundary fixtures. Wrecks bypass living-heading preference; no waiting for tow. |
| A one-metre-ahead alongside fixture requested return to the line while bodies overlapped longitudinally. | Hold the existing offset until the return corridor clears. | The physical fixture changes the premature zero request to −3 m. Neither version caused a damaging hit in that particular short fixture; it is not claimed as a prevented crash. |
| Passing destinations were line-relative but occupancy was nose-relative for displaced cars. | Rotate nearby bodies into the local road frame and check destination/swept side corridors. | Both signs, yawed frames and solid=0 regression cases. |
| The first closing response used a fixed .8 s TTC, which cannot cover a large closing speed when there is no passing lane. | Solve the conservative a=8 m/s² relative stopping-distance equation, with .25 s allowance, analytically. | Independent root identity, domain grid including 40 m/s closure; no fitted coefficients. |
| The 7001–7069 results had already been inspected before the stopping-distance correction. | Reclassify them as development; reserve 8101,8111,8117,8123,8147,8161,8171,8191 and freeze again. | Final held-outs were measured only after road2-freeze.json. No policy changes followed. |
| The wider grid changed exact historical no-crates counts. | Update checkpoint assertions from fresh runs: 7 and 8. | Preserve current flag and no-worse KO/stalled assertions; current 1 KOs, 0 stalled. |

Intermediate fixed-policy runs are retained as road2-development-a/b/c*.jsonl. These corrections were made from explicit equations and counterexamples, not by sweeping values or choosing the best seed score. Their race results were not monotonic. Prior edit logs remain in road-pass1/NEURAL_NETWORK.md and walkthrough-before-open-road.md.

## Direct delay diagnosis

The read-only neuron traces compare the frozen pass-1 and final graphs. In seeds 1/7/42, total time under a material traffic speed reduction falls from 155.07/232.03/134.03 to 11.13/14.10/18.40 car-seconds. Matched-speed cap time becomes zero. The longest final episodes in those seeds are .60/1.10/1.13 s, versus 7.13/7.97/5.87 s before. In seed 6007, the old leader spent 12.2 s capped behind lapped traffic; the final leading-car cap time is zero and total capped time falls from 147.87 to 11.70 car-seconds. These are observed episode durations, not a universal time bound or an isolated prediction of lap time.

Most of the earlier delay was therefore ordinary traffic, not waiting for wreck towing. The final graph resolves those demonstrated long cap episodes. It does not resolve every race loss: the clock leaders' observed damage and the no-crates comparison below show that engine loss, impacts and recovery still consume the available race margin. The no-crates control also has one clock finish, so weapons alone cannot explain every failure.

## What the measurements mean

The simulator hash is identical for every live-grid run. Historical 9 m comparison uses a read-only in-memory import of world.js with only ROW_GAP=9 and SPAWN_LAST_ROW_S=−2, versus live 14/−32. No simulator file is written. Five laps, 200 s, damage, weapons, track and car physics are otherwise identical. This isolates the grid change from the network change.

Crossing classification requires an event within 25 m of a generated crossing and the cars assigned to different nearest passes sA/sB, each within 30 route metres. Thirty allows the 25 m window plus body extent. Same-pass lap-0 pack collisions are open-road events. A heading-angle alternative is not needed when continuous route identity is available; this convention may miss a car whose route identity has just changed in a collision. Classification is crossing first, otherwise landing for upper≥0 or a car between lip and landS+maxSpeed×1 s, otherwise open. No events disappear. Hard means closing>6 m/s, not the older strength≥.35 metric. Laps 1–4 use the running leader's lap at the event.

Car-laps sum each car's nonnegative credited route gain from its own grid position divided by lap length, including partial KO laps. Rates pool counts and exposure. Later crossing counts and rates are both reported; their rate denominator is all car-laps, not a claim of equal late-lap exposure. Open-after-eight-second rates are diagnostic; the half-contact target still includes launch hits. Stuck means a running car below 3 m/s after second five. Flag-gap medians include only flag finishes; failure counts remain explicit. Timeout gaps are at shutdown. Lead changes use credited progress among running cars after second five.

### Original twenty

| Metric | Original / 9 m | Original / 14 m | Pass 1 / 14 m | Final / 14 m |
|---|---:|---:|---:|---:|
| Flag finishes | 18.000 | 14.000 | 11.000 | 15.000 |
| Clock finishes | 1.000 | 6.000 | 9.000 | 4.000 |
| Attrition finishes | 1.000 | 0.000 | 0.000 | 1.000 |
| Minimum running | 1.000 | 2.000 | 2.000 | 1.000 |
| Mean race seconds | 193.176 | 194.871 | 196.714 | 194.938 |
| Median best leader lap seconds | 36.700 | 36.627 | 36.868 | 36.916 |
| Median gap at flag metres | 130.206 | 128.549 | 193.344 | 144.846 |
| Lead changes/race | 4.400 | 5.050 | 2.150 | 5.850 |
| Open hits/car-lap | 1.317 | 1.121 | 0.643 | 0.968 |
| Open hard hits/car-lap | 0.825 | 0.718 | 0.464 | 0.650 |
| Open hits after 8 s/car-lap | 1.185 | 1.059 | 0.559 | 0.915 |
| Open launch hits (count) | 100.000 | 45.000 | 65.000 | 42.000 |
| True crossing hits, leader lap 0 | 0.000 | 0.000 | 3.000 | 0.000 |
| True crossing hits, leader laps 1–4 | 161.000 | 165.000 | 270.000 | 155.000 |
| Later crossing hits/car-lap | 0.212 | 0.228 | 0.349 | 0.197 |
| Landing hits/car-lap | 0.241 | 0.294 | 0.138 | 0.191 |
| Stuck % | 2.157 | 2.748 | 2.630 | 2.358 |
| Longest stop s | 8.367 | 10.567 | 11.300 | 9.267 |
| Stalled/car-lap | 0.008 | 0.019 | 0.010 | 0.011 |
| Turtled/car-lap | 0.087 | 0.105 | 0.094 | 0.089 |
| Wall events/car-lap | 4.796 | 5.075 | 4.215 | 4.448 |
| Weapons/race | 79.750 | 79.450 | 84.650 | 80.550 |
| Crate collection % | 47.882 | 50.372 | 51.718 | 46.918 |
| Car-lap exposure | 758.823 | 725.273 | 773.981 | 784.913 |

### Additional development

| Metric | Original / 9 m | Original / 14 m | Pass 1 / 14 m | Final / 14 m |
|---|---:|---:|---:|---:|
| Flag finishes | 7.000 | 5.000 | 3.000 | 7.000 |
| Clock finishes | 1.000 | 3.000 | 4.000 | 1.000 |
| Attrition finishes | 0.000 | 0.000 | 1.000 | 0.000 |
| Minimum running | 3.000 | 2.000 | 1.000 | 3.000 |
| Mean race seconds | 193.187 | 196.121 | 193.548 | 194.605 |
| Median best leader lap seconds | 37.031 | 36.971 | 37.054 | 37.015 |
| Median gap at flag metres | 173.932 | 191.097 | 141.510 | 157.043 |
| Lead changes/race | 3.625 | 6.875 | 3.375 | 5.875 |
| Open hits/car-lap | 1.054 | 1.403 | 0.856 | 1.150 |
| Open hard hits/car-lap | 0.651 | 0.968 | 0.600 | 0.722 |
| Open hits after 8 s/car-lap | 0.863 | 1.310 | 0.781 | 1.088 |
| Open launch hits (count) | 58.000 | 27.000 | 21.000 | 20.000 |
| True crossing hits, leader lap 0 | 1.000 | 2.000 | 0.000 | 0.000 |
| True crossing hits, leader laps 1–4 | 59.000 | 52.000 | 119.000 | 82.000 |
| Later crossing hits/car-lap | 0.195 | 0.180 | 0.422 | 0.256 |
| Landing hits/car-lap | 0.281 | 0.149 | 0.192 | 0.156 |
| Stuck % | 2.484 | 2.685 | 3.596 | 2.569 |
| Longest stop s | 7.167 | 6.933 | 5.333 | 5.633 |
| Stalled/car-lap | 0.010 | 0.017 | 0.014 | 0.009 |
| Turtled/car-lap | 0.106 | 0.111 | 0.099 | 0.088 |
| Wall events/car-lap | 4.588 | 4.608 | 4.647 | 4.482 |
| Weapons/race | 79.750 | 74.500 | 81.875 | 80.125 |
| Crate collection % | 50.000 | 45.015 | 54.452 | 42.603 |
| Car-lap exposure | 302.521 | 289.280 | 281.673 | 319.931 |

### Fresh held-out

| Metric | Original / 9 m | Original / 14 m | Pass 1 / 14 m | Final / 14 m |
|---|---:|---:|---:|---:|
| Flag finishes | 4.000 | 6.000 | 3.000 | 5.000 |
| Clock finishes | 4.000 | 2.000 | 5.000 | 3.000 |
| Attrition finishes | 0.000 | 0.000 | 0.000 | 0.000 |
| Minimum running | 2.000 | 3.000 | 3.000 | 2.000 |
| Mean race seconds | 196.731 | 196.034 | 197.241 | 195.703 |
| Median best leader lap seconds | 36.689 | 37.034 | 36.958 | 36.927 |
| Median gap at flag metres | 60.933 | 180.032 | 283.122 | 377.348 |
| Lead changes/race | 4.500 | 5.375 | 2.000 | 6.750 |
| Open hits/car-lap | 1.170 | 1.257 | 0.676 | 1.257 |
| Open hard hits/car-lap | 0.770 | 0.809 | 0.474 | 0.827 |
| Open hits after 8 s/car-lap | 0.920 | 1.190 | 0.559 | 1.182 |
| Open launch hits (count) | 73.000 | 20.000 | 32.000 | 21.000 |
| True crossing hits, leader lap 0 | 0.000 | 2.000 | 0.000 | 0.000 |
| True crossing hits, leader laps 1–4 | 67.000 | 87.000 | 80.000 | 69.000 |
| Later crossing hits/car-lap | 0.229 | 0.291 | 0.294 | 0.247 |
| Landing hits/car-lap | 0.270 | 0.267 | 0.099 | 0.394 |
| Stuck % | 2.491 | 2.762 | 2.984 | 3.199 |
| Longest stop s | 10.567 | 4.933 | 9.933 | 5.667 |
| Stalled/car-lap | 0.014 | 0.013 | 0.015 | 0.018 |
| Turtled/car-lap | 0.086 | 0.094 | 0.140 | 0.107 |
| Wall events/car-lap | 4.913 | 4.669 | 4.776 | 4.868 |
| Weapons/race | 79.875 | 74.500 | 80.750 | 71.625 |
| Crate collection % | 49.880 | 45.379 | 55.166 | 46.376 |
| Car-lap exposure | 292.301 | 299.237 | 272.001 | 279.182 |

## Finish tables

### Original twenty development seeds

| Seed | Original 9 m / 14 m / pass 1 / final s | End | Running | Gap m | Leads | Fired | Stuck % | Stalled/turtled |
|---:|---|---|---:|---:|---:|---:|---:|---|
| 1 | 192.5 / 200.0 / 194.5 / 189.6 | flag | 6 | 79.1 | 6 | 81 | 1.01 | 0/5 |
| 7 | 196.2 / 190.6 / 197.0 / 192.4 | ATTRITION | 1 | — | 7 | 70 | 2.83 | 0/5 |
| 42 | 191.9 / 189.1 / 190.6 / 197.4 | flag | 5 | 186.8 | 9 | 94 | 3.45 | 0/2 |
| 1201 | 197.0 / 192.0 / 200.0 / 200.0 | CLOCK | 3 | 791.7 | 7 | 67 | 6.95 | 1/3 |
| 1709 | 190.4 / 200.0 / 189.1 / 191.7 | flag | 4 | 144.8 | 10 | 72 | 1.86 | 0/6 |
| 2309 | 194.5 / 191.8 / 190.7 / 189.9 | flag | 6 | 70.5 | 3 | 86 | 1.62 | 1/3 |
| 2903 | 190.1 / 191.3 / 199.6 / 199.7 | flag | 5 | 21.0 | 13 | 76 | 0.40 | 0/4 |
| 3613 | 191.6 / 193.8 / 200.0 / 200.0 | CLOCK | 6 | 38.3 | 7 | 91 | 2.64 | 0/2 |
| 4801 | 191.6 / 197.2 / 192.9 / 188.9 | flag | 7 | 205.9 | 1 | 78 | 1.87 | 0/1 |
| 6007 | 195.0 / 200.0 / 200.0 / 199.6 | flag | 3 | 89.2 | 9 | 69 | 2.74 | 1/5 |
| 6011 | 191.6 / 195.0 / 196.8 / 187.3 | flag | 7 | 89.2 | 2 | 78 | 0.04 | 0/5 |
| 6029 | 193.7 / 190.3 / 200.0 / 192.6 | flag | 5 | 161.6 | 2 | 70 | 1.67 | 0/6 |
| 6043 | 191.3 / 187.4 / 200.0 / 200.0 | CLOCK | 3 | 147.4 | 4 | 78 | 3.50 | 0/3 |
| 6053 | 192.1 / 194.8 / 196.1 / 192.7 | flag | 5 | 194.5 | 1 | 81 | 3.34 | 2/4 |
| 6067 | 190.2 / 196.8 / 191.0 / 195.6 | flag | 6 | 37.2 | 6 | 91 | 1.56 | 1/2 |
| 6073 | 192.4 / 200.0 / 200.0 / 197.7 | flag | 6 | 164.5 | 6 | 93 | 2.00 | 1/0 |
| 6089 | 195.3 / 199.9 / 200.0 / 189.7 | flag | 8 | 11.2 | 10 | 87 | 0.44 | 0/4 |
| 6101 | 191.1 / 200.0 / 195.9 / 200.0 | CLOCK | 4 | 141.1 | 2 | 79 | 4.72 | 1/3 |
| 6113 | 195.0 / 200.0 / 200.0 / 198.9 | flag | 5 | 210.0 | 4 | 87 | 2.92 | 1/3 |
| 6121 | 200.0 / 187.4 / 200.0 / 195.0 | flag | 5 | 226.8 | 8 | 83 | 2.60 | 0/4 |

### Additional development, inspected before the final correction

| Seed | Original 9 m / 14 m / pass 1 / final s | End | Running | Gap m | Leads | Fired | Stuck % | Stalled/turtled |
|---:|---|---|---:|---:|---:|---:|---:|---|
| 7001 | 192.0 / 187.1 / 194.1 / 196.7 | flag | 4 | 114.3 | 7 | 78 | 1.76 | 1/4 |
| 7013 | 190.8 / 200.0 / 158.5 / 188.4 | flag | 5 | 341.9 | 4 | 61 | 2.48 | 0/5 |
| 7019 | 188.9 / 195.4 / 200.0 / 196.7 | flag | 3 | 178.9 | 7 | 77 | 2.91 | 1/3 |
| 7027 | 192.3 / 196.0 / 197.3 / 191.7 | flag | 5 | 157.0 | 6 | 89 | 1.91 | 0/2 |
| 7039 | 200.0 / 195.7 / 200.0 / 189.3 | flag | 7 | 64.6 | 0 | 82 | 1.34 | 0/4 |
| 7043 | 199.8 / 200.0 / 198.5 / 200.0 | CLOCK | 3 | 71.4 | 2 | 64 | 5.40 | 1/4 |
| 7057 | 191.8 / 194.7 / 200.0 / 196.3 | flag | 6 | 25.2 | 15 | 91 | 1.98 | 0/5 |
| 7069 | 189.8 / 200.0 / 200.0 / 197.8 | flag | 5 | 234.8 | 6 | 99 | 3.23 | 0/1 |

### Fresh held-out, measured after final freeze

| Seed | Original 9 m / 14 m / pass 1 / final s | End | Running | Gap m | Leads | Fired | Stuck % | Stalled/turtled |
|---:|---|---|---:|---:|---:|---:|---:|---|
| 8101 | 188.4 / 196.0 / 200.0 / 188.6 | flag | 2 | 1485.6 | 1 | 73 | 5.04 | 0/3 |
| 8111 | 200.0 / 200.0 / 195.9 / 200.0 | CLOCK | 3 | 379.3 | 5 | 70 | 3.43 | 0/3 |
| 8117 | 200.0 / 196.9 / 193.9 / 189.7 | flag | 4 | 520.7 | 10 | 70 | 3.10 | 2/3 |
| 8123 | 196.5 / 194.1 / 200.0 / 194.9 | flag | 4 | 377.3 | 9 | 56 | 2.72 | 1/5 |
| 8147 | 200.0 / 200.0 / 188.2 / 196.9 | flag | 7 | 25.2 | 5 | 84 | 1.33 | 0/3 |
| 8161 | 189.4 / 194.3 / 200.0 / 200.0 | CLOCK | 2 | 915.3 | 9 | 67 | 5.27 | 1/5 |
| 8171 | 200.0 / 193.7 / 200.0 / 200.0 | CLOCK | 3 | 301.5 | 7 | 81 | 1.85 | 0/4 |
| 8191 | 199.5 / 193.3 / 200.0 / 195.5 | flag | 6 | 224.4 | 8 | 72 | 3.80 | 1/4 |

## Isolation, attrition and a separate balance proposal

With crates removed, the final network finishes 19/20 original-seed races by laps, with at least 7 running. This is a weapons-disabled control, not a damage-balance experiment and not a claim that a specific shot caused a particular failure. Solo unarmed best lap is 36.438 s. Actual armed tests retain all weapon circuits and all eleven types are used across the final set. Maximum non-roof hold is 25.071 s; the historical 20 s hold floor can still miss.

Measured health loss over final races is 114.915 from car contact, 113.324 from walls, and 71.448 directly from weapons. 118 cars were destroyed; 19 received their final damaging operation from a weapon. The observer preserves pre-operation health through nested wheelOff/ko. It does not label a later wall collision as weapon damage, so weapon disruption is understated by direct damage attribution alone.

For a separate parent-owned balance experiment, test DAMAGE.scale **.0058 → .00464 (−20%)**, leaving ARSENAL unchanged. The proposed one-fifth reduction targets physical damage while keeping weapon conflict. On the *unchanged recorded damage histories* of surviving clock leaders it would add 0.040–0.161 health; their nonzero-engine cases imply 2.2–15.1% more available torque under the existing .3+.7*engineHealth law. This is bookkeeping, **not simulated performance or an assertion that the floor will pass**. Damage history, wheel loss, alignment, collisions and rankings will diverge. It cannot directly cure turtling or undo a launch. No value was changed here and no blanket weapon-damage reduction is supported by these measurements.

## Verification, exactness and limitations

163/164 node tests pass; all 68 neural/evaluation tests pass. The remaining failure is the parent-owned test/physics.test.js:406 reference driver on the changed solo grid, which does not import the neural network. It stalls at s=897.45 after two laps. The same fixture on the historical grid finishes in 127.092 race seconds, with .611 health, .727 m minimum clearance and a 39.229 s last lap. Both read-only repros are recorded in physics-external-repro.json and physics-external-oldgrid.json. The physics test and simulator were left untouched. verify.mjs records the fresh evidence and still exits with failure until the full suite is green. Byte-identical construction is checked against the generated source. 31 frames and 3883 activations replay exactly; the browser ESM bundle is 229769 bytes. Random test interiors are verification, not weight search. The generic runtime/wrapper remain unchanged, with no policy outside the graph and no per-call buffer allocation.

Affine rows, Boolean/WTA circuits, min/max, clipped recurrences and square-product identities implement their specified algebra exactly over real arithmetic. Float64 and Float32 deployment introduce tested numerical error. Pursuit, friction allowance, body corridors, lane-change timing and collision categories are approximations or explicit heuristics. The speed floor knowingly permits low-speed contact. Good root arithmetic is not proof of collision avoidance; neither a local crossing exemption nor an accurate gap controller guarantees the race outcomes. The acceptance table governs the result.

Reproduce using road2-eval.mjs baseline9/baseline14/pass1/final with explicit seed arguments, traffic-diagnosis.mjs --final, passing-case.mjs, eval.mjs --solo, grid-regression.mjs, node --test, inspect.mjs, verify.mjs and document.mjs. road2-summary.json contains the report's aggregates. Older final-named artifacts not cited here describe earlier revisions.

Simulator SHA-256: f04c79dcb3f5d1fb1bda51c3c0e2d61e5e642a422469f8438f6643043eb45e4c. Weights SHA-256: ebd81dc2cb4cfe3292cb5b8311c67eba5aeb628934c9dffdb32789347bdd62ed. Architecture: 131 layers, 4155 units, 7896 edges, 12051 parameters, 47 states, 277 observations and six actions. Only authorized AI, tools, neural tests and neural documentation paths were changed. No src/sim edits, training, fitting, parameter search, git initialization or commits.
