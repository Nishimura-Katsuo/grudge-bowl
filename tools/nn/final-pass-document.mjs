// Reporting only. These calculations cannot alter or select network weights.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import spec from '../../src/ai/weights.js';
import {development,heldOut,ownerAdded} from './final-pass-eval.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const load=p=>JSON.parse(read(p));
const lines=p=>read(p).trim().split(/\r?\n/).map(JSON.parse);
const rows=p=>lines(p).filter(r=>r.seed!==undefined);
const final=rows('./results-final.jsonl'),before=rows('./final-pass-before.jsonl'),recovery=rows('./final-pass-recovery.jsonl'),contact=rows('./final-pass-contact.jsonl'),original=rows('./final-pass-original9.jsonl');
const verify=load('./verification-final.json'),freeze=load('./final-pass-freeze.json'),timing=load('./final-pass-timing.json'),frames=load('./trace.json'),grid=load('./grid-final.jsonl'),solo=lines('./solo-final.jsonl').at(-1);
const refresh=load('./finish-line-manifest.json');
for(const file of ['results-final','final-pass-original9'])assert.equal(lines(`./${file}.jsonl`)[0].simRevision.sha256,verify.simSha256);
for(const file of ['final-pass-before','final-pass-recovery','final-pass-contact'])assert.equal(lines(`./${file}.jsonl`)[0].simRevision.sha256,freeze.simRevision.sha256);
assert.equal(refresh.simRevision.sha256,verify.simSha256);assert.equal(refresh.weightSha256,verify.weightSha256);
assert.equal(freeze.weightSha256,verify.weightSha256);assert.deepEqual(freeze.heldOut,heldOut);
assert.equal(final.length,development.length+heldOut.length+ownerAdded.length);assert.equal(original.length,final.length);
assert.deepEqual(final.map(r=>r.seed),refresh.seeds);assert.deepEqual(original.map(r=>r.seed),refresh.seeds);
const ownerRows=rows('./owner-final-50.jsonl');assert.equal(ownerRows.length,final.length);
for(const external of ownerRows){const measured=final.find(r=>r.seed===external.seed).owner;for(const [key,value] of Object.entries(external))assert.deepEqual(measured[key]??measured.kos[key]??0,value,`Owner metric mismatch ${external.seed}:${key}`);}
const sum=(rs,f)=>rs.reduce((s,r)=>s+f(r),0),mean=(rs,f)=>sum(rs,f)/rs.length;
// Match bal/sum.mjs: upper middle, per-run rounded progress, flag gaps only.
const med=xs=>xs.length?xs.slice().sort((a,b)=>a-b)[xs.length>>1]:null;
const f=(x,n=3)=>Number.isFinite(x)?x.toFixed(n):'—',pct=(a,b)=>100*(b/a-1),status=b=>b?'PASS':'FAIL';
const fullLap=r=>Math.min(...r.lapTimes.filter(l=>l.car===r.winnerId&&l.lap>=2).map(l=>l.seconds));
function metrics(rs){const n=rs.length,L=sum(rs,r=>r.owner.prog),flags=rs.filter(r=>r.owner.flag);return{
 n,flags:flags.length,clocks:rs.filter(r=>!r.owner.flag&&r.raceSeconds>=200).length,attrition:rs.filter(r=>!r.owner.flag&&r.raceSeconds<200).length,
 minT:Math.min(...rs.map(r=>r.owner.T)),medianT:med(rs.map(r=>r.owner.T)),maxT:Math.max(...rs.map(r=>r.owner.T)),maxRawT:Math.max(...rs.map(r=>r.raceSeconds)),meanT:mean(rs,r=>r.raceSeconds),aim:flags.filter(r=>r.raceSeconds>=185&&r.raceSeconds<=195).length,
 minRunning:Math.min(...rs.map(r=>r.owner.run)),running:mean(rs,r=>r.owner.run),gap:med(flags.map(r=>r.owner.gap)),closeFlags:flags.filter(r=>r.owner.gap!==null&&r.owner.gap<=60).length,leads:mean(rs,r=>r.owner.leads),
 carLaps:L,open:sum(rs,r=>r.owner.open)/L,hard:sum(rs,r=>r.owner.hard)/L,cross:sum(rs,r=>r.owner.cross)/L,crossLate:sum(rs,r=>r.owner.crossLate)/L,
 openCount:sum(rs,r=>r.owner.open),hardCount:sum(rs,r=>r.owner.hard),crossCount:sum(rs,r=>r.owner.cross),
 stalledCount:sum(rs,r=>r.stalled),stalled:mean(rs,r=>r.stalled),stalledRate:sum(rs,r=>r.stalled)/L,turtled:mean(rs,r=>r.turtled),turtledRate:sum(rs,r=>r.turtled)/L,destroyed:mean(rs,r=>r.ko.destroyed??0),
 stuck:100*sum(rs,r=>r.stuckCarSeconds)/sum(rs,r=>r.liveCarSeconds),longest:Math.max(...rs.map(r=>r.longestStop)),pace:med(rs.map(fullLap)),
 fired:mean(rs,r=>r.owner.fired),types:new Set(rs.flatMap(r=>r.weapons.shots.map(s=>s.weapon))).size,
 collect:100*sum(rs,r=>r.crates.collected)/sum(rs,r=>r.crates.empty),liveMiss:100*sum(rs,r=>r.crates.missedLive)/sum(rs,r=>r.crates.empty),walls:sum(rs,r=>r.wallHits)/L,
 slips:100*sum(rs,r=>r.slidingSamples)/sum(rs,r=>r.movingSamples),maxHeld:Math.max(...rs.map(r=>r.weapons.maxHeldNonRoof)),
 rocket:100*sum(rs,r=>r.weapons.rocketDamaging)/Math.max(1,sum(rs,r=>r.weapons.rocketShots)),drops:100*sum(rs,r=>r.weapons.droppedBehind)/Math.max(1,sum(rs,r=>r.weapons.dropped))};}
const groups=[['Development',development],['Previous held-out',heldOut],['Owner-added',ownerAdded]].map(([name,seeds])=>({name,seeds,rows:final.filter(r=>seeds.includes(r.seed)),final:metrics(final.filter(r=>seeds.includes(r.seed))),original:metrics(original.filter(r=>seeds.includes(r.seed)))}));
const b=metrics(before),r=metrics(recovery),c=metrics(contact),all=metrics(final);
const allGroup={name:'All 50',rows:final,final:all,original:metrics(original)};
const summary={simSha256:verify.simSha256,weightSha256:verify.weightSha256,selected:'unchanged pass 2',finishLine:refresh.finishLine,gridLine:refresh.gridLine,ownerMetricMatches:ownerRows.length,historicalAttempts:{simSha256:freeze.simRevision.sha256,before:b,recovery:r,contact:c},groups:groups.map(({name,final,original})=>({name,final,original})),all,allOriginal:allGroup.original,timing};
writeFileSync(new URL('./final-pass-summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
const csvFields=['seed','T','flag','run','gap','leads','fired','open','hard','cross','prog','turtled','destroyed','stalled'];
const csv=['policy,'+csvFields.join(',')+',winnerBestFullLap,leaderBestFullLap'];
for(const seed of refresh.seeds)for(const [policy,data] of [['original9',original],['final14',final]]){const row=data.find(r=>r.seed===seed),m=row.owner;csv.push(policy+','+csvFields.map(k=>m[k]??m.kos[k]??(k==='gap'?'':0)).join(',')+','+(row.winnerBestLap??'')+','+(row.leaderBestLap??''));}
writeFileSync(new URL('./finish-line-50.csv',import.meta.url),csv.join('\n')+'\n');
const finishTable=g=>`| Seed | Original 9 m s/end | Final s/end | Running old→final | Gap m old→final | Leads old→final | Open/hard/cross old→final | Best full lap old→final s | Weapons | Stuck % | Stalled/turtled | Crates % |\n|---:|---|---|---|---|---|---|---|---:|---:|---|---:|\n${g.rows.map(x=>{const o=original.find(a=>a.seed===x.seed),m=x.owner,a=o.owner;return`| ${x.seed} | ${f(a.T,1)} ${a.flag?'flag':o.raceSeconds>=200?'CLOCK':'ATTRITION'} | ${f(m.T,1)} ${m.flag?'flag':x.raceSeconds>=200?'CLOCK':'ATTRITION'} | ${a.run}→${m.run} | ${a.gap??'—'}→${m.gap??'—'} | ${a.leads}→${m.leads} | ${a.open}/${a.hard}/${a.cross}→${m.open}/${m.hard}/${m.cross} | ${f(o.winnerBestLap,3)}→${f(x.winnerBestLap,3)} | ${m.fired} | ${f(x.stuckPercent,2)} | ${x.stalled}/${x.turtled} | ${f(x.crates.collectionPercent,1)} |`;}).join('\n')}`;
const comparisons=[['Flag finishes','flags'],['Minimum running at shutdown','minRunning'],['Mean running','running'],['Median seconds','medianT'],['Median flag margin m','gap'],['Lead changes/race','leads'],['Open hits/car-lap','open'],['Hard open hits/car-lap','hard'],['Crossing hits/car-lap','cross'],['Crossing hits on leader laps 1–4/car-lap','crossLate'],['Stalled KOs/race','stalled'],['Stalled KOs/car-lap','stalledRate'],['Turtled KOs/car-lap','turtledRate'],['Stuck %','stuck'],['Weapons/race','fired'],['Crate collection %','collect'],['Wall events/car-lap','walls'],['Median winner best complete lap s','pace']];
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
 ['Pace loss at most 2%',`${f(a.pace)} → ${f(m.pace)} s median winner best complete lap; ${status(m.pace<=a.pace*1.02)}`],
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

**The deployed weights are unchanged from pass 2.** This shipping-review refresh includes the final simulator fixes and repairs the best-lap measurement: the shortened opening lap can no longer satisfy a full-lap pace floor. The earlier recovery and contact attempts remain rejected: each lost three flag finishes on the previous finish-line revision. No construction or driving behaviour was changed here. The measured shipping limits and remaining historical targets are reported below.

The simulator now has DAMAGE.scale=.00464, weapon damage/goreDamage at 80% of the prior values, and grip clay/asphalt/mud=2.3/2.6/1.77. The race is five laps with a 200 s backstop and the 14 m grid. FINISH_LINE_S=1030 governs credited laps; GRID_LINE_S=52 is a painted grid marker only. The first lap is short: on the approximately 1152 m route, moving the counting line adds about 174 m of initial credited progress and removes about 174 m of required driving from every grid slot. Four subsequent laps are full route lengths. Initial raceDone changes, but no neural weights or dynamics were changed here. These changes belong to the parent. **No simulator file was edited here.** The repaired parent physics reference-driver test also passes.

| Target | All 50 seeds |
|---|---|
${acceptance(allGroup).map(([n,x])=>`| ${n} | ${x} |`).join('\n')}

The final simulator also bounds the Grudge Seeker's angular turn rate, including a target directly astern; crate pickup requires vertical reach of 2.6 m, Whirl requires vertical overlap within 2.4 m, and Prize Bull within 2.6 m. creditHit ignores victims already at zero health, preventing a later zero-damage touch from taking knockout credit. Sensor layout and weights are unchanged.

The policy is byte-identical to the before checkpoint; race differences from the preceding report arise from these simulator fixes. Across all 50 races, ${all.flags} finish by laps and ${all.clocks} hit the clock. Race seconds are ${f(all.minT,1)}/${f(all.medianT,1)}/${f(all.maxT,1)} min/median/max; minimum running is ${all.minRunning}; median flag gap is ${all.gap} m and ${all.closeFlags} flag finishes are within 60 m. Stalled KOs are ${f(all.stalled,3)}/race. Total physical recovery is still not bounded by the network. All 50 rows agree field for field with a fresh execution of the owner's comparison script. The displayed maximum is ${f(all.maxT,1)} s; the raw maximum is ${f(all.maxRawT,3)} s, one 240 Hz step past the 200 s clock threshold. A literal ≤200 s raw limit therefore ${all.maxRawT<=200?'passes':'fails by that step'}. At least two running is ${status(all.minRunning>=2)}. Flag finishes are ${all.flags}/50 against the approximately 48/50 expectation: ${status(all.flags>=48)}. Clock seeds: ${final.filter(x=>!x.finishedByLaps).map(x=>x.seed).join(', ')}. No weights were changed in response.

${core}

## Worked forward pass on the final graph

The first trace is a grounded car at 20 m/s on current clay (surfaceGrip input 1.15), approaching a parallel rival at 16 m/s seven metres ahead, with no nearby lip or crossing. Closing c=4; required gap=5.5+.25×4+4²/16=7.5 m. Available clearance is 1.5 m. Solving .25c+c²/16=1.5 gives safeClosing=sqrt(28)−2=3.291502622 m/s. Its cap is (16+3.291502622)/40=.482287566, below free pace .7×.9=.63. Speed error is −.017712434; brake=14×.017712434≈.247974082. The next free pace is higher, so feed-forward brake contributes zero. The usable left lane requests −3 m; its first filtered offset is −.4 m. The elbow is off. Float32 inputs explain the small numeric differences below.

| Neuron | ID | Activation |
|---|---:|---:|
${trace.map(a=>`| ${a.name} | ${a.id} | ${f(a.value,9)} |`).join('\n')}

Steer/throttle/brake/handbrake/reverse/fire = ${frames[0].action.map(x=>f(x,9)).join(' / ')}. All ${frames.length} trace frames carry complete observations and initial/next recurrence. The generated neuron map supplies every affine row, activation, layer range and consumer.

## Historical rejected attempts and current refresh

On the previous counting-line revision (simulator ${freeze.simRevision.sha256}), the before measurement exactly reproduces the parent's applied-balance result: 26/28 flags, 25 stalled KOs, 98 lead changes, 1423 open hits, 951 hard open hits and 236 crossings over 1118.7 rounded car-laps. That historical seed-1 cross-check is preserved in owner-check.jsonl. The current refresh independently checks all 50 seeds in owner-final-50.jsonl. The final report uses that definition, not the older landing-excluding contact category.

Those historical six reported seeds contain 14 stalled cars. Read-only decision traces in stall-before.jsonl expose three specific weaknesses:

- Seed 6007 cars 5 and 7 face almost backwards, accelerate above the 3 m/s recovery-entry ceiling and lose approximately 108 and 91 route metres. Existing route debt applies only after recovery has entered, so it cannot catch this earlier loss.
- Seed 8123 car 7 stops at s≈868.4 with about 49° heading error. Nose rays are 7.5/3.3/45 m, outside the 3.2 m detector; the +32° ray is 2.1 m. The front corner is blocked despite forwardBlocked=0. It does not integrate recovery evidence.
- Seed 2309 cars 1 and 8 spend much of their final recovery on oil. The gear/turn circuit asks for full lock, but the final oil clamp permits only ±.25, delaying reorientation. Other examples involve repeated contact, clearance/re-entry cycles and route debt after crossing disruption; the three identified defects do not explain every failure.

| Checkpoint | Derived changes | Why it was rejected or retained |
|---|---|---|
| Recovery attempt, 4167 units / 7916 edges | Reuse the .5 s entry integral for backward-facing route velocity below −.5 m/s even above 3 m/s. Add ±32° corner-ray threshold (1/sin32°+.5)/45, from one-metre half-width plus .5 m margin. Permit full lock during oil recovery with speed cap 2.5 m/s: about 1.5 m/s² at a 4.17 m radius, below nominal .2g oil grip; multiply recovery speed by 1.6. No new state. | Stalled KOs 25→15 and stuck ${f(b.stuck)}→${f(r.stuck)}%, but flags 26→23. Reverted all three changes. The six reported seeds fall from 14 to 3 stalled cars in this candidate, but that does not outweigh failed races. |
| One contact attempt, 4204 units / 7986 edges | Starting again from the retained baseline, permit the existing closing-speed cap inside crossing windows only for nearly parallel traffic: heading dot≥.9 means ≤25.84°, separating it from 60° cross traffic. Preserve lip/landing and actual cross-traffic exemptions. No changed following gains or new state. | Flags 26→23, leads 98→96; open contact ${f(b.open)}→${f(c.open)}/car-lap. Failed the explicit guard; reverted. |
| Final retained graph, 4155 units / 7896 edges | Byte-identical pass 2; no new behaviour circuits. | Best flag count among the two explicitly authorized attempts and before policy. No automated selection loop, constant sweep or further tuning. |
| Earlier balance refresh (historical test changes) | Re-run results and historical checkpoints; rocket test now requires damage >.65×configured rocket damage, retaining roughly the old fractional bound. Actual fixture damage is .078540162 with wheel loss and exactly one attributed damaging shot; the 3 m fly-by still deals zero. Historical no-crates KOs change from 7 to 6; before-review remains 8. | On the current simulator, no-crates seed 1 finishes with ${grid.current.koTotal} KOs and ${grid.current.stalled} stalled. Flag and no-worse KO/stalled requirements remain. |
| Earlier metric regression | Add independent cases for same-strand packs, strict 25 m/60 m boundaries, abs heading dot and 24-step lead sampling after 10 s. | All tests pass. No policy inputs or actions are changed by an observer. |
| Finish-line refresh | Rerun all 50 seeds and original-policy comparison on FINISH_LINE_S=1030, verify all rows against the literal owner script, regenerate traces/map/docs. | No weights, construction logic or test assertions changed. The complete test suite passes unchanged. |
| Shipping-review refresh | Gate all evaluation best-lap minima on lap number≥2, retaining lap 1 in the lap-event record and as the timestamp anchor for lap 2. Re-run the current simulator, whose seeker, vertical interaction and knockout-credit fixes belong to the parent. | A deliberately faulty .8 pace-share clone has a short opening lap below 37 s but every complete lap above 38 s; its winner and leader minima now fail the 37 s pace floor. One-lap-only races report null best laps. Production weights are unchanged. |

The contact attribution sample was fixed to seeds 1/7/42/4801 before that one attempt. It contains 184 owner-open events, 118 hard. At .63 s before the hard contacts, only 28 of 236 car-side snapshots enabled openRoad; 112 cleared the crossing-distance predicate. This is evidence of a broad exemption, not proof that extending braking will improve races. The failed attempt supplies the counterexample. Candidate JSON tensors, construction snapshots and full 28-seed results remain in tools/nn; they are not imported by the shipped brain. Earlier edit logs are archived in road-pass2/NEURAL_NETWORK.md and road-pass1/NEURAL_NETWORK.md.

| Historical 28-seed measurement, before the finish-line move | Before / retained policy | Recovery attempt | Contact attempt |
|---|---:|---:|---:|
${comparisons.map(([n,k])=>`| ${n} | ${f(b[k])} | ${f(r[k])} | ${f(c[k])} |`).join('\n')}

## Measurement definitions and isolation

Primary metrics reproduce the owner's comparison definition in [owner-metrics.mjs](../tools/nn/owner-metrics.mjs). A hit is crossing only when **both** cars are strictly within 25 circular route metres of one of [79,129,466,516,799,850], abs(Ra[0]Rb[0]+Ra[6]Rb[6])<.8, and abs(progressA−progressB)>60 m. This intentionally keeps the owner's unnormalised horizontal heading dot. Every other hit, **including jump landings**, is open. Hard open means closing>6 m/s. Classification uses car state immediately after the physics step. The older generated-crossing/landing categories remain supplemental and never replace these totals.

Exposure is sum(max(0,creditedProgress))/trackLength, rounded to one decimal **per race** before pooling. It does not subtract starting grid offsets, including the positive starting credit introduced by the new finish. Lead changes sample running cars every 24 physics steps, start counting after race second 10, and exclude the finished phase. Median is the sorted upper-middle element for even sample counts. Flag gaps include flag finishes only. Per-seed gaps at clock shutdown are labelled as such by the end column. Stuck remains running speed<3 m/s after second five. Later-crossing rates count leader laps 1–4 with the same total car-lap denominator. Complete-lap pace compares each winning car's best lap numbered 2 or later, excluding the short opening lap.

The historical-policy replay uses pre-open-road.json and the old 9 m grid by replacing only ROW_GAP=14→9 and SPAWN_LAST_ROW_S=−32→−2 in an **in-memory import** of world.js. Both comparison columns use the current finish at s=1030 and the applied balance. No simulator file is written. It measures combined network/grid differences on common balance; it cannot isolate those two effects. The parent's earlier old-balance baseline (22/28 flags, open 1.570, hard .994, cross .183) is historical context, not silently mixed into the new controlled columns.

Development seeds: ${development.join(', ')}. The ten previous held-outs are ${heldOut.join(', ')}; they were first measured after the original weight freeze at ${freeze.time}, but are now known. The twelve owner-added seeds are ${ownerAdded.join(', ')}; the owner had already inspected them. No group is advertised as newly blind in this refresh. Refresh manifest time: ${refresh.time}. Every final-policy and original-policy race was rerun against the current simulator. The rejected attempts were not rerun or reconsidered; their results remain historical evidence.

### Development comparison

${groupTable(groups[0])}

### Previous held-out comparison

${groupTable(groups[1])}

### Owner-added comparison

${groupTable(groups[2])}

### All 50, pooled

${groupTable(allGroup)}

## Finish tables

The paired CSV, [finish-line-50.csv](../tools/nn/finish-line-50.csv), includes every owner-metric field for both policies on all 50 seeds. In the tables, old→final means original policy/9 m grid → retained policy/14 m grid, both on the current finish and balance. Single-valued weapons, stuck, KO and crate columns describe the retained policy.

### All 28 development seeds

${finishTable(groups[0])}

### Ten previous held-outs

${finishTable(groups[1])}

### Twelve owner-added seeds

${finishTable(groups[2])}

## Verification, exactness and remaining limits

${verify.testsPassed}/${verify.testsTotal} tests pass, including ${verify.neuralTests} neural/evaluation tests. Construction regenerates weights byte for byte; both rejected construction snapshots also regenerate their checkpoint tensors exactly without writing deployed weights. ${verify.traceFrames} frames and ${verify.traceActivations} saved activations replay exactly. All ${verify.completeLapRows} final/original rows independently match the winning car's minimum over laps numbered 2 onward. Browser ESM bundle: ${verify.browserBundleBytes} bytes. No runtime/wrapper changes, per-call allocation, simulator edits, training, fitting or parameter search were introduced.

Twelve production act calls: ${f(timing.final.meanMs)} ms mean, ${f(timing.final.p95Ms)} ms p95, ${f(timing.final.maxMs)} ms maximum over 10000 batches. ${timing.final.maxMs<2?'All three measured statistics are below 2 ms.':'Mean/p95 are below 2 ms, but the observed maximum is not.'} Before/final graph bytes are identical, so there is no added neural work in this pass. The historical pre-open-road graph is smaller and measures ${f(timing.preOpenRoad.meanMs)} ms mean; the old literal no-increase target versus that graph is still unmet. Sample timing includes host scheduling/GC and is not a worst-case execution-time proof.

Affine arithmetic, Boolean gates, stable WTA, clipped recurrences and square-product multiplication are exact identities over their declared real domains. Float32 inputs and Float64 runtime introduce tested numeric error. Pursuit, friction allowances, local body/ray corridors, passing and recovery geometry remain approximations or explicit heuristics. Fixed race seeds are observations, not guarantees; random circuit interiors verify equations and never choose weights.

The mechanical recovery defects above remain in the deployed graph because the tested repair cost flags. Oil recovery can be too slow, front-corner obstacles can be missed, and a fast wrong-way car can defer entry until it has lost too much route. Collision disruption and route-credit debt can still defeat the 12 s stall rule. The attempted same-strand crossing braking did not reduce total open contact enough and also lost flags/lead changes, so the broad crossing exemption remains. The half-contact goal is not met. This pass recommends no further balance or network tuning.

All eleven weapons are used across the full set. Across 50 final races, mean fired=${f(all.fired,2)}, rocket damaging shots=${f(all.rocket,2)}%, tail-qualified drops=${f(all.drops,2)}%, maximum non-roof hold=${f(all.maxHeld)} s, crates collected=${f(all.collect,2)}% and live misses=${f(all.liveMiss,2)}%. The old 20 s hold and 65% collection targets are not implied by the new acceptance table. Field slip>10° is ${f(all.slips,2)}% of moving samples, while solo unarmed slip is only ${f(solo.unarmed.movingSlipPercent,3)}%; contact/weapon sliding is not proof of stylish solo drifting. Solo best complete lap (lap 2 onward)=${f(fullLap(solo.unarmed))} s unarmed and ${f(fullLap(solo.network))} s armed. The first shortened lap is excluded from all complete-lap pace comparisons; winnerBestLap is the winning car's minimum over laps 2 onward, and leaderBestLap is the minimum complete lap recorded by a car leading at that lap event. Both fields are null if no qualifying complete lap exists. lapTimes retains the opening interval for event accounting, but no best-lap minimum includes it.

Reproduce with final-pass-eval.mjs before/final/original9 and explicit seeds; rejected tensor checkpoints may be evaluated by their JSON basename. Then run node --test, inspect.mjs, verify.mjs and document.mjs. results-final.jsonl, owner-final-50.jsonl, final-pass-original9.jsonl, final-pass-summary.json, finish-line-manifest.json and final-pass-timing.json are the current report artifacts. final-pass-freeze.json and the rejected-attempt JSONLs deliberately retain their historical simulator identity; finish-line-before preserves the report before the finish-line move, and shipping-before preserves the report before the final simulator review fixes. Their best-lap fields predate the complete-lap metric repair and must not be used as current full-lap pace measurements. Other archived result files describe explicitly named earlier checkpoints.

Simulator SHA-256: ${verify.simSha256}. Weights SHA-256: ${verify.weightSha256}. Final architecture: ${spec.layers.length-1} layers, ${spec.biases.length} units, ${spec.weights.length} edges, ${spec.weights.length+spec.biases.length} parameters, ${spec.stateOutputs.length} recurrent states, 277 observations and six actions. No files outside the authorized AI/tools/neural-test/neural-documentation paths were changed.
`;
writeFileSync(new URL('../../docs/NEURAL_NETWORK.md',import.meta.url),doc);
const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:var(--font-sans);color:var(--foreground);margin:0}.row{display:grid;grid-template-columns:minmax(115px,170px) 1fr 80px;gap:10px;align-items:center;margin:14px 0}.bar{height:16px;background:var(--chart-1)}.old{background:var(--chart-2)}small{color:var(--muted-foreground)}</style></head><body>${[['Original / 9 m grid',allGroup.original.flags,'old'],['Retained / 14 m grid',all.flags,'']].map(([n,v,cls])=>`<div class="row"><span>${n}</span><div class="bar ${cls}" style="width:${v/50*100}%"></div><span>${v}/50 flags</span></div>`).join('')}<small>Same applied balance and finish at s=1030. Retained weights are unchanged. Open contact changes ${f(pct(allGroup.original.open,all.open),1)}%; the 50% reduction target is not met.</small></body></html>`;
writeFileSync(new URL('./report-final.html',import.meta.url),html);
console.log(JSON.stringify(summary));
