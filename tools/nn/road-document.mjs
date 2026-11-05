// Report two frozen policies, never select weights from results.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import spec from '../../src/ai/weights.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),load=p=>JSON.parse(read(p)),jsonl=p=>read(p).trim().split(/\r?\n/).map(JSON.parse);
const br=jsonl('./road-before.jsonl'),ar=jsonl('./results-final.jsonl'),b=br.filter(r=>r.seed!==undefined),a=ar.filter(r=>r.seed!==undefined),v=load('./verification-final.json'),freeze=load('./road-freeze.json'),timing=load('./road-timing.json'),frames=load('./trace.json'),solo=jsonl('./solo-final.jsonl').at(-1),oldSolo=jsonl('./solo-before-road.jsonl').at(-1),grid=load('./grid-final.jsonl');
for(const x of [br[0],ar[0],freeze])assert.equal(x.simRevision.sha256,v.simSha256);assert.equal(freeze.weightSha256,v.weightSha256);
const f=x=>Number.isFinite(x)?x.toFixed(3):'no rival',sum=(rs,fn)=>rs.reduce((s,r)=>s+fn(r),0),avg=(rs,fn)=>sum(rs,fn)/rs.length;
const med=xs=>{xs=xs.slice().sort((x,y)=>x-y);return xs.length%2?xs[xs.length>>1]:(xs[xs.length/2-1]+xs[xs.length/2])/2;};
function metrics(rs){const laps=sum(rs,r=>r.contacts.carLaps),shots=rs.flatMap(r=>r.weapons.shots);return{races:rs.length,flags:rs.filter(r=>r.finishedByLaps).length,timeMin:Math.min(...rs.map(r=>r.raceSeconds)),timeMax:Math.max(...rs.map(r=>r.raceSeconds)),runningMin:Math.min(...rs.map(r=>r.running)),runningMean:avg(rs,r=>r.running),open:sum(rs,r=>r.contacts.open.all)/laps,openHard:sum(rs,r=>r.contacts.open.hard)/laps,cross:sum(rs,r=>r.contacts.crossing.all)/laps,crossHard:sum(rs,r=>r.contacts.crossing.hard)/laps,landing:sum(rs,r=>r.contacts.landing.all)/laps,stalled:sum(rs,r=>r.stalled)/laps,turtled:sum(rs,r=>r.turtled)/laps,stuck:100*sum(rs,r=>r.stuckCarSeconds)/sum(rs,r=>r.liveCarSeconds),margin:med(rs.map(r=>r.finishMargin??Infinity)),flagMargin:med(rs.filter(r=>r.finishedByLaps).map(r=>r.finishMargin??Infinity)),leadChanges:avg(rs,r=>r.leadChanges),pace:med(rs.map(r=>r.leaderBestLap??Infinity)),fired:avg(rs,r=>r.weapons.fired),types:new Set(shots.map(s=>s.weapon)).size,collect:100*sum(rs,r=>r.crates.collected)/sum(rs,r=>r.crates.empty),carLaps:laps};}
const change=(x,y)=>100*(y/x-1),ok=x=>x?'PASS':'FAIL';
const groups=[['Development',a.filter(r=>r.role==='development')],['Fresh held-out',a.filter(r=>r.role==='held-out')],['All twenty',a]].map(([name,rs])=>{const bs=b.filter(x=>rs.some(r=>r.seed===x.seed));return{name,rs,bs,before:metrics(bs),after:metrics(rs)};});
const targetRows=[['Open hits/car-lap at least halved',(x,y)=>`${f(change(x.open,y.open))}% ${ok(y.open<=x.open*.5)}`],['Open hard hits/car-lap at least halved',(x,y)=>`${f(change(x.openHard,y.openHard))}% ${ok(y.openHard<=x.openHard*.5)}`],['Crossroads rate within 15%',(x,y)=>`${f(change(x.cross,y.cross))}% ${ok(Math.abs(change(x.cross,y.cross))<=15)}`],['Every flag in 175-200 s',(x,y)=>`${y.flags}/${y.races} flags; ${ok(y.flags===y.races&&y.timeMin>=175&&y.timeMax<=200)}`],['At least two running every race',(x,y)=>`${y.runningMin} minimum; ${ok(y.runningMin>=2)}`],['Median flag gap no worse (flag races only)',(x,y)=>`${f(x.flagMargin)} → ${f(y.flagMargin)} m; ${ok(y.flagMargin<=x.flagMargin)}`],['Median leader best lap within 2%',(x,y)=>`${f(x.pace)} → ${f(y.pace)} s; ${ok(y.pace<=1.02*x.pace)}`],['No stuck regression',(x,y)=>`${f(x.stuck)} → ${f(y.stuck)}%; ${ok(y.stuck<=x.stuck)}`],['No stalled/car-lap regression',(x,y)=>`${f(x.stalled)} → ${f(y.stalled)}; ${ok(y.stalled<=x.stalled)}`],['No turtled/car-lap regression',(x,y)=>`${f(x.turtled)} → ${f(y.turtled)}; ${ok(y.turtled<=x.turtled)}`],['All eleven weapons used',(x,y)=>`${y.types}/11; ${ok(y.types===11)}`]];
const table=rs=>`| Seed | Race before → after s | Flag | Running before → after | Gap before → after m | Leader lap before → after s | Leads | Fired | Stuck % | Stalled/turtled |\n|---:|---|---|---|---|---|---:|---:|---:|---|\n${rs.map(r=>{const q=b.find(x=>x.seed===r.seed);return`| ${r.seed} | ${f(q.raceSeconds)} → ${f(r.raceSeconds)} | ${r.finishedByLaps?'yes':'CLOCK'} | ${q.running} → ${r.running} | ${f(q.finishMargin)} → ${f(r.finishMargin)} | ${f(q.leaderBestLap)} → ${f(r.leaderBestLap)} | ${r.leadChanges} | ${r.weapons.fired} | ${f(r.stuckPercent)} | ${r.stalled}/${r.turtled} |`;}).join('\n')}`;
const source=read('./walkthrough-before-open-road.md');let core=source.slice(source.indexOf('## Runtime boundary'),source.indexOf('## Worked forward pass'));
core=core.replace(/<!-- architecture -->[\s\S]*?<!-- \/architecture -->/,`| Quantity | Value |\n|---|---:|\n| Raw observations/actions | 277/6 |\n| Recurrent/total inputs | 47/324 |\n| Layers/units | ${spec.layers.length-1}/${spec.biases.length} |\n| Edges/parameters | ${spec.weights.length}/${spec.weights.length+spec.biases.length} |`);
core=core.replace(/The pre-crate weapons network had[^\n]+/,`The previous network had 2967 units, 5650 edges and 45 states. This network has ${spec.biases.length} units, ${spec.weights.length} edges and 47 states. The unchanged generic runtime uses linear, ReLU, step, square, atan, reciprocal and sqrt.`);
core=core.replace('State 44 is the filtered crate offset in metres.', 'State 44 is the filtered crate offset in metres. State 45 is crossing grace (.75 s), state 46 is flight grace (1 s).');
core=core.replace(/^(\| ([\w.]+) \| )\d+ \| \d+ \|(.+)$/gm,(line,_,name,tail)=>{const id=spec.names.indexOf(name);if(id<0)return line;return`| ${name} | ${id} | ${spec.layers.findIndex((x,k)=>id>=x&&id<spec.layers[k+1])+1} |${tail}`;});
core=core.replace('Normally request ±3 m.', 'On open road request ±3 m only if the selected lane is clear with the existing road/ray margins; otherwise request zero lateral offset and follow. Crossroads retain the original passing logic.');
core=core.replace('A living selected rival within 10 m may provoke narrowing', 'Only in the 30 m crossing approach or .75 s crossing grace, a living selected rival within 10 m may provoke narrowing');
core=core.replace('* More than 25 m to the jump lip, the existing passing condition.', '* More than max(25 m, one second of travel) to the jump lip.');
core=core.replace('request = G(passDirection*width, passing; 3)', 'request = openRoad ? G(3*direction, passing AND clearance;128) : G(passDirection*width, passing;3)');
core=core.replace("neutralOffset' = 13/15*oldNeutralOffset + 2/15*(passing ? 3*direction : 0)","neutralOffset' = 13/15*oldNeutralOffset + 2/15*(openRoad ? politeRequest : legacyNeutralRequest)");
core=core.replace(/Neither target position nor anger changes desired speed[^\n]+/, 'Anger never requests reverse. Physical open-road traffic now limits desired speed via the new circuit below; weapon anger/grudge consumers are unchanged. Older aggression ablations are historical, not final-policy measurements.');
core=core.replace('p = ego.pace*share','freePace = ego.pace*share\np = min(freePace, recoveryActive ? 1.5 : trafficSpeedLimit)');
core=core.replace('Inside 25 m of a jump lip, no new pass offset is requested.', 'Inside max(25 m, one second of horizontal travel) of a jump lip, no new pass offset is requested.');
core=core.replace('Previous missed deadlines remain in the historical log; the current sample has no non-roof hold over 20 s, without proving a universal bound.', `The current twenty-race sample includes a non-roof hold of ${f(Math.max(...a.map(r=>r.weapons.maxHeldNonRoof)))} s; the old 20 s hold target is not met. This firing circuit was not changed in this pass.`);
core=core.replace('the measurements section reports their means.', 'the JSONL artifact reports the samples.');
const traceNames=['openRoad','crossGrace','trafficFlightGrace','follow0.valid','follow0.closing','follow0.gap','follow0.speedCap','trafficSpeedLimit','freeDesiredSpeed','desiredSpeed','requestedOffset','steer','throttle','brake'];
const damage=a.flatMap(r=>r.contacts.damage),totals=Object.fromEntries(['car','wall','weapon','other'].map(k=>[k,sum(damage,d=>d[k])])),destroyed=damage.filter(d=>d.ko==='destroyed');
const doc=`# The Knot: five-lap racing with weapon-led conflict

One directly programmed recurrent network drives all twelve racers. This pass adds an open-road following-speed cap and refuses passes into occupied lanes; the elbow is restricted to crossroads. Racing-line, slip/yaw, jump, recovery and weapon circuits remain. Every policy calculation is compiled into weights and activations. No training, fitting, search, runtime rule wrapper or simulator edit was used.

## Final acceptance status

**The full targets are not met. This is not an accepted race balance.** Clock finishes remain failures. Before/after runs use the same frozen five-lap, 200 s simulator. Only seeds 1,7,42 informed equation corrections. The nine previously used seeds are the development reporting group. Eleven fresh seeds (6007,6011,6029,6043,6053,6067,6073,6089,6101,6113,6121) were reserved until the weights were frozen in road-freeze.json; no policy edits followed their measurement.

| Target | Development | Fresh held-out | All twenty |
|---|---|---|---|
${targetRows.map(([name,fn])=>`| ${name} | ${groups.map(g=>fn(g.before,g.after)).join(' | ')} |`).join('\n')}

The matched-wrapper timing mean is ${f(timing.before.meanMs)} → ${f(timing.after.meanMs)} ms: a regression, despite staying below 2 ms. Production mean/p95/max for twelve calls is ${f(ar.at(-1).benchmark.meanMs)}/${f(ar.at(-1).benchmark.p95Ms)}/${f(ar.at(-1).benchmark.maxMs)} ms. No outliers were discarded.

${core}

## New open-road following circuit

For each solid, wall-visible body .5–60 m ahead, within 2.6 m laterally, and headingCos≥.5, compute:

\`\`\`text
V = 40*sqrt(speedFwd² + speedRight²)
c = max(0, -40*opp.relVelFwd)
gap = 5.5 + .35*V + c²/16
cap = clip((40*speedFwd + 40*opp.relVelFwd + (100*opp.fwd-gap)/1.2)/40, 0, 1.5)
limit = min(1.5, every eligible cap)
desiredSpeed = min(freeDesiredSpeed, openRoad AND NOT recovery ? limit : 1.5)
\`\`\`

5.5 m is two 2.45 m half-lengths plus .6 m clearance. The .35 s allowance covers the 30 Hz decision and .25 s passing filter with margin. Closing distance c²/(2a) uses a=8 m/s², below nominal dry grip. The 1.2 s gap-correction horizon covers lateral response, filter and braking delay; it is an engineering choice, not fitted. Actual gap weights are +14 on horizontalSpeed, +1/16 on squared closing speed, bias 5.5. The cap row weights are [1,1,100/48,-1/48] on speedFwd, relative velocity, fwd and gap. Two ReLUs clip [0,1.5]; eligibility muxes use M=1.5. Each minimum is a−ReLU(a−b). Eleven blocks are statically unrolled.

OpenRoad requires grounded, headingCos≥.8, not whirling, toCrossing≥45 m, toJump≥60 m, and expired crossing/flight grace. CrossGrace resets to .75 s whenever toCrossing≤30 m; otherwise clip(old−1/30,0,.75). FlightGrace resets to 1 s while no wheel is grounded and then counts down. Both selectors use M=1. Recovery bypasses following. The existing post-hit settling state is not a following veto: a grounded shove must not disable following for 1.8 s. New following contributes no limit while approaching a crossing or airborne/landing. This is a proved gate property, not a guarantee of unchanged arrival times or intersection collision rates.

The existing 30 m passing WTA, ±3 m lane targets, side occupancy and road clamps remain. On open road only a clear selected lane receives a request; blocked lanes get zero. Request and offset selectors have conservative M=128 over the much smaller ±3 m filtered domain. The elbow can run only in the crossing approach/grace, regardless of settling. Weapons, rage, grudge and crate construction are unchanged. No extra turning, reversing or braking to reach a victim is introduced.

The following corridor is nose-relative, not a curved swept-path planner. It cannot see smoke-hidden cars or anticipate sideways squeezes. Braking earlier can spread the field well before a crossroads, and fewer direct contacts can change later weapon trajectories. These limitations explain why circuit correctness alone cannot establish the requested physical targets.

## Worked forward pass

The first saved frame has V=20 m/s, a parallel slower car 8 m ahead, relative speed −4 m/s, no nearby crossing/jump, and zero memory. Closing=4; gap=5.5+.35×20+16/16=13.5 m. Cap=(20−4+(8−13.5)/1.2)/40=.285416667, or 11.4167 m/s. Free pace=28×.9=25.2 m/s. The existing brake controller saturates at one. The clear passing lane requests −3 m, filtered to −.4 m; the elbow is off. This is a late near-body fixture, not a guarantee of physical avoidance.

| Neuron | ID | Activation |
|---|---:|---:|
${frames[0].activations.filter(x=>traceNames.includes(x.name)).map(x=>`| ${x.name} | ${x.id} | ${x.value.toFixed(9)} |`).join('\n')}

Actual steer/throttle/brake/handbrake/reverse/fire: ${frames[0].action.map(x=>x.toFixed(9)).join(' / ')}. trace.json contains full observations, initial/next memory and outputs for all ${frames.length} frames. NEURON_MAP.md lists every row and consumer.

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

${v.testsPassed} tests pass, including ${v.neuralTests} neural/evaluation tests. Deterministic rebuild is byte-identical; ${v.traceFrames} traces and ${v.traceActivations} selected activations replay exactly. New tests cover following equations, rear exclusion, crossing/landing grace, grounded-hit retention, lane refusal and contact/damage classification. Existing circuit, recovery and weapon regressions remain. No-crates seed-1 checkpoints have ${grid.preWeapons.koTotal}/${grid.beforeReview.koTotal} KOs; final has ${grid.current.koTotal}. Green tests do not imply accepted gameplay.

Reproduce with road-eval.mjs baseline, road-eval.mjs final, eval.mjs --solo, grid-regression.mjs, node --test, inspect.mjs, verify.mjs and document.mjs. The final and baseline JSONL files include event snapshots and simulator manifests. Old final artifacts not referenced here are historical revisions.

### Fixed metric definitions

Car-laps sum nonnegative credited route gain from each car's own grid position divided by track length, including partial KO laps. Rates pool counts/exposure rather than averaging seed rates. Hits are damage-threshold hit events, not every touch. Hard means closing>6 m/s, matching the owner's estimate; strength≥.35 is still the separate legacy field. Crossroads means event position within 25 m of generated crossing coordinates. Landing means upper≥0 or either car in [lip, landS+maxSpeed×1 s]. Categories are exclusive: crossing, else landing, else open. Crossing landings remain in crossing; no events are discarded. Rear/braking/crate/early labels are descriptive, not causes. Stuck is running horizontal speed<3 m/s after second 5. A missing second car contributes infinite gap, never silently dropped. Timeout rows show gaps at stop, not a claimed flag. Flag-gap medians include only completed flag races; they are conditional measurements and do not excuse missing flags. The separate all-end gap includes every race. Pace compares the median leader best completed lap and separately solo; not every lap.

${groups.map(g=>`### ${g.name}: before → after\n\n| Metric | Before | After |\n|---|---:|---:|\n${[['open','Open hits/car-lap'],['openHard','Open hard/car-lap'],['cross','Crossroads hits/car-lap'],['crossHard','Crossroads hard/car-lap'],['landing','Landing hits/car-lap'],['carLaps','Car-lap exposure'],['stuck','Stuck %'],['stalled','Stalled/car-lap'],['turtled','Turtled/car-lap'],['flagMargin','Median flag gap m'],['margin','Median gap at every race end m'],['leadChanges','Lead changes/race'],['pace','Median leader lap s'],['fired','Weapons/race'],['collect','Crate collection %']].map(([k,n])=>`| ${n} | ${f(g.before[k])} | ${f(g.after[k])} |`).join('\n')}`).join('\n\n')}

### Development finish table

${table(groups[0].rs)}

### Fresh held-out finish table

${table(groups[1].rs)}

### Solo, weapons and attrition

Unarmed best lap ${f(oldSolo.unarmed.leaderBestLap)} → ${f(solo.unarmed.leaderBestLap)} s; armed ${f(oldSolo.network.leaderBestLap)} → ${f(solo.network.leaderBestLap)} s. All ${metrics(a).types}/11 weapons fire, mean ${f(metrics(b).fired)} → ${f(metrics(a).fired)} per five-lap race. Prior three-lap context was 49.333 fired/race, not a controlled lap-count ablation. Rage/grudge trigger equations are unchanged; weapon-probes.json contains independent temperament contrasts. Every per-seed weapon and crate count is in results-final.jsonl.

Actual health loss over twenty final races: car contact ${f(totals.car)}, wall ${f(totals.wall)}, weapon ${f(totals.weapon)}, other ${f(totals.other)} health units. Of ${destroyed.length} destroyed cars, ${destroyed.filter(d=>d.last==='weapon').length} had a weapon as the last damaging operation. The event observer preserves pre-operation health through nested wheelOff/ko; it does not attribute a later wall crash to an earlier weapon. Health changes cannot directly cure turtling or delays from spins. This evidence does not support a specific blanket weapon-damage reduction as a cure for the failed timing/contact targets. No health/damage adjustment is recommended or applied without a separate controlled experiment.

## Contact diagnosis after the frozen comparison

Across twenty baseline races, 680 open-road events included 208 parallel front/rear contacts, 147 with a braking participant, 19 with a hunt-mode participant, and 414 in the first 40 s. The delivered network has 507 open events, but 239 front/rear contacts and 297 with braking; open hunt-mode contacts are zero. Thus the elbow was a small observed component, and the new following response worsened the rear-contact/compression problem even as total open events fell. These labels overlap and are not a controlled causal decomposition. Proximity to a crate fell from 348 to 129 events, but that alone cannot establish that crate steering caused those impacts. Crossroads and landing losses cannot be excused by unchanged local gates: earlier speed decisions change arrival timing.

## Exactness and limitations

Affine arithmetic, square-product identities, Boolean gates, min/max, clipped clocks and leak recurrences implement the stated mathematical program exactly in real arithmetic. Float64 deployment is checked at boundaries and interiors, not every floating value. Pursuit, headway, lane geometry and attribution are physical approximations or measurement conventions. No crossing-yield gate does not guarantee preserved collision counts after earlier following. Weapon outcomes and crate pickups can dominate later divergence. The tables, including clock finishes, govern acceptance. No target is weakened to turn a miss into a pass.

## Artifact identity

Simulator SHA-256: ${v.simSha256}. Weights SHA-256: ${v.weightSha256}. Architecture: ${spec.layers.length-1} layers, ${spec.biases.length} units, ${spec.weights.length} edges, ${spec.weights.length+spec.biases.length} parameters, ${spec.stateOutputs.length} states. Rules are five laps and a 200 s backstop. Only src/ai, tools/nn, test/nn.test.js, docs/NEURAL_NETWORK.md and docs/NEURON_MAP.md were edited. No sim edits, training, fitting, parameter search, git initialization or commits.
`;
writeFileSync(new URL('../../docs/NEURAL_NETWORK.md',import.meta.url),doc);
const summary={groups:groups.map(({name,before,after})=>({name,before,after})),damage:totals,destroyed:destroyed.length,weaponFinalBlows:destroyed.filter(d=>d.last==='weapon').length,timing};
writeFileSync(new URL('./road-summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
const max=Math.max(...groups.flatMap(g=>[g.before.open,g.after.open,g.before.cross,g.after.cross]));
const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{background:transparent;color:var(--foreground);font-family:var(--font-sans);margin:0}.row{display:grid;grid-template-columns:150px 1fr 100px;gap:8px;align-items:center;margin:12px 0}.track{height:24px}.bar{height:10px;background:var(--chart-1);margin-bottom:3px}.old{background:var(--chart-2)}small{color:var(--muted-foreground)}</style></head><body><p>Contact events per car-lap</p>${groups.slice(0,2).map(g=>['open','cross'].map(k=>`<div class="row"><span>${g.name}<br>${k==='open'?'Open road':'Crossroads'}</span><div class="track"><div class="bar old" style="width:${100*g.before[k]/max}%"></div><div class="bar" style="width:${100*g.after[k]/max}%"></div></div><span>${f(g.before[k])} → ${f(g.after[k])}</span></div>`).join('')).join('')}<small>Upper: baseline · lower: delivered network. Targets: halve open-road events; preserve crossroads within 15%.</small></body></html>`;
writeFileSync(new URL('./report-final.html',import.meta.url),html);console.log(JSON.stringify(summary));
