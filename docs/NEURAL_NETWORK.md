# The Knot: directly programmed racing and weapon conflict

This network is a program written into weights. Racing-line pursuit and slip/yaw feedback become arithmetic neurons; comparisons and winner-take-all circuits select passing space, trigger weapons and choose recovery manoeuvres. Recurrent neurons remember grudges, rage, offsets and timers. One generic forward pass controls every car. No training, fitting, parameter sweep or policy code outside the network is used.

## Backhander naming and roster compatibility

Slot 9 is now `arms.backhander` at observation index 261. Only seven graph labels changed; every numeric parameter, edge, activation, output index and recurrent connection is identical. The two rebuilds agree byte for byte. The comparison is recorded in [backhander-rename-verification.json](../tools/nn/backhander-rename-verification.json). The Foghorn observer now excludes shot kind `hand` from its swat count.

Backhander retains the fire-and-forget trigger: grounded, settled, incoming threat below the nerve threshold, pickup patience/grudge reservation, and the existing deadlines. Its race-leader target and back-half-only availability belong to the simulator. The network assumes no bull geometry, damage, movement or attack animation; it contains no hand-specific physics constants either. The current hand uses `ARSENAL.hand.height`, not the old slot-9 overlap value quoted in the historical measurement below.

The 36-entry roster still supplies twelve race-local IDs 0-11. Eleven opponent slots and twelve telemetry grudge entries therefore remain correct; a race with 36 simultaneous cars would not be supported. All current temperament values lie in aggression [0.55,1], nerve [0.35,1] and vengeance [0.3,1]. The equations use independent bounded inputs, not original-driver identities or correlations between axes. Regression checks cover the Backhander trigger for every roster temperament and all eight range corners. This establishes circuit compatibility, not identical race performance for new lineups.

The race tables, simulator hash and shipping verification below remain the preceding measured checkpoint; this naming-only task does not rerun or relabel historical races. The current renamed weight hash is in the linked comparison artifact.

## Final status on the applied balance

**The deployed weights are unchanged from pass 2.** This shipping-review refresh includes the final simulator fixes and repairs the best-lap measurement: the shortened opening lap can no longer satisfy a full-lap pace floor. The earlier recovery and contact attempts remain rejected: each lost three flag finishes on the previous finish-line revision. No construction or driving behaviour was changed here. The measured shipping limits and remaining historical targets are reported below.

The simulator now has DAMAGE.scale=.00464, weapon damage/goreDamage at 80% of the prior values, and grip clay/asphalt/mud=2.3/2.6/1.77. The race is five laps with a 200 s backstop and the 14 m grid. FINISH_LINE_S=1030 governs credited laps; GRID_LINE_S=52 is a painted grid marker only. The first lap is short: on the approximately 1152 m route, moving the counting line adds about 174 m of initial credited progress and removes about 174 m of required driving from every grid slot. Four subsequent laps are full route lengths. Initial raceDone changes, but no neural weights or dynamics were changed here. These changes belong to the parent. **No simulator file was edited here.** The repaired parent physics reference-driver test also passes.

| Target | All 50 seeds |
|---|---|
| All flags below 200 s | 45/50, 5 clocks; FAIL |
| 185–195 s aim | 24/50; range 179.2–200.0 s |
| At least two running every race | 2 minimum at shutdown; PASS (clock finishes still fail above) |
| Flag margin no worse than original | 139 → 163 m; FAIL |
| Lead changes at least original | 4.40 → 4.14; FAIL |
| Open contact at least halved | -15.6%; FAIL |
| Hard open contact at least halved | -10.8%; FAIL |
| Later crossing rate not lower | 0.170 → 0.218; PASS |
| Pace loss at most 2% | 36.450 → 36.679 s median winner best complete lap; PASS |
| Stuck / stalled / turtled rates no worse | FAIL / FAIL / FAIL |
| All eleven weapons used | 11/11; PASS |
| Crates (historical 65% target) | 46.97% collected, 52.04% live misses; FAIL |

At the measured shipping-review checkpoint, the simulator also bounded the Grudge Seeker's angular turn rate, including a target directly astern; crate pickup requires vertical reach of 2.6 m, Whirl requires vertical overlap within 2.4 m, and Backhander within 2.6 m. creditHit ignores victims already at zero health, preventing a later zero-damage touch from taking knockout credit. Sensor layout and weights are unchanged.

The policy is byte-identical to the before checkpoint; race differences from the preceding report arise from these simulator fixes. Across all 50 races, 45 finish by laps and 5 hit the clock. Race seconds are 179.2/187.5/200.0 min/median/max; minimum running is 2; median flag gap is 163 m and 8 flag finishes are within 60 m. Stalled KOs are 0.700/race. Total physical recovery is still not bounded by the network. All 50 rows agree field for field with a fresh execution of the owner's comparison script. The displayed maximum is 200.0 s; the raw maximum is 200.004 s, one 240 Hz step past the 200 s clock threshold. A literal ≤200 s raw limit therefore fails by that step. At least two running is PASS. Flag finishes are 45/50 against the approximately 48/50 expectation: FAIL. Clock seeds: 1, 4801, 9203, 10211, 10289. No weights were changed in response.

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

Actions are steer, throttle, brake, handbrake, reverse, fire. Fire and telemetry.firing are the same binary neuron activation. Handbrake is zero. Slip feedback manages the existing tyre physics; the stronger correction produces only 0.132% >10° sliding in the current unarmed solo, so the numeric field slide result must not be mistaken for a demonstration of controlled solo drifting. There is no new raw sensor and no simulator edit by this implementation.

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

The pace notes already solve braking before corners and account for no braking in air. The added term follows a=d(v²)/(2 ds), using the next note eight metres away: 40²/(2*8)=100. Difference-of-square rows therefore use +100 and −100, followed by ReLU. Divide by nominal friction-limited deceleration mu*g and clip. Error feedback corrects force-model mismatch; it no longer needs the car to overshoot pace before requesting deceleration. At a desired 32.4 m/s now and 30.6 m/s eight metres ahead, required deceleration is (32.4²−30.6²)/16=7.0875 m/s². Current clay grip 2.3 gives feed-forward brake 7.0875/(2.3*9.81)≈0.314120463. Airborne control still forces brake zero.

The parent corrected the grip sensor after this pass found all new surfaces clipped to 1.5. Its final encoding is **grip/2**: mud .885, clay 1.15, asphalt 1.3. The decode is a weight 2, not a hidden wrapper. The .2 denominator floor handles finite domain-boundary fixtures; actual surface readings are well above it.

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

The age affine row has weight 1 from oldAge and bias .03333333333333333. Two ReLUs clip it at 0 and 20, and the signed gate uses M=20 from that ceiling. Its next state is G(age, NOT fire;20), so a consumed item resets the clock immediately. Hard expiry is H(age−19): a longer deadline than every soft deadline, leaving one second below the requested 20 s limit for normal grounding/decision delay. Fire always requires ready, raceActive, at least one wheel down and not whirling. An expired airborne or inverted car retains the item until wheel contact; this is necessary for the no-airborne-fire rule, and it means elapsed live holds can exceed 20 s. Observed maximum non-roof hold is 23.508 s. The historical 20 s target is not guaranteed. Trigger circuits were not changed in this pass.

The delay row has weights −.75,−.3 and bias 1.5: calm A=0,r=0 waits 1.5 s; A=1,r=1 waits .45 s (the simulator's .5 s ready lock may dominate). Anger changes patience without modifying the race destination. Vengeance briefly reserves a weapon for a strong nearby grudge that is not yet in the forward corridor; it adds at most three seconds and never overrides grounded hard expiry. A hidden grudge has no trustworthy geometry, so it cannot reserve fire. The circuit does not aim a Seeker itself: that weapon's simulator targeting uses lastHitter.

| Class | Normal tactical opportunity, after delay and outside reserve | Soft deadline age, seconds |
|---|---|---|
| Barn Burner | Grounded/settled; ahead ≤20+25A+10r m; bearing and predicted intercept inside the corridor described below | 18−4A−r (13–18) |
| Repo Hook | Grounded/settled; ahead ≥10 m and ≤40+20A m | 18−4A−r (13–18) |
| Grudge Seeker, Backhander, Grand Piano | Grounded/settled; incoming≤.4+.3N | 12−4A−r (7–12) |
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







## Worked forward pass on the final graph

The first trace is a grounded car at 20 m/s on current clay (surfaceGrip input 1.15), approaching a parallel rival at 16 m/s seven metres ahead, with no nearby lip or crossing. Closing c=4; required gap=5.5+.25×4+4²/16=7.5 m. Available clearance is 1.5 m. Solving .25c+c²/16=1.5 gives safeClosing=sqrt(28)−2=3.291502622 m/s. Its cap is (16+3.291502622)/40=.482287566, below free pace .7×.9=.63. Speed error is −.017712434; brake=14×.017712434≈.247974082. The next free pace is higher, so feed-forward brake contributes zero. The usable left lane requests −3 m; its first filtered offset is −.4 m. The elbow is off. Float32 inputs explain the small numeric differences below.

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
| physicalGrip | 1681 | 2.299999952 |
| requestedOffset | 4337 | -3.000000000 |
| passOffset | 4339 | -0.400000000 |
| desiredSpeed | 4192 | 0.482287565 |
| steer | 4478 | 0.070491385 |
| throttle | 4338 | 0.000000000 |
| brake | 4330 | 0.247974087 |
| follow0.clearance | 463 | 1.500000030 |
| follow0.safeRoot | 1132 | 5.291502667 |
| returnBlocked | 2897 | 0.000000000 |

Steer/throttle/brake/handbrake/reverse/fire = 0.070491385 / 0.000000000 / 0.247974087 / 0.000000000 / 0.000000000 / 0.000000000. All 31 trace frames carry complete observations and initial/next recurrence. The generated neuron map supplies every affine row, activation, layer range and consumer.

## Historical rejected attempts and current refresh

On the previous counting-line revision (simulator 5d38edc9f4717dc91e5b8605d520e907f9ee7428e22cd02c096fee467b4c0c22), the before measurement exactly reproduces the parent's applied-balance result: 26/28 flags, 25 stalled KOs, 98 lead changes, 1423 open hits, 951 hard open hits and 236 crossings over 1118.7 rounded car-laps. That historical seed-1 cross-check is preserved in owner-check.jsonl. The current refresh independently checks all 50 seeds in owner-final-50.jsonl. The final report uses that definition, not the older landing-excluding contact category.

Those historical six reported seeds contain 14 stalled cars. Read-only decision traces in stall-before.jsonl expose three specific weaknesses:

- Seed 6007 cars 5 and 7 face almost backwards, accelerate above the 3 m/s recovery-entry ceiling and lose approximately 108 and 91 route metres. Existing route debt applies only after recovery has entered, so it cannot catch this earlier loss.
- Seed 8123 car 7 stops at s≈868.4 with about 49° heading error. Nose rays are 7.5/3.3/45 m, outside the 3.2 m detector; the +32° ray is 2.1 m. The front corner is blocked despite forwardBlocked=0. It does not integrate recovery evidence.
- Seed 2309 cars 1 and 8 spend much of their final recovery on oil. The gear/turn circuit asks for full lock, but the final oil clamp permits only ±.25, delaying reorientation. Other examples involve repeated contact, clearance/re-entry cycles and route debt after crossing disruption; the three identified defects do not explain every failure.

| Checkpoint | Derived changes | Why it was rejected or retained |
|---|---|---|
| Recovery attempt, 4167 units / 7916 edges | Reuse the .5 s entry integral for backward-facing route velocity below −.5 m/s even above 3 m/s. Add ±32° corner-ray threshold (1/sin32°+.5)/45, from one-metre half-width plus .5 m margin. Permit full lock during oil recovery with speed cap 2.5 m/s: about 1.5 m/s² at a 4.17 m radius, below nominal .2g oil grip; multiply recovery speed by 1.6. No new state. | Stalled KOs 25→15 and stuck 2.914→2.511%, but flags 26→23. Reverted all three changes. The six reported seeds fall from 14 to 3 stalled cars in this candidate, but that does not outweigh failed races. |
| One contact attempt, 4204 units / 7986 edges | Starting again from the retained baseline, permit the existing closing-speed cap inside crossing windows only for nearly parallel traffic: heading dot≥.9 means ≤25.84°, separating it from 60° cross traffic. Preserve lip/landing and actual cross-traffic exemptions. No changed following gains or new state. | Flags 26→23, leads 98→96; open contact 1.272→1.273/car-lap. Failed the explicit guard; reverted. |
| Final retained graph, 4155 units / 7896 edges | Byte-identical pass 2; no new behaviour circuits. | Best flag count among the two explicitly authorized attempts and before policy. No automated selection loop, constant sweep or further tuning. |
| Earlier balance refresh (historical test changes) | Re-run results and historical checkpoints; rocket test now requires damage >.65×configured rocket damage, retaining roughly the old fractional bound. Actual fixture damage is .078540162 with wheel loss and exactly one attributed damaging shot; the 3 m fly-by still deals zero. Historical no-crates KOs change from 7 to 6; before-review remains 8. | On the current simulator, no-crates seed 1 finishes with 0 KOs and 0 stalled. Flag and no-worse KO/stalled requirements remain. |
| Earlier metric regression | Add independent cases for same-strand packs, strict 25 m/60 m boundaries, abs heading dot and 24-step lead sampling after 10 s. | All tests pass. No policy inputs or actions are changed by an observer. |
| Finish-line refresh | Rerun all 50 seeds and original-policy comparison on FINISH_LINE_S=1030, verify all rows against the literal owner script, regenerate traces/map/docs. | No weights, construction logic or test assertions changed. The complete test suite passes unchanged. |
| Shipping-review refresh | Gate all evaluation best-lap minima on lap number≥2, retaining lap 1 in the lap-event record and as the timestamp anchor for lap 2. Re-run the current simulator, whose seeker, vertical interaction and knockout-credit fixes belong to the parent. | A deliberately faulty .8 pace-share clone has a short opening lap below 37 s but every complete lap above 38 s; its winner and leader minima now fail the 37 s pace floor. One-lap-only races report null best laps. Production weights are unchanged. |

The contact attribution sample was fixed to seeds 1/7/42/4801 before that one attempt. It contains 184 owner-open events, 118 hard. At .63 s before the hard contacts, only 28 of 236 car-side snapshots enabled openRoad; 112 cleared the crossing-distance predicate. This is evidence of a broad exemption, not proof that extending braking will improve races. The failed attempt supplies the counterexample. Candidate JSON tensors, construction snapshots and full 28-seed results remain in tools/nn; they are not imported by the shipped brain. Earlier edit logs are archived in road-pass2/NEURAL_NETWORK.md and road-pass1/NEURAL_NETWORK.md.

| Historical 28-seed measurement, before the finish-line move | Before / retained policy | Recovery attempt | Contact attempt |
|---|---:|---:|---:|
| Flag finishes | 26.000 | 23.000 | 23.000 |
| Minimum running at shutdown | 2.000 | 3.000 | 3.000 |
| Mean running | 5.857 | 5.536 | 5.821 |
| Median seconds | 192.800 | 192.100 | 189.900 |
| Median flag margin m | 190.000 | 148.000 | 212.000 |
| Lead changes/race | 3.500 | 3.821 | 3.429 |
| Open hits/car-lap | 1.272 | 1.343 | 1.273 |
| Hard open hits/car-lap | 0.850 | 0.874 | 0.840 |
| Crossing hits/car-lap | 0.211 | 0.231 | 0.205 |
| Crossing hits on leader laps 1–4/car-lap | 0.204 | 0.227 | 0.204 |
| Stalled KOs/race | 0.893 | 0.536 | 0.643 |
| Stalled KOs/car-lap | 0.022 | 0.014 | 0.016 |
| Turtled KOs/car-lap | 0.081 | 0.093 | 0.095 |
| Stuck % | 2.914 | 2.511 | 2.871 |
| Weapons/race | 84.929 | 87.143 | 84.679 |
| Crate collection % | 47.868 | 49.062 | 45.638 |
| Wall events/car-lap | 4.692 | 4.735 | 4.905 |
| Median winner best complete lap s | 36.450 | 36.412 | 36.362 |

## Measurement definitions and isolation

Primary metrics reproduce the owner's comparison definition in [owner-metrics.mjs](../tools/nn/owner-metrics.mjs). A hit is crossing only when **both** cars are strictly within 25 circular route metres of one of [79,129,466,516,799,850], abs(Ra[0]Rb[0]+Ra[6]Rb[6])<.8, and abs(progressA−progressB)>60 m. This intentionally keeps the owner's unnormalised horizontal heading dot. Every other hit, **including jump landings**, is open. Hard open means closing>6 m/s. Classification uses car state immediately after the physics step. The older generated-crossing/landing categories remain supplemental and never replace these totals.

Exposure is sum(max(0,creditedProgress))/trackLength, rounded to one decimal **per race** before pooling. It does not subtract starting grid offsets, including the positive starting credit introduced by the new finish. Lead changes sample running cars every 24 physics steps, start counting after race second 10, and exclude the finished phase. Median is the sorted upper-middle element for even sample counts. Flag gaps include flag finishes only. Per-seed gaps at clock shutdown are labelled as such by the end column. Stuck remains running speed<3 m/s after second five. Later-crossing rates count leader laps 1–4 with the same total car-lap denominator. Complete-lap pace compares each winning car's best lap numbered 2 or later, excluding the short opening lap.

The historical-policy replay uses pre-open-road.json and the old 9 m grid by replacing only ROW_GAP=14→9 and SPAWN_LAST_ROW_S=−32→−2 in an **in-memory import** of world.js. Both comparison columns use the current finish at s=1030 and the applied balance. No simulator file is written. It measures combined network/grid differences on common balance; it cannot isolate those two effects. The parent's earlier old-balance baseline (22/28 flags, open 1.570, hard .994, cross .183) is historical context, not silently mixed into the new controlled columns.

Development seeds: 1, 7, 42, 1201, 1709, 2309, 2903, 3613, 4801, 6007, 6011, 6029, 6043, 6053, 6067, 6073, 6089, 6101, 6113, 6121, 8101, 8111, 8117, 8123, 8147, 8161, 8171, 8191. The ten previous held-outs are 9103, 9113, 9133, 9151, 9173, 9199, 9203, 9221, 9239, 9257; they were first measured after the original weight freeze at 2026-11-05T02:16:59.167Z, but are now known. The twelve owner-added seeds are 10007, 10037, 10061, 10093, 10103, 10133, 10151, 10177, 10211, 10243, 10267, 10289; the owner had already inspected them. No group is advertised as newly blind in this refresh. Refresh manifest time: 2026-11-05T04:54:53.590Z. Every final-policy and original-policy race was rerun against the current simulator. The rejected attempts were not rerun or reconsidered; their results remain historical evidence.

### Development comparison

| Metric | Original policy / 9 m / applied balance | Final / 14 m / applied balance |
|---|---:|---:|
| Flag finishes | 28.000 | 26.000 |
| Minimum running at shutdown | 3.000 | 2.000 |
| Mean running | 5.643 | 4.893 |
| Median seconds | 185.500 | 188.800 |
| Median flag margin m | 250.000 | 189.000 |
| Lead changes/race | 3.679 | 3.857 |
| Open hits/car-lap | 1.529 | 1.350 |
| Hard open hits/car-lap | 0.934 | 0.881 |
| Crossing hits/car-lap | 0.181 | 0.252 |
| Crossing hits on leader laps 1–4/car-lap | 0.174 | 0.245 |
| Stalled KOs/race | 0.429 | 0.821 |
| Stalled KOs/car-lap | 0.011 | 0.021 |
| Turtled KOs/car-lap | 0.099 | 0.095 |
| Stuck % | 2.697 | 3.040 |
| Weapons/race | 80.536 | 81.429 |
| Crate collection % | 46.695 | 47.302 |
| Wall events/car-lap | 4.672 | 4.876 |
| Median winner best complete lap s | 36.425 | 36.708 |

### Previous held-out comparison

| Metric | Original policy / 9 m / applied balance | Final / 14 m / applied balance |
|---|---:|---:|
| Flag finishes | 10.000 | 9.000 |
| Minimum running at shutdown | 4.000 | 3.000 |
| Mean running | 5.700 | 5.100 |
| Median seconds | 188.100 | 186.400 |
| Median flag margin m | 84.000 | 86.000 |
| Lead changes/race | 5.700 | 4.400 |
| Open hits/car-lap | 1.731 | 1.433 |
| Hard open hits/car-lap | 1.070 | 0.946 |
| Crossing hits/car-lap | 0.139 | 0.154 |
| Crossing hits on leader laps 1–4/car-lap | 0.139 | 0.154 |
| Stalled KOs/race | 0.700 | 0.400 |
| Stalled KOs/car-lap | 0.017 | 0.010 |
| Turtled KOs/car-lap | 0.096 | 0.105 |
| Stuck % | 2.291 | 2.420 |
| Weapons/race | 81.900 | 80.600 |
| Crate collection % | 45.372 | 47.312 |
| Wall events/car-lap | 4.789 | 4.762 |
| Median winner best complete lap s | 36.800 | 36.517 |

### Owner-added comparison

| Metric | Original policy / 9 m / applied balance | Final / 14 m / applied balance |
|---|---:|---:|
| Flag finishes | 10.000 | 10.000 |
| Minimum running at shutdown | 3.000 | 3.000 |
| Mean running | 5.250 | 4.750 |
| Median seconds | 189.200 | 190.100 |
| Median flag margin m | 154.000 | 209.000 |
| Lead changes/race | 5.000 | 4.583 |
| Open hits/car-lap | 1.798 | 1.402 |
| Hard open hits/car-lap | 1.104 | 0.882 |
| Crossing hits/car-lap | 0.198 | 0.214 |
| Crossing hits on leader laps 1–4/car-lap | 0.188 | 0.206 |
| Stalled KOs/race | 0.250 | 0.667 |
| Stalled KOs/car-lap | 0.006 | 0.017 |
| Turtled KOs/car-lap | 0.107 | 0.112 |
| Stuck % | 3.055 | 2.483 |
| Weapons/race | 82.333 | 80.250 |
| Crate collection % | 49.413 | 45.922 |
| Wall events/car-lap | 4.927 | 5.005 |
| Median winner best complete lap s | 36.621 | 36.679 |

### All 50, pooled

| Metric | Original policy / 9 m / applied balance | Final / 14 m / applied balance |
|---|---:|---:|
| Flag finishes | 48.000 | 45.000 |
| Minimum running at shutdown | 3.000 | 2.000 |
| Mean running | 5.560 | 4.900 |
| Median seconds | 186.200 | 187.500 |
| Median flag margin m | 139.000 | 163.000 |
| Lead changes/race | 4.400 | 4.140 |
| Open hits/car-lap | 1.634 | 1.379 |
| Hard open hits/car-lap | 1.002 | 0.894 |
| Crossing hits/car-lap | 0.176 | 0.223 |
| Crossing hits on leader laps 1–4/car-lap | 0.170 | 0.218 |
| Stalled KOs/race | 0.440 | 0.700 |
| Stalled KOs/car-lap | 0.011 | 0.018 |
| Turtled KOs/car-lap | 0.100 | 0.101 |
| Stuck % | 2.700 | 2.785 |
| Weapons/race | 81.240 | 80.980 |
| Crate collection % | 47.048 | 46.969 |
| Wall events/car-lap | 4.756 | 4.885 |
| Median winner best complete lap s | 36.450 | 36.679 |

## Finish tables

The paired CSV, [finish-line-50.csv](../tools/nn/finish-line-50.csv), includes every owner-metric field for both policies on all 50 seeds. In the tables, old→final means original policy/9 m grid → retained policy/14 m grid, both on the current finish and balance. Single-valued weapons, stuck, KO and crate columns describe the retained policy.

### All 28 development seeds

| Seed | Original 9 m s/end | Final s/end | Running old→final | Gap m old→final | Leads old→final | Open/hard/cross old→final | Best full lap old→final s | Weapons | Stuck % | Stalled/turtled | Crates % |
|---:|---|---|---|---|---|---|---|---:|---:|---|---:|
| 1 | 185.3 flag | 200.0 CLOCK | 7→3 | 13→503 | 1→4 | 58/30/7→65/41/18 | 37.213→37.462 | 95 | 2.85 | 0/3 | 50.6 |
| 7 | 185.7 flag | 179.5 flag | 7→5 | 413→297 | 1→1 | 50/34/8→63/41/5 | 36.387→35.917 | 68 | 2.97 | 0/5 | 44.2 |
| 42 | 195.0 flag | 191.3 flag | 4→3 | 59→323 | 4→2 | 114/67/7→57/34/9 | 36.717→36.392 | 91 | 2.94 | 2/3 | 56.7 |
| 1201 | 181.6 flag | 187.2 flag | 6→3 | 377→584 | 2→0 | 47/27/5→50/34/15 | 36.254→37.138 | 73 | 3.92 | 1/3 | 52.3 |
| 1709 | 184.2 flag | 193.5 flag | 5→7 | 359→62 | 1→6 | 92/62/3→43/28/15 | 36.375→37.375 | 94 | 1.93 | 0/2 | 47.5 |
| 2309 | 183.4 flag | 185.5 flag | 5→4 | 272→163 | 3→4 | 84/52/6→41/28/22 | 36.196→36.021 | 71 | 4.49 | 1/3 | 44.5 |
| 2903 | 186.7 flag | 193.9 flag | 6→8 | 533→20 | 8→5 | 70/44/8→62/33/12 | 36.771→36.708 | 104 | 1.97 | 0/2 | 44.2 |
| 3613 | 183.3 flag | 196.4 flag | 9→6 | 111→36 | 0→8 | 45/29/7→37/26/5 | 36.217→38.196 | 98 | 2.17 | 0/5 | 52.7 |
| 4801 | 182.7 flag | 200.0 CLOCK | 6→2 | 306→59 | 5→7 | 54/27/14→67/42/13 | 36.262→37.471 | 74 | 4.70 | 2/3 | 44.0 |
| 6007 | 185.5 flag | 187.1 flag | 6→5 | 48→405 | 1→1 | 27/24/3→57/43/5 | 36.425→36.533 | 80 | 3.01 | 0/5 | 55.2 |
| 6011 | 190.5 flag | 182.6 flag | 3→6 | 77→47 | 0→6 | 56/39/20→37/26/4 | 36.496→35.979 | 89 | 1.03 | 0/4 | 45.4 |
| 6029 | 185.7 flag | 195.7 flag | 6→6 | 64→502 | 5→2 | 69/38/5→52/39/12 | 36.450→37.512 | 74 | 6.64 | 2/3 | 57.3 |
| 6043 | 189.5 flag | 194.1 flag | 3→3 | 139→144 | 10→6 | 43/24/4→39/31/16 | 36.100→37.154 | 73 | 2.94 | 0/4 | 54.8 |
| 6053 | 186.8 flag | 194.7 flag | 6→6 | 47→84 | 3→6 | 42/22/1→39/26/8 | 36.100→36.854 | 89 | 3.82 | 0/5 | 49.7 |
| 6067 | 185.6 flag | 192.0 flag | 9→5 | 70→283 | 6→3 | 59/36/2→68/43/12 | 36.450→37.458 | 82 | 2.96 | 0/6 | 46.0 |
| 6073 | 183.8 flag | 188.9 flag | 5→5 | 40→673 | 4→3 | 88/49/2→69/48/16 | 36.467→35.983 | 83 | 4.64 | 1/4 | 53.6 |
| 6089 | 186.2 flag | 181.5 flag | 5→5 | 93→83 | 2→5 | 68/36/3→24/11/0 | 36.679→36.004 | 65 | 3.43 | 2/5 | 35.6 |
| 6101 | 195.1 flag | 180.8 flag | 6→5 | 365→189 | 12→1 | 63/39/13→33/20/9 | 36.121→35.908 | 87 | 4.24 | 3/4 | 56.5 |
| 6113 | 184.9 flag | 189.2 flag | 6→6 | 483→85 | 6→4 | 79/61/23→43/25/13 | 36.954→37.404 | 90 | 2.19 | 0/3 | 43.6 |
| 6121 | 182.6 flag | 184.1 flag | 7→5 | 302→21 | 3→10 | 58/28/14→57/41/2 | 36.429→36.704 | 76 | 1.40 | 0/6 | 40.2 |
| 8101 | 179.6 flag | 188.8 flag | 6→5 | 320→179 | 0→8 | 80/51/5→49/33/5 | 35.942→36.604 | 95 | 2.13 | 1/3 | 59.5 |
| 8111 | 187.6 flag | 185.9 flag | 7→4 | 250→91 | 1→5 | 83/53/12→66/46/7 | 36.287→36.767 | 77 | 2.28 | 2/2 | 40.4 |
| 8117 | 179.3 flag | 192.1 flag | 5→3 | 304→390 | 1→4 | 43/29/3→82/45/1 | 35.892→36.175 | 71 | 2.61 | 0/6 | 49.6 |
| 8123 | 199.2 flag | 179.2 flag | 4→4 | 172→565 | 13→0 | 63/29/2→57/41/14 | 36.892→35.887 | 64 | 4.10 | 0/5 | 48.0 |
| 8147 | 185.1 flag | 185.4 flag | 4→6 | 15→39 | 4→2 | 35/26/5→54/38/14 | 37.304→36.875 | 94 | 2.36 | 0/3 | 43.2 |
| 8161 | 183.7 flag | 179.8 flag | 5→5 | 349→396 | 2→2 | 50/34/9→70/40/15 | 36.400→35.892 | 72 | 3.40 | 2/3 | 42.0 |
| 8171 | 181.7 flag | 183.0 flag | 7→4 | 65→276 | 2→1 | 45/25/8→62/36/10 | 36.217→36.379 | 77 | 2.76 | 3/3 | 39.4 |
| 8191 | 197.6 flag | 183.0 flag | 3→8 | 612→419 | 3→2 | 54/35/4→58/41/3 | 36.979→36.725 | 74 | 2.76 | 1/3 | 42.2 |

### Ten previous held-outs

| Seed | Original 9 m s/end | Final s/end | Running old→final | Gap m old→final | Leads old→final | Open/hard/cross old→final | Best full lap old→final s | Weapons | Stuck % | Stalled/turtled | Crates % |
|---:|---|---|---|---|---|---|---|---:|---:|---|---:|
| 9103 | 192.9 flag | 182.7 flag | 4→6 | 13→226 | 8→5 | 59/33/4→51/35/4 | 36.800→36.179 | 88 | 4.07 | 1/4 | 53.9 |
| 9113 | 182.7 flag | 186.4 flag | 6→6 | 68→76 | 3→4 | 65/37/3→81/49/1 | 36.825→36.075 | 89 | 0.96 | 0/3 | 41.3 |
| 9133 | 187.0 flag | 186.4 flag | 5→5 | 45→69 | 3→6 | 85/53/6→63/39/6 | 37.125→36.721 | 88 | 2.15 | 0/3 | 48.4 |
| 9151 | 190.9 flag | 181.5 flag | 4→7 | 412→379 | 20→3 | 89/62/7→27/20/5 | 37.708→36.175 | 89 | 3.34 | 0/5 | 54.1 |
| 9173 | 184.7 flag | 196.3 flag | 7→4 | 84→29 | 7→4 | 55/26/2→49/35/14 | 36.196→37.158 | 78 | 3.83 | 1/3 | 53.5 |
| 9199 | 182.4 flag | 184.6 flag | 4→5 | 530→86 | 3→4 | 68/37/11→67/42/3 | 36.000→36.375 | 77 | 1.53 | 0/5 | 35.5 |
| 9203 | 192.7 flag | 200.0 CLOCK | 7→3 | 163→261 | 1→5 | 86/57/14→84/61/10 | 36.358→37.704 | 82 | 2.73 | 1/3 | 58.0 |
| 9221 | 188.1 flag | 183.7 flag | 9→5 | 1→122 | 6→3 | 98/66/3→44/30/5 | 36.375→36.204 | 70 | 1.60 | 0/6 | 45.8 |
| 9239 | 188.5 flag | 187.5 flag | 4→4 | 67→14 | 3→9 | 50/34/2→45/30/11 | 36.321→37.146 | 75 | 2.28 | 0/5 | 39.2 |
| 9257 | 186.9 flag | 184.4 flag | 7→6 | 98→134 | 3→1 | 67/41/6→48/28/1 | 37.238→36.517 | 70 | 2.02 | 1/4 | 53.4 |

### Twelve owner-added seeds

| Seed | Original 9 m s/end | Final s/end | Running old→final | Gap m old→final | Leads old→final | Open/hard/cross old→final | Best full lap old→final s | Weapons | Stuck % | Stalled/turtled | Crates % |
|---:|---|---|---|---|---|---|---|---:|---:|---|---:|
| 10007 | 187.5 flag | 187.9 flag | 7→6 | 76→92 | 6→7 | 70/46/10→41/28/4 | 36.054→37.396 | 78 | 1.46 | 1/3 | 39.8 |
| 10037 | 178.5 flag | 190.1 flag | 6→4 | 381→23 | 1→4 | 55/37/6→50/36/5 | 35.942→36.679 | 60 | 4.41 | 3/3 | 46.0 |
| 10061 | 189.2 flag | 188.2 flag | 4→7 | 154→170 | 4→4 | 43/22/10→39/22/0 | 36.621→36.104 | 81 | 0.88 | 0/5 | 40.5 |
| 10093 | 200.0 CLOCK | 181.0 flag | 5→5 | 0→260 | 9→0 | 96/50/12→77/47/11 | 37.563→35.467 | 100 | 2.93 | 0/3 | 50.8 |
| 10103 | 198.8 flag | 191.4 flag | 4→4 | 219→162 | 8→4 | 78/45/11→49/29/9 | 37.271→36.612 | 98 | 2.55 | 1/5 | 53.3 |
| 10133 | 186.7 flag | 181.6 flag | 5→5 | 256→209 | 1→7 | 99/56/9→60/31/4 | 36.708→36.308 | 76 | 1.34 | 0/7 | 51.6 |
| 10151 | 190.5 flag | 182.6 flag | 4→6 | 227→300 | 8→6 | 57/41/3→40/25/7 | 36.225→36.425 | 72 | 2.19 | 1/4 | 54.5 |
| 10177 | 200.0 CLOCK | 191.4 flag | 3→4 | 81→64 | 4→4 | 91/60/18→59/34/11 | 38.175→36.679 | 83 | 2.20 | 1/5 | 39.4 |
| 10211 | 182.0 flag | 200.0 CLOCK | 4→3 | 75→134 | 1→9 | 78/44/2→78/52/22 | 35.929→36.921 | 88 | 3.51 | 0/4 | 39.4 |
| 10243 | 184.2 flag | 190.6 flag | 8→4 | 75→235 | 4→4 | 41/28/2→74/49/5 | 36.604→37.492 | 81 | 2.98 | 0/4 | 46.2 |
| 10267 | 192.2 flag | 184.4 flag | 6→5 | 57→358 | 2→3 | 93/64/6→64/37/11 | 36.671→36.521 | 73 | 2.23 | 0/6 | 45.6 |
| 10289 | 184.5 flag | 200.0 CLOCK | 7→4 | 124→299 | 12→3 | 52/31/5→43/34/14 | 36.621→39.808 | 73 | 3.02 | 1/5 | 50.4 |

## Verification, exactness and remaining limits

172/172 tests pass, including 71 neural/evaluation tests. Construction regenerates weights byte for byte; both rejected construction snapshots also regenerate their checkpoint tensors exactly without writing deployed weights. 31 frames and 3883 saved activations replay exactly. All 100 final/original rows independently match the winning car's minimum over laps numbered 2 onward. Browser ESM bundle: 229770 bytes. No runtime/wrapper changes, per-call allocation, simulator edits, training, fitting or parameter search were introduced.

Twelve production act calls: 0.394 ms mean, 0.530 ms p95, 1.699 ms maximum over 10000 batches. All three measured statistics are below 2 ms. Before/final graph bytes are identical, so there is no added neural work in this pass. The historical pre-open-road graph is smaller and measures 0.257 ms mean; the old literal no-increase target versus that graph is still unmet. Sample timing includes host scheduling/GC and is not a worst-case execution-time proof.

Affine arithmetic, Boolean gates, stable WTA, clipped recurrences and square-product multiplication are exact identities over their declared real domains. Float32 inputs and Float64 runtime introduce tested numeric error. Pursuit, friction allowances, local body/ray corridors, passing and recovery geometry remain approximations or explicit heuristics. Fixed race seeds are observations, not guarantees; random circuit interiors verify equations and never choose weights.

The mechanical recovery defects above remain in the deployed graph because the tested repair cost flags. Oil recovery can be too slow, front-corner obstacles can be missed, and a fast wrong-way car can defer entry until it has lost too much route. Collision disruption and route-credit debt can still defeat the 12 s stall rule. The attempted same-strand crossing braking did not reduce total open contact enough and also lost flags/lead changes, so the broad crossing exemption remains. The half-contact goal is not met. This pass recommends no further balance or network tuning.

All eleven weapons are used across the full set. Across 50 final races, mean fired=80.98, rocket damaging shots=56.46%, tail-qualified drops=84.73%, maximum non-roof hold=23.508 s, crates collected=46.97% and live misses=52.04%. The old 20 s hold and 65% collection targets are not implied by the new acceptance table. Field slip>10° is 6.95% of moving samples, while solo unarmed slip is only 0.132%; contact/weapon sliding is not proof of stylish solo drifting. Solo best complete lap (lap 2 onward)=35.837 s unarmed and 35.983 s armed. The first shortened lap is excluded from all complete-lap pace comparisons; winnerBestLap is the winning car's minimum over laps 2 onward, and leaderBestLap is the minimum complete lap recorded by a car leading at that lap event. Both fields are null if no qualifying complete lap exists. lapTimes retains the opening interval for event accounting, but no best-lap minimum includes it.

Reproduce with final-pass-eval.mjs before/final/original9 and explicit seeds; rejected tensor checkpoints may be evaluated by their JSON basename. Then run node --test, inspect.mjs, verify.mjs and document.mjs. results-final.jsonl, owner-final-50.jsonl, final-pass-original9.jsonl, final-pass-summary.json, finish-line-manifest.json and final-pass-timing.json are the current report artifacts. final-pass-freeze.json and the rejected-attempt JSONLs deliberately retain their historical simulator identity; finish-line-before preserves the report before the finish-line move, and shipping-before preserves the report before the final simulator review fixes. Their best-lap fields predate the complete-lap metric repair and must not be used as current full-lap pace measurements. Other archived result files describe explicitly named earlier checkpoints.

Simulator SHA-256: 0a60a94507980d902e180a4953bae030778c34502cb245e557b3b80386afd6f8. Weights SHA-256: ebd81dc2cb4cfe3292cb5b8311c67eba5aeb628934c9dffdb32789347bdd62ed. Final architecture: 131 layers, 4155 units, 7896 edges, 12051 parameters, 47 recurrent states, 277 observations and six actions. No files outside the authorized AI/tools/neural-test/neural-documentation paths were changed.
