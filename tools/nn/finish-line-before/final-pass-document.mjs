// Reporting only. These calculations cannot alter or select network weights.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import spec from '../../src/ai/weights.js';
import {development,heldOut} from './final-pass-eval.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const load=p=>JSON.parse(read(p));
const lines=p=>read(p).trim().split(/\r?\n/).map(JSON.parse);
const rows=p=>lines(p).filter(r=>r.seed!==undefined);
const final=rows('./results-final.jsonl'),before=rows('./final-pass-before.jsonl'),recovery=rows('./final-pass-recovery.jsonl'),contact=rows('./final-pass-contact.jsonl'),original=rows('./final-pass-original9.jsonl');
const verify=load('./verification-final.json'),freeze=load('./final-pass-freeze.json'),timing=load('./final-pass-timing.json'),frames=load('./trace.json'),grid=load('./grid-final.jsonl'),solo=lines('./solo-final.jsonl').at(-1);
for(const file of ['results-final','final-pass-before','final-pass-recovery','final-pass-contact','final-pass-held-out','final-pass-original9'])assert.equal(lines(`./${file}.jsonl`)[0].simRevision.sha256,verify.simSha256);
assert.equal(freeze.weightSha256,verify.weightSha256);assert.deepEqual(freeze.heldOut,heldOut);
assert.equal(final.length,development.length+heldOut.length);assert.equal(original.length,final.length);
const sum=(rs,f)=>rs.reduce((s,r)=>s+f(r),0),mean=(rs,f)=>sum(rs,f)/rs.length;
// Match bal/sum.mjs: upper middle, per-run rounded progress, flag gaps only.
const med=xs=>xs.length?xs.slice().sort((a,b)=>a-b)[xs.length>>1]:null;
const f=(x,n=3)=>Number.isFinite(x)?x.toFixed(n):'—',pct=(a,b)=>100*(b/a-1),status=b=>b?'PASS':'FAIL';
function metrics(rs){const n=rs.length,L=sum(rs,r=>r.owner.prog),flags=rs.filter(r=>r.owner.flag);return{
 n,flags:flags.length,clocks:rs.filter(r=>!r.owner.flag&&r.raceSeconds>=200).length,attrition:rs.filter(r=>!r.owner.flag&&r.raceSeconds<200).length,
 minT:Math.min(...rs.map(r=>r.owner.T)),medianT:med(rs.map(r=>r.owner.T)),maxT:Math.max(...rs.map(r=>r.owner.T)),meanT:mean(rs,r=>r.raceSeconds),aim:flags.filter(r=>r.raceSeconds>=185&&r.raceSeconds<=195).length,
 minRunning:Math.min(...rs.map(r=>r.owner.run)),running:mean(rs,r=>r.owner.run),gap:med(flags.map(r=>r.owner.gap)),leads:mean(rs,r=>r.owner.leads),
 carLaps:L,open:sum(rs,r=>r.owner.open)/L,hard:sum(rs,r=>r.owner.hard)/L,cross:sum(rs,r=>r.owner.cross)/L,crossLate:sum(rs,r=>r.owner.crossLate)/L,
 openCount:sum(rs,r=>r.owner.open),hardCount:sum(rs,r=>r.owner.hard),crossCount:sum(rs,r=>r.owner.cross),
 stalledCount:sum(rs,r=>r.stalled),stalled:mean(rs,r=>r.stalled),stalledRate:sum(rs,r=>r.stalled)/L,turtled:mean(rs,r=>r.turtled),turtledRate:sum(rs,r=>r.turtled)/L,destroyed:mean(rs,r=>r.ko.destroyed??0),
 stuck:100*sum(rs,r=>r.stuckCarSeconds)/sum(rs,r=>r.liveCarSeconds),longest:Math.max(...rs.map(r=>r.longestStop)),pace:med(rs.map(r=>r.leaderBestLap)),
 fired:mean(rs,r=>r.owner.fired),types:new Set(rs.flatMap(r=>r.weapons.shots.map(s=>s.weapon))).size,
 collect:100*sum(rs,r=>r.crates.collected)/sum(rs,r=>r.crates.empty),liveMiss:100*sum(rs,r=>r.crates.missedLive)/sum(rs,r=>r.crates.empty),walls:sum(rs,r=>r.wallHits)/L,
 slips:100*sum(rs,r=>r.slidingSamples)/sum(rs,r=>r.movingSamples),maxHeld:Math.max(...rs.map(r=>r.weapons.maxHeldNonRoof)),
 rocket:100*sum(rs,r=>r.weapons.rocketDamaging)/Math.max(1,sum(rs,r=>r.weapons.rocketShots)),drops:100*sum(rs,r=>r.weapons.droppedBehind)/Math.max(1,sum(rs,r=>r.weapons.dropped))};}
const groups=[['Development',development],['Fresh held-out',heldOut]].map(([name,seeds])=>({name,seeds,rows:final.filter(r=>seeds.includes(r.seed)),final:metrics(final.filter(r=>seeds.includes(r.seed))),original:metrics(original.filter(r=>seeds.includes(r.seed)))}));
const b=metrics(before),r=metrics(recovery),c=metrics(contact),all=metrics(final);
const summary={simSha256:verify.simSha256,weightSha256:verify.weightSha256,selected:'unchanged pass 2',before:b,recovery:r,contact:c,groups:groups.map(({name,final,original})=>({name,final,original})),all,timing};
writeFileSync(new URL('./final-pass-summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
const finishTable=g=>`| Seed | Original 9 m s/end | Final s/end | Running | Gap m | Leads | Open/hard/cross | Weapons | Stuck % | Stalled/turtled | Crates % |\n|---:|---|---|---:|---:|---:|---|---:|---:|---|---:|\n${g.rows.map(x=>{const o=original.find(a=>a.seed===x.seed),m=x.owner;return`| ${x.seed} | ${f(o.owner.T,1)} ${o.owner.flag?'flag':'CLOCK'} | ${f(m.T,1)} ${m.flag?'flag':x.raceSeconds>=200?'CLOCK':'ATTRITION'} | ${m.run} | ${m.gap??'—'} | ${m.leads} | ${m.open}/${m.hard}/${m.cross} | ${m.fired} | ${f(x.stuckPercent,2)} | ${x.stalled}/${x.turtled} | ${f(x.crates.collectionPercent,1)} |`;}).join('\n')}`;
const comparisons=[['Flag finishes','flags'],['Minimum running at shutdown','minRunning'],['Mean running','running'],['Median seconds','medianT'],['Median flag margin m','gap'],['Lead changes/race','leads'],['Open hits/car-lap','open'],['Hard open hits/car-lap','hard'],['Crossing hits/car-lap','cross'],['Crossing hits on leader laps 1–4/car-lap','crossLate'],['Stalled KOs/race','stalled'],['Stalled KOs/car-lap','stalledRate'],['Turtled KOs/car-lap','turtledRate'],['Stuck %','stuck'],['Weapons/race','fired'],['Crate collection %','collect'],['Wall events/car-lap','walls'],['Median leader best lap s','pace']];
const groupTable=g=>`| Metric | Original policy / 9 m / applied balance | Final / 14 m / applied balance |\n|---|---:|---:|\n${comparisons.map(([n,k])=>`| ${n} | ${f(g.original[k])} | ${f(g.final[k])} |`).join('\n')}`;
const acceptance=g=>{const a=g.original,m=g.final;return[
 ['All flags below 200 s',`${m.flags}/${m.n}, ${m.clocks} clocks; ${status(m.flags===m.n&&m.maxT<200)}`],
 ['185–195 s aim',`${m.aim}/${m.n}; range ${f(m.minT,1)}–${f(m.maxT,1)} s`],
 ['At least two running every race',`${m.minRunning} minimum at shutdown; ${status(m.minRunning>=2)} (clock finishes still fail above)`],
 ['Flag margin no worse than original',`${a.gap} → ${m.gap} m; ${status(m.gap<=a.gap)}`],
 ['Lead changes at least original',`${f(a.leads,2)} → ${f(m.leads,2)}; ${status(m.leads>=a.leads)}`],
 ['Open contact at least halved',`${f(pct(a.open,m.open),1)}%; ${status(m.open<=a.open/2)}`],
 ['Hard open contact at least halved',`${f(pct(a.hard,m.hard),1)}%; ${status(m.hard<=a.hard/2)}`],
 ['Later crossing rate not lower',`${f(a.crossLate)} → ${f(m.crossLate)}; ${status(m.crossLate>=a.crossLate)}`],
 ['Pace loss at most 2%',`${f(a.pace)} → ${f(m.pace)} s median leader best; ${status(m.pace<=a.pace*1.02)}`],
 ['Stuck / stalled / turtled rates no worse',`${status(m.stuck<=a.stuck)} / ${status(m.stalledRate<=a.stalledRate)} / ${status(m.turtledRate<=a.turtledRate)}`],
 ['All eleven weapons used',`${m.types}/11; ${status(m.types===11)}`],
 ['Crates (historical 65% target)',`${f(m.collect,2)}% collected, ${f(m.liveMiss,2)}% live misses; ${status(m.collect>=65)}`]
 ];};
let core=read('./road-pass2/NEURAL_NETWORK.md');core=core.slice(core.indexOf('## Runtime boundary'),core.indexOf('## Worked forward pass'));
core=core.replace('produces no >10° slides in the current unarmed solo',`produces only ${f(solo.unarmed.movingSlipPercent,3)}% >10° sliding in the current unarmed solo`);
core=core.replace('Clay grip 2.2 gives feed-forward brake 7.0875/(2.2*9.81)≈.328399.',`Current clay grip 2.3 gives feed-forward brake 7.0875/(2.3*9.81)≈${f(7.0875/(2.3*9.81),9)}.`);
core=core.replace('mud .85, clay 1.1, asphalt 1.25','mud .885, clay 1.15, asphalt 1.3');
core=core.replace(/Observed maximum non-roof hold is [^\n]+/,`Observed maximum non-roof hold is ${f(all.maxHeld)} s. The historical 20 s target is not guaranteed. Trigger circuits were not changed in this pass.`);
core=core.replace(/the current maximum non-roof hold is [0-9.]+ s\./,`the current maximum non-roof hold is ${f(all.maxHeld)} s.`);
const traceNames=['openRoad','follow0.closing','follow0.gap','follow0.clearance','follow0.safeRoot','follow0.valid','follow0.speedCap','trafficSpeedLimit','freeDesiredSpeed','desiredSpeed','freePass','returnBlocked','requestedOffset','passOffset','physicalGrip','steer','throttle','brake'];
const trace=frames[0].activations.filter(a=>traceNames.includes(a.name));
const doc=`# The Knot: directly programmed racing and weapon conflict

This network is a program written into weights. Racing-line pursuit and slip/yaw feedback become arithmetic neurons; comparisons and winner-take-all circuits select passing space, trigger weapons and choose recovery manoeuvres. Recurrent neurons remember grudges, rage, offsets and timers. One generic forward pass controls every car. No training, fitting, parameter sweep or policy code outside the network is used.

## Final status on the applied balance

**The complete target is not met. The deployed weights are unchanged from pass 2.** This bounded final pass measured one recovery repair and one independent contact attempt. Both lost three flag finishes on the 28 development seeds, so both were rejected under the flag-first priority. Neither candidate is represented as shipped. No further behaviour tuning followed the freeze.

The simulator now has DAMAGE.scale=.00464, weapon damage/goreDamage at 80% of the prior values, and grip clay/asphalt/mud=2.3/2.6/1.77. Five laps, a 200 s backstop and the 14 m grid remain. These changes belong to the parent. **No simulator file was edited here.** The repaired parent physics reference-driver test also passes.

| Target | 28 development seeds | Ten fresh held-outs |
|---|---|---|
${acceptance(groups[0]).map(([n,x],k)=>`| ${n} | ${x} | ${acceptance(groups[1])[k][1]} |`).join('\n')}

The final policy is byte-identical to the before checkpoint, so the final pass introduces no driving, weapon, crate or graph-cost regression relative to that checkpoint. That is not an improvement claim: stalled KOs remain ${f(b.stalled,3)}/race on development and ${f(groups[1].final.stalled,3)}/race on held-outs. Across all 38 races, ${all.flags} finish by laps and ${all.clocks} hit the clock. Total physical recovery is still not bounded by the network.

${core}

## Worked forward pass on the final graph

The first trace is a grounded car at 20 m/s on current clay (surfaceGrip input 1.15), approaching a parallel rival at 16 m/s seven metres ahead, with no nearby lip or crossing. Closing c=4; required gap=5.5+.25×4+4²/16=7.5 m. Available clearance is 1.5 m. Solving .25c+c²/16=1.5 gives safeClosing=sqrt(28)−2=3.291502622 m/s. Its cap is (16+3.291502622)/40=.482287566, below free pace .7×.9=.63. Speed error is −.017712434; brake=14×.017712434≈.247974082. The next free pace is higher, so feed-forward brake contributes zero. The usable left lane requests −3 m; its first filtered offset is −.4 m. The elbow is off. Float32 inputs explain the small numeric differences below.

| Neuron | ID | Activation |
|---|---:|---:|
${trace.map(a=>`| ${a.name} | ${a.id} | ${f(a.value,9)} |`).join('\n')}

Steer/throttle/brake/handbrake/reverse/fire = ${frames[0].action.map(x=>f(x,9)).join(' / ')}. All ${frames.length} trace frames carry complete observations and initial/next recurrence. The generated neuron map supplies every affine row, activation, layer range and consumer.

## Final bounded edit log and diagnosis

The before measurement exactly reproduces the parent's applied-balance result: 26/28 flags, 25 stalled KOs, 98 lead changes, 1423 open hits, 951 hard open hits and 236 crossings over 1118.7 rounded car-laps. The literal parent run.mjs and the new owner-metrics observer agree on **every output field** for seed 1; owner-check.jsonl is the independent run. The final report uses that definition, not the older landing-excluding contact category.

The six reported seeds contain 14 stalled cars. Read-only decision traces in stall-before.jsonl expose three specific weaknesses:

- Seed 6007 cars 5 and 7 face almost backwards, accelerate above the 3 m/s recovery-entry ceiling and lose approximately 108 and 91 route metres. Existing route debt applies only after recovery has entered, so it cannot catch this earlier loss.
- Seed 8123 car 7 stops at s≈868.4 with about 49° heading error. Nose rays are 7.5/3.3/45 m, outside the 3.2 m detector; the +32° ray is 2.1 m. The front corner is blocked despite forwardBlocked=0. It does not integrate recovery evidence.
- Seed 2309 cars 1 and 8 spend much of their final recovery on oil. The gear/turn circuit asks for full lock, but the final oil clamp permits only ±.25, delaying reorientation. Other examples involve repeated contact, clearance/re-entry cycles and route debt after crossing disruption; the three identified defects do not explain every failure.

| Checkpoint | Derived changes | Why it was rejected or retained |
|---|---|---|
| Recovery attempt, 4167 units / 7916 edges | Reuse the .5 s entry integral for backward-facing route velocity below −.5 m/s even above 3 m/s. Add ±32° corner-ray threshold (1/sin32°+.5)/45, from one-metre half-width plus .5 m margin. Permit full lock during oil recovery with speed cap 2.5 m/s: about 1.5 m/s² at a 4.17 m radius, below nominal .2g oil grip; multiply recovery speed by 1.6. No new state. | Stalled KOs 25→15 and stuck ${f(b.stuck)}→${f(r.stuck)}%, but flags 26→23. Reverted all three changes. The six reported seeds fall from 14 to 3 stalled cars in this candidate, but that does not outweigh failed races. |
| One contact attempt, 4204 units / 7986 edges | Starting again from the retained baseline, permit the existing closing-speed cap inside crossing windows only for nearly parallel traffic: heading dot≥.9 means ≤25.84°, separating it from 60° cross traffic. Preserve lip/landing and actual cross-traffic exemptions. No changed following gains or new state. | Flags 26→23, leads 98→96; open contact ${f(b.open)}→${f(c.open)}/car-lap. Failed the explicit guard; reverted. |
| Final retained graph, 4155 units / 7896 edges | Byte-identical pass 2; no new behaviour circuits. | Best flag count among the two explicitly authorized attempts and before policy. No automated selection loop, constant sweep or further tuning. |
| Simulator refresh | Re-run results and historical checkpoints; rocket test now requires damage >.65×configured rocket damage, retaining roughly the old fractional bound. Actual fixture damage is .078540162 with wheel loss and exactly one attributed damaging shot; the 3 m fly-by still deals zero. Historical no-crates KOs change from 7 to 6; before-review remains 8. | Current no-crates seed 1 finishes with ${grid.current.koTotal} KOs and ${grid.current.stalled} stalled. Flag and no-worse KO/stalled requirements remain. |
| Metric regression | Add independent cases for same-strand packs, strict 25 m/60 m boundaries, abs heading dot and 24-step lead sampling after 10 s. | All tests pass. No policy inputs or actions are changed by an observer. |

The contact attribution sample was fixed to seeds 1/7/42/4801 before that one attempt. It contains 184 owner-open events, 118 hard. At .63 s before the hard contacts, only 28 of 236 car-side snapshots enabled openRoad; 112 cleared the crossing-distance predicate. This is evidence of a broad exemption, not proof that extending braking will improve races. The failed attempt supplies the counterexample. Candidate JSON tensors, construction snapshots and full 28-seed results remain in tools/nn; they are not imported by the shipped brain. Earlier edit logs are archived in road-pass2/NEURAL_NETWORK.md and road-pass1/NEURAL_NETWORK.md.

| Applied-balance 28-seed measurement | Before / retained final | Recovery attempt | Contact attempt |
|---|---:|---:|---:|
${comparisons.map(([n,k])=>`| ${n} | ${f(b[k])} | ${f(r[k])} | ${f(c[k])} |`).join('\n')}

## Measurement definitions and isolation

Primary metrics reproduce scratchpad/bal/run.mjs and sum.mjs. A hit is crossing only when **both** cars are strictly within 25 circular route metres of one of [79,129,466,516,799,850], abs(Ra[0]Rb[0]+Ra[6]Rb[6])<.8, and abs(progressA−progressB)>60 m. This intentionally keeps the owner's unnormalised horizontal heading dot. Every other hit, **including jump landings**, is open. Hard open means closing>6 m/s. Classification uses car state immediately after the physics step. The older generated-crossing/landing categories remain supplemental and never replace these totals.

Exposure is sum(max(0,creditedProgress))/trackLength, rounded to one decimal **per race** before pooling. It does not subtract starting grid offsets. Lead changes sample running cars every 24 physics steps, start counting after race second 10, and exclude the finished phase. Median is the sorted upper-middle element for even sample counts. Flag gaps include flag finishes only. Per-seed gaps at clock shutdown are labelled as such by the end column. Stuck remains running speed<3 m/s after second five. Later-crossing rates count leader laps 1–4 with the same total car-lap denominator.

The historical-policy replay uses pre-open-road.json and the old 9 m grid by replacing only ROW_GAP=14→9 and SPAWN_LAST_ROW_S=−32→−2 in an **in-memory import** of world.js. All balance values are the newly applied values. No simulator file is written. It measures combined network/grid differences on common balance; it cannot isolate those two effects. The parent's earlier old-balance baseline (22/28 flags, open 1.570, hard .994, cross .183) is historical context, not silently mixed into the new controlled columns.

Development seeds: ${development.join(', ')}. These 28 have all been inspected. Final freeze: ${freeze.time}, before any race on ${heldOut.join(', ')}. Those ten are the fresh held-out set. Historical-policy replays on them occurred only after freeze; no policy decision was changed after seeing them. Because the retained tensor equals the before tensor byte for byte, the applied-balance before results are also the final development results; rerunning an identical deterministic race is unnecessary.

### Development comparison

${groupTable(groups[0])}

### Fresh held-out comparison

${groupTable(groups[1])}

## Finish tables

### All 28 development seeds

${finishTable(groups[0])}

### Ten fresh held-outs

${finishTable(groups[1])}

## Verification, exactness and remaining limits

${verify.testsPassed}/${verify.testsTotal} tests pass, including ${verify.neuralTests} neural/evaluation tests. Construction regenerates weights byte for byte; both rejected construction snapshots also regenerate their checkpoint tensors exactly without writing deployed weights. ${verify.traceFrames} frames and ${verify.traceActivations} saved activations replay exactly. Browser ESM bundle: ${verify.browserBundleBytes} bytes. No runtime/wrapper changes, per-call allocation, simulator edits, training, fitting or parameter search were introduced.

Twelve production act calls: ${f(timing.final.meanMs)} ms mean, ${f(timing.final.p95Ms)} ms p95, ${f(timing.final.maxMs)} ms maximum over 10000 batches. Mean/p95 are under 2 ms; the observed maximum is not. Before/final graph bytes are identical, so there is no added neural work in this pass. The historical pre-open-road graph is smaller and measures ${f(timing.preOpenRoad.meanMs)} ms mean; the old literal no-increase target versus that graph is still unmet. Sample timing includes host scheduling/GC and is not a worst-case execution-time proof.

Affine arithmetic, Boolean gates, stable WTA, clipped recurrences and square-product multiplication are exact identities over their declared real domains. Float32 inputs and Float64 runtime introduce tested numeric error. Pursuit, friction allowances, local body/ray corridors, passing and recovery geometry remain approximations or explicit heuristics. Fixed race seeds are observations, not guarantees; random circuit interiors verify equations and never choose weights.

The mechanical recovery defects above remain in the deployed graph because the tested repair cost flags. Oil recovery can be too slow, front-corner obstacles can be missed, and a fast wrong-way car can defer entry until it has lost too much route. Collision disruption and route-credit debt can still defeat the 12 s stall rule. The attempted same-strand crossing braking did not reduce total open contact enough and also lost flags/lead changes, so the broad crossing exemption remains. The half-contact goal is not met. This pass recommends no further balance or network tuning.

All eleven weapons are used in both reported sets. Across 38 final races, mean fired=${f(all.fired,2)}, rocket damaging shots=${f(all.rocket,2)}%, tail-qualified drops=${f(all.drops,2)}%, maximum non-roof hold=${f(all.maxHeld)} s, crates collected=${f(all.collect,2)}% and live misses=${f(all.liveMiss,2)}%. The old 20 s hold and 65% collection targets are not implied by the new acceptance table. Field slip>10° is ${f(all.slips,2)}% of moving samples, while solo unarmed slip is only ${f(solo.unarmed.movingSlipPercent,3)}%; contact/weapon sliding is not proof of stylish solo drifting. Solo best lap=${f(solo.unarmed.winnerBestLap)} s unarmed and ${f(solo.network.winnerBestLap)} s armed.

Reproduce with final-pass-eval.mjs before/final/original9 and explicit seeds; rejected tensor checkpoints may be evaluated by their JSON basename. Then run node --test, inspect.mjs, verify.mjs and document.mjs. results-final.jsonl, final-pass-summary.json, final-pass-freeze.json and final-pass-timing.json are the current report artifacts. Other archived result files describe explicitly named earlier checkpoints.

Simulator SHA-256: ${verify.simSha256}. Weights SHA-256: ${verify.weightSha256}. Final architecture: ${spec.layers.length-1} layers, ${spec.biases.length} units, ${spec.weights.length} edges, ${spec.weights.length+spec.biases.length} parameters, ${spec.stateOutputs.length} recurrent states, 277 observations and six actions. No files outside the authorized AI/tools/neural-test/neural-documentation paths were changed.
`;
writeFileSync(new URL('../../docs/NEURAL_NETWORK.md',import.meta.url),doc);
const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;color:#ddd;background:#16191f;margin:20px}h3{font-size:16px}.row{display:grid;grid-template-columns:160px 1fr 70px;gap:12px;margin:12px 0;align-items:center}.bar{height:16px;background:#dd9863}.keep{background:#73b9a7}.small{font-size:12px;color:#b9c1cd}</style></head><body><h3>Flag finishes on the 28 development seeds</h3>${[['Retained policy',b.flags,true],['Recovery attempt',r.flags,false],['Contact attempt',c.flags,false]].map(([n,v,keep])=>`<div class="row"><span>${n}</span><div class="bar ${keep?'keep':''}" style="width:${v/28*100}%"></div><span>${v}/28</span></div>`).join('')}<p class="small">Both attempts were rejected. The frozen retained policy finished ${groups[1].final.flags}/10 fresh held-out races; ${groups[1].final.clocks} reached the clock. All-flags and half-contact targets remain unmet.</p></body></html>`;
writeFileSync(new URL('./report-final.html',import.meta.url),html);
console.log(JSON.stringify(summary));
