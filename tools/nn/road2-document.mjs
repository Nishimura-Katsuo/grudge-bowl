// Reporting only. Never changes or selects a policy from measured scores.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import spec from '../../src/ai/weights.js';
import {heldOut,development} from './road2-eval.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),load=p=>JSON.parse(read(p)),rows=p=>read(p).trim().split(/\r?\n/).map(JSON.parse);
const files=['./road2-baseline9-all.jsonl','./road2-baseline14-all.jsonl','./road2-pass1-all.jsonl','./results-final.jsonl'];
const data=files.map(p=>rows(p).filter(r=>r.seed!==undefined));
const verification=load('./verification-final.json'),freeze=load('./road2-freeze.json'),timing=load('./road2-timing.json'),frames=load('./trace.json'),solo=rows('./solo-final.jsonl').at(-1),grid=load('./grid-final.jsonl'),unarmed=rows('./road2-unarmed.jsonl').filter(r=>r.seed!==undefined);
for(const p of files)assert.equal(rows(p)[0].simRevision.sha256,verification.simSha256);
assert.equal(freeze.weightSha256,verification.weightSha256);assert.deepEqual(freeze.heldOut,heldOut);
const sum=(a,fn)=>a.reduce((s,x)=>s+fn(x),0),mean=(a,fn)=>a.length?sum(a,fn)/a.length:NaN,med=a=>{a=a.slice().sort((x,y)=>x-y);return a.length?(a.length%2?a[a.length>>1]:(a[a.length/2-1]+a[a.length/2])/2):NaN;},f=(x,n=3)=>Number.isFinite(x)?x.toFixed(n):'—',pct=(a,b)=>100*(b/a-1),status=b=>b?'PASS':'FAIL';
function metrics(rs){const events=rs.flatMap(r=>r.contacts.events),laps=sum(rs,r=>r.contacts.carLaps),flag=rs.filter(r=>r.finishedByLaps),count=fn=>events.filter(fn).length;return{
 n:rs.length,flags:flag.length,clocks:rs.filter(r=>!r.finishedByLaps&&r.raceSeconds>=200).length,attrition:rs.filter(r=>!r.finishedByLaps&&r.raceSeconds<200).length,
 minimumRunning:Math.min(...rs.map(r=>r.running)),meanRunning:mean(rs,r=>r.running),meanTime:mean(rs,r=>r.raceSeconds),minTime:Math.min(...rs.map(r=>r.raceSeconds)),maxTime:Math.max(...rs.map(r=>r.raceSeconds)),aim:flag.filter(r=>r.raceSeconds>=185&&r.raceSeconds<=195).length,
 open:count(e=>e.category==='open')/laps,openHard:count(e=>e.category==='open'&&e.hard)/laps,openAfter8:count(e=>e.category==='open'&&e.time>=8)/laps,gridOpen:count(e=>e.category==='open'&&e.time<8),openCount:count(e=>e.category==='open'),
 cross0:count(e=>e.crossing&&e.leaderLap===0),crossLate:count(e=>e.crossing&&e.leaderLap>0),crossLateRate:count(e=>e.crossing&&e.leaderLap>0)/laps,window0:count(e=>e.crossingWindow&&e.leaderLap===0),landing:count(e=>e.category==='landing')/laps,
 carLaps:laps,stuck:100*sum(rs,r=>r.stuckCarSeconds)/sum(rs,r=>r.liveCarSeconds),stalled:sum(rs,r=>r.stalled)/laps,turtled:sum(rs,r=>r.turtled)/laps,longest:Math.max(...rs.map(r=>r.longestStop)),margin:med(flag.map(r=>r.finishMargin??Infinity)),leads:mean(rs,r=>r.leadChanges),pace:med(rs.map(r=>r.leaderBestLap)),
 fired:mean(rs,r=>r.weapons.fired),types:new Set(rs.flatMap(r=>r.weapons.shots.map(s=>s.weapon))).size,collect:100*sum(rs,r=>r.crates.collected)/sum(rs,r=>r.crates.empty),maxHeld:Math.max(...rs.map(r=>r.weapons.maxHeldNonRoof)),walls:sum(rs,r=>r.wallHits)/laps};}
const groups=[['Original twenty',development.slice(0,20)],['Additional development',development.slice(20)],['Fresh held-out',heldOut],['All runs',[...development,...heldOut]]].map(([name,seeds])=>({name,seeds,rs:data[3].filter(r=>seeds.includes(r.seed)),m:data.map(a=>metrics(a.filter(r=>seeds.includes(r.seed))))}));
const final=data[3],damage=final.flatMap(r=>r.contacts.damage),totals=Object.fromEntries(['car','wall','weapon','other'].map(k=>[k,sum(damage,d=>d[k])])),destroyed=damage.filter(d=>d.ko==='destroyed');
const late=final.filter(r=>!r.finishedByLaps&&r.raceSeconds>=200).map(r=>{const car=r.cars[r.winnerId],d=r.contacts.damage[r.winnerId],engineContact=Math.max(0,1-car.engineHealth-.35*d.weapon);return{seed:r.seed,health:car.health,engine:car.engineHealth,contact:d.car+d.wall,weapon:d.weapon,addedHealth:.2*(d.car+d.wall),torqueGain:car.engineHealth>0?100*.7*.2*engineContact/(.3+.7*car.engineHealth):NaN};});
const summary={simSha256:verification.simSha256,weightSha256:verification.weightSha256,groups:groups.map(({name,m})=>({name,baseline9:m[0],baseline14:m[1],pass1:m[2],final:m[3]})),unarmed:metrics(unarmed),damage:totals,destroyed:destroyed.length,weaponFinalBlows:destroyed.filter(d=>d.last==='weapon').length,clockLeaders:late,timing};
writeFileSync(new URL('./road2-summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
let core=read('./road-pass1/NEURAL_NETWORK.md');core=core.slice(core.indexOf('## Runtime boundary'),core.indexOf('## New open-road following circuit'));
core=core.replace(/\| Layers\/units \|[^\n]+/,`| Layers/units | ${spec.layers.length-1}/${spec.biases.length} |`).replace(/\| Edges\/parameters \|[^\n]+/,`| Edges/parameters | ${spec.weights.length}/${spec.weights.length+spec.biases.length} |`);
core=core.replace(/The previous network had[^\n]+/,`The pre-open-road network had 2967 units, 5650 edges and 45 states; the first open-road candidate had 3309 units, 6300 edges and 47 states. The final network has ${spec.biases.length} units, ${spec.weights.length} edges and 47 states. No new state was needed for this pass. The runtime and activations are unchanged.`);
core=core.replace(/^(\| ([\w.]+) \| )\d+ \| \d+ \|(.+)$/gm,(line,_,name,tail)=>{const id=spec.names.indexOf(name);return id<0?line:`| ${name} | ${id} | ${spec.layers.findIndex((x,k)=>id>=x&&id<spec.layers[k+1])+1} |${tail}`;});
core=core.replace(/## Passing and opportunistic anger[\s\S]*?(?=## Grudges, rage and jumps)/,read('./road2-walkthrough.md')+'\n\n');
core=core.replace(/The current twenty-race sample includes a non-roof hold of[^\n]+/,`Observed maximum non-roof hold is ${f(Math.max(...final.map(r=>r.weapons.maxHeldNonRoof)))} s. The historical 20 s hold target is not guaranteed; the trigger circuits were not changed in this pass.`);
core=core.replace('the current sample has no non-roof hold over 20 s, without proving a universal bound.',`the current maximum non-roof hold is ${f(Math.max(...final.map(r=>r.weapons.maxHeldNonRoof)))} s.`);
const line=(label,key,g)=>`| ${label} | ${g.m.map(m=>f(m[key])).join(' | ')} |`;
const comparison=g=>`### ${g.name}\n\n| Metric | Original / 9 m | Original / 14 m | Pass 1 / 14 m | Final / 14 m |\n|---|---:|---:|---:|---:|\n${[['Flag finishes','flags'],['Clock finishes','clocks'],['Attrition finishes','attrition'],['Minimum running','minimumRunning'],['Mean race seconds','meanTime'],['Median best leader lap seconds','pace'],['Median gap at flag metres','margin'],['Lead changes/race','leads'],['Open hits/car-lap','open'],['Open hard hits/car-lap','openHard'],['Open hits after 8 s/car-lap','openAfter8'],['Open launch hits (count)','gridOpen'],['True crossing hits, leader lap 0','cross0'],['True crossing hits, leader laps 1–4','crossLate'],['Later crossing hits/car-lap','crossLateRate'],['Landing hits/car-lap','landing'],['Stuck %','stuck'],['Longest stop s','longest'],['Stalled/car-lap','stalled'],['Turtled/car-lap','turtled'],['Wall events/car-lap','walls'],['Weapons/race','fired'],['Crate collection %','collect'],['Car-lap exposure','carLaps']].map(([label,key])=>line(label,key,g)).join('\n')}`;
const finishes=g=>`| Seed | Original 9 m / 14 m / pass 1 / final s | End | Running | Gap m | Leads | Fired | Stuck % | Stalled/turtled |\n|---:|---|---|---:|---:|---:|---:|---:|---|\n${g.rs.map(r=>`| ${r.seed} | ${data.map(a=>f(a.find(x=>x.seed===r.seed).raceSeconds,1)).join(' / ')} | ${r.finishedByLaps?'flag':r.raceSeconds>=200?'CLOCK':'ATTRITION'} | ${r.running} | ${f(r.finishMargin,1)} | ${r.leadChanges} | ${r.weapons.fired} | ${f(r.stuckPercent,2)} | ${r.stalled}/${r.turtled} |`).join('\n')}`;
const acceptance=g=>{const [old,wide,prior,m]=g.m;return[
 ['Every flag below 200 s',`${m.flags}/${m.n}; ${status(m.flags===m.n&&m.maxTime<200)}`],
 ['At least two running at every flag',`${m.minimumRunning} at race end; ${status(m.minimumRunning>=2&&m.flags===m.n)}`],
 ['Median flag gap no worse than original 9 m',`${f(old.margin)} → ${f(m.margin)} m; ${status(m.margin<=old.margin)}`],
 ['Lead changes at least original 9 m / 14 m',`${f(old.leads)} / ${f(wide.leads)} → ${f(m.leads)}; ${status(m.leads>=Math.max(old.leads,wide.leads))}`],
 ['Open hits at least halved vs original 9 m',`${f(pct(old.open,m.open),1)}%; ${status(m.open<=old.open/2)}`],
 ['Open hard hits at least halved vs original 9 m',`${f(pct(old.openHard,m.openHard),1)}%; ${status(m.openHard<=old.openHard/2)}`],
 ['Later crossing rate at least original 9 m / 14 m',`${f(old.crossLateRate)} / ${f(wide.crossLateRate)} → ${f(m.crossLateRate)}; ${status(m.crossLateRate>=Math.max(old.crossLateRate,wide.crossLateRate))}`],
 ['Stuck no worse than original 14 m',`${f(wide.stuck)} → ${f(m.stuck)}%; ${status(m.stuck<=wide.stuck)}`],
 ['Stalled rate no worse than original 14 m',`${f(wide.stalled)} → ${f(m.stalled)}; ${status(m.stalled<=wide.stalled)}`],
 ['Turtled rate no worse than original 14 m',`${f(wide.turtled)} → ${f(m.turtled)}; ${status(m.turtled<=wide.turtled)}`],
 ['Weapons/race no worse than pass 1',`${f(prior.fired)} → ${f(m.fired)}; ${status(m.fired>=prior.fired&&m.types===11)}`],
 ['Crate collection no worse than pass 1',`${f(prior.collect)} → ${f(m.collect)}%; ${status(m.collect>=prior.collect)}`]
 ];};
const selected=['openRoad','follow0.closing','follow0.gap','follow0.clearance','follow0.safeRoot','follow0.urgent','follow0.valid','follow0.speedCap','trafficSpeedLimit','freeDesiredSpeed','desiredSpeed','passRange','freePass','returnBlocked','requestedOffset','passOffset','steer','throttle','brake'];
const trace=frames[0].activations.filter(x=>selected.includes(x.name));
const doc=`# The Knot: directly programmed racing and weapon conflict

The network is an executable program written into weights. Racing-line pursuit and slip/yaw feedback drive the car; neural comparisons select a free passing lane, a relative braking-distance circuit handles imminent closing, and a geometric guard prevents merging into an alongside body. Recurrent neurons keep grudges, rage, recovery and weapon timing. One generic forward pass drives all twelve cars. No training, fitting, parameter search or simulator edit was used.

## Final status

**The complete acceptance target is not met.** The revised metric confirms that the old 25 m crossing window confused launch packs with cross traffic. Passing and braking fixes remove the demonstrated preferred-gap delay, but the race tables still contain failures. No clock or attrition finish counts as a flag. Minimum running at shutdown does not substitute for the requirement to reach the flag.

| Target | Original twenty development | Fresh held-out |
|---|---|---|
${acceptance(groups[0]).map(([n,x],k)=>`| ${n} | ${x} | ${acceptance(groups[2])[k][1]} |`).join('\n')}

The 185–195 s aim is reached by ${groups[0].m[3].aim}/${groups[0].m[3].n} original development races and ${groups[2].m[3].aim}/${groups[2].m[3].n} held-outs. Timing also regresses: matched-wrapper mean for twelve calls is ${f(timing.baseline.meanMs)} ms original, ${f(timing.pass1.meanMs)} ms pass 1, ${f(timing.final.meanMs)} ms final. Production mean/p95/max is ${f(timing.production.meanMs)}/${f(timing.production.p95Ms)}/${f(timing.production.maxMs)} ms. The repeat with no other local measurement jobs stays below 2 ms in this sample, but does not meet a literal no-increase target. The earlier shared-load run is retained in road2-timing-shared-load.json: production p95 1.477 ms and maximum 61.337 ms (the original network also recorded a 54.731 ms maximum). Those wall-clock outliers are not discarded or attributed solely to the graph.

${core}

## Worked forward pass

The first saved frame is a grounded car at 20 m/s approaching a parallel rival at 16 m/s, seven metres ahead. There is no crossing or lip nearby. Closing speed c=4; required gap=5.5+.25×4+16/16=7.5 m. Actual clearance is 7−5.5=1.5 m. Solve its safe closing speed: sqrt(4+16×1.5)−2=sqrt(28)−2=3.291502622 m/s. The cap is (16+3.291502622)/40=.482287566. Free desired speed is .7×.9=.63. Desired speed is the cap; the speed error is −.017712434, so brake=14×.017712434≈.247974082. Pace feed-forward is zero here because the next free pace is higher. The left clear lane requests −3 m, filtered to −.4 m on the first decision; the elbow is off. Float32 observation representation introduces the small differences shown below.

| Neuron | ID | Activation |
|---|---:|---:|
${trace.map(x=>`| ${x.name} | ${x.id} | ${x.value.toFixed(9)} |`).join('\n')}

Steer/throttle/brake/handbrake/reverse/fire: ${frames[0].action.map(x=>x.toFixed(9)).join(' / ')}. All ${frames.length} saved frames include their complete observations and initial/next recurrent vectors. NEURON_MAP.md gives every layer range, affine row and consumer.

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
| The wider grid changed exact historical no-crates counts. | Update checkpoint assertions from fresh runs: ${grid.preWeapons.koTotal} and ${grid.beforeReview.koTotal}. | Preserve current flag and no-worse KO/stalled assertions; current ${grid.current.koTotal} KOs, ${grid.current.stalled} stalled. |

Intermediate fixed-policy runs are retained as road2-development-a/b/c*.jsonl. These corrections were made from explicit equations and counterexamples, not by sweeping values or choosing the best seed score. Their race results were not monotonic. Prior edit logs remain in road-pass1/NEURAL_NETWORK.md and walkthrough-before-open-road.md.

## Direct delay diagnosis

The read-only neuron traces compare the frozen pass-1 and final graphs. In seeds 1/7/42, total time under a material traffic speed reduction falls from 155.07/232.03/134.03 to 11.13/14.10/18.40 car-seconds. Matched-speed cap time becomes zero. The longest final episodes in those seeds are .60/1.10/1.13 s, versus 7.13/7.97/5.87 s before. In seed 6007, the old leader spent 12.2 s capped behind lapped traffic; the final leading-car cap time is zero and total capped time falls from 147.87 to 11.70 car-seconds. These are observed episode durations, not a universal time bound or an isolated prediction of lap time.

Most of the earlier delay was therefore ordinary traffic, not waiting for wreck towing. The final graph resolves those demonstrated long cap episodes. It does not resolve every race loss: the clock leaders' observed damage and the no-crates comparison below show that engine loss, impacts and recovery still consume the available race margin. The no-crates control also has one clock finish, so weapons alone cannot explain every failure.

## What the measurements mean

The simulator hash is identical for every live-grid run. Historical 9 m comparison uses a read-only in-memory import of world.js with only ROW_GAP=9 and SPAWN_LAST_ROW_S=−2, versus live 14/−32. No simulator file is written. Five laps, 200 s, damage, weapons, track and car physics are otherwise identical. This isolates the grid change from the network change.

Crossing classification requires an event within 25 m of a generated crossing and the cars assigned to different nearest passes sA/sB, each within 30 route metres. Thirty allows the 25 m window plus body extent. Same-pass lap-0 pack collisions are open-road events. A heading-angle alternative is not needed when continuous route identity is available; this convention may miss a car whose route identity has just changed in a collision. Classification is crossing first, otherwise landing for upper≥0 or a car between lip and landS+maxSpeed×1 s, otherwise open. No events disappear. Hard means closing>6 m/s, not the older strength≥.35 metric. Laps 1–4 use the running leader's lap at the event.

Car-laps sum each car's nonnegative credited route gain from its own grid position divided by lap length, including partial KO laps. Rates pool counts and exposure. Later crossing counts and rates are both reported; their rate denominator is all car-laps, not a claim of equal late-lap exposure. Open-after-eight-second rates are diagnostic; the half-contact target still includes launch hits. Stuck means a running car below 3 m/s after second five. Flag-gap medians include only flag finishes; failure counts remain explicit. Timeout gaps are at shutdown. Lead changes use credited progress among running cars after second five.

${groups.slice(0,3).map(comparison).join('\n\n')}

## Finish tables

### Original twenty development seeds

${finishes(groups[0])}

### Additional development, inspected before the final correction

${finishes(groups[1])}

### Fresh held-out, measured after final freeze

${finishes(groups[2])}

## Isolation, attrition and a separate balance proposal

With crates removed, the final network finishes ${summary.unarmed.flags}/${summary.unarmed.n} original-seed races by laps, with at least ${summary.unarmed.minimumRunning} running. This is a weapons-disabled control, not a damage-balance experiment and not a claim that a specific shot caused a particular failure. Solo unarmed best lap is ${f(solo.unarmed.leaderBestLap)} s. Actual armed tests retain all weapon circuits and all eleven types are used across the final set. Maximum non-roof hold is ${f(Math.max(...final.map(r=>r.weapons.maxHeldNonRoof)))} s; the historical 20 s hold floor can still miss.

Measured health loss over final races is ${f(totals.car)} from car contact, ${f(totals.wall)} from walls, and ${f(totals.weapon)} directly from weapons. ${destroyed.length} cars were destroyed; ${destroyed.filter(d=>d.last==='weapon').length} received their final damaging operation from a weapon. The observer preserves pre-operation health through nested wheelOff/ko. It does not label a later wall collision as weapon damage, so weapon disruption is understated by direct damage attribution alone.

For a separate parent-owned balance experiment, test DAMAGE.scale **.0058 → .00464 (−20%)**, leaving ARSENAL unchanged. The proposed one-fifth reduction targets physical damage while keeping weapon conflict. On the *unchanged recorded damage histories* of surviving clock leaders it would add ${f(Math.min(...late.map(x=>x.addedHealth)))}–${f(Math.max(...late.map(x=>x.addedHealth)))} health; their nonzero-engine cases imply ${f(Math.min(...late.map(x=>x.torqueGain).filter(Number.isFinite)),1)}–${f(Math.max(...late.map(x=>x.torqueGain).filter(Number.isFinite)),1)}% more available torque under the existing .3+.7*engineHealth law. This is bookkeeping, **not simulated performance or an assertion that the floor will pass**. Damage history, wheel loss, alignment, collisions and rankings will diverge. It cannot directly cure turtling or undo a launch. No value was changed here and no blanket weapon-damage reduction is supported by these measurements.

## Verification, exactness and limitations

${verification.testsPassed}/${verification.testsTotal} node tests pass; all ${verification.neuralTests} neural/evaluation tests pass. The remaining failure is the parent-owned test/physics.test.js:406 reference driver on the changed solo grid, which does not import the neural network. It stalls at s=897.45 after two laps. The same fixture on the historical grid finishes in 127.092 race seconds, with .611 health, .727 m minimum clearance and a 39.229 s last lap. Both read-only repros are recorded in physics-external-repro.json and physics-external-oldgrid.json. The physics test and simulator were left untouched. verify.mjs records the fresh evidence and still exits with failure until the full suite is green. Byte-identical construction is checked against the generated source. ${verification.traceFrames} frames and ${verification.traceActivations} activations replay exactly; the browser ESM bundle is ${verification.browserBundleBytes} bytes. Random test interiors are verification, not weight search. The generic runtime/wrapper remain unchanged, with no policy outside the graph and no per-call buffer allocation.

Affine rows, Boolean/WTA circuits, min/max, clipped recurrences and square-product identities implement their specified algebra exactly over real arithmetic. Float64 and Float32 deployment introduce tested numerical error. Pursuit, friction allowance, body corridors, lane-change timing and collision categories are approximations or explicit heuristics. The speed floor knowingly permits low-speed contact. Good root arithmetic is not proof of collision avoidance; neither a local crossing exemption nor an accurate gap controller guarantees the race outcomes. The acceptance table governs the result.

Reproduce using road2-eval.mjs baseline9/baseline14/pass1/final with explicit seed arguments, traffic-diagnosis.mjs --final, passing-case.mjs, eval.mjs --solo, grid-regression.mjs, node --test, inspect.mjs, verify.mjs and document.mjs. road2-summary.json contains the report's aggregates. Older final-named artifacts not cited here describe earlier revisions.

Simulator SHA-256: ${verification.simSha256}. Weights SHA-256: ${verification.weightSha256}. Architecture: ${spec.layers.length-1} layers, ${spec.biases.length} units, ${spec.weights.length} edges, ${spec.weights.length+spec.biases.length} parameters, ${spec.stateOutputs.length} states, 277 observations and six actions. Only authorized AI, tools, neural tests and neural documentation paths were changed. No src/sim edits, training, fitting, parameter search, git initialization or commits.
`;
writeFileSync(new URL('../../docs/NEURAL_NETWORK.md',import.meta.url),doc);
const max=Math.max(...groups.filter(g=>g.name!=='All runs').flatMap(g=>g.m.map(m=>m.open)));
const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{background:transparent;color:var(--foreground);font-family:var(--font-sans);margin:0}.row{display:grid;grid-template-columns:150px 1fr 115px;gap:8px;margin:12px 0}.bar{height:10px;background:var(--chart-1);margin-bottom:3px}.old{background:var(--chart-2)}small{color:var(--muted-foreground)}</style></head><body><p>Open-road hits per car-lap, including launch</p>${[groups[0],groups[2]].map(g=>`<div class="row"><span>${g.name}</span><div><div class="bar old" style="width:${100*g.m[0].open/max}%"></div><div class="bar" style="width:${100*g.m[3].open/max}%"></div></div><span>${f(g.m[0].open)} → ${f(g.m[3].open)}</span></div>`).join('')}<small>Upper: original network, 9 m grid. Lower: final network, 14 m grid. Target: at least half. Same-strand crossing-window pack hits remain open-road hits.</small></body></html>`;
writeFileSync(new URL('./report-final.html',import.meta.url),html);console.log(JSON.stringify(summary));
