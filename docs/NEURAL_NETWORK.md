# The Knot: programming a racing neural network

The bots now race first. I described the driving job as a small program: follow the racing line at the pace-note speed, control rear-wheel slip, move around slower traffic, and recover after a collision. Recovery requires obstruction or a backward heading; a merely slow car on clear road keeps driving. Failed recovery legs are judged by route loss as well as motion, and an obsolete turn direction can be reconsidered. I translated that program into affine neuron rows and activation functions, assigning every weight directly. Passing provides the conflict: for a bounded half-second pulse an angry, stable bot leaves less room beside a nearby rival, followed by at least four seconds of rest. A rival never becomes its destination. The track supplies the crossroads and landing collisions.

No training, fitting, gradients, optimizers or parameter search was used. The deterministic construction is [build.mjs](../tools/nn/build.mjs). Fixed-policy measurements informed the explicitly logged equation corrections below. Random test inputs check identities; they do not set weights.

## Final acceptance status

**The complete acceptance floor is not met.** 9/9 races end at three laps; 6/9 finish within 165 s and 3/9 meet the 50 s leader-lap limit. Mean stalled KOs=0.889, weighted stuck time=4.724%, longest stop=18.467 s. Stalled KOs measure failure to gain route; they can happen to a moving car. They are not interchangeable with stopped-time samples.

Seven development seeds are 1, 7, 42, 1201, 1709, 2309, 2903. Reserved seeds 3613 and 4801 are reported separately. They are not pristine one-shot hold-outs: earlier rounds measured them, and the reviewer explicitly used seed 4801 to diagnose the stale recovery latch and aggression cost. This round reports the requested reserved comparison set separately, without claiming untouched validation. No weights were selected by comparing candidates, and no automatic parameter search ran.

For development: stalled KOs=1.000/race, stuck=4.432%, longest stop=12.500 s. The priority floor is not met in this group.

For held-out: stalled KOs=0.500/race, stuck=5.659%, longest stop=18.467 s. The priority floor is not met in this group.

| Acceptance requirement | Final measurement, all nine seeds | Status |
|---|---|---|
| Every race ends at three laps within 165 s | 6/9; max 175.242 s | Fail |
| Leader best lap ≤50 s | 3/9; max 53.283 s | Fail |
| Mean KOs ≤4 | 3.444 | Pass |
| Earlier mean turtled target ≤0.5 | 1.000 | Fail |
| Mean stalled KOs ≤0.5 | 0.889 | Fail |
| Mean running at finish ≥7 | 8.556 | Pass |
| Stuck car-time ≤3% | 4.724% | Fail |
| Longest stop ≤8 s | 18.467 s | Fail |
| Hits/min ≥10 and hard/min ≥1.5 | 9/9 | Pass |
| Crossroads share ≥25% | 7/9 | Fail |
| Mean lead changes ≥2 | 4.000 | Pass |
| Moving slip above 10° ≥8% | 11.805% pooled; 9/9 individually | Pass pooled; see individual results |
| Mean descending-car hit events ≥4 | 3.667 | Fail |
| Twelve act() calls under 2 ms | Mean 0.129, p95 0.135, max 0.548 ms | Pass measured |

## Runtime boundary and architecture

The simulator runs at 240 Hz, decisions at 30 Hz. OBS supplies 253 Float32 raw observations. The generic forward pass uses Float64 affine sums and activation/state buffers; act() copies/clamps five Float32 outputs and decodes display telemetry. No policy is in the wrapper, and telemetry never controls the car. The same tensors drive all twelve cars; temperament arrives through observations.

<!-- architecture -->
| Quantity | Value |
|---|---:|
| Computed neurons | 1693 |
| Layers with earlier-layer skip connections | 90 |
| Nonzero edges | 3164 |
| Stored parameters, edges plus biases | 4857 |
| Recurrent state values | 26 |
| Generated weights bytes | 73998 |
<!-- /architecture -->

The final deadline repair adds seven computed units, twelve edges and nineteen stored parameters to the immediate pre-fix checkpoint; no recurrent states are added. A name-based row comparison proves that only routeFailed changes among existing rows. Most additional depth comes from putting the safety predicates before the offset and steering pipeline; these are sparse arithmetic layers, not wide dense MLP layers. The generic runtime is unchanged. The previous derby controller had 4737 computed units and 37 states. Removing hunt/intercept scoring, cold urgency, wind-ups, attack renewal and target-locked run-ups makes this controller substantially smaller. Activations remain linear, ReLU, step, square and atan (plus reciprocal for pursuit). A mixed-activation circuit is deliberate; no claim is made that a finite ReLU-only network exactly implements discontinuous comparisons or division.

State indices 0–10 are fixed-slot grudges, 11 rage, 12 slow-time accumulation, 13 recovery clock, 14 recovery gear, 15 recovery steering, 16 filtered passing offset, 17 recovery-active latch, 18 backward-turn latch, 19 phase no-motion integral, 20 route debt in metres, 21 wall-clock leg age, 22 aggression pulse/cooldown clock, 23 neutral passing offset, 24 display-only rage, and 25 previous race position. All start at zero. All old state values are read before any next state is copied. Construction-time loops merely replicate named rows across eleven fixed slots. There is no per-act allocation in the runtime or wrapper source.

Actions are steer, throttle, brake, handbrake, reverse. Handbrake is zero: controlled power/lift slides arise from the existing tyre physics and slip feedback, not a rear-lock stunt that sacrifices pace. There is no new raw sensor and no simulator edit by this implementation.

## Neuron map and arithmetic substrate

[NEURON_MAP.md](NEURON_MAP.md) lists every layer range, unit, exact row, activation and consumer. The primary interfaces are:

<!-- interfaces -->
| Block output | ID | Layer | Domain | Consumer |
|---|---:|---:|---|---|
| grudge0 | 1057 | 5 | [0,1] | Passing commitment, next state |
| rage | 654 | 2 | [0,1] | Driving commitment, next state |
| shownRage | 1824 | 26 | [0,1] | Display only |
| leanClock | 1891 | 47 | [0,4.5] s | Pulse and cooldown |
| effectiveNarrowing | 1924 | 65 | bit | Hunt display |
| neutralOffset | 1770 | 19 | [-3,3] m | Neutral pass and display reference |
| routeDebt | 1750 | 17 | [0,8] m | Failed-leg detector |
| legTime | 1833 | 28 | [0,2] s | Wall-clock leg deadline |
| headingYawAgreement | 789 | 2 | [-1.5,1.5] | Heading improvement test |
| turnImproving | 1113 | 5 | bit | Route-deadline exemption |
| routeFailed | 1774 | 20 | bit | Leg replan |
| turnReconsider | 1739 | 16 | bit | Turn latch |
| traffic0.valid | 959 | 4 | bit | Traffic WTA |
| target0 | 1343 | 8 | bit | Local traffic selector |
| passing | 1733 | 16 | bit | Lateral excursion |
| activeLean | 1959 | 82 | bit | Hunt display |
| passOffset | 1908 | 57 | [-3,3] m | Next state and aim |
| boundedOffset | 1915 | 62 | road corridor | Pursuit aim |
| pursuitCurvature | 1935 | 71 | [-.5,.5] 1/m | Steering and expected yaw |
| followingSteer | 1940 | 74 | bounded heuristic | Normal steering |
| wallReflex | 802 | 2 | [-.232,.232] | Normal steering |
| desiredSpeed | 1318 | 7 | [0,1.455] sensor units | Speed error |
| slipAuthority | 928 | 3 | [0,1] | Low-speed throttle release |
| slipGrip | 1402 | 9 | [0,1] | Throttle multiplier |
| spinGrip | 929 | 3 | [0,1] | Throttle multiplier |
| forwardBlocked | 1307 | 7 | bit | Recovery evidence |
| releaseRoad | 1389 | 9 | bit | Recovery release |
| stuck | 1661 | 11 | [0,.6] s | Entry threshold |
| escapeTimer | 1832 | 28 | [0,1.8] s | Gear phases |
| phaseSlow | 1825 | 27 | [0,1] s | Failed-leg detector |
| escapeActive | 1725 | 15 | bit | Recovery latch and display |
| escapeTurn | 1841 | 30 | {-1,0,1} | Opposing steering locks |
| reverse | 1845 | 33 | bit | Action 4 |
| steer | 1971 | 90 | [-1,1] | Action 0 |
| throttle | 1877 | 42 | [0,1] | Action 1 |
| brake | 1889 | 45 | [0,1] | Action 2 |
<!-- /interfaces -->

Let R(x)=max(0,x), H(x)=1 if x≥0 else 0, C(x)=clip(x,0,1). Affine rows have W[out,in] orientation. Missing edges are zero.

* Absolute value: R(x)+R(−x), weights +1 and −1 into two hinges, then [1,1] readout.
* Clip to [a,b]: a+R(x−a)−R(x−b). A steering clip uses biases +1,−1 and output bias −1.
* Product: ((x+y)²−(x−y)²)/4. Two square units have rows [1,1] and [1,−1]; readout weights are [.25,−.25]. This is algebraically exact, with floating cancellation in deployment.
* Signed Boolean gate G(x,g;M)=R(x+Mg−M)−R(−x+Mg−M). At g=0 and |x|≤M both hinges vanish; at g=1 their difference is x. Raw sensor selectors use M=1.5; passing offsets M=3; steering muxes M=6; Boolean latches M=1. The phase-clock gate uses M=2 because its clipped maximum is 1.8 s; Boolean latch gates use M=1. Route-debt gates use M=8, the clipped debt bound. The aggression-clock mux uses M=4.5, its exact countdown ceiling. Lost-place gating uses M=11 because twelve cars span eleven positions.
* Mux(g,x,y)=G(x,g;M)+G(y,1−g;M).
* AND of n bits is H(sum(bits)−n+.5); OR is H(sum(bits)−.5). Half-unit margins separate Boolean cases.
* WTA compares every pair. H(score_i−score_j) awards equality to the smaller slot; its affine complement awards the other side. AND of all pairwise wins produces exactly one winner. Eleven-way selection has 55 comparisons, 55 complementary rows and 11 conjunctions. No runtime argmax selects control targets.

## Racing line and speed become steering and pedals

Look points are already on the racing line, in metres/70. Speed is m/s/40. A three-threshold neural mux chooses the 16, 28, 45 or 65 m point at speeds 14, 24 and 34 m/s. Those horizons retain the tested reference driver's preview schedule; threshold equality selects the farther point. A filtered passing offset is added to its lateral coordinate.

For normalized aim(x,y), the tangent-circle curvature is:

```text
kappa = 2*y / (70*max(x*x+y*y,(4/70)^2))
wheel = atan(2.85*kappa)
expectedYaw = kappa*(40*speedFwd)/3
steer = (1.25/.6)*wheel + .95*slipAngle - .12*(yawRate-expectedYaw)
```

The wheelbase is 1.45−(−1.4)=2.85 m, nominal lock .6 rad. The denominator floor is .00326530612245; its reciprocal is bounded by 306.25. The coefficient 2/70 comes from normalized coordinates, not a fitted steering curve. The 1.25 multiplier retains the reference driver's understeer allowance. Slip feedback is positive: when velocity lies right of the nose, right steering turns the nose toward that velocity. The .95 gain and .12 residual-yaw damping are declared control heuristics, not proven stability gains. If the selected route point is behind, a comparator substitutes ±.7 steering toward its lateral side, so a spun car can turn forward toward the route.

Walls add 4R(2.6/45−ray8)−4R(2.6/45−ray7). The 2.6 m clearance is the supplied racing line's margin; normalized rays are distance/45. This correction is zero on the intended clear line and increases after contact pushes the car toward a wall. At zero ray clearance its magnitude is .231111 action units. It does not estimate a complete swept vehicle path. Final alignment correction is −ego.alignment/3 because the input is physical radians×5 and nominal steering lock is .6 rad: 1/(5*.6)=1/3. Damaged lock makes cancellation approximate.

Desired speed is ego.pace times .97, minus a small crossing lift. The pace notes already include braking before every corner and the jump air zones; the network does not recalculate them. The .97 share reserves 3% speed and about 5.9% lateral-acceleration margin relative to the notes, before tyre/controller errors.

```text
nearCrossing = C(1 - 120*toCrossing/12)
share = .97 - nearCrossing*.012*(1-nerve)
error = pace*share - speedFwd
demand = C(20*error + .04 + .15*speedFwd²), gated by error>=0
fastSlipGrip = C(1 - 6*R(abs(slipAngle)-.10))
slipAuthority = C((1600*(speedFwd²+speedRight²)-4)/32)
slipGrip = 1 - slipAuthority*(1-fastSlipGrip)
spinGrip = C(1 - 5*R(rearSlip-.12))
throttle = demand*slipGrip*spinGrip
brake = C(-14*error)
```

The speed gains 20 and 14 mean .5 throttle and .35 brake per m/s, matching the reference driver's units. A nominal 6000 N available wheel force gives rolling fraction(.016*1550*9.81)/6000≈.0405 and drag coefficient(.56*40²)/6000≈.1493, rounded to .04 and .15 for feed-forward. This is an approximate load model, not parameter fitting. The rear-slip threshold .12 is the tyre's peak-slip ratio. Full spin suppression occurs at .32; at racing speed body-slip grip fades from .10 to .266667 rad. The envelope allows modest power slides but cuts drive for a spin. Moving slip above 10° drives drift telemetry; it is not proof that every slide is intentional.

At low speed, body slip also contains ordinary turning geometry: beta=atan((1.4/2.85)*tan(.6))≈.324 rad at full lock. The old gate treated that as a spin and removed all throttle, so a physically freed car could creep at 1 m/s. The slip-authority ramp is C(50*(speedFwd²+speedRight²)−.125). Squared horizontal speed follows lateral load; weights 50=1600/(36−4) and bias −.125=−4/32 follow from observations in m/s/40 and the 2–6 m/s endpoints. Using both components prevents a fast sideways slide from masquerading as a slow launch. At 2 m/s a full-lock bicycle has only about .96 m/s² lateral acceleration; at 6 m/s it has about 8.64 m/s². Thus body-slip suppression fades in over 2–6 m/s, while wheelspin suppression remains active at every speed. The circuit above 6 m/s is unchanged. This is a reasoned low-speed approximation, not a fitted traction curve.

The network does not use cross-traffic arrival times to avoid or pursue cars. A nervous driver gives up at most 1.2 percentage points of pace inside 12 m of a crossing; nerve 1 gives up none. Cross traffic remains a deliberate source of racing conflict.

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

Neither target position nor anger changes desired speed or requests reverse. Rear blocking and a separate PIT manoeuvre are not implemented. The ablation below measures the remaining traffic-dependent cost of this governed narrowing, including subsequent collisions and recovery.

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

At 30 Hz, 240 decisions give an eight-second half-life; the leak is 0.9971160533355892. A .2-strength contact adds .5, and losing one of twelve-car rank positions adds .2. Countdown observations prime previous rank without awarding rage. Rank loss can include contact/ranking consequences, so this is honestly a lost-position signal, not an inferred clean overtake. The display also reacts to a bot's own credited hit through iHit. Tests trace dependencies and prove that neither display state nor rank input reaches an action or driving-state output. The temperament/grudge controller still consumes only drivingRage. In display-rage.mjs at race time 30 s over the same nine seeds, the 106 still-running cars have mean displayed rage .616462 versus mean driving rage .312050 (rage-final.jsonl). This is the current-sim sample, not a matched comparison with the earlier reported .1 bars.

Inside 25 m of a jump lip, no new pass offset is requested. The filter gives about a second to return toward the line at 25 m/s. Inside 8 m, steering demand is clipped to ±.18 before alignment compensation, corresponding to .108 rad nominal wheel angle. With no wheels down, the steering demand and brake are zero; alignment compensation still cancels bent steering. The brake is immediately available again at first wheel contact, using the current pace error, so Pancake's landing brake zone remains active. These gates cannot undo a collision at take-off or guarantee zero slip at the lip.

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
            AND raceActive AND grounded AND NOT oldRecoveryActive
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

The product uses two square rows with [1,1] and [1,−1], then [.25,−.25] readout. Strict positivity is 1−H(−product): weight −1, bias zero into the step, followed by an affine complement. Zero yaw or zero heading sine is not improving. AND with gearMatches uses two +1 weights and bias −1.5. The final complement enters routeFailed as one extra +1 input; its five-input AND bias changes from −3.5 to −4.5. This is the entire policy repair: seven new rows and one modified row. No extra speed threshold, timer or fitted constant was introduced.

The sign is a local angular-progress heuristic, not a prediction of recovery completion. It ignores rotation of the route tangent itself, and any positive yaw alignment qualifies, however small. Existing obstruction, no-motion and 1.7 s useful-reverse-phase transitions remain in force; only the route-loss deadline is inhibited. The 90-decision regression follows a forward turn through about 67° while it initially loses route, then mismatches the gear and verifies that the deadline still fires.

Leg age is wall time, including shifts and opposite travel. Unlike the useful-motion timer, it cannot remain at zero while a gear request is failing. A route-failure replan bypasses the .5 s useful-motion minimum. If facing backwards and the rear is clear, it requests reverse; otherwise it requests forward, and in either case it recomputes the turn. Ordinary blocked/no-motion replans alternate gear. The two clocks therefore have different jobs: preserve enough actual reverse motion to manoeuvre, but prevent a motion-only failure detector from accepting endless route loss.

The phase clock advances by 1/30 only when observed gear matches requested gear and longitudinal velocity is not more than .2 m/s in the opposite direction. It saturates at 1.8 s and resets on leg replans, including replans that retain the same gear. A mismatch requests brake=.7 and throttle=0; this lets the physical gearbox change instead of spending the useful phase while travelling the other way. Recovery throttle is clip(20*(4/40−abs(speedFwd)),0,.8), with brake C(14*(abs(speedFwd)−4/40)) above 4 m/s. At nominal turn radius 2.85/tan(.6)=4.17 m, this caps lateral acceleration near 3.84 m/s² before damage or slip.

These equations bound the useful reverse phase, no-motion dwell, clocks, and the age of a route-failing leg once route concern is present and no engaged improving turn exempts it. **They do not bound total physical recovery time or guarantee regained route.** Repeated blocked legs, a side-corner obstruction missed by the forward rays, or insufficient space can still cause a stalled KO. The final measurements include these failures. The turn latch is for reorientation only; it is not an attack lock or a request to approach a rival.

## Worked forward pass

[trace.json](../tools/nn/trace.json) contains complete Float32 observations, initial and next state, intermediate activations and actions for eleven reproducible frames. The passing example starts at 20 m/s, pace 28 m/s, zero slip, zero memory and all wall rays clear. A living parallel rival is 8 m ahead, 4 m/s slower; aggression=.8, nerve=.7, vengeance=.7. Racing-line look points have lateral coordinate .03, or 2.1 m. Half width is 9 m, and the line is centred in the road. Unspecified fields are zero.

Eligibility=1, nearest-slot WTA selects rival 0, the left-side tie wins, and passing=1. Aggression=.4 exceeds .35, giving width 3−.6*.4=2.76 m and requested offset −2.76 m. The governor is safe, so its clock starts at 4.5 and the pulse is on. The first aggressive offset is −2.76*(2/15)=−.368 m; the neutral offset is −3*(2/15)=−.4 m. Neither is road-clamped, so the effective narrowing is .032 m, above the .01 m hunt threshold. At 20 m/s the 28 m look point supplies x=.4; y=.03−.368/70≈.024742857. The square/reciprocal/atan circuit then calculates pursuit curvature and road-wheel angle. Desired speed is 28*.97=27.16 m/s, so error 7.16 m/s saturates demand; no slip/spin gate reduces it. Actual floating activations follow:

<!-- trace -->
| Neuron | ID | Value |
|---|---:|---:|
| grudge0 | 1057 | 0.000000000 |
| rage | 654 | 0.000000000 |
| displayRage | 1803 | 0.000000000 |
| shownRage | 1824 | 0.000000000 |
| leanSafe | 1870 | 1.000000000 |
| leanClock | 1891 | 4.500000000 |
| leaning | 1893 | 1.000000000 |
| neutralOffset | 1770 | -0.400000000 |
| boundedNeutral | 1785 | -0.400000000 |
| effectiveNarrowing | 1924 | 1.000000000 |
| routeDebt | 1750 | 0.000000000 |
| headingYawAgreement | 789 | 0.000000000 |
| turnImproving | 1113 | 0.000000000 |
| routeFailed | 1774 | 0.000000000 |
| legTime | 1833 | 0.000000000 |
| turnReconsider | 1739 | 0.000000000 |
| traffic0.valid | 959 | 1.000000000 |
| target0 | 1343 | 1.000000000 |
| trafficExists | 1410 | 1.000000000 |
| passDirection | 1558 | -1.000000000 |
| passing | 1733 | 1.000000000 |
| aggression | 1710 | 0.400000006 |
| activeLean | 1959 | 1.000000000 |
| passWidth | 1900 | 2.759999996 |
| requestedOffset | 1907 | -2.759999996 |
| passOffset | 1908 | -0.368000000 |
| passLower | 1030 | -7.399999762 |
| passUpper | 1031 | 7.399999762 |
| boundedOffset | 1915 | -0.368000000 |
| look.fwd.2 | 1703 | 0.400000006 |
| aimRight | 1916 | 0.024742856 |
| aimRadius2 | 1922 | 0.160612214 |
| pursuitCurvature | 1935 | 0.004401526 |
| pursuitWheel | 1936 | 0.012543690 |
| expectedYaw | 1939 | 0.029343503 |
| followingSteer | 1940 | 0.029653907 |
| wallReflex | 802 | 0.000000000 |
| jumpSteer | 1960 | 0.029653907 |
| ground | 284 | 1.000000000 |
| paceShare | 1132 | 0.970000000 |
| desiredSpeed | 1318 | 0.678999988 |
| speedError | 1361 | 0.178999988 |
| throttleDemand | 1572 | 1.000000000 |
| slipAuthority | 928 | 1.000000000 |
| fastSlipGrip | 1133 | 1.000000000 |
| slipGrip | 1402 | 1.000000000 |
| spinGrip | 929 | 1.000000000 |
| forwardBlocked | 1307 | 0.000000000 |
| rearBlocked | 1308 | 0.000000000 |
| releaseRoad | 1389 | 1.000000000 |
| forwardProgress | 778 | 0.000000000 |
| stuck | 1661 | 0.000000000 |
| escapeTrigger | 1700 | 0.000000000 |
| escapeActive | 1725 | 0.000000000 |
| turning | 1734 | 0.000000000 |
| escapeTimer | 1832 | 0.000000000 |
| phaseSlow | 1825 | 0.000000000 |
| phaseChange | 1794 | 0.000000000 |
| escapeTurn | 1841 | 0.000000000 |
| recoveryBrake | 1864 | 0.000000000 |
| reverse | 1845 | 0.000000000 |
| steer | 1971 | 0.029653907 |
| throttle | 1877 | 1.000000000 |
| brake | 1889 | 0.000000000 |

| Frame | Action steer / throttle / brake / handbrake / reverse |
|---|---|
| Passing a slower rival | 0.029654 / 1.000000 / 0.000000 / 0.000000 / 0.000000 |
| Airborne overspeed | 0.000000 / 0.000000 / 0.000000 / 0.000000 / 0.000000 |
| Clear road rejects stale stuck evidence | 0.079375 / 1.000000 / 0.000000 / 0.000000 / 0.000000 |
| Nose-wall recovery requests reverse | 1.000000 / 0.000000 / 0.700000 / 0.000000 / 1.000000 |
| Reverse gear uses the opposing lock | 1.000000 / 0.500000 / 0.000000 / 0.000000 / 1.000000 |
| Back-off complete: shift to forward | -1.000000 / 0.000000 / 0.700000 / 0.000000 / 0.000000 |
| Clearance releases recovery | -0.041585 / 1.000000 / 0.000000 / 0.000000 / 0.000000 |
| Kinematic low-speed slip keeps drive | 0.266130 / 1.000000 / 0.000000 / 0.000000 / 0.000000 |
| Stale turn and moving route debt replan | 1.000000 / 0.000000 / 0.700000 / 0.000000 / 1.000000 |
| Engaged improving turn suppresses route deadline | 1.000000 / 0.250000 / 0.000000 / 0.000000 / 0.000000 |
| Wrong engaged gear preserves failed-shift deadline | -1.000000 / 0.000000 / 0.700000 / 0.000000 / 1.000000 |
<!-- /trace -->

The airborne frame is overspeed but receives no brake. The clear-road frame starts with old stuck=.6 and stallTimer=.3 but rejects recovery. Setting ray0=2/45 creates actual obstruction: the next frame requests reverse and brake .7 until the gear changes. Later frames show opposing lock, the forward shift, release when clearance opens, and nonzero drive with kinematic low-speed slip. The ninth frame sets a stale +1 turn, −138° heading, 5.2 m/s forward motion, −4 m/s route progress, 3 m prior debt and 1.8 s leg age. Debt becomes 3.133333 m, routeFailed=1, the turn changes to −1, and reverse is requested with a shift brake. The tenth frame has +151.2° error, yawRate=.396/3, engaged drive, 3.5 m/s speed and negative route progress. The product is .063591485; turnImproving=1 and routeFailed=0 despite debt=3.102235784 m. Action is [1, .250000030, 0, 0, 0], preserving the turn. In the eleventh frame observed reverse disagrees with requested drive: turnImproving=0 and routeFailed=1, action [−1, 0, .7, 0, 1]. These are circuit traces, not claims that every jointly specified sensor snapshot was sampled from a physical race.

## Feedback-assisted edit log

The earlier four-finding review round began from weights SHA-256 06c8c6152fc7411eb268a368ac592a11858cd960a2bb3b1e12365ce4a9050fb1, saved in review-baseline.json. The preceding recovery round began at e92fd116ad5169581a19d7876f2ba60971b74809ce2e5f943bbcd9224d1f915a. Earlier rows retain the racer-construction history; the equations above describe the current program. Development measurements used fixed policies sequentially and were never a candidate-ranking loop.

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

### This review: feedback-assisted corrections

| Evidence | Reasoned equation change | Verification scope |
|---|---|---|
| Reviewer observed a stale +1 turn at −138° and a moving car losing route. | Choose signed heading when both side corridors clear; reconsider a disagreeing latch below 6 m/s. Add half-body route debt, six-second rule urgency and a 1.7 s wall-clock failed-leg deadline. | Mirrored frozen fixtures, including 5.2 m/s physical movement with negative route rate; deadline while gear never engages; controlled physical stale-latch spawn. |
| Construction audit showed the useful-motion minimum could still block a deadline during a failed shift. | Let routeFailed bypass that minimum; leg wall time advances independently of useful motion. This is an equation correction, not a candidate score choice. | Regression requires both routeFailed and phaseChange under a permanently mismatched gear. |
| Rear-quarter car at (−3.5,+3.5) m masks wreck at (12,0) m. | Move ahead, lateral and slower-or-wreck predicates before the WTA; retain rear-quarter occupancy in side scores. | Old checkpoint selects rear car/no pass; final selects wreck/−3 m pass, with rear lane occupied. |
| Ungoverned narrowing had large collision/recovery cost; airborne and clamped passes could report hunt. | Add posture/recovery/clearance gates and a .5 s pulse with ≥4 s rest. Compare the actual bounded aim with a parallel neutral aim. Use squared horizontal speed for drift. | Safety masks, pulse duration/cooldown, road-clamp and airborne fixtures, sideways drift, both ablation arms. |
| Algebraic audit: filtering only the narrowed request leaves a narrowing tail after safety fails. | Mux back to the neutral offset whenever lean is false, after both filters and before road clamping. No race scores selected this change. | Every cooldown decision has identical effective and neutral bounded offset. |
| Early rage display was weak, while changing control rage would alter driving. | Add display-only eight-second leak, +2.5×contact and +.2 per lost rank place; retain the six-second driving-rage equation. | Exact recurrence/half-life tests and dependency-graph exclusion from all action and driving-state outputs. |
| Parent reverted temporary raised floor, set ground friction=.3, changed descending-hit attribution to upper, running-only finish and rare grazing rays. | No neural retuning for these changes. Count event.upper≥0, including car ID 0; require a living winner with progress≥laps×track.length. Discard earlier final-number attempts and remeasure the frozen revision. | Hash manifests on race and ablation runs; results below. |

On the final Hump track, the older four-finding checkpoint (06c8…, not the immediate pre-deadline-fix checkpoint) loses car 8 in seed 4801 to destruction at 74.046 s. Switching only that car to the final network at 30 s leaves it alive at the finish; both seed 42 continuations from 107 s survive. These older-checkpoint continuations are traffic-dependent evidence spanning several repairs, not an isolated test of this last guard. review-before.jsonl and review-after.jsonl contain the refreshed observations. The explicit mirrored fixture isolates the deadline regression against the immediate pre-fix weights.

The preceding track-only remeasurement changed no controller equations: it raised Dropkick and Pancake to 18 m ramps, 11 m falls and 1.75 m heights, and capped Dropkick at 29 m/s. Its race numbers are superseded by the deadline-repair measurements below. Historical edit-log observations describe their original revisions and are not current-track results.

### Final deadline repair, with feedback

The immediate pre-fix checkpoint is 995a99fe632b396140e1a52b1f709d7750d7427ae136cad972be6258e6e4f9f1, retained in turn-deadline-baseline.json. The reviewer reported seed 42 car 5 reducing a +151.2° error at about .396 rad/s while routeFailed interrupted it, with the same mechanism in seed 4801 car 10. These are reports on the review revision, not claimed exact trajectories on the final Hump track.

The equivalent mirrored fixture failed on the pre-fix weights: routeFailed=1 despite an engaged correcting turn. The sole hand edit adds the gear-and-heading/yaw guard derived above. Forty combinations cover both gears, both heading signs, positive/negative/zero/tiny yaw and engaged/mismatched gear; a 90-tick rotating fixture verifies persistence without gear cycling and subsequent failed-shift release. Existing stale-turn and negative-route tests still pass when there is no improving yaw. The named-row audit in verification-final.json requires exactly seven added rows and only routeFailed modified. No other behaviour was retuned.

The parent then finalized Hump at ramp 18 m, fall 11 m, height 1.75 m, airLength 20 m and maxSpeed 22 m/s; finish fractions are compared only between running cars. All final results below use that simulator and this single circuit repair. Earlier edit-log observations remain historical evidence. The stronger kickers do not justify any extra controller change in this round.

Only deterministic construction edits were made. The preliminary filtered-offset evaluation was superseded by the logically required no-tail mux; no values were tried and ranked. Obsolete development result/trace files were removed after retaining their reasoning in this log. The old checkpoint in review-baseline.json is intentionally retained for before/after reproduction, not used in production. Restore it by writing its spec as the weights.js export if reproducing the original brain; rebuilding always restores the final construction.

## Verification and measurements

Regenerate with node tools/nn/build.mjs, node --test > tools/nn/test-final.txt, node tools/nn/inspect.mjs, node tools/nn/eval.mjs > tools/nn/results-final.jsonl, node tools/nn/eval.mjs --solo > tools/nn/solo-final.jsonl, node tools/nn/aggression.mjs > tools/nn/aggression-final.jsonl, node tools/nn/recovery-cases.mjs > tools/nn/recovery-final.jsonl, node tools/nn/verify.mjs, then node tools/nn/document.mjs.

89 tests pass, including 32 neural/evaluation tests. They cover arithmetic identities and boundaries, WTA ties, recurrent leaks, pursuit, zero slots, wreck headings, free-side passing, the 6.4 m funnel, offset decay, pre-WTA obstacle eligibility, bounded aggression pulses and cooldown, display-only rage graph isolation, airborne and road-clamped telemetry, horizontal drift, airborne braking, low-speed slip authority, blockage masks, clearance hysteresis, gear clocks and route-debt deadlines including failed shifts, stale steering latch correction, engaged-turn deadline inhibition with a preserved failed-shift timeout, steering signs, actual backward travel, no-motion transitions, alignment, ablation matching and output reuse. Closed-loop checks cover fixed physical recovery cases, solo three-lap completion and a full grid with credited damage. The acceptance floor remains separate from these regression tests.

Rebuild is byte-identical; 11 traces and 704 selected intermediate activations replay exactly; browser ESM bundle=94631 bytes. Solo network best lap=49.783 s versus reference=49.996 s; three-lap time=154.758 s versus 154.887 s. Solo moving slip=5.815%; collision-induced slides are included in the grid measurements.

### Speed and survival, every seed

Limits: three-lap finish; time≤165 s; leader best≤50 s; mean KO≤4, stalled≤.5, running≥7; weighted stuck≤3%, longest stop≤8 s. The earlier mean-turtled target of .5 per race is also shown for continuity.

| Seed / role | Finish | Race s | Leader best s | KO / stalled / turtled | Running | Stuck % | Longest s |
|---|---|---:|---:|---|---:|---:|---:|
| 1 development | 3 laps | 155.008 | 49.783 | 0 / 0 / 0 | 12 | 1.863 | 6.100 |
| 7 development | 3 laps | 159.062 | 51.629 | 5 / 2 / 2 | 7 | 3.825 | 7.867 |
| 42 development | 3 laps | 160.421 | 49.867 | 5 / 2 / 2 | 7 | 6.487 | 11.833 |
| 1201 development | 3 laps | 165.383 | 50.496 | 2 / 0 / 2 | 10 | 3.322 | 5.267 |
| 1709 development | 3 laps | 153.992 | 49.742 | 3 / 0 / 0 | 9 | 3.273 | 3.533 |
| 2309 development | 3 laps | 155.621 | 50.071 | 3 / 1 / 0 | 9 | 4.159 | 12.133 |
| 2903 development | 3 laps | 175.242 | 53.283 | 6 / 2 / 1 | 6 | 8.528 | 12.500 |
| 3613 held-out | 3 laps | 171.321 | 50.258 | 2 / 0 / 2 | 10 | 3.623 | 8.000 |
| 4801 held-out | 3 laps | 153.479 | 50.042 | 5 / 1 / 0 | 7 | 8.055 | 18.467 |

| Group | Mean KO | Mean stalled | Mean turtled | Mean running | Weighted stuck % | Max stop s | Mean descending hits |
|---|---:|---:|---:|---:|---:|---:|---:|
| development | 3.429 | 1.000 | 1.000 | 8.571 | 4.432 | 12.500 | 3.714 |
| held-out | 3.500 | 0.500 | 1.000 | 8.500 | 5.659 | 18.467 | 3.500 |

### Conflict and slides, every seed

Limits: hits/min≥10, hard/min≥1.5, crossroads share≥25%, mean lead changes≥2, moving slip>10° share≥8%, mean descending-car hits≥4.

| Seed | Hits/min | Hard/min | Crossroads hit % | Descending hits | Lead changes | Moving slip % | Winner |
|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 27.482 | 5.419 | 45.070 | 5 | 3 | 11.625 | MAD MUFFLER |
| 7 | 35.081 | 6.790 | 47.312 | 8 | 2 | 11.629 | GRUDGE JUDY |
| 42 | 33.287 | 5.984 | 50.562 | 6 | 3 | 10.216 | OL' SMOKEY |
| 1201 | 30.475 | 6.893 | 20.238 | 0 | 11 | 12.152 | MAD MUFFLER |
| 1709 | 38.574 | 7.793 | 55.556 | 1 | 2 | 10.459 | KEVIN |
| 2309 | 35.856 | 10.795 | 51.613 | 4 | 6 | 10.772 | OL' SMOKEY |
| 2903 | 28.760 | 10.272 | 38.095 | 2 | 3 | 13.366 | SCRAP DADDY |
| 3613 | 21.363 | 3.852 | 16.393 | 0 | 4 | 12.848 | SCRAP DADDY |
| 4801 | 47.303 | 10.946 | 54.545 | 7 | 2 | 12.810 | TETANUS |

Stuck samples use living cars with horizontal speed<3 m/s after the first 5 s, at 30 Hz. Longest stop uses the same definition and includes gear changes. Moving slip uses speed>6 m/s and |horizontal slip|>10°, with the heading normalized in the horizontal plane. Hard hits have event strength≥.35; all car-car hit events count, including solid wrecks. Crossroads hits are within 16 m of any track.crossings point. Descending-car hits count event.upper≥0, including car ID 0. The simulator now requires real downward closing speed; this is stricter than the former fromAbove flag. The aggregate JSON key fromAbove is retained for tooling compatibility but reads only upper. A three-lap finish requires the winner to be alive with progress≥world.laps×track.length, rather than relying on cached leader/car lap counts. Lead changes are leader identity changes after 5 s, retaining the incumbent at route ties; they include leader KOs. Leader best lap is the best completed lap by a car leading at that lap event. Lap 1 includes grid offset and launch. KO/survival averages are per race; stuck/slip use car-time denominators.

### Aggression budget: paired counterfactual measurement

[aggression.mjs](../tools/nn/aggression.mjs) runs the same frozen network and seeds with temperAggression=0, temperVengeance=0 and every hitMe=0 from the first decision. All initial grudges are zero, so they remain exactly zero. Rage and nerve remain unchanged. With grudge=0 and aggression temperament=0, the anger score is at most .2 from rage, below the .35 leaning threshold; the elbow circuit is therefore inactive. This harness clamp is not part of production act(). The comparison does not change weights or select a policy.

Match completed laps by car ID and lap number between the two runs. Positive cost means aggression-on was slower. Across 156 matched car-laps, mean cost is **0.417 s/lap**, maximum 58.029 s; 65 matched laps cost more than one second. 29 on-laps and 39 off-laps have no match and are excluded. **The universal one-second-per-lap budget is not established.** This includes collision, damage, traffic and recovery consequences, not only steering excursion time; the two fields diverge after contact. Conditioning on both laps being completed also creates survivorship bias. This is a reproducible counterfactual cost measurement, not an isolated causal attribution to a particular elbow.

| Seed | Matched laps | Mean on−off s/lap | Largest cost s | Laps costing >1 s | On race s | Off race s |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 20 | -0.694 | 11.804 | 11 | 155.008 | 157.521 |
| 7 | 17 | -3.316 | 7.067 | 8 | 159.062 | 159.758 |
| 42 | 15 | 2.491 | 18.692 | 6 | 160.421 | 153.225 |
| 1201 | 19 | -3.708 | 44.434 | 6 | 165.383 | 158.625 |
| 1709 | 19 | -2.213 | 19.434 | 6 | 153.992 | 152.579 |
| 2309 | 16 | -3.149 | 13.817 | 4 | 155.621 | 155.558 |
| 2903 | 15 | 8.349 | 58.029 | 8 | 175.242 | 154.187 |
| 3613 | 19 | -0.678 | 28.871 | 8 | 171.321 | 155.958 |
| 4801 | 16 | 9.284 | 47.629 | 8 | 153.479 | 153.354 |

The all-off experiment changes opponents too. A second experiment clamps only car 0, selected before measurement, while every opponent retains its production brain. Matching only that car's completed laps gives 13 pairs, mean cost **2.936 s/lap**, maximum 23.254 s; 8 exceed one second. This isolates the initial policy change to one driver, while retaining the resulting traffic feedback. Unmatched laps are still a limitation, not zero-cost observations.

| Seed | Car-0 matched laps | Mean on−off s/lap | Largest cost s | Laps costing >1 s |
|---:|---:|---:|---:|---:|
| 1 | 2 | 0.046 | 1.450 | 1 |
| 7 | 0 | — | — | 0 |
| 42 | 1 | 9.000 | 9.000 | 1 |
| 1201 | 1 | 1.412 | 1.412 | 1 |
| 1709 | 2 | -5.985 | -1.025 | 0 |
| 2309 | 2 | -3.065 | 1.041 | 1 |
| 2903 | 1 | 15.942 | 15.942 | 1 |
| 3613 | 2 | 1.077 | 3.325 | 1 |
| 4801 | 2 | 13.836 | 23.254 | 2 |

### Fixed physical recovery fixtures

These are controlled spawns reproducing the reported classes, not saved states of the user's exact cars. Case D also starts with the explicitly specified stale +1 turn and three metres of route debt, while facing −138°. First-forward means body-forward speed>3 m/s and heading within 30° of the route. Progress is net route gain after ten seconds.

| Case | First forward s | Route gain m | Reverse entries | Health |
|---|---:|---:|---:|---:|
| A: clear aligned launch | 0.604 | 182.239 | 0 | 1.000 |
| B: backward beside left wall | 3.404 | 123.042 | 0 | 1.000 |
| B: backward beside right wall | 5.538 | 46.043 | 0 | 1.000 |
| C: oblique clear launch | 0.904 | 159.332 | 0 | 1.000 |
| C: shallow clear launch | 0.637 | 178.888 | 0 | 1.000 |
| C: thirty degrees | 0.604 | 184.530 | 0 | 1.000 |
| D: stale post-collision turn with route debt | 4.371 | 93.571 | 1 | 1.000 |

Inference over 10,000 batches of twelve act() calls including telemetry: mean 0.129 ms, p95 0.135 ms, max 0.548 ms. No outliers discarded; this is measured cost, not a hard scheduling guarantee.

## Exactness, approximations and limitations

Exact in real arithmetic on the declared domains: affine transforms, abs/clips, square products, Boolean gates, WTA tie rule, finite clocks, leak recurrences and fixed-slot masks. Finite-precision tests cover boundaries and interiors; they are not an exhaustive floating-point proof. Runtime assumes valid finite simulator observations and physically consistent road-width/line-offset inputs.

Approximate: bicycle pursuit, nominal steering-lock compensation, rolling/drag feed-forward, sampled reverse control and the first-order lateral filter. Heuristic: preview thresholds, pace share, slip/yaw gains, traffic corridors, anger thresholds and recovery paths. Road-bounded aim is not a physical path-clearance proof. Three-point recovery may fail when the underbody or another car blocks motion; the car can remain slow across multiple cycles. Jump gates cannot prevent tumbling after another car hits it. Cross traffic is deliberately not solved. Natural slides are measured, but stylistic drift quality needs spectator review.

The final stalled-event diagnostics record KEVIN and BAD NEIGHBOUR in seed 7 and OIL BARON in seed 2309. The complete race measurements still include all damaged running cars and long slow intervals; the worst is 18.467 s in seed 4801. Preventing the deadline from interrupting a correcting turn does not guarantee that the car gains the four metres before the stall rule expires. A positive heading/yaw product can persist with very slow angular progress. The one-second aggression budget also remains a failed universal bound: long costs after divergent crashes do not by themselves demonstrate a stuck governor. No further behaviour was tuned.

The final status table is authoritative: unmet floors are retained as failures; there is no hidden relabeling of stalled KOs or exclusions of damaged running cars. The paired traffic experiment does not establish the universal one-second-per-lap aggression budget. No separate rear-blocking or deliberate PIT controller is present. No simulator retuning is recommended to disguise misses.

## Artifact identity

Simulator SHA-256: **08652b91cb4a60fd541ad6ae048eb3757730cee1c40a3dc02b74337e5b9085c1**. Weights SHA-256: **05f1327f7a280b27fe991fa7f4fef5998e4bc627b3c7ce672c5fd87f4b4633e8**. The sorted file hash/mtime manifest is in results-final.jsonl; evaluation rejects a simulator change during a run. This revision uses Dropkick and Pancake ramps of 18 m, falls of 11 m and heights of 1.75 m; their maximum speeds are 29 and 31 m/s respectively. Hump now also uses an 18 m ramp, 11 m fall and 1.75 m height, with airLength=20 m and maxSpeed=22 m/s. All three kickers are 1.75 m tall. It retains the Pancake funnel, low car-contact lever, groundFriction=.3, the original body floor, downward-closing upper attribution, running-only progress-based finish, finish-fraction comparisons only between running cars, and the final grazing-ray fix. All final figures were measured after the last simulator notice. The parent owns all simulator changes. This implementation changed nothing outside src/ai, tools/nn, test/nn.test.js and the two neural documentation files.

