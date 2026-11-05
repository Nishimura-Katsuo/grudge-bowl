// Current-run documentation only; no policy selection or parameter changes.
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import spec from '../../src/ai/weights.js';
import {ARSENAL,TRACK,SURFACE_PROPS,CONTACT} from '../../src/sim/config.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),jsonl=p=>read(p).trim().split(/\r?\n/).map(JSON.parse);
const records=jsonl('./results-final.jsonl'),races=records.filter(r=>r.seed!==undefined),timing=records.at(-1).benchmark;
const v=JSON.parse(read('./verification-final.json')),frames=JSON.parse(read('./trace.json')),soloRecords=jsonl('./solo-final.jsonl'),solo=soloRecords.at(-1);
const costRecords=jsonl('./hazard-cost-final.jsonl'),costs=costRecords.filter(r=>r.seed!==undefined),caseRecords=jsonl('./recovery-final.jsonl'),cases=caseRecords.filter(r=>r.name);
const grid=JSON.parse(read('./grid-final.jsonl')),hold=JSON.parse(read('./hold-final.json')),review=JSON.parse(read('./review-fixtures.json'));
const wallBefore=jsonl('./results-before-wall-lever.jsonl').filter(r=>r.seed!==undefined);
const beforeRecords=jsonl('./speed-before-final.jsonl'),before=beforeRecords.filter(r=>r.seed!==undefined),soloBefore=jsonl('./speed-before-solo-final.jsonl').at(-1).network;
const previousRecords=jsonl('./speed-before-final.jsonl'),previousRaces=previousRecords.filter(r=>r.seed!==undefined);
const crateReview=JSON.parse(read('./crate-review-final.json')),aggressionRecords=jsonl('./aggression-final.jsonl'),aggressionRuns=aggressionRecords.filter(r=>r.seed!==undefined);
assert.equal(previousRecords[0].simRevision.sha256,v.simSha256);assert.equal(crateReview.simRevision.sha256,v.simSha256);assert.equal(aggressionRecords[0].simRevision.sha256,v.simSha256);
const crateDriving=JSON.parse(read('./crate-driving-final.json')),crateCases=jsonl('./crate-cases-final.jsonl');
assert.equal(beforeRecords[0].simRevision.sha256,v.simSha256);assert.equal(crateDriving.simRevision.sha256,v.simSha256);
assert.equal(grid.simRevision.sha256,v.simSha256);assert.equal(hold.simRevision.sha256,v.simSha256);
const rageRecords=jsonl('./rage-final.jsonl'),rageCars=rageRecords.flatMap(r=>r.cars??[]),probes=JSON.parse(read('./weapon-probes.json'));
for(const rs of [records,soloRecords,costRecords,caseRecords,rageRecords])assert.equal(rs[0].simRevision.sha256,v.simSha256);
assert.equal(v.weightSha256,createHash('sha256').update(read('../../src/ai/weights.js')).digest('hex'));
const f=x=>x!==null&&Number.isFinite(x)?x.toFixed(3):'—',sum=(rs,k)=>rs.reduce((s,r)=>s+r[k],0),avg=(rs,k)=>sum(rs,k)/rs.length;
const pct=(a,b)=>b?100*a/b:null,median=xs=>{const x=xs.filter(Number.isFinite).sort((a,b)=>a-b);return x.length?x[Math.floor(x.length/2)]:null;};
const completion=r=>r.finishedByLaps?`${f(r.raceSeconds)} s to three laps`:`NO FINISH (${Object.entries(r.ko).map(([reason,n])=>n+' '+reason).join(', ')}; harness ends at ${f(r.raceSeconds)} s)`;
const stuck=rs=>100*sum(rs,'stuckCarSeconds')/sum(rs,'liveCarSeconds'),slides=rs=>100*sum(rs,'slidingSamples')/sum(rs,'movingSamples');
const status=b=>b?'Pass':'FAIL',groups=[['Development',races.filter(r=>r.role==='development')],['Reserved',races.filter(r=>r.role==='held-out')],['All nine',races]];
const shots=rs=>rs.flatMap(r=>r.weapons.shots),ws=(rs,k)=>rs.reduce((s,r)=>s+r.weapons[k],0);
const prior=rs=>before.filter(b=>rs.some(r=>r.seed===b.seed)),cs=(rs,k)=>rs.reduce((s,r)=>s+r.crates[k],0),collection=rs=>pct(cs(rs,'collected'),cs(rs,'empty')),missed=rs=>pct(cs(rs,'missedLive'),cs(rs,'empty'));
function metrics(rs){const ds=shots(rs).map(s=>s.dwell);return{raceMax:Math.max(...rs.map(r=>r.raceSeconds)),lapMax:Math.max(...rs.map(r=>r.leaderBestLap??Infinity)),fires:ws(rs,'fired')/rs.length,median:median(ds),heldMax:Math.max(...rs.map(r=>r.weapons.maxHeld)),nonRoofMax:Math.max(...rs.map(r=>r.weapons.maxHeldNonRoof)),rocket:pct(ws(rs,'rocketDamaging'),ws(rs,'rocketShots')),drop:pct(ws(rs,'droppedBehind'),ws(rs,'dropped')),running:avg(rs,'running'),stalled:avg(rs,'stalled'),turtled:avg(rs,'turtled'),stuck:stuck(rs),classes:new Set(shots(rs).map(s=>s.weapon)).size};}
let doc=read('../../docs/NEURAL_NETWORK.md').replace(/\r\n/g,'\n');
function section(start,end,body){const a=doc.indexOf(start),b=end?doc.indexOf(end,a+start.length):doc.length;assert.ok(a>=0&&b>a,start);doc=doc.slice(0,a)+start+'\n\n'+body.trim()+'\n\n'+doc.slice(b);}
function block(name,body){const start=`<!-- ${name} -->`,end=`<!-- /${name} -->`;const a=doc.indexOf(start),b=doc.indexOf(end,a);assert.ok(a>=0&&b>a,name);doc=doc.slice(0,a)+start+'\n'+body.trim()+'\n'+doc.slice(b);}
const requirements=[
 ['Three-lap finishes, every race',rs=>[`${rs.filter(r=>r.finishedByLaps).length}/${rs.length}`,rs.every(r=>r.finishedByLaps)]],
 ['Leader best lap ≤37 s, every race',rs=>[f(metrics(rs).lapMax)+' max',metrics(rs).lapMax<=37]],
 ['Winner ≤130 s, every race',rs=>[f(metrics(rs).raceMax)+' max',metrics(rs).raceMax<=130]],
 ['Mean turtled ≤3',rs=>[f(metrics(rs).turtled),metrics(rs).turtled<=3]],
 ['Mean stalled ≤1.5',rs=>[f(metrics(rs).stalled),metrics(rs).stalled<=1.5]],
 ['Stuck car-time ≤7%',rs=>[f(stuck(rs))+'%',stuck(rs)<=7]],
 ['At least 2 running in EVERY race',rs=>[Math.min(...rs.map(r=>r.running))+' min',rs.every(r=>r.running>=2)]],
 ['≥30 weapons, every race',rs=>[Math.min(...rs.map(r=>r.weapons.fired))+' min',rs.every(r=>r.weapons.fired>=30)]],
 ['All eleven types used',rs=>[metrics(rs).classes+'/11',metrics(rs).classes===11]],
 ['Barn Burner damaging shots ≥30%',rs=>[f(metrics(rs).rocket)+'%',metrics(rs).rocket>=30]],
 ['Drops with tail rival ≥60%',rs=>[f(metrics(rs).drop)+'%',metrics(rs).drop>=60]],
 ['No non-roof live hold >20 s',rs=>[f(metrics(rs).nonRoofMax)+' max',metrics(rs).nonRoofMax<=20]],
 ['Median pickup→fire ≤7 s',rs=>[f(metrics(rs).median),metrics(rs).median<=7]],
 ['Moving slip >10° for ≥8%',rs=>[f(slides(rs))+'%',slides(rs)>=8]],
 ['Twelve act() calls well under 2 ms',()=>[f(timing.p95Ms)+' p95 ms',timing.p95Ms<2]],
];
section('## Final acceptance status','## Runtime boundary',`
**The complete floor is ${requirements.every(([,fn])=>fn(races)[1])?'met':'not met'}.** These are the faster-car brief's floors: 37 s leader laps (34 s stretch), 130 s races, mean turtled≤3, mean stalled≤1.5, stuck≤7%, at least two running at every flag, and the weapon/slide limits below. The earlier 65% crate collection target is now a reported metric, not an acceptance item. Gravity and physics-step timing were never changed by this implementation.

With identical weights, the wall-lever simulator change gives mean race time ${f(avg(wallBefore,'raceSeconds'))} → ${f(avg(races,'raceSeconds'))} s, mean turtled ${f(metrics(wallBefore).turtled)} → ${f(metrics(races).turtled)}, mean stalled ${f(metrics(wallBefore).stalled)} → ${f(metrics(races).stalled)}, and pooled stuck ${f(stuck(wallBefore))} → ${f(stuck(races))}%. Only measurement/report artifacts and exact baseline test expectations changed in this refresh.

On this same final simulator, the saved pre-speed network versus the final network has mean race time ${f(avg(before,'raceSeconds'))} → ${f(avg(races,'raceSeconds'))} s, pooled stuck ${f(stuck(before))} → ${f(stuck(races))}%, mean turtled ${f(metrics(before).turtled)} → ${f(metrics(races).turtled)}, and mean fired ${f(metrics(before).fires)} → ${f(metrics(races).fires)}. These full-grid comparisons include chaotic contact/weapon divergence; they are not isolated causal estimates of one coefficient.

Development seeds: 1, 7, 42, 1201, 1709, 2309, 2903. The requested reserved seeds 3613 and 4801 are reported separately. They were used in earlier reviews and repeatedly measured here, so “held-out” in the JSON is a role label, not a claim of pristine one-shot validation. The weapons edits used mechanical evidence and the stated development examples; no policy candidates were ranked by seed score.

| Requirement | Development | Reserved | All nine |
|---|---|---|---|
${requirements.map(([name,fn])=>`| ${name} | ${groups.map(([,rs])=>{const [value,ok]=fn(rs);return `${value} · ${status(ok)}`;}).join(' | ')} |`).join('\n')}

Dwell median is pooled over fired items; the per-seed medians below also expose individual misses. Rocket/drop percentages pool shot counts, not seed percentages. Stuck pools living car-seconds. The slide floor uses moving horizontal speed>6 m/s and slip>10°. Upper-hit and general-contact rates remain reported without new floors. Maximum hold includes unfinished live holds; KO and race finish end observation, not an invented successful firing. The roof exception is measured at each sample: only body-up dot world-up≤0 is exempt; an airborne upright car is not exempt, and a later upright sample after 20 s fails. All-hold maxima are still shown.
`);
block('architecture',`| Quantity | Value |
|---|---:|
| Observations / actions | ${spec.observationCount} / ${spec.actions.length} |
| Computed neurons | ${spec.biases.length} |
| Layers with earlier-layer skip connections | ${spec.layers.length-1} |
| Nonzero edges | ${spec.weights.length} |
| Stored parameters, edges plus biases | ${spec.weights.length+spec.biases.length} |
| Recurrent state values | ${spec.stateOutputs.length} |
| Generated weights bytes | ${statSync(new URL('../../src/ai/weights.js',import.meta.url)).size} |`);
const interfaces=[['grudge0','[0,1]','Anger, reservation, memory'],['rage','[0,1]','Driving and weapons'],['shownRage','[0,1]','Display only'],['weaponAge','[0,20] s','Trigger comparisons'],['triggerDelay','[.45,1.5] s','Pickup patience'],['reserveForGrudge','bit','Tactical restraint'],['rocketOpportunity','bit','Barn Burner'],['rearOpportunity','bit','Four dropped classes'],['hornDefence','bit','Immediate defence'],['fire','bit','Action 5 and HUD'],['settleClock','[0,1.8] s','Recovery grace'],['recoveryAllowed','bit','Recovery entry and latch'],['settleEscape','bit','Urgent obstruction exception'],['rocketIntercept','normalized lateral metres','Projectile corridor'],['hardExpiry','bit','Grounded fallback'],['hazardAvoid','bit','Detour mux'],['hazardOffset','[-92.7,92.7] m','Filtered waypoint'],['hazardAimFloor','[4/70,63.55/70]','Detour preview'],['oilSteer','[-.25,.25]','Oil steering'],['oilThrottle','[0,.35]','Oil propulsion'],['displayTarget0','bit','Display identity memory'],['leanClock','[0,4.5] s','Elbow pulse/cooldown'],['traffic0.valid','bit','Passing WTA'],['target0','bit','Current visible target'],['boundedOffset','road interval','Pursuit'],['pursuitCurvature','[-1.3829,1.3829] 1/m','Steer/yaw'],['desiredSpeed','[0,1.35]','Pace control'],['slipAuthority','[0,1]','Traction envelope'],['stuck','[0,.6] s','Obstructed entry'],['routeDebt','[0,8] m','Recovery progress'],['turnImproving','bit','Deadline exemption'],['escapeActive','bit','Recovery control'],['crateFiltered','[-26.5,26.5] m','Actual-side clearance'],['crateToRight','bit','Side ray and occupancy'],['crateReachError','metres','Reach comparison'],['crateReachAllowance','[0,24] m','Reach comparison'],['crateReachable','bit','Crate eligibility'],['horizontalSpeed','[0,sqrt(4.5)]','Preview, pace, steering'],['previewMetres','[16,65] m','Line interpolation'],['frontAxleYawTime','[.085,1.209]','Yaw feedback'],['physicalGrip','[.2,3]','Braking'],['brakingFeedforward','[0,1]','Race brake demand'],['crateTimeRoom','bit','Optional pickup veto'],['steer','[-1,1]','Action 0'],['throttle','[0,1]','Action 1'],['brake','[0,1]','Action 2']];
block('interfaces',`| Block output | ID | Layer | Domain | Consumer |
|---|---:|---:|---|---|
${interfaces.map(([name,domain,consumer])=>{const id=spec.names.indexOf(name);assert.ok(id>=0,name);const layer=spec.layers.findIndex((s,k)=>id>=s&&id<spec.layers[k+1])+1;return `| ${name} | ${id} | ${layer} | ${domain} | ${consumer} |`;}).join('\n')}`);
const weaponFrame=frames.find(f=>f.label.startsWith('Barn Burner'));
const crateFrame=frames.find(f=>f.label.startsWith('Empty car approaches'));
const fastFrame=frames.find(f=>f.label.startsWith('Fast car anticipates'));
block('trace',`| Neuron, passing frame | ID | Value |
|---|---:|---:|
${frames[0].activations.map(a=>`| ${a.name} | ${a.id} | ${a.value.toFixed(9)} |`).join('\n')}

The Barn Burner frame has A=.8, r=${f(weaponFrame.activations.find(a=>a.name==='rage').value)}, age input=2 s, ready=1, rival range=.2 (20 m), bearing=.05, grounded with zero slip. Age advances to 2.033333333; delay is .9 s; range limit is 40 m and bearing limit .112 rad. The matched visible slot is about 19.975 m forward and .9996 m right with zero relative velocity. Flight time=(19.975−3.4)/92≈.18016 s; predicted lateral miss≈.9996 m, within the 2 m corridor. All opportunity bits are true, reservation is false, so fire=1 and next weapon age=0. This does not steer toward the firing target. Exact selected activations:

| Weapon neuron | ID | Value |
|---|---:|---:|
${weaponFrame.activations.filter(a=>['weaponAge','triggerDelay','rocketOpportunity','rocketCorridor','rocketIntercept','rocketFlightTime','reserveForGrudge','fire','steer','throttle','brake','settleClock'].includes(a.name)).map(a=>`| ${a.name} | ${a.id} | ${a.value.toFixed(9)} |`).join('\n')}

| Frame | Action steer / throttle / brake / handbrake / reverse / fire |
|---|---|
${frames.map(r=>`| ${r.label} | ${r.action.map(x=>x.toFixed(6)).join(' / ')} |`).join('\n')}

### Faster-car forward pass

A straight grounded clay approach is travelling at 32.4 m/s. Current pace is 36 m/s, the eight-metre pace note is 34 m/s, encoded grip is 1.1, and the jump is 20 m away. The graph computes horizontal speed .81, chooses a 32.4 m preview, decodes grip 2.2, and requests .9×36=32.4 m/s. The next desired speed is .9×34=30.6 m/s. Thus paceDeceleration=100×(.81²−.765²)=7.0875 m/s² and brakingFeedforward=7.0875/(2.2×9.81)≈.328399. Despite essentially zero current speed error, the car brakes before exceeding the falling note. The noRaceBrake gate removes throttle. Jump distance 20 m is inside the one-second 32.4 m alignment window, so lateral detours are off. Straight geometry produces zero steering and no weapon is held. Selected actual activations, including Float32 input rounding:

| Fast-frame neuron | ID | Value |
|---|---:|---:|
${fastFrame.activations.filter(a=>['horizontalSpeed','previewMetres','frontAxleYawTime','physicalGrip','paceShare','desiredSpeed','previewPace','paceDeceleration','brakingFeedforward','speedError','jumpSettleDistance','awayFromJump','steer','throttle','brake'].includes(a.name)).map(a=>`| ${a.name} | ${a.id} | ${a.value.toFixed(9)} |`).join('\n')}

Action is ${fastFrame.action.map(x=>x.toFixed(9)).join(' / ')} in steer/throttle/brake/handbrake/reverse/fire order.`);
const crateTrace=`
### Crate trace: the same final weights

A grounded car travels at 25 m/s on a straight, 9 m half-width road, with pace 36 m/s and aggression .8. It holds nothing. A live crate is 40 m ahead and 4.5 m right. Every ray is clear, and there is no traffic, hazard or nearby jump. Previous state is zero. The interpolated line is centred, so the lateral error is 4.5 m. The search range is 45+15×.8=57 m, the ramp is (57−40)/20=.85, and the requested offset is .85×min(4,4.5)=3.4 m. The first filtered offset is (2/15)×3.4=.453333 m, so clearance tests the right lane. Reach allowance is .2×40=8 m at this speed; the full 4.5 m required change is reachable. Float32 observation rounding accounts for the final digits below.

The ordinary one-second preview is 25 m in this frame. The short lateral component is 2×.453333/(40²+.453333²)≈.00056659 m⁻¹. Straight-road return cancellation is zero. The synthetic encoded surfaceGrip=1 means physical grip=2, so spare-grip curvature is .75×9.81×2/25²=.023544 m⁻¹, so this first command is not capped. The pursuit wheel is atan(2.85×curvature); the existing slip/yaw controller produces the six actions below. On the next frame a held Barn Burner makes crateSeeking=0 and clears the offset, without changing weapon-trigger rules.

| Crate neuron | ID | Activation |
|---|---:|---:|
${crateFrame.activations.filter(a=>a.name.startsWith('crate')||['pursuitCurvature','steer','throttle','brake','fire'].includes(a.name)).map(a=>`| ${a.name} | ${a.id} | ${a.value.toFixed(9)} |`).join('\n')}
`;
const oldCrateTrace=doc.indexOf('### Crate trace: the same final weights');
if(oldCrateTrace>=0)doc=doc.slice(0,oldCrateTrace)+doc.slice(doc.indexOf('## Feedback-assisted edit log',oldCrateTrace));
doc=doc.replace('## Feedback-assisted edit log',crateTrace+'\n## Feedback-assisted edit log');
const pairs=costs.flatMap(r=>r.matched),allShots=shots(races),names=[...new Set(allShots.map(s=>s.name))];
const hazardRows=['mine','oil'].map(kind=>{const hs=races.map(r=>r.weapons.hazards.byKind[kind]);return{kind,encounters:sum(hs,'encounters'),clear:sum(hs,'clear'),steeredClear:sum(hs,'steeredClear'),speedLoss:hs.reduce((s,h)=>s+(h.meanSpeedLoss??0)*h.encounters,0)/sum(hs,'encounters')};});
section('## Verification and measurements','## Exactness',`
Regenerate in order:

\`\`\`text
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
\`\`\`

${v.testsPassed} tests pass, including ${v.neuralTests} neural/evaluation tests. Arithmetic is compared with independent expressions at domain bounds and random interiors; WTA includes ties. Existing passing, recovery, engaged-turn, gear, telemetry, alignment, horizontal-speed and output-reuse regressions remain. The faster-car tests independently check continuous preview interpolation, horizontal speed, front-axle feedback, pace-gradient braking with the grip/2 encoding, acquisition/alignment time gates and the enlarged steering mux bound. The unarmed solo test now requires a lap ≤37 s, zero stuck time and zero KOs. Weapon tests cover all eleven weapon opportunities and ready/deadline gates, age reset, temperament, the tail absence sentinel, hidden-slot memory, oil inputs, forced-motion suppression with a strict urgent-obstruction exception, and actual mine/oil detours. A graph check proves rocket interception cannot alter driving actions. Review regressions also cover round-trip coordinate transforms, rocket corridor/intercept rejection, soft versus hard expiry including airborne retention, a real blast containing wheelOff, and the three-revision no-crates grid. Crate tests cover opposite-sign raw/filtered transients in both directions, opposite-side traffic permission, reach-cone boundaries and deterministic random interiors, late retarget cancellation, and a physical pickup versus held/blind controls. A test suite passing is not a claim that the separate acceptance floor passes.

The rebuild is byte-identical. ${v.traceFrames} complete traces replay exactly, including ${v.traceActivations} selected intermediate activations, next state and six actions. Browser ESM bundle: ${v.browserBundleBytes} bytes. No policy code from test/helpers/gunner.js ships.

### Faster-car adaptation: pickup and driving comparisons

An alive car enters a spot's observation window at route distance below 30 m. When route distance wraps above 500 m, record whether it was empty on entry and whether it now holds an item. If still empty, distinguish a live crate remaining from no crate remaining. Sample at 30 Hz after race second 3. This deliberately reproduces the supplied classifier: it can count a fast pickup-and-fire as a miss and does not count an approach censored by KO/finish. It does not reclassify unsafe or obstructed opportunities out of the denominator. The baseline is pre-speed.json, the preceding complete crate/weapons network, rerun on the current simulator in speed-before-final.jsonl. It records ${cs(before.filter(r=>r.role==='development'),'empty')} development empty passes. The original pre-crate 886-pass result is historical and is not used as this adaptation baseline.

| Seed | Empty passes | Collected / empty | Collected % before → after | Live miss % before → after | Fired before → after | Wall hits before → after | Stuck % before → after |
|---:|---:|---|---|---|---|---|---|
${races.map(r=>{const b=before.find(b=>b.seed===r.seed);return `| ${r.seed}${r.role==='held-out'?' reserved':''} | ${r.crates.empty} | ${r.crates.collected} / ${r.crates.empty} | ${f(b.crates.collectionPercent)} → ${f(r.crates.collectionPercent)} | ${f(b.crates.missedLivePercent)} → ${f(r.crates.missedLivePercent)} | ${b.weapons.fired} → ${r.weapons.fired} | ${b.wallHits} → ${r.wallHits} | ${f(b.stuckPercent)} → ${f(r.stuckPercent)} |`;}).join('\n')}

| Group | Pickup % before → after | Live miss % before → after | Mean fired before → after | Wall events before → after | Pooled stuck % before → after |
|---|---|---|---|---|---|
${groups.map(([name,rs])=>{const bs=prior(rs);return `| ${name} | ${f(collection(bs))} → ${f(collection(rs))} | ${f(missed(bs))} → ${f(missed(rs))} | ${f(metrics(bs).fires)} → ${f(metrics(rs).fires)} | ${sum(bs,'wallHits')} → ${sum(rs,'wallHits')} | ${f(stuck(bs))} → ${f(stuck(rs))} |`;}).join('\n')}

Armed solo, crates enabled, pre-speed → current policy on this simulator: best completed winner lap **${f(soloBefore.winnerBestLap)} → ${f(solo.network.winnerBestLap)} s**; **${completion(soloBefore)} → ${completion(solo.network)}**. Wall events ${soloBefore.wallHits} → ${solo.network.wallHits}; stuck ${f(soloBefore.stuckPercent)} → ${f(solo.network.stuckPercent)}%. A dash means no completed lap, not a zero or excluded result. This is the requested real weapon-enabled comparison.

The older pre-crate checkpoint is used only for a separate steering isolation, which discards each pickup before firing so weapon feedback cannot cause later divergence: three laps ${f(crateDriving.before.race)} → ${f(crateDriving.after.race)} s, wall events ${crateDriving.before.events.filter(e=>e.type==='wall').length} → ${crateDriving.after.events.filter(e=>e.type==='wall').length}, stuck ${f(crateDriving.before.stuck)} → ${f(crateDriving.after.stuck)} car-seconds. This isolated comparison does **not** establish a no-harm result in the full grid. Extra weapons, traffic interactions and different crashes are not separated by the race comparison.

The physical 4.5 m off-line fixture collects with minimum crate distance ${f(crateCases[0].minDistance)} m, road clearance ${f(crateCases[0].minRoad)} m, full health and ${crateCases[0].wallHits} wall events. Its crate-blind control misses at ${f(crateCases[1].minDistance)} m. Holding a weapon produces the same physical trajectory as the blind control. Tests also exercise priority gates, turning road geometry, lane occupancy, arithmetic boundaries and the spare-grip bound. Safety gates intentionally leave unsafe opportunities uncollected. The new acquisition-time veto makes optional detours weaker above 30–40 m/s, depending on temperament; collection is reported without a target in the latest brief.

### Retained crate-review regressions

The side-clearance and late-retarget fixes remain active. The same original synthetic fixtures still exercise them after the high-speed changes:

| Review fixture | Before crate review | Current |
|---|---|---|
${crateReview.cases.map(r=>{const keys=r.name.startsWith('Filtered')?['crateToRight','crateTrafficClear','crateSeeking']:['crateReachAllowance','crateReachError','crateReachable','crateSeeking'];return `| ${r.name} | ${keys.map(k=>k+'='+f(r.before[k])).join(', ')} | ${keys.map(k=>k+'='+f(r.after[k])).join(', ')} |`;}).join('\n')}

### Every race: speed, survival and weapons

| Seed / role | Finish | Race s | Leader lap s | Running | KO / stalled / turtled | Stuck % | Longest stop s | Fired | Margin m | Lead changes |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
${races.map(r=>`| ${r.seed} ${r.role==='held-out'?'reserved':'dev'} | ${r.finishedByLaps?'3 laps':'FAIL'} | ${f(r.raceSeconds)} | ${f(r.leaderBestLap)} | ${r.running} | ${r.koTotal} / ${r.stalled} / ${r.turtled} | ${f(r.stuckPercent)} | ${f(r.longestStop)} | ${r.weapons.fired} | ${f(r.finishMargin)} | ${r.leadChanges} |`).join('\n')}

Margin is the credited progress of the first running finisher minus the second running car at the final physics step, in metres. Lead changes use progress leadership after five seconds with incumbent ties retained.

| Seed | Pickup→fire median s | Longest / non-roof hold s | Rocket damaging / fired | Rocket % | Drops with tail / total | Tail % | Foghorn swats |
|---:|---:|---:|---|---:|---|---:|---:|
${races.map(({seed,weapons:w})=>`| ${seed} | ${f(w.medianDwell)} | ${f(w.maxHeld)} / ${f(w.maxHeldNonRoof)} | ${w.rocketDamaging} / ${w.rocketShots} | ${f(w.rocketHitPercent)} | ${w.droppedBehind} / ${w.dropped} | ${f(w.dropBehindPercent)} | ${w.hornSwats} |`).join('\n')}

| Group | Mean fired | Mean running | Mean stalled | Mean turtled | Stuck % | Pooled dwell s | Rocket % | Tail-drop % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${groups.map(([name,rs])=>{const m=metrics(rs);return `| ${name} | ${f(m.fires)} | ${f(m.running)} | ${f(m.stalled)} | ${f(m.turtled)} | ${f(m.stuck)} | ${f(m.median)} | ${f(m.rocket)} | ${f(m.drop)} |`;}).join('\n')}

Weapon totals, in contract order (Barn Burner, Grudge Seeker, Welcome Mat, Oil Slick, Smoke Bomb, Threshing Whirl, Repo Hook, Bedspring, Prize Bull, Grand Piano, Foghorn): **${Array.from({length:11},(_,k)=>races.reduce((s,r)=>s+r.weapons.weaponCounts[k],0)).join(', ')}**.

The observer records pickup/fired events and watches immediate health changes when a Barn Burner blast event is emitted, before that step's later car collisions. Nested wheelOff and ko events do not refresh the pre-operation snapshot; the enclosing blast does. Other completed operation events refresh it normally. It requires another car inside the 3D blast radius with reduced health. This measures at least one damaged rival per shot, not the number of victims; shots still flying at the flag remain in the denominator. This matches the current simulator's synchronous operation/event order. It remains an event/health observer rather than an explicit simulator damage tag, so future changes to nested events must preserve that boundary. The real stationary-target fixture emits wheelOff inside the damaging blast operation; the corrected observer reports one damaging shot. Its current damage is recorded in rocket-final.jsonl. A forced three-metre fly-by reports zero. Tail presence uses physical living rivals within 40 m and the sensor's .6 rad tail cone, including smoke-hidden rivals. Foghorn swats count nearby non-owned, non-bull projectiles removed at that firing event; the data show ${ws(races,'hornSwats')} such saves.

### Hazard encounters and cost

| Kind | Completed encounters with local room | Body-clear passes | Steered and body-clear | Share steered clear | Mean speed loss m/s |
|---|---:|---:|---:|---:|---:|
${hazardRows.map(h=>`| ${h.kind} | ${h.encounters} | ${h.clear} | ${h.steeredClear} | ${f(pct(h.steeredClear,h.encounters))}% | ${f(h.speedLoss)} |`).join('\n')}

Each car/hazard pair is counted once, sampled at 30 Hz. Entry requires an armed mine/oil 10–55 m along the local road tangent, within radius+1 m laterally in that road frame, and a side destination at radius+1.2 m fitting current half width minus 1.6 m. The observer rotates nose-frame distances into the road frame before combining them with trackOffset; it uses the actual hazard radius; it does not assert a clear future road, available tyre grip or jump eligibility. A successful clear keeps centre separation>radius+1 m, and “steered” additionally observes input.steer pointing away at some sample. It does not prove that the circuit caused the clear. Removed nearby mines count as failed encounters; externally removed distant hazards are discarded. There are ${races.reduce((s,r)=>s+r.weapons.hazards.censored,0)} unfinished encounters at flags. Mean speed loss is entry speed minus the minimum during the encounter (floored at zero); braking for the road and collisions can contribute.

The controlled physical fixture uses a 25 m/s spawn and hazard 55 m ahead. Correct frame rotation alone still clipped oil at 4.74 m; placing the waypoint before the near edge clears its full seven-metre body corridor. Final on/off results on the same frozen simulator:

| Hazard / avoidance | Centre clearance m | Minimum road clearance m | Time to 70 m route s | Body-clear |
|---|---:|---:|---:|---|
${jsonl('./hazard-after.jsonl').map(r=>`| ${r.kind} ${r.avoid?'on':'off'} | ${f(r.minDistance)} | ${f(r.minRoad)} | ${f(r.seconds)} | ${status(r.clear)} |`).join('\n')}

[hazard-cost.mjs](../tools/nn/hazard-cost.mjs) repeats the fixed seeds with only toHazard=1 and hazardRight=0 in a harness copy of the observations; production has no such mask. Match laps by car ID and lap number. Across ${pairs.length} pairs, mean on−off cost is **${f(avg(pairs,'cost'))} s/lap**, range ${f(Math.min(...pairs.map(p=>p.cost)))} to ${f(Math.max(...pairs.map(p=>p.cost)))} s. ${sum(costs,'unmatchedOn')} on-laps and ${sum(costs,'unmatchedOff')} off-laps have no match. Contact, pickups and weapon outcomes diverge, and matching survivors adds survivorship bias. This is the observed traffic-level counterfactual cost, not an isolated path-length penalty or a fitted coefficient.

| Seed | Matched laps | Mean avoidance on−off s/lap | Largest cost s |
|---:|---:|---:|---:|
${costs.map(r=>`| ${r.seed} | ${r.pairs} | ${f(r.meanCost)} | ${f(r.maxCost)} |`).join('\n')}

### Temperament: controlled contrasts and actual drivers

All controlled contrasts use identical weights and fixed observations, changing only the stated input/state. The N=1 Foghorn case deliberately holds incoming=.75: it tolerates that threat until the 19 s hard expiry. A closer incoming shot would cross its defensive threshold immediately.

| Fixed situation | First fire s |
|---|---:|
${probes.map(r=>`| ${r.label} | ${f(r.seconds)} |`).join('\n')}

| Driver | A / N / V | Fired across nine races | Median dwell s | Mean rocket firing range m |
|---|---|---:|---:|---:|
${names.map(name=>{const ss=allShots.filter(s=>s.name===name),t=ss[0].temper,rr=ss.filter(s=>s.weapon===1);return `| ${name} | ${f(t.aggression)} / ${f(t.nerve)} / ${f(t.vengeance)} | ${ss.length} | ${f(median(ss.map(s=>s.dwell)))} | ${f(rr.length?avg(rr,'aheadRange'):null)} |`;}).join('\n')}

Actual driver counts are not controlled causal comparisons: rank, item mix, damage, pickup opportunity and survival differ. Rocket range=100 m means no visible ahead target, so forced shots raise the range mean. The fixed contrasts establish the temperament effect without using those confounders to fit weights.

### Racing, slides and recovery retained

| Seed | Hits/min | Hard/min | Crossroads % | Upper hits | Lead changes | Moving slip % | Winner |
|---:|---:|---:|---:|---:|---:|---:|---|
${races.map(r=>`| ${r.seed} | ${f(r.hitsPerMinute)} | ${f(r.hardPerMinute)} | ${f(r.crossingHitPercent)} | ${r.fromAbove} | ${r.leadChanges} | ${f(r.movingSlipPercent)} | ${r.winner} |`).join('\n')}

Stuck means a running car below 3 m/s horizontal speed after the first 5 s. Longest stop uses the same samples and includes gear shifts, oil and weapon effects. Moving slip requires horizontal speed>6 m/s and abs(slip)>10°, with the horizontal heading normalized. Hard contact strength≥.35; crossroad contacts lie within 16 m. Upper hits read event.upper≥0 (the legacy JSON aggregate name fromAbove remains). A lap finish requires a living winner's credited progress≥laps×track.length. Lead changes begin after 5 s and retain the incumbent at route ties. Leader best lap is a completed lap by a car leading at its lap event; lap one includes launch/grid offset.

Armed solo: ${completion(solo.network)}; ${solo.network.lapTimes.length} completed laps, best ${f(solo.network.leaderBestLap)} s. No-crates driving isolation: best ${f(solo.unarmed.winnerBestLap)} s, three laps ${f(solo.unarmed.raceSeconds)} s, moving slip ${f(solo.unarmed.movingSlipPercent)}%. The same no-crates reference driver at paceShare=.8: best ${f(solo.reference.winnerBestLap)} s, three laps ${f(solo.reference.raceSeconds)} s. Weapon effects and expiry shots remain enabled in armed solo and grid results. Pooled grid moving slip is ${f(slides(races))}% and includes externally forced spins.

| Fixed recovery case | First forward s | Route gain after 10 s | Reverse entries |
|---|---:|---:|---:|
${cases.map(r=>`| ${r.name} | ${f(r.firstForward)} | ${f(r.progress)} | ${r.reversals} |`).join('\n')}

### Aggression ablation on the current simulator

This harness clamps aggression, vengeance and hitMe inputs to zero from decision zero. In the current armed network this changes firing patience and crate range as well as the lean policy. It is an end-to-end temperament counterfactual, **not** an isolated narrowing or path-length cost. Rage and nerve remain active. Traffic, weapon outcomes and surviving matched laps diverge; the largest lap differences do not prove a stuck governor. No one-second bound is claimed.

| Seed | Matched laps | Mean on−off s/lap | Largest cost s | Fixed car 0 mean cost s |
|---:|---:|---:|---:|---:|
${aggressionRuns.map(r=>`| ${r.seed} | ${r.pairs} | ${f(r.meanCost)} | ${f(r.maxCost)} | ${f(r.focal.meanCost)} |`).join('\n')}

### Review reproductions and remaining hold/recovery limits

The same synthetic inputs through the saved pre-review checkpoint and the final network give:

| Review fixture | Before | After |
|---|---|---|
${review.map(r=>{let keys=r.name.startsWith('Urgent')?['recoveryAllowed','escapeActive']:r.name.startsWith('Centred')?['hazardLinePosition','hazardAvoid']:['rocketOpportunity','fire'];return `| ${r.name} | ${keys.map(k=>k+'='+f(r.before[k])).join(', ')} | ${keys.map(k=>k+'='+f(r.after[k])).join(', ')} |`;}).join('\n')}

| Seed 1, no crates | KOs | Stalled | Stuck % | Race s |
|---|---:|---:|---:|---:|
${[['Pre-weapons racer',grid.preWeapons],['Before this review',grid.beforeReview],['Final',grid.current]].map(([name,r])=>`| ${name} | ${r.koTotal} | ${r.stalled} | ${f(r.stuckPercent)} | ${f(r.raceSeconds)} |`).join('\n')}

The urgent exception is verified at the neuron/action boundary, including retention of active recovery under repeated hit pulses. On the current faster-car simulator, the no-crates exact checkpoints have ${grid.preWeapons.koTotal} and ${grid.beforeReview.koTotal} KOs, respectively, and the final network has ${grid.current.koTotal}. The regression pins those freshly measured baseline counts and still requires the final network to finish with no greater KO/stalled counts than the weapons checkpoint. The final network has fewer KOs than both saved checkpoints in this measured case; this does not prove recovery on every track state or seed.

The current maximum observed live hold is ${f(metrics(races).heldMax)} s. The earlier pre-crate seed-7 run had a real 21.4375 s hold by an upside-down HEAD GASKET; this is historical evidence, not a claim about the current run. The grounded-only fire gate is unchanged. Hard expiry bounds patience, **not time until physical contact is available**. A universal 20 s bound and unconditional no-airborne-fire cannot both be guaranteed for arbitrary no-wheel-contact inputs. The refreshed seed-7 diagnostic is hold-final.json.

At 30 race seconds the ${rageCars.length} still-running sampled cars average ${f(avg(rageCars,'display'))} shown rage versus ${f(avg(rageCars,'driving'))} driving rage. Display-only state has no graph path to control. Inference over 10,000 batches of twelve act() calls, including telemetry, measured alone after validation jobs completed: mean ${f(timing.meanMs)} ms, p95 ${f(timing.p95Ms)} ms, maximum ${f(timing.maxMs)} ms. No outliers discarded. The earlier concurrently loaded-host benchmark is preserved separately in results-final.jsonl; this is not a hard scheduling guarantee.
`);
section('## Exactness, approximations and limitations','## Artifact identity',`
Exact in real arithmetic on the declared domains: affine transforms, abs/clips, square products, Boolean gates, WTA tie rule, finite clocks, half-life recurrences and fixed-slot masks. Finite-precision tests cover boundaries/interiors, not every possible float. Runtime assumes finite valid observations and physically consistent geometry.

Approximate: bicycle/front-axle steering, nominal bent-steering cancellation, friction-limited braking feed-forward, drag bias, sampled recovery, lateral filtering, the short hazard waypoint and the crate reach cone. The cone is a conservative desired approach slope, not a proof that available lateral acceleration can complete a manoeuvre. Heuristic: pace share, slip/yaw gains, traffic corridors, weapon ranges/delays/reservation, effect detection and detour room. No threshold is a learned estimate of hit probability. The complete policy remains a real neural program, but neither hand programming nor exact Boolean logic guarantees good physical outcomes.

The measured misses are: ${requirements.filter(([,fn])=>!fn(races)[1]).map(([name,fn])=>name+' ('+fn(races)[0]+')').join('; ')||'none'}. The fastest leader lap is ${f(Math.min(...races.map(r=>r.leaderBestLap)))} s against the 34 s stretch. The held-out label is only the requested reporting group. Rocket aim now includes a constant-relative-velocity intercept check, but cannot predict turns, target height or later collisions; the grounded hard expiry can still force wasted shots; drops can expire without a rival. The corrected controlled oil detour now clears. Grid oil avoidance is still imperfect: road curvature, traffic, narrow corridors and local waypoint approximations remain. Hazard-type absence forces mine avoidance to use oil-sized clearance. The local room classifier is more permissive than the controller near jumps. Waypoint detours can add time or put a car into other traffic; the paired costs show those consequences. Oil and external spins contribute to stuck and slip metrics without being excluded.

A smoke-hidden new attacker is unidentifiable from zeroed hitMe fields, though existing grudges and target identity survive. Display identity can outlive a towed rival until replaced or observed. The effect grace can postpone recovery until the urgent grounded/upright/slow/obstructed exception applies; the no-crates seed-1 grid now completes with ${grid.current.koTotal} KO(s), and armed-grid failures remain. Slow Hook pulls below the impulse threshold are not explicitly identified. Recovery clocks bound individual phases, not physical completion before the stall deadline. Foghorn opportunity is verified and actual swats counted; it cannot defend without holding Foghorn. No weapon fires without wheel contact, even at hard expiry; consequently physical holds can exceed the 20 s floor, as demonstrated at the previous checkpoint.

Crate collection remains incomplete; the latest brief requests its rate rather than a minimum. The raw sensor reports only the nearest live crate in nose-lateral distance, so rivals can consume it before arrival and force a late change to a farther row. Unreachable late changes are now skipped rather than chased. Passing, occupied lanes, jumps, hazards, slip and corner gates deliberately veto detours. Clearance follows the filtered target side, including its reset transient. No all-traffic veto was removed: the existing occupancy test already selects only the movement-side lane. The new reach gate also rejects some collectable approaches; it does not optimize pickup rate. Interpolated geometry and the lateral-load estimate remain approximate. Neither individual physical pickups nor the steering-isolation harness establishes a no-harm guarantee; the full-grid comparisons and failures remain explicit above.

The final unarmed solo has ${f(solo.unarmed.movingSlipPercent)}% time above the ten-degree slide threshold: natural drifting is a weakness of the stronger stabilizing feedback. Grid slip includes weapon-induced motion, so the numeric result does not establish stylish controlled drifting. Armed solo is also slower than the bare driving case; all of its pickup, expiry-shot and weapon feedback is retained in the reported number. No universal one-second aggression cost guarantee is claimed. No simulator retuning is recommended to disguise misses. The 55 m hazard warning is only .95 s at 58 m/s; without a hazard-radius field, the conservative oil-sized clearance can fail at that speed. Passing remains a brief local lateral heuristic rather than a multi-car trajectory plan.
`);
section('## Artifact identity',null,`Simulator SHA-256: **${v.simSha256}**. Weights SHA-256: **${v.weightSha256}**. The sorted source-file hash/mtime manifest is in results-final.jsonl. Evaluation rejects a simulator change during its run; documentation checks every final manifest against verification. Final weights use ${spec.biases.length} computed units and ${spec.stateOutputs.length} state values; no original observation index moved.

This run includes the parent's final arsenal review: 3D blast range, back-half Hook/Bull pickups, dead-whirl shutdown, reliable oiled during whirl, nonstacking springs, road-projected Piano and burnout repair. Ground friction remains .3; all three kickers remain 1.75 m tall. The final wall impulse lever is CONTACT.wallContactLever=${CONTACT.wallContactLever}. Current jump caps are ${TRACK.jumps.map(j=>j.name+' '+j.maxSpeed+' m/s').join(', ')}. Arsenal constants are recorded below for reproduction; they are read only, never changed by this implementation.

The faster-car pass uses reach ${ARSENAL.crateReach} m, respawn ${ARSENAL.crateRespawn} s, mud grip ${SURFACE_PROPS[2].grip}/drag ${SURFACE_PROPS[2].drag}, and the parent's surfaceGrip/2 sensor encoding. The earlier faster-car circuit changes regenerated weights, traces and the neuron map. This final wall-lever pass changes measurement artifacts and exact-checkpoint test expectations only; weights and construction behavior are unchanged. The algebraic traces and neuron map have no simulator hash and remain byte-identical. The preceding complete network is pre-speed.json; speed-before-final.jsonl reruns it on this final simulator. The saved crate-review-baseline.json and crate-review-before.jsonl preserve the pre-fix policy and its same-simulator measurements. Files ending in reach27-respawn9 and before-mud-review are historical. Baseline and current-policy comparisons in the final tables were all rerun on this revision.

\`\`\`json
${JSON.stringify(ARSENAL,null,2)}
\`\`\`

Production files: src/ai/index.js, src/ai/weights.js; generic src/ai/network.js remains the forward runtime, with one added scalar sqrt activation. Construction/measurement sources and artifacts live in tools/nn. Tests: test/nn.test.js. Documentation: this walkthrough and NEURON_MAP.md. **Nothing was edited outside the authorized paths; no simulator or sensor edits, git initialization or commits.**
`);
writeFileSync(new URL('../../docs/NEURAL_NETWORK.md',import.meta.url),doc);
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;color:var(--foreground);font-family:var(--font-sans)}.row{display:grid;grid-template-columns:62px 1fr 110px;gap:8px;align-items:center;height:36px}.track{height:23px;position:relative;background:color-mix(in srgb,var(--foreground) 5%,transparent)}.bar{height:9px;background:var(--chart-1)}.before{background:var(--chart-2);margin-bottom:4px}.track:after{content:"";position:absolute;left:86.6667%;top:-5px;height:33px;border-left:1px dashed var(--foreground)}.value{font-size:12px;text-align:right}.note{font-size:13px;color:var(--muted-foreground);margin-top:14px}p{margin:0 0 12px}</style></head><body><p>Wall-contact change · unchanged network · race seconds</p>${races.map(r=>{const b=wallBefore.find(b=>b.seed===r.seed);return `<div class="row"><span>${r.seed}${r.role==='held-out'?' *':''}</span><div class="track"><div class="bar before" style="width:${Math.min(100,b.raceSeconds/150*100)}%"></div><div class="bar" style="width:${Math.min(100,r.raceSeconds/150*100)}%"></div></div><span class="value">${f(b.raceSeconds)} → ${f(r.raceSeconds)}</span></div>`}).join('')}<div class="note">Upper: previous sim · lower: final sim · dashed line: 130 s limit<br>* Reserved seeds. Missing floors remain explicit in the walkthrough.</div></body></html>`;
writeFileSync(new URL('./report-final.html',import.meta.url),html);
console.log(JSON.stringify({groups:Object.fromEntries(groups.map(([name,rs])=>[name,{...metrics(rs),slides:slides(rs),collect:collection(rs)}])),timing,hazardRows,hazardCost:avg(pairs,'cost')}));
