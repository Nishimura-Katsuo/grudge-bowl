// Refresh generated evidence blocks; prose lives in the walkthrough itself.
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import spec from '../../src/ai/weights.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),jsonl=p=>read(p).trim().split(/\r?\n/).map(JSON.parse);
const records=jsonl('./results-final.jsonl'),races=records.filter(x=>x.seed!==undefined),timing=records.at(-1).benchmark;
const verification=JSON.parse(read('./verification-final.json')),frames=JSON.parse(read('./trace.json')),solo=jsonl('./solo-final.jsonl').at(-1);
const ablationRecords=jsonl('./aggression-final.jsonl'),ablations=ablationRecords.filter(x=>x.seed!==undefined),cases=jsonl('./recovery-final.jsonl').filter(x=>x.name);
assert.equal(verification.simSha256,records[0].simRevision.sha256);
assert.equal(ablationRecords[0].simRevision.sha256,records[0].simRevision.sha256);
assert.equal(verification.weightSha256,createHash('sha256').update(read('../../src/ai/weights.js')).digest('hex'));
const f=x=>x!==null&&Number.isFinite(x)?x.toFixed(3):'—',sum=(rs,k)=>rs.reduce((s,r)=>s+r[k],0),avg=(rs,k)=>sum(rs,k)/rs.length;
const stuck=rs=>100*sum(rs,'stuckCarSeconds')/sum(rs,'liveCarSeconds'),slides=rs=>100*sum(rs,'slidingSamples')/sum(rs,'movingSamples');
const status=b=>b?'Pass':'Fail',passes=p=>races.filter(p).length;
let doc=read('../../docs/NEURAL_NETWORK.md').replace(/\r\n/g,'\n');
function section(start,end,body){const a=doc.indexOf(start),b=end?doc.indexOf(end,a+start.length):doc.length;assert.ok(a>=0&&b>a,start);doc=doc.slice(0,a)+start+'\n\n'+body.trim()+'\n\n'+doc.slice(b);}
function block(name,body){const start=`<!-- ${name} -->`,end=`<!-- /${name} -->`;const a=doc.indexOf(start),b=doc.indexOf(end,a);assert.ok(a>=0&&b>a,name);doc=doc.slice(0,a)+start+'\n'+body.trim()+'\n'+doc.slice(b);}
section('## Final acceptance status','## Runtime boundary',`
**The complete acceptance floor is not met.** ${passes(r=>r.finishedByLaps)}/9 races end at three laps; ${passes(r=>r.raceSeconds<=165)}/9 finish within 165 s and ${passes(r=>r.leaderBestLap<=50)}/9 meet the 50 s leader-lap limit. Mean stalled KOs=${f(avg(races,'stalled'))}, weighted stuck time=${f(stuck(races))}%, longest stop=${f(Math.max(...races.map(r=>r.longestStop)))} s. Stalled KOs measure failure to gain route; they can happen to a moving car. They are not interchangeable with stopped-time samples.

Seven development seeds are 1, 7, 42, 1201, 1709, 2309, 2903. Reserved seeds 3613 and 4801 are reported separately. They are not pristine one-shot hold-outs: earlier rounds measured them, and the reviewer explicitly used seed 4801 to diagnose the stale recovery latch and aggression cost. This round reports the requested reserved comparison set separately, without claiming untouched validation. No weights were selected by comparing candidates, and no automatic parameter search ran.

${['development','held-out'].map(role=>{const rs=races.filter(r=>r.role===role);return `For ${role}: stalled KOs=${f(avg(rs,'stalled'))}/race, stuck=${f(stuck(rs))}%, longest stop=${f(Math.max(...rs.map(r=>r.longestStop)))} s. The priority floor ${avg(rs,'stalled')<=.5&&stuck(rs)<=3&&rs.every(r=>r.longestStop<=8)?'is met':'is not met'} in this group.`;}).join('\n\n')}

| Acceptance requirement | Final measurement, all nine seeds | Status |
|---|---|---|
| Every race ends at three laps within 165 s | ${passes(r=>r.finishedByLaps&&r.raceSeconds<=165)}/9; max ${f(Math.max(...races.map(r=>r.raceSeconds)))} s | ${status(races.every(r=>r.finishedByLaps&&r.raceSeconds<=165))} |
| Leader best lap ≤50 s | ${passes(r=>r.leaderBestLap<=50)}/9; max ${f(Math.max(...races.map(r=>r.leaderBestLap)))} s | ${status(races.every(r=>r.leaderBestLap<=50))} |
| Mean KOs ≤4 | ${f(avg(races,'koTotal'))} | ${status(avg(races,'koTotal')<=4)} |
| Earlier mean turtled target ≤0.5 | ${f(avg(races,'turtled'))} | ${status(avg(races,'turtled')<=.5)} |
| Mean stalled KOs ≤0.5 | ${f(avg(races,'stalled'))} | ${status(avg(races,'stalled')<=.5)} |
| Mean running at finish ≥7 | ${f(avg(races,'running'))} | ${status(avg(races,'running')>=7)} |
| Stuck car-time ≤3% | ${f(stuck(races))}% | ${status(stuck(races)<=3)} |
| Longest stop ≤8 s | ${f(Math.max(...races.map(r=>r.longestStop)))} s | ${status(races.every(r=>r.longestStop<=8))} |
| Hits/min ≥10 and hard/min ≥1.5 | ${passes(r=>r.hitsPerMinute>=10&&r.hardPerMinute>=1.5)}/9 | ${status(races.every(r=>r.hitsPerMinute>=10&&r.hardPerMinute>=1.5))} |
| Crossroads share ≥25% | ${passes(r=>r.crossingHitPercent>=25)}/9 | ${status(races.every(r=>r.crossingHitPercent>=25))} |
| Mean lead changes ≥2 | ${f(avg(races,'leadChanges'))} | ${status(avg(races,'leadChanges')>=2)} |
| Moving slip above 10° ≥8% | ${f(slides(races))}% pooled; ${passes(r=>r.movingSlipPercent>=8)}/9 individually | ${status(slides(races)>=8)} pooled; see individual results |
| Mean descending-car hit events ≥4 | ${f(avg(races,'fromAbove'))} | ${status(avg(races,'fromAbove')>=4)} |
| Twelve act() calls under 2 ms | Mean ${f(timing.meanMs)}, p95 ${f(timing.p95Ms)}, max ${f(timing.maxMs)} ms | ${status(timing.p95Ms<2)} measured |
`);
block('architecture',`| Quantity | Value |
|---|---:|
| Computed neurons | ${spec.biases.length} |
| Layers with earlier-layer skip connections | ${spec.layers.length-1} |
| Nonzero edges | ${spec.weights.length} |
| Stored parameters, edges plus biases | ${spec.weights.length+spec.biases.length} |
| Recurrent state values | ${spec.stateOutputs.length} |
| Generated weights bytes | ${statSync(new URL('../../src/ai/weights.js',import.meta.url)).size} |`);
const interfaces=[['grudge0','[0,1]','Passing commitment, next state'],['rage','[0,1]','Driving commitment, next state'],['shownRage','[0,1]','Display only'],['leanClock','[0,4.5] s','Pulse and cooldown'],['effectiveNarrowing','bit','Hunt display'],['neutralOffset','[-3,3] m','Neutral pass and display reference'],['routeDebt','[0,8] m','Failed-leg detector'],['legTime','[0,2] s','Wall-clock leg deadline'],['headingYawAgreement','[-1.5,1.5]','Heading improvement test'],['turnImproving','bit','Route-deadline exemption'],['routeFailed','bit','Leg replan'],['turnReconsider','bit','Turn latch'],['traffic0.valid','bit','Traffic WTA'],['target0','bit','Local traffic selector'],['passing','bit','Lateral excursion'],['activeLean','bit','Hunt display'],['passOffset','[-3,3] m','Next state and aim'],['boundedOffset','road corridor','Pursuit aim'],['pursuitCurvature','[-.5,.5] 1/m','Steering and expected yaw'],['followingSteer','bounded heuristic','Normal steering'],['wallReflex','[-.232,.232]','Normal steering'],['desiredSpeed','[0,1.455] sensor units','Speed error'],['slipAuthority','[0,1]','Low-speed throttle release'],['slipGrip','[0,1]','Throttle multiplier'],['spinGrip','[0,1]','Throttle multiplier'],['forwardBlocked','bit','Recovery evidence'],['releaseRoad','bit','Recovery release'],['stuck','[0,.6] s','Entry threshold'],['escapeTimer','[0,1.8] s','Gear phases'],['phaseSlow','[0,1] s','Failed-leg detector'],['escapeActive','bit','Recovery latch and display'],['escapeTurn','{-1,0,1}','Opposing steering locks'],['reverse','bit','Action 4'],['steer','[-1,1]','Action 0'],['throttle','[0,1]','Action 1'],['brake','[0,1]','Action 2']];
block('interfaces',`| Block output | ID | Layer | Domain | Consumer |
|---|---:|---:|---|---|
${interfaces.map(([name,domain,consumer])=>{const id=spec.names.indexOf(name);assert.ok(id>=0);const layer=spec.layers.findIndex((s,k)=>id>=s&&id<spec.layers[k+1])+1;return `| ${name} | ${id} | ${layer} | ${domain} | ${consumer} |`;}).join('\n')}`);
block('trace',`| Neuron | ID | Value |
|---|---:|---:|
${frames[0].activations.map(a=>`| ${a.name} | ${a.id} | ${a.value.toFixed(9)} |`).join('\n')}

| Frame | Action steer / throttle / brake / handbrake / reverse |
|---|---|
${frames.map(r=>`| ${r.label} | ${r.action.map(x=>x.toFixed(6)).join(' / ')} |`).join('\n')}`);
const pairs=ablations.flatMap(r=>r.matched),cost=avg(pairs,'cost'),focalPairs=ablations.flatMap(r=>r.focal.matched);
section('## Verification and measurements','## Exactness',`
Regenerate with node tools/nn/build.mjs, node --test > tools/nn/test-final.txt, node tools/nn/inspect.mjs, node tools/nn/eval.mjs > tools/nn/results-final.jsonl, node tools/nn/eval.mjs --solo > tools/nn/solo-final.jsonl, node tools/nn/aggression.mjs > tools/nn/aggression-final.jsonl, node tools/nn/recovery-cases.mjs > tools/nn/recovery-final.jsonl, node tools/nn/verify.mjs, then node tools/nn/document.mjs.

${verification.testsPassed} tests pass, including ${verification.neuralTests} neural/evaluation tests. They cover arithmetic identities and boundaries, WTA ties, recurrent leaks, pursuit, zero slots, wreck headings, free-side passing, the 6.4 m funnel, offset decay, pre-WTA obstacle eligibility, bounded aggression pulses and cooldown, display-only rage graph isolation, airborne and road-clamped telemetry, horizontal drift, airborne braking, low-speed slip authority, blockage masks, clearance hysteresis, gear clocks and route-debt deadlines including failed shifts, stale steering latch correction, engaged-turn deadline inhibition with a preserved failed-shift timeout, steering signs, actual backward travel, no-motion transitions, alignment, ablation matching and output reuse. Closed-loop checks cover fixed physical recovery cases, solo three-lap completion and a full grid with credited damage. The acceptance floor remains separate from these regression tests.

Rebuild is byte-identical; ${verification.traceFrames} traces and ${verification.traceActivations} selected intermediate activations replay exactly; browser ESM bundle=${verification.browserBundleBytes} bytes. Solo network best lap=${f(solo.network.winnerBestLap)} s versus reference=${f(solo.reference.winnerBestLap)} s; three-lap time=${f(solo.network.raceSeconds)} s versus ${f(solo.reference.raceSeconds)} s. Solo moving slip=${f(solo.network.movingSlipPercent)}%; collision-induced slides are included in the grid measurements.

### Speed and survival, every seed

Limits: three-lap finish; time≤165 s; leader best≤50 s; mean KO≤4, stalled≤.5, running≥7; weighted stuck≤3%, longest stop≤8 s. The earlier mean-turtled target of .5 per race is also shown for continuity.

| Seed / role | Finish | Race s | Leader best s | KO / stalled / turtled | Running | Stuck % | Longest s |
|---|---|---:|---:|---|---:|---:|---:|
${races.map(r=>`| ${r.seed} ${r.role} | ${r.finishedByLaps?'3 laps':'FAIL'} | ${f(r.raceSeconds)} | ${f(r.leaderBestLap)} | ${r.koTotal} / ${r.stalled} / ${r.turtled} | ${r.running} | ${f(r.stuckPercent)} | ${f(r.longestStop)} |`).join('\n')}

| Group | Mean KO | Mean stalled | Mean turtled | Mean running | Weighted stuck % | Max stop s | Mean descending hits |
|---|---:|---:|---:|---:|---:|---:|---:|
${['development','held-out'].map(role=>{const rs=races.filter(r=>r.role===role);return `| ${role} | ${f(avg(rs,'koTotal'))} | ${f(avg(rs,'stalled'))} | ${f(avg(rs,'turtled'))} | ${f(avg(rs,'running'))} | ${f(stuck(rs))} | ${f(Math.max(...rs.map(r=>r.longestStop)))} | ${f(avg(rs,'fromAbove'))} |`;}).join('\n')}

### Conflict and slides, every seed

Limits: hits/min≥10, hard/min≥1.5, crossroads share≥25%, mean lead changes≥2, moving slip>10° share≥8%, mean descending-car hits≥4.

| Seed | Hits/min | Hard/min | Crossroads hit % | Descending hits | Lead changes | Moving slip % | Winner |
|---:|---:|---:|---:|---:|---:|---:|---|
${races.map(r=>`| ${r.seed} | ${f(r.hitsPerMinute)} | ${f(r.hardPerMinute)} | ${f(r.crossingHitPercent)} | ${r.fromAbove} | ${r.leadChanges} | ${f(r.movingSlipPercent)} | ${r.winner} |`).join('\n')}

Stuck samples use living cars with horizontal speed<3 m/s after the first 5 s, at 30 Hz. Longest stop uses the same definition and includes gear changes. Moving slip uses speed>6 m/s and |horizontal slip|>10°, with the heading normalized in the horizontal plane. Hard hits have event strength≥.35; all car-car hit events count, including solid wrecks. Crossroads hits are within 16 m of any track.crossings point. Descending-car hits count event.upper≥0, including car ID 0. The simulator now requires real downward closing speed; this is stricter than the former fromAbove flag. The aggregate JSON key fromAbove is retained for tooling compatibility but reads only upper. A three-lap finish requires the winner to be alive with progress≥world.laps×track.length, rather than relying on cached leader/car lap counts. Lead changes are leader identity changes after 5 s, retaining the incumbent at route ties; they include leader KOs. Leader best lap is the best completed lap by a car leading at that lap event. Lap 1 includes grid offset and launch. KO/survival averages are per race; stuck/slip use car-time denominators.

### Aggression budget: paired counterfactual measurement

[aggression.mjs](../tools/nn/aggression.mjs) runs the same frozen network and seeds with temperAggression=0, temperVengeance=0 and every hitMe=0 from the first decision. All initial grudges are zero, so they remain exactly zero. Rage and nerve remain unchanged. With grudge=0 and aggression temperament=0, the anger score is at most .2 from rage, below the .35 leaning threshold; the elbow circuit is therefore inactive. This harness clamp is not part of production act(). The comparison does not change weights or select a policy.

Match completed laps by car ID and lap number between the two runs. Positive cost means aggression-on was slower. Across ${pairs.length} matched car-laps, mean cost is **${f(cost)} s/lap**, maximum ${f(Math.max(...pairs.map(x=>x.cost)))} s; ${pairs.filter(x=>x.cost>1).length} matched laps cost more than one second. ${sum(ablations,'unmatchedOn')} on-laps and ${sum(ablations,'unmatchedOff')} off-laps have no match and are excluded. **The universal one-second-per-lap budget is not established.** This includes collision, damage, traffic and recovery consequences, not only steering excursion time; the two fields diverge after contact. Conditioning on both laps being completed also creates survivorship bias. This is a reproducible counterfactual cost measurement, not an isolated causal attribution to a particular elbow.

| Seed | Matched laps | Mean on−off s/lap | Largest cost s | Laps costing >1 s | On race s | Off race s |
|---:|---:|---:|---:|---:|---:|---:|
${ablations.map(r=>`| ${r.seed} | ${r.pairs} | ${f(r.meanCost)} | ${f(r.maxCost)} | ${r.overOneSecond} | ${f(r.onRaceSeconds)} | ${f(r.offRaceSeconds)} |`).join('\n')}

The all-off experiment changes opponents too. A second experiment clamps only car 0, selected before measurement, while every opponent retains its production brain. Matching only that car's completed laps gives ${focalPairs.length} pairs, mean cost **${f(avg(focalPairs,'cost'))} s/lap**, maximum ${f(Math.max(...focalPairs.map(x=>x.cost)))} s; ${focalPairs.filter(x=>x.cost>1).length} exceed one second. This isolates the initial policy change to one driver, while retaining the resulting traffic feedback. Unmatched laps are still a limitation, not zero-cost observations.

| Seed | Car-0 matched laps | Mean on−off s/lap | Largest cost s | Laps costing >1 s |
|---:|---:|---:|---:|---:|
${ablations.map(r=>`| ${r.seed} | ${r.focal.pairs} | ${f(r.focal.meanCost)} | ${f(r.focal.maxCost)} | ${r.focal.overOneSecond} |`).join('\n')}

### Fixed physical recovery fixtures

These are controlled spawns reproducing the reported classes, not saved states of the user's exact cars. Case D also starts with the explicitly specified stale +1 turn and three metres of route debt, while facing −138°. First-forward means body-forward speed>3 m/s and heading within 30° of the route. Progress is net route gain after ten seconds.

| Case | First forward s | Route gain m | Reverse entries | Health |
|---|---:|---:|---:|---:|
${cases.map(r=>`| ${r.name} | ${f(r.firstForward)} | ${f(r.progress)} | ${r.reversals} | ${f(r.health)} |`).join('\n')}

Inference over 10,000 batches of twelve act() calls including telemetry: mean ${f(timing.meanMs)} ms, p95 ${f(timing.p95Ms)} ms, max ${f(timing.maxMs)} ms. No outliers discarded; this is measured cost, not a hard scheduling guarantee.
`);
section('## Artifact identity',null,`Simulator SHA-256: **${verification.simSha256}**. Weights SHA-256: **${verification.weightSha256}**. The sorted file hash/mtime manifest is in results-final.jsonl; evaluation rejects a simulator change during a run. This revision uses Dropkick and Pancake ramps of 18 m, falls of 11 m and heights of 1.75 m; their maximum speeds are 29 and 31 m/s respectively. Hump now also uses an 18 m ramp, 11 m fall and 1.75 m height, with airLength=20 m and maxSpeed=22 m/s. All three kickers are 1.75 m tall. It retains the Pancake funnel, low car-contact lever, groundFriction=.3, the original body floor, downward-closing upper attribution, running-only progress-based finish, finish-fraction comparisons only between running cars, and the final grazing-ray fix. All final figures were measured after the last simulator notice. The parent owns all simulator changes. This implementation changed nothing outside src/ai, tools/nn, test/nn.test.js and the two neural documentation files.`);
writeFileSync(new URL('../../docs/NEURAL_NETWORK.md',import.meta.url),doc);
const maximum=Math.max(5,Math.ceil(Math.max(...races.map(r=>r.stuckPercent))/5)*5);
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;background:transparent;color:var(--foreground);font-family:var(--font-sans)}figure{margin:0}figcaption{margin-bottom:14px}.row{display:grid;grid-template-columns:80px minmax(0,1fr) 64px;gap:8px;align-items:center;height:32px}.track{position:relative;height:14px;background:color-mix(in srgb,var(--foreground) 5%,transparent)}.bar{height:14px;background:var(--chart-1)}.track:after{content:"";position:absolute;left:${300/maximum}%;top:-9px;height:32px;border-left:1px solid var(--foreground)}.value{text-align:right;font-variant-numeric:tabular-nums}.note{margin-top:14px;color:var(--muted-foreground)}.axis{display:grid;grid-template-columns:80px minmax(0,1fr) 64px;gap:8px;margin-top:8px}.ticks{display:flex;justify-content:space-between;color:var(--muted-foreground)}
</style></head><body><figure aria-label="Running-car time below three metres per second after five seconds, by seed"><figcaption>Stuck time · running-car samples (%)</figcaption>${races.map(r=>`<div class="row"><span>${r.seed}${r.role==='held-out'?' *':''}</span><div class="track"><div class="bar" style="width:${100*r.stuckPercent/maximum}%"></div></div><span class="value">${r.stuckPercent.toFixed(2)}%</span></div>`).join('\n')}<div class="axis"><span></span><div class="ticks"><span>0</span><span>${maximum/2}</span><span>${maximum}%</span></div><span></span></div><div class="note">Vertical line: 3% limit · * reserved evaluation seeds</div></figure></body></html>`;
writeFileSync(new URL('./report-final.html',import.meta.url),html);
