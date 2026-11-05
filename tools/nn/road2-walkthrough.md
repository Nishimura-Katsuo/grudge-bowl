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
