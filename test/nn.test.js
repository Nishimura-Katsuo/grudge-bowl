import test from 'node:test';

import assert from 'node:assert/strict';

import {readFileSync} from 'node:fs';

import {Circuit} from '../tools/nn/circuits.mjs';

import {construct} from '../tools/nn/build.mjs';

import spec from '../src/ai/weights.js';

import {compileNetwork,createRuntime} from '../src/ai/network.js';

import {createBrain} from '../src/ai/index.js';

import {OBS} from '../src/sim/sensors.js';
import {ARSENAL} from '../src/sim/config.js';
import {ownerMetrics} from '../tools/nn/owner-metrics.mjs';

import {evaluate,progressLeader} from '../tools/nn/eval.mjs';

import {createWorld,stepWorld} from '../src/sim/world.js';
import {crateCase} from '../tools/nn/crate-case.mjs';

import {recoveryCase,recoveryCases} from '../tools/nn/recovery-cases.mjs';

import {peacefulBrain,compareLaps} from '../tools/nn/aggression.mjs';

const close=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);

const clip=x=>Math.max(0,Math.min(1,x));

test('owner comparison retains same-strand hits, exact crossing boundaries and lead cadence',()=>{
  const car=(id,s,progress,angle=0)=>({id,alive:true,trackS:s,progress,R:[Math.cos(angle),0,0,0,0,0,Math.sin(angle)]});
  const w={seed:1,track:{length:1152},laps:5,phase:'racing',step:24,raceTime:5,leaderLaps:0,cars:[car(0,79,79),car(1,129,129)]};
  const m=ownerMetrics(w),hit={type:'hit',a:0,b:1,closing:7};
  m.sample();m.event(hit); // Parallel pack, even inside both crossing windows.
  w.cars[0].R[0]=.5;w.cars[0].R[6]=Math.sqrt(.75);w.cars[0].progress=-40;m.event(hit);
  w.cars[0].progress=69;m.event(hit); // Gap exactly 60 fails strict >60.
  w.cars[0].progress=-40;w.cars[0].trackS=104;m.event(hit); // Exactly 25 m from both passes.
  w.cars[0].trackS=79;w.cars[0].R[0]=-.99;m.event(hit); // Abs(dot), not signed dot.
  w.cars[0].progress=6000;w.cars[1].progress=5990;w.raceTime=11;w.step=25;m.sample();assert.equal(m.result().leads,0);
  w.step=48;m.sample();w.cars[1].progress=6001;w.phase='finished';m.sample();
  const r=m.result();assert.equal(r.open,4);assert.equal(r.hard,4);assert.equal(r.cross,1);assert.equal(r.leads,1);assert.equal(r.prog,10.4);assert.equal(r.flag,true);assert.equal(r.gap,1);
});

test('crate interpolation, coordinates, temperament and distance ramp match independent expressions',()=>{
  for(const metres of [0,4,8,12,16,22,28,36,45,50,60,65,120])for(const angle of [-.25,0,.25])for(const aggression of [0,.5,1]){
    const f=fixture();f.set('arms.toCrate',metres/120);f.set('arms.crateRight',.4);f.set('ego.temperAggression',aggression);f.set('ego.headingSin',Math.sin(angle));f.set('ego.headingCos',Math.cos(angle));f.set('ego.lineOffset',.15);
    for(let k=0;k<5;k++)f.set(`look${k}.right`,.01*(k+1)**2);
    f.run();const read=n=>f.obs[OBS.index[n]],d=120*read('arms.toCrate'),half=10*read('ego.halfWidth'),cos=read('ego.headingCos'),xs=[0,8,16,28,45,65],ys=[-read('ego.lineOffset')*half*cos/70,...Array.from({length:5},(_,k)=>read(`look${k}.right`))];
    let expected=ys.at(-1);for(let k=0;k<5;k++)if(d<xs[k+1]){expected=ys[k]+(ys[k+1]-ys[k])*(d-xs[k])/(xs[k+1]-xs[k]);break;}
    close(f.v('crateLine.right'),expected);const error=(read('arms.crateRight')*half-70*expected)/Math.max(.5,cos),allowance=2.2-.4*aggression,detour=error,egoLine=read('ego.lineOffset')*half,request=(egoLine+Math.max(-4,Math.min(4,detour-egoLine)))*clip((45+15*aggression-d)/20);
    close(f.v('crateLineError'),error);close(f.v('crateRequest'),request);
  }
});

test('crate clearance follows the filtered target side, including reset and opposite-history transients',()=>{
  for(const sign of [-1,1])for(const memory of [0,-3*sign]){
    const f=fixture();f.set('arms.toCrate',35/120);f.set('arms.crateRight',4*sign/9);f.set('ego.lineOffset',2.5*sign/9);f.set('ego.speedFwd',.5);
    for(let k=0;k<5;k++)f.set(`look${k}.right`,-2.5*sign/70);
    f.r.state[44]=memory;rival(f,0,{fwd:-.02,right:-.03*sign,dist:.04,relVelFwd:0});f.run();
    assert.equal(f.v('crateReachable'),1);assert.equal(f.v('passing'),0);
    close(f.v('crateFiltered'),(2*f.v('crateRequest')+13*memory)/15);
    assert.equal(f.v('crateToRight'),sign<0?1:0);assert.equal(f.v('crateTrafficClear'),0);assert.equal(f.v('crateSeeking'),0);
    // A rival on the opposite side must not veto this clear-side detour.
    f.set('opp0.right',.03*sign);f.r.state[44]=memory;f.run();assert.equal(f.v('crateTrafficClear'),1);assert.equal(f.v('crateSeeking'),1);
  }
});

test('crate reach cone matches its speed-dependent expression and rejects disappearing late targets',()=>{
  let seed=6907;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const cases=[[3.64,29.63,7.76],[20,30,4],[20,40,3],[0,0,0],...Array.from({length:100},()=>[60*random(),45*random(),12*random()-6])];
  for(const [d,v,x] of cases){const f=fixture();f.set('arms.toCrate',d/120);f.set('arms.crateRight',x/9);f.set('ego.speedFwd',v/40);f.set('ego.pace',1.2);f.run();
    const allowance=.2*(120*f.obs[OBS.index['arms.toCrate']])*Math.min(1,30/Math.max(1e-30,40*Math.abs(f.obs[OBS.index['ego.speedFwd']])));
    close(f.v('crateReachAllowance'),allowance);close(f.v('crateReachError'),Math.abs(f.v('crateLineError')-f.v('crateEgoLine')));
    assert.equal(f.v('crateReachable'),f.v('crateReachError')<=allowance?1:0);
  }
  const late=fixture(),off=fixture();for(const f of [late,off]){f.set('arms.toCrate',3.64/120);f.set('arms.crateRight',7.76/9);f.set('ego.speedFwd',29.63/40);f.set('ego.pace',.9);f.r.state[44]=2.26;}
  off.set('arms.toCrate',1);late.run();off.run();assert.equal(late.v('crateReachable'),0);assert.equal(late.v('crateSeeking'),0);assert.equal(late.v('crateOffset'),0);close(late.v('steer'),off.v('steer'));
});

test('crates yield to weapons, passing, hazards, recovery, walls, jumps, slip and corner pace',()=>{
  const base=()=>{const f=fixture();f.set('arms.toCrate',.2);f.set('arms.crateRight',.5);f.set('ego.speedFwd',.5);return f;};
  const yes=base();yes.run();assert.equal(yes.v('crateSeeking'),1);assert.ok(yes.v('crateOffset')>0);
  for(const changes of [{'arms.barnBurner':1},{'arms.toCrate':1},{'ego.toJump':.1},{'ego.wheelsDown':0},{'arms.oiled':1},{'arms.whirling':1},{'ego.headingCos':.7},{'ego.slipAngle':.3},{'ego.speedFwd':.8},{ray3:.05},{'arms.toHazard':.3}]){
    const f=base();f.r.state[44]=3;for(const [n,x] of Object.entries(changes))f.set(n,x);f.run();assert.equal(f.v('crateSeeking'),0,JSON.stringify(changes));assert.equal(f.v('crateOffset'),0);
  }
  const pass=base();rival(pass,0);pass.run();assert.equal(pass.v('passing'),1);assert.equal(pass.v('crateSeeking'),0);
  const alongside=base();rival(alongside,0,{fwd:-.02,right:.03,dist:.04,relVelFwd:0});alongside.run();assert.equal(alongside.v('passing'),0);assert.equal(alongside.v('crateTrafficClear'),0);assert.equal(alongside.v('crateSeeking'),0);
  const curve=base();curve.set('look2.right',.5);curve.run();assert.equal(curve.v('crateFutureAligned'),0);assert.equal(curve.v('crateSeeking'),0);
  const recover=base();recover.set('ego.speedFwd',0);recover.set('ray0',2/45);recover.set('ego.stallTimer',.3);recover.r.state[12]=.6;recover.run();assert.equal(recover.v('escapeActive'),1);assert.equal(recover.v('crateSeeking'),0);
  const narrow=base();narrow.set('ego.halfWidth',.64);narrow.set('ego.trackOffset',.7);narrow.set('ego.lineOffset',0);for(let k=0;k<30;k++)narrow.run();assert.ok(narrow.v('crateBounded')<=narrow.v('crateUpper')+1e-8);assert.ok(narrow.v('crateBounded')>=narrow.v('crateLower')-1e-8);
});

test('an empty car physically detours and collects an off-line crate; a held weapon leaves its normal trajectory unchanged',()=>{
  const empty=crateCase(),blind=crateCase({seek:false}),held=crateCase({held:true}),heldBlind=crateCase({held:true,seek:false});
  assert.equal(empty.collected,true);assert.equal(blind.collected,false);assert.ok(empty.lateralAtSpot>4.5-ARSENAL.crateReach);assert.ok(empty.minDistance<=ARSENAL.crateReach);assert.equal(empty.wallHits,0);assert.equal(empty.health,1);assert.ok(empty.minRoad>2.6);assert.equal(held.collected,false);const path=r=>r.frames.map(({s,steer,speed})=>({s,steer,speed}));assert.deepEqual(path(held),path(heldBlind));assert.deepEqual(path(held),path(blind));
});

test('crate lane correction preserves corner preview and spends only spare surface grip',()=>{
  for(const speed of [5,20,35])for(const surface of [.62,1,1.14]){
    const f=fixture();f.set('arms.toCrate',.2);f.set('arms.crateRight',.5);f.set('ego.speedFwd',speed/40);f.set('ego.pace',1.2);f.set('ego.surfaceGrip',surface);
    f.run();const read=n=>f.obs[OBS.index[n]],v2=Math.max(25,1600*(read('ego.speedFwd')**2+read('ego.speedRight')**2));
    const budget=Math.max(0,1.5*9.81*read('ego.surfaceGrip')/v2-Math.abs(f.v('pursuitBaseCurvature')));
    close(f.v('crateCurvatureBudget'),budget);assert.ok(Math.abs(f.v('crateAppliedCurvature'))<=budget+1e-10);
    close(f.v('aimForward'),previewReference(f.obs,'fwd'));close(f.v('aimRight'),previewReference(f.obs,'right'));
  }
});

test('lead-change measurement retains the incumbent at quantized ties',()=>{const cars=[{id:0,alive:true,progress:10},{id:1,alive:true,progress:10}];assert.equal(progressLeader(cars,1).id,1);cars[0].progress+=1e-10;assert.equal(progressLeader(cars,1).id,1);cars[0].progress=11;assert.equal(progressLeader(cars,1).id,0);cars[0].alive=false;assert.equal(progressLeader(cars,0).id,1);});

function fixture(){const obs=new Float32Array(OBS.size);for(const [n,x] of Object.entries({'arms.toCrate':1,'arms.toHazard':1,'arms.aheadRange':1,'arms.behindRange':1,'ego.pace':.7,'ego.halfWidth':.9,'ego.engineHealth':1,'ego.health':1,'ego.wheelsDown':1,'ego.upright':1,'ego.raceActive':1,'ego.surfaceGrip':1,'ego.headingCos':1,'ego.toJump':1,'ego.toCrossing':1,'ego.temperAggression':.8,'ego.temperVengeance':.7,'ego.temperNerve':.7}))obs[OBS.index[n]]=x;for(let k=0;k<14;k++)obs[OBS.index[`ray${k}`]]=1;for(let k=0;k<5;k++){obs[OBS.index[`look${k}.fwd`]]=[8,16,28,45,65][k]/70;obs[OBS.index[`look${k}.pace`]]=.7;}const r=createRuntime(compileNetwork(spec));return{obs,r,v:n=>r.values[spec.names.indexOf(n)],set:(n,x)=>obs[OBS.index[n]]=x,run:()=>r.forward(obs)};}

function rival(f,k,extra={}){for(const [n,x] of Object.entries({solid:1,alive:1,los:1,headingCos:1,fwd:.08,right:0,dist:.08,relVelFwd:-.1,...extra}))f.set(`opp${k}.${n}`,x);}

test('rebuild is byte identical, finite, strictly layered and uses the new contract',()=>{assert.deepEqual(construct(),spec);assert.equal(OBS.size,277);assert.equal(spec.stateOutputs.length,47);assert.equal(readFileSync(new URL('../src/ai/weights.js',import.meta.url),'utf8'),'// Generated by tools/nn/build.mjs. Do not edit.\nexport default '+JSON.stringify(spec)+';\n');for(let l=0;l<spec.layers.length-1;l++)for(let id=spec.layers[l];id<spec.layers[l+1];id++){let row=id-spec.inputCount;assert.ok(Number.isFinite(spec.biases[row]));for(let j=spec.offsets[row];j<spec.offsets[row+1];j++){assert.ok(spec.columns[j]<spec.layers[l]);assert.ok(Number.isFinite(spec.weights[j]));}}});

test('gates, muxes, products and clamps match independent expressions at bounds and random interiors',()=>{const c=new Circuit(['x','y','g']);const ids=[c.gate('g',0,2,1.5),c.mux('m',2,0,1,1.5),c.mul('p',0,1),c.clip('c',[[0,1]],0,-.4,.7)];const s=c.compile({outputs:ids}),r=createRuntime(compileNetwork(s));let seed=101;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);for(const x of [-1.5,-.40000001,-.4,0,.7,.70000001,1.5,...Array.from({length:300},()=>3*random()-1.5)])for(const g of [0,1]){const y=3*random()-1.5,v=r.forward([x,y,g]);[g?x:0,g?x:y,x*y,Math.max(-.4,Math.min(.7,x))].forEach((z,k)=>close(v[s.outputs[k]],z));}});

test('comparators, Boolean AND and WTA have deterministic ties',()=>{const c=new Circuit(['a','b','c']);const outputs=[c.step('cmp',[[0,1],[1,-1]]),c.and('and',[0,1]),...c.wta('w',[0,1,2])];const s=c.compile({outputs}),r=createRuntime(compileNetwork(s));for(const a of [0,1])for(const b of [0,1])for(const d of [0,1]){const xs=[a,b,d],v=r.forward(xs);assert.equal(v[s.outputs[0]],Number(a>=b));assert.equal(v[s.outputs[1]],a&&b);assert.deepEqual(s.outputs.slice(2).map(i=>v[i]),xs.map((_,k)=>Number(k===xs.indexOf(Math.max(...xs)))));}});

test('eleven-way traffic WTA matches independent argmax on negative scores, near ties and random interiors',()=>{const c=new Circuit(Array.from({length:11},(_,k)=>String(k))),s=c.compile({outputs:c.wta('w',Array.from({length:11},(_,k)=>k))}),r=createRuntime(compileNetwork(s));let seed=991;for(let trial=0;trial<300;trial++){const xs=Array.from({length:11},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return -6+6*seed/2**32;});if(trial<11){xs.fill(-4);xs[trial]+=[-1e-12,0,1e-12][trial%3];}const expected=xs.indexOf(Math.max(...xs)),v=r.forward(xs);assert.deepEqual(s.outputs.map(i=>v[i]),xs.map((_,k)=>Number(k===expected)));}});

test('all grudge memories and rage follow the stated leak equations',()=>{const f=fixture();f.r.state.fill(.2,0,12);f.set('ego.hitTaken',.3);f.set('ego.stallTimer',.2);for(let k=0;k<11;k++)f.set(`opp${k}.hitMe`,k/20);f.run();for(let k=0;k<11;k++)close(f.r.state[k],clip(.2*2**(-1/540)+f.obs[OBS.index[`opp${k}.hitMe`]]*(.5+1.5*f.obs[OBS.index['ego.temperVengeance']])));close(f.r.state[11],clip(.2*2**(-1/180)+.65*f.obs[OBS.index['ego.hitTaken']]+.008*f.obs[OBS.index['ego.stallTimer']]));for(let k=0;k<11;k++)f.set(`opp${k}.hitMe`,0);const before=f.r.state[0];for(let j=0;j<540;j++)f.run();close(f.r.state[0],before/2);});

function previewReference(obs,field){const d=Math.max(16,Math.min(65,40*Math.hypot(obs[OBS.index['ego.speedFwd']],obs[OBS.index['ego.speedRight']]))),ds=[16,28,45,65];for(let k=0;k<3;k++)if(d<=ds[k+1]){const t=(d-ds[k])/(ds[k+1]-ds[k]);return (1-t)*obs[OBS.index[`look${k+1}.${field}`]]+t*obs[OBS.index[`look${k+2}.${field}`]];}return obs[OBS.index['look4.'+field]];}
test('continuous one-second preview and pursuit match geometry at boundaries and high speeds',()=>{for(const speed of [0,15.999,16,16.001,27.999,28,28.001,44.999,45,45.001,58,60])for(const lateral of [0,5]){const f=fixture();f.set('ego.speedFwd',speed/40);f.set('ego.speedRight',lateral/40);for(let k=0;k<5;k++)f.set(`look${k}.right`,.02*(k+1));f.run();const x=previewReference(f.obs,'fwd'),y=previewReference(f.obs,'right'),curvature=2*y/(70*Math.max(x*x+y*y,(4/70)**2));close(f.v('aimForward'),x);close(f.v('aimRight'),y);close(f.v('pursuitCurvature'),curvature);close(f.v('pursuitWheel'),Math.atan(2.85*curvature));}});


test('horizontal speed and front-axle compensation match independent vector geometry',()=>{
  for(const vf of [-1.5,-.15,0,.15,.8,1.5])for(const vr of [-1,.0,.7]){
    const f=fixture();f.set('ego.speedFwd',vf);f.set('ego.speedRight',vr);f.set('ego.slipAngle',.18);f.set('ego.yawRate',.3);f.run();
    const v=40*Math.hypot(f.obs[OBS.index['ego.speedFwd']],f.obs[OBS.index['ego.speedRight']]);close(f.v('horizontalSpeed'),v/40);
    close(f.v('frontAxleYawTime'),3*1.45/(.6*Math.max(6,v)));
    close(f.v('followingSteer'),1.25*Math.atan(2.85*f.v('pursuitCurvature'))/.6+f.obs[OBS.index['ego.slipAngle']]/.6+3*1.45/(.6*Math.max(6,v))*(f.v('expectedYaw')-f.obs[OBS.index['ego.yawRate']]));
  }
  const f=fixture();f.set('ego.speedFwd',0);f.set('ego.speedRight',1);f.run();assert.ok(f.v('brake')>.9);assert.equal(f.v('throttle'),0);
});

test('pace-note braking anticipates deceleration and never brakes airborne',()=>{
  for(const grip of [.85,1.1,1.25])for(const future of [.6,.9,1.2]){
    const f=fixture();f.set('ego.surfaceGrip',grip);f.set('ego.pace',.9);f.set('look0.pace',future);f.set('ego.speedFwd',.81);f.run();
    const p=f.obs[OBS.index['ego.pace']]*.9,q=f.obs[OBS.index['look0.pace']]*.9;
    const ff=clip(Math.max(0,((40*p)**2-(40*q)**2)/16)/(9.81*2*f.obs[OBS.index['ego.surfaceGrip']]));
    close(f.v('brakingFeedforward'),ff);close(f.v('brake'),clip(ff-14*(p-f.obs[OBS.index['ego.speedFwd']])));
    if(future<.9){assert.ok(f.v('brake')>0);assert.equal(f.v('throttle'),0);}
    f.set('ego.wheelsDown',0);f.run();assert.equal(f.v('brake'),0);
  }
});

test('larger front-axle steering range cannot leak through airborne or recovery gates',()=>{
  const f=fixture();f.set('ego.slipAngle',1.5);f.set('ego.yawRate',-1.5);
  for(let k=0;k<5;k++){f.set(`look${k}.fwd`,.001);f.set(`look${k}.right`,4/70);}
  f.set('ego.wheelsDown',0);f.run();assert.ok(f.v('followingSteer')>6);assert.equal(f.v('steer'),0);
  f.set('ego.wheelsDown',1);f.set('ray0',2/45);f.set('ego.stallTimer',.7);state(f,'recover',1);state(f,'turn',-1);state(f,'gear',1);f.run();assert.equal(f.v('escapeActive'),1);close(f.v('steerChoice'),f.v('recoverySteer'));
});

test('fast approaches preserve one second to settle for jumps and 1.5 seconds to acquire crates',()=>{
  for(const v of [20,35,50,58]){
    const f=fixture();f.set('ego.speedFwd',v/40);f.set('ego.toJump',35/120);f.set('ego.pace',1.5);f.set('arms.toCrate',.3);f.set('arms.crateRight',.5);f.run();
    const speed=40*f.obs[OBS.index['ego.speedFwd']],d=120*f.obs[OBS.index['ego.toJump']];assert.equal(f.v('awayFromJump'),d>=Math.max(25,speed)?1:0);assert.equal(f.v('crateTimeRoom'),f.v('crateRange')>=1.5*speed?1:0);
    if(v>=50){assert.equal(f.v('crateSeeking'),0);assert.equal(f.v('crateOffset'),0);}
  }
});

test('zero towed slots are absent; wrecks at any heading are passed but never displayed as targets',()=>{const f=fixture();f.run();assert.equal(f.v('trafficExists'),0);assert.equal(f.v('passing'),0);for(const heading of [-1,0,1]){rival(f,4,{alive:0,headingCos:heading});f.run();assert.equal(f.v('passing'),1);assert.equal(f.v('displayTarget4'),0);assert.ok(f.v('requestedOffset')<0);}f.set('opp4.solid',0);f.run();assert.equal(f.v('trafficExists'),0);});

test('passing picks the free side, stays inside the road and smoothly returns',()=>{const f=fixture();rival(f,0);rival(f,1,{fwd:.1,right:-.03,dist:.104});f.run();assert.equal(f.v('passDirection'),1);for(let k=0;k<30;k++)f.run();assert.ok(f.v('boundedOffset')>2);f.set('opp0.solid',0);f.set('opp1.solid',0);for(let k=0;k<30;k++)f.run();assert.ok(Math.abs(f.v('passOffset'))<.05);f.set('ego.trackOffset',.7);f.set('ego.lineOffset',0);rival(f,0);f.set('ray4',0);for(let k=0;k<30;k++)f.run();assert.ok(f.v('boundedOffset')<=f.v('passUpper')+1e-8);});

test('aggression only narrows a nearby passing gap, ignores backmarkers without grudge, never changes speed or gear',()=>{const f=fixture();f.set('ego.toCrossing',.1);rival(f,0,{raceGap:1});f.run();assert.equal(f.v('activeLean'),0);f.r.state[0]=.8;f.run();assert.equal(f.v('activeLean'),1);const desired=f.v('desiredSpeed');assert.equal(f.v('reverse'),0);f.set('ego.temperAggression',0);f.run();close(f.v('desiredSpeed'),desired);f.set('opp0.fwd',-.4);f.run();assert.equal(f.v('activeLean'),0);assert.equal(f.v('passing'),0);assert.equal(f.v('reverse'),0);});

test('jump approach suppresses passing, lip limits steer, and airborne wheels receive no brake',()=>{const f=fixture();rival(f,0);f.set('ego.toJump',.02);f.set('look3.right',.6);f.set('ego.speedFwd',.8);f.run();assert.equal(f.v('passing'),0);assert.ok(Math.abs(f.v('steer'))<=.18+1e-8);f.set('ego.wheelsDown',0);f.run();assert.equal(f.v('brake'),0);assert.equal(f.v('steer'),0);f.set('ego.wheelsDown',1);f.run();assert.ok(f.v('brake')>0);});

test('at racing speed traction envelopes decrease with wheelspin and large body slip',()=>{const f=fixture();f.set('ego.speedFwd',12/40);for(const slip of [0,.1,.2,.3,.5])for(const spin of [0,.12,.22,.32,.5]){f.set('ego.slipAngle',slip);f.set('ego.rearSlip',spin);f.run();close(f.v('slipGrip'),clip(1-6*Math.max(0,f.obs[OBS.index['ego.slipAngle']]-.1)));close(f.v('spinGrip'),clip(1-5*Math.max(0,f.obs[OBS.index['ego.rearSlip']]-.12)));}});

test('low-speed slip authority follows lateral load at 2–6 m/s in every horizontal direction',()=>{
  for(const speed of [0,1,2,2.001,4,5.999,6,8])for(const angle of [0,.4,Math.PI/2,Math.PI]){const f=fixture();f.set('ego.speedFwd',speed*Math.cos(angle)/40);f.set('ego.speedRight',speed*Math.sin(angle)/40);f.set('ego.slipAngle',Math.atan(1.4/2.85*Math.tan(.6)));f.set('ego.rearSlip',.22);f.run();
    const vf=f.obs[OBS.index['ego.speedFwd']]*40,vr=f.obs[OBS.index['ego.speedRight']]*40,authority=clip((vf*vf+vr*vr-4)/32),base=clip(1-6*Math.max(0,f.obs[OBS.index['ego.slipAngle']]-.1));close(f.v('slipAuthority'),authority);close(f.v('slipGrip'),1-authority*(1-base));close(f.v('spinGrip'),clip(1-5*(f.obs[OBS.index['ego.rearSlip']]-.12)));
  }
});
test('a nose-wall reverse actually travels backwards and turns toward the route',()=>{

  const r=recoveryCase({name:'nose at wall',s:600,angle:90,offset:-7.2});const back=r.frames.filter(f=>f.reverse>.5);

  assert.ok(r.reverseMetres>2);assert.ok(back.some(f=>f.steer<-.8));assert.ok(back.at(-1).angle<back[0].angle-15);assert.ok(r.firstForward<8);assert.ok(r.progress>20);assert.equal(r.alive,true);

});

test('clear aligned or oblique launches never accumulate stuck time, even with stale stall evidence',()=>{

  for(const angle of [-70,-30,0,30,70]){const f=fixture();f.set('ego.headingCos',Math.cos(angle*Math.PI/180));f.set('ego.headingSin',Math.sin(angle*Math.PI/180));f.set('ego.stallTimer',.95);f.r.state[12]=.6;

    for(let k=0;k<90;k++){f.set('ego.speedFwd',Math.min(7,k/15)/40);f.run();assert.equal(f.v('reverse'),0);assert.equal(f.v('escapeActive'),0);assert.equal(f.v('stuck'),0);}}

});

test('recovery requires sustained blockage, releases with clearance hysteresis, and clears all control latches',()=>{

  const f=fixture();f.set('ego.stallTimer',.3);f.set('ray0',2/45);

  for(let k=0;k<14;k++){f.run();assert.equal(f.v('escapeActive'),0);}for(let k=0;k<3;k++)f.run();assert.equal(f.v('escapeActive'),1);assert.equal(f.v('reverse'),1);

  f.set('ego.inReverse',1);f.set('ego.speedFwd',-1/40);f.set('ray0',4/45);f.run();assert.equal(f.v('escapeActive'),1);assert.equal(f.v('recoveryRelease'),0);

  f.set('ray0',1);f.run();assert.equal(f.v('escapeActive'),0);assert.equal(f.v('reverse'),0);assert.equal(f.v('brake'),.7);

  for(const slot of [13,14,15,17,18])assert.equal(f.r.state[slot],0);

});

test('a forward-moving car does not newly reverse into traffic',()=>{

  const f=fixture();rival(f,0,{fwd:.05,dist:.05});f.set('ego.stallTimer',.8);f.set('ego.speedFwd',2/40);f.set('ego.progressRate',1/40);f.r.state[12]=.6;

  for(let k=0;k<120;k++){f.run();assert.equal(f.v('reverse'),0);assert.equal(f.v('escapeActive'),0);assert.equal(f.v('stuck'),0);}

});

test('backward recovery uses opposite full locks, pauses phase time while shifting, and finishes only at a good heading',()=>{

  for(const sign of [-1,1]){const f=fixture();f.set('ego.headingCos',-.9);f.set('ego.headingSin',sign*.436);f.set(sign>0?'ray8':'ray7',1/45);f.set('ray0',2/45);f.set('ray11',1/45);f.set('ray12',1/45);f.set('ego.stallTimer',.3);f.r.state[12]=.6;f.run();

    assert.equal(f.v('reverse'),1);assert.equal(f.v('escapeTurn'),sign);close(f.v('steer'),-sign);

    for(let k=0;k<30;k++)f.run();assert.equal(f.v('escapeTimer'),0);

    f.set('ego.inReverse',1);f.set('ego.speedFwd',-3/40);for(let k=0;k<55;k++)f.run();assert.equal(f.v('reverse'),0);close(f.v('steer'),sign);

    f.set('ego.inReverse',0);f.set('ego.speedFwd',3/40);f.set('ray0',1);for(let k=0;k<100;k++)f.run();assert.equal(f.v('escapeActive'),1);assert.equal(f.v('reverse'),0);

    f.set('ego.headingCos',.9);f.set('ego.headingSin',.436);f.run();assert.equal(f.v('escapeActive'),0);assert.equal(f.v('turning'),0);

  }

});

test('rear walls select a forward turn and genuine no-motion changes the failed leg',()=>{

  const f=fixture();f.set('ego.headingCos',-1);f.set('ego.stallTimer',.3);f.set('ray13',1/45);f.r.state[12]=.6;f.run();assert.equal(f.v('reverse'),0);assert.equal(Math.abs(f.v('steer')),1);

  let changed=false;for(let k=0;k<30;k++){f.run();changed ||= f.v('phaseFailed')===1;}assert.ok(changed);assert.equal(f.v('reverse'),1);

});

test('recovery geometry uses solid slots and projected widths; zero slots do not block',()=>{

  const f=fixture();f.run();assert.equal(f.v('forwardBlocked'),0);rival(f,0,{alive:0,headingCos:0,headingSin:1,fwd:.035,right:.03,dist:.046});f.run();assert.equal(f.v('forwardBlocked'),1);

  f.set('opp0.solid',0);f.run();assert.equal(f.v('forwardBlocked'),0);

  f.set('ego.halfWidth',.64);f.set('ego.trackOffset',.7);f.set('ego.lineOffset',0);rival(f,0);f.set('ray4',0);for(let k=0;k<30;k++)f.run();close(f.v('passUpper'),6.4*.3-1.6,1e-6);assert.ok(f.v('boundedOffset')<=f.v('passUpper')+1e-8);

});

test('alignment compensation applies after recovery steering, including reverse',()=>{

  const f=fixture();f.r.state[12]=.6;f.set('ego.stallTimer',.5);f.set('ray0',2/45);f.set('ego.alignment',.45);f.run();close(f.v('steer'),Math.max(-1,Math.min(1,f.v('recoverySteer')-.45/3)),1e-7);

});

test('fixed physical open-road and wall cases regain forward travel without repeated latch cycles',()=>{

  for(const example of recoveryCases){const r=recoveryCase(example);assert.equal(r.alive,true,example.name);assert.ok(r.firstForward!==null&&r.firstForward<8,JSON.stringify(r));assert.ok(r.progress>20,example.name);if(example.name.startsWith('A:')||example.name.startsWith('C:'))assert.equal(r.reversals,0,example.name);}

});

test('aggression ablation clamps grudges from decision zero and compares matching car-laps',()=>{

  const f=fixture(),off=peacefulBrain({id:0});rival(f,0);f.set('opp0.hitMe',1);f.set('ego.hitTaken',1);

  for(let k=0;k<60;k++)off.act(f.obs);assert.ok([...off.telemetry.grudge].every(x=>x===0));assert.notEqual(off.telemetry.mode,'hunt');

  const r=compareLaps({lapTimes:[{car:1,lap:1,seconds:51},{car:0,lap:2,seconds:53}]},{lapTimes:[{car:1,lap:1,seconds:49},{car:2,lap:1,seconds:70}]});assert.equal(r.pairs,1);assert.equal(r.meanCost,2);assert.equal(r.overOneSecond,1);assert.equal(r.unmatchedOn,1);assert.equal(r.unmatchedOff,1);assert.equal(compareLaps({lapTimes:[]},{lapTimes:[]}).meanCost,null);

});

test('act reuses its output and telemetry has stable car IDs',()=>{const b=createBrain({id:3}),f=fixture();rival(f,3);let a=b.act(f.obs);assert.equal(b.telemetry.targetId,4);assert.equal(a,b.act(f.obs));assert.equal(b.telemetry.grudge.length,12);for(const x of a)assert.ok(Number.isFinite(x));});

test('unarmed fast-car regression completes five laps with a full lap below 37 seconds without stops',()=>{const r=evaluate(1,{carCount:1,weapons:false});assert.equal(r.laps,5);assert.ok(r.lapTimes.some(l=>l.lap===5));assert.equal(r.finishedByLaps,true);const full=r.lapTimes.filter(l=>l.car===r.winnerId&&l.lap>=2);assert.equal(full.length,4);assert.equal(r.winnerBestLap,Math.min(...full.map(l=>l.seconds)));assert.equal(r.leaderBestLap,r.winnerBestLap);assert.ok(r.winnerBestLap<=37);assert.equal(r.koTotal,0);assert.equal(r.stuckPercent,0);});

test('a shortened first lap cannot hide the deliberately slower pace-share fault',async()=>{
  const {brainFromSpec}=await import('../tools/nn/grid-regression.mjs');
  const faulty=structuredClone(spec);faulty.biases[faulty.names.indexOf('paceShare')-faulty.inputCount]=.8;
  const r=evaluate(1,{carCount:1,weapons:false,brainFactory:brainFromSpec(faulty)});
  assert.equal(r.finishedByLaps,true);assert.ok(r.lapTimes.find(l=>l.lap===1).seconds<37);
  const full=r.lapTimes.filter(l=>l.lap>=2);assert.equal(full.length,4);assert.ok(full.every(l=>l.seconds>38));
  assert.equal(r.winnerBestLap,Math.min(...full.map(l=>l.seconds)));assert.equal(r.leaderBestLap,r.winnerBestLap);assert.ok(r.winnerBestLap>37);
});

test('best-lap metrics remain unavailable when only the short opening lap completes',()=>{
  const r=evaluate(1,{carCount:1,weapons:false,laps:1});assert.equal(r.finishedByLaps,true);assert.equal(r.lapTimes.length,1);
  assert.equal(r.winnerBestLap,null);assert.equal(r.leaderBestLap,null);
});

test('a full grid progresses and records actual credited damage',()=>{const w=createWorld({seed:1,brainFactory:createBrain});for(let k=0;k<40*240;k++)stepWorld(w);assert.ok(w.cars.some(c=>c.progress>500));assert.ok(w.cars.reduce((s,c)=>s+c.damageDealt,0)>0);for(const car of w.cars)for(const v of [car.px,car.py,car.pz,car.health])assert.ok(Number.isFinite(v));});


const state=(f,name,value)=>{f.r.state[spec.names.indexOf('memory.'+name)-OBS.size]=value;};
const mode=f=>['hunt','race','drift','unstick'][spec.modes.map(id=>f.r.values[id]).indexOf(Math.max(...spec.modes.map(id=>f.r.values[id])))];

test('rear-quarter traffic cannot mask a forward wreck, but still occupies its passing lane',()=>{
  const f=fixture();f.set('ego.speedFwd',.5);rival(f,0,{fwd:-.035,right:.035,dist:Math.hypot(.035,.035),relVelFwd:0});rival(f,1,{alive:0,fwd:.12,dist:.12});f.run();
  assert.equal(f.v('target0'),0);assert.equal(f.v('target1'),1);assert.equal(f.v('passing'),1);assert.equal(f.v('requestedOffset'),-3);assert.equal(f.v('lane1.0.blocked'),1);
});

test('post-collision stale lock is reconsidered and moving route loss has a leg deadline',()=>{
  for(const sign of [-1,1]){const f=fixture();f.set('ego.headingCos',Math.cos(138*Math.PI/180));f.set('ego.headingSin',sign*Math.sin(138*Math.PI/180));f.set('ego.speedFwd',5.2/40);f.set('ego.progressRate',-4/40);f.set('ego.stallTimer',.7);
    state(f,'recover',1);state(f,'turning',1);state(f,'turn',-sign);state(f,'escape',1);state(f,'legTime',1.8);state(f,'routeDebt',3);f.run();
    assert.equal(f.v('turnReconsider'),1);assert.equal(f.v('escapeTurn'),sign);assert.equal(f.v('routeFailed'),1);assert.equal(f.v('phaseChange'),1);assert.equal(f.v('reverse'),1);assert.ok(f.v('routeDebt')>3);assert.equal(f.v('phaseSlow'),0);
    f.set('ego.inReverse',1);f.set('ego.speedFwd',-3/40);f.set('ego.progressRate',1/40);f.run();assert.ok(f.v('routeDebt')<3.14);assert.equal(f.v('escapeTurn'),sign);
    f.set('ego.headingCos',1);f.set('ego.headingSin',0);f.run();assert.equal(f.v('escapeActive'),0);assert.equal(f.v('routeDebt'),0);assert.equal(f.v('legTime'),0);
  }
  // A wall-clock leg deadline must expire even when the requested gear never engages.
  const f=fixture();f.set('ego.headingCos',-1);f.set('ego.stallTimer',.8);f.set('ego.speedFwd',5.2/40);f.set('ego.progressRate',-2/40);state(f,'recover',1);state(f,'turning',1);state(f,'gear',1);state(f,'turn',1);
  let replanned=false;for(let k=0;k<65;k++){f.run();replanned ||=f.v('routeFailed')===1&&f.v('phaseChange')===1;}assert.ok(replanned);assert.ok(f.v('routeDebt')>3);
});

test('aggressive narrowing has safety gates, a half-second pulse and four-second rest',()=>{
  const mutations=[f=>f.set('ego.wheelsDown',0),f=>f.set('ego.headingCos',.8),f=>f.set('ego.slipAngle',.2),f=>{state(f,'recover',1);state(f,'turning',1);state(f,'turn',1);f.set('ego.headingCos',-.5);},f=>f.set('ego.trackOffset',-.75)];
  for(const mutate of mutations){const f=fixture();f.set('ego.toCrossing',.1);rival(f,0);mutate(f);f.run();assert.equal(f.v('leaning'),0);assert.equal(f.v('activeLean'),0);}
  const f=fixture();f.set('ego.toCrossing',.1);rival(f,0);let ticks=0,starts=[];for(let k=0;k<300;k++){f.run();ticks+=f.v('leaning');if(f.v('leanStart'))starts.push(k);if(k>=15&&k<135){assert.equal(f.v('leaning'),0);close(f.v('boundedOffset'),f.v('boundedNeutral'));}}
  assert.ok(ticks>=30&&ticks<=45);assert.ok(starts.length>=2);for(let k=1;k<starts.length;k++)assert.ok(starts[k]-starts[k-1]>=135);
});

test('telemetry reports effective grounded narrowing and horizontal drift',()=>{
  const air=fixture();rival(air,0);air.set('ego.wheelsDown',0);air.run();assert.equal(mode(air),'race');
  const side=fixture();side.set('ego.speedRight',.5);side.set('ego.slipAngle',1.5);side.run();assert.equal(mode(side),'drift');
  const clamped=fixture();rival(clamped,0);clamped.set('ego.halfWidth',.64);clamped.set('ego.trackOffset',-.75);clamped.run();assert.equal(mode(clamped),'race');assert.equal(clamped.v('effectiveNarrowing'),0);
  const live=fixture();live.set('ego.toCrossing',.1);rival(live,0);live.run();assert.equal(mode(live),'hunt');assert.ok(Math.abs(live.v('boundedNeutral'))-Math.abs(live.v('boundedOffset'))>=.01);
});

test('display rage responds to contact and lost places with no path to driving or its recurrent state',()=>{
  const a=fixture(),b=fixture();a.set('ego.racePosition',0);b.set('ego.racePosition',1/11);b.set('opp0.iHit',.2);a.run();b.run();assert.ok(b.v('shownRage')>.69);assert.equal(a.v('rage'),b.v('rage'));assert.deepEqual(spec.actions.map(id=>a.r.values[id]),spec.actions.map(id=>b.r.values[id]));
  const driving=[...spec.actions,...spec.stateOutputs.slice(0,24)],seen=new Set();function visit(id){if(seen.has(id))return;seen.add(id);if(id<spec.inputCount)return;for(let k=spec.offsets[id-spec.inputCount];k<spec.offsets[id-spec.inputCount+1];k++)visit(spec.columns[k]);}driving.forEach(visit);
  for(const n of ['memory.displayRage','memory.previousPosition','ego.racePosition','shownRage','displayRage'])assert.ok(!seen.has(spec.names.indexOf(n)),n);
  const before=b.v('displayRage');b.set('opp0.iHit',0);for(let k=0;k<240;k++)b.run();close(b.v('displayRage'),before/2);
});


test('route-loss deadline preserves an engaged turn that reduces heading error, but never exempts a failed shift',()=>{
  for(const gear of [0,1])for(const sign of [-1,1])for(const yaw of [-.396/3,-1e-5/3,0,1e-5/3,.396/3])for(const engaged of [false,true]){
    const f=fixture(),angle=sign*(gear?60:151.2)*Math.PI/180;
    f.set('ego.headingSin',Math.sin(angle));f.set('ego.headingCos',Math.cos(angle));f.set('ego.yawRate',yaw);f.set('ego.speedFwd',(gear?-3.5:3.5)/40);f.set('ego.progressRate',-3/40);f.set('ego.stallTimer',.7);f.set('ego.inReverse',engaged?gear:1-gear);
    for(const [name,value] of Object.entries({recover:1,turning:1,turn:sign,gear,escape:1,legTime:1.8,routeDebt:3}))state(f,name,value);
    f.run();const improving=engaged&&f.obs[OBS.index['ego.headingSin']]*f.obs[OBS.index['ego.yawRate']]>0;
    assert.equal(f.v('routeFailed'),Number(!improving),JSON.stringify({gear,sign,yaw,engaged}));
    assert.equal(f.v('phaseChange'),Number(!improving));if(improving){assert.equal(f.v('reverse'),gear);assert.equal(f.v('recoveryBrake'),0);}
  }
  // A successful forward turn may lose route until the nose crosses 90 degrees.
  const f=fixture();for(const [name,value] of Object.entries({recover:1,turning:1,turn:1,escape:1,legTime:1.8,routeDebt:3}))state(f,name,value);
  f.set('ego.speedFwd',3.5/40);f.set('ego.yawRate',.396/3);f.set('ego.stallTimer',.7);
  for(let tick=0;tick<90;tick++){const angle=151.2*Math.PI/180-tick*.396/30;f.set('ego.headingSin',Math.sin(angle));f.set('ego.headingCos',Math.cos(angle));f.set('ego.progressRate',3.5*Math.cos(angle)/40);f.run();assert.equal(f.v('routeFailed'),0);assert.equal(f.v('phaseChange'),0);assert.equal(f.v('reverse'),0);assert.equal(f.v('recoveryBrake'),0);}
  f.set('ego.inReverse',1);f.run();assert.equal(f.v('routeFailed'),1);assert.equal(f.v('phaseChange'),1);
});


test('soft deadlines retain opportunity and posture, with grounded hard expiry at nineteen seconds',()=>{
  const keys=['barnBurner','grudgeSeeker','welcomeMat','oilSlick','smokeBomb','threshingWhirl','repoHook','bedspring','prizeBull','grandPiano','foghorn'];
  for(const key of keys){const f=fixture();f.set('arms.'+key,1);state(f,'weaponAge',20);f.run();assert.equal(f.v('fire'),0,key+' ready');f.set('arms.ready',1);f.set('ego.wheelsDown',0);f.run();assert.equal(f.v('fire'),0,key+' airborne hard expiry');f.set('ego.wheelsDown',1);f.run();assert.equal(f.v('fire'),1,key+' hard expiry');assert.equal(f.v('weaponAgeNext'),0);}
  for(const key of ['barnBurner','repoHook','welcomeMat','oilSlick','smokeBomb','bedspring','threshingWhirl','foghorn']){const f=fixture();f.set('arms.'+key,1);f.set('arms.ready',1);state(f,'weaponAge',18);f.run();assert.equal(f.v('fire'),0,key+' no opportunity at soft expiry');}
  const f=fixture();f.set('arms.barnBurner',1);f.set('arms.ready',1);rival(f,10,{fwd:.15,dist:.15,right:0,relVelFwd:0});f.set('arms.aheadRange',.15);state(f,'weaponAge',18);f.set('ego.slipAngle',.5);f.run();assert.equal(f.v('fire'),0);f.set('ego.slipAngle',0);f.run();assert.equal(f.v('fire'),1);
  const b=createBrain({id:0});assert.equal(b.act(f.obs).length,6);assert.ok([0,1].includes(b.telemetry.firing));
});

test('weapon temperament changes timing, aim range, grudge restraint and defensive threat threshold',()=>{
  const first=(aggression,vengeance=0,grudged=false)=>{const f=fixture();f.set('arms.barnBurner',1);f.set('arms.ready',1);f.set('arms.aheadRange',.15);rival(f,10,{fwd:.15,dist:.15,relVelFwd:0});f.set('ego.temperAggression',aggression);f.set('ego.temperVengeance',vengeance);if(grudged){rival(f,0,{fwd:-.1,right:.1,dist:.15});state(f,'grudge0',1);}for(let k=0;k<400;k++){f.run();if(f.v('fire'))return k/30;}throw Error('No fire');};
  assert.ok(first(1)<first(0));assert.ok(first(1,1,true)>first(1,0,true)+2);
  for(const nerve of [0,1]){const f=fixture();f.set('arms.foghorn',1);f.set('arms.ready',1);f.set('arms.incoming',.75);f.set('ego.temperNerve',nerve);f.run();assert.equal(f.v('fire'),nerve?0:1);}
  for(const aggressive of [0,1]){const f=fixture();f.set('arms.barnBurner',1);f.set('arms.ready',1);f.set('arms.aheadRange',.4);rival(f,10,{fwd:.4,dist:.4,relVelFwd:0});f.set('ego.temperAggression',aggressive);state(f,'weaponAge',2);f.run();assert.equal(f.v('fire'),aggressive);}
});

test('hidden slots preserve remembered identity and leaking grudges without creating a zero-distance obstacle',()=>{
  const f=fixture();rival(f,0);state(f,'grudge0',.8);f.run();assert.equal(f.v('displayTarget0'),1);for(const name of OBS.names.filter(n=>n.startsWith('opp0.')))f.set(name,0);f.set('arms.blinded',1);f.run();assert.equal(f.v('displayTarget0'),1);assert.equal(f.v('trafficExists'),0);assert.equal(f.v('forwardBlocked'),0);assert.ok(f.v('grudge0')>.79);assert.ok(f.v('paceShare')<.9);
});

test('whirl, airborne and abrupt throws clear recovery and keep it inhibited during settling',()=>{
  for(const mutate of [f=>f.set('arms.whirling',1),f=>f.set('ego.wheelsDown',0),f=>f.set('ego.hitTaken',.5),f=>f.set('ego.speedRight',.5)]){const f=fixture();f.set('ego.headingCos',-1);f.set('ego.stallTimer',.9);state(f,'stuck',.6);state(f,'recover',1);mutate(f);f.run();assert.equal(f.v('escapeActive'),0);assert.equal(f.v('reverse'),0);assert.equal(f.v('stuck'),0);assert.equal(f.v('recoveryAllowed'),0);}
});

test('oil limits inputs and hazard offsets stay inside available road',()=>{
  const f=fixture();f.set('arms.oiled',1);f.set('look1.right',.4);for(let k=0;k<30;k++){const previous=f.r.state[spec.names.indexOf('memory.oilThrottle')-OBS.size];f.run();assert.ok(Math.abs(f.v('steer'))<=.25+1e-8);assert.ok(f.v('throttle')<=.35+1e-8);assert.ok(f.v('throttle')<=previous+.080001);}
  f.set('arms.oiled',0);f.set('arms.toHazard',.3);for(let k=0;k<30;k++)f.run();assert.equal(f.v('hazardAvoid'),1);assert.ok(f.v('boundedOffset')>=f.v('passLower')-1e-8);assert.ok(f.v('boundedOffset')<=f.v('passUpper')+1e-8);
  f.set('ego.halfWidth',.64);f.run();assert.equal(f.v('hazardRoom'),0);assert.equal(f.v('hazardAvoid'),0);
});

test('credited weapon damage reaches rage and the correct fixed-slot grudge',async()=>{
  const {weaponHit}=await import('../src/sim/world.js');const {fillObservation}=await import('../src/sim/sensors.js');const w=createWorld({seed:1,carCount:2});w.phase='racing';weaponHit(w,w.cars[1],w.cars[0],.02,w.cars[0].px,w.cars[0].pz,.5);assert.equal(w.cars[0].lastHitter,1);fillObservation(w,w.cars[0],w.obs[0]);const b=createBrain(w.cars[0]);b.act(w.obs[0]);assert.ok(b.telemetry.grudge[1]>0);assert.ok(b.telemetry.rage>0);
});

test('absent tail range cannot become a tactical drop at maximum aggression and rage',()=>{const f=fixture();f.set('arms.welcomeMat',1);f.set('arms.ready',1);f.set('ego.temperAggression',1);state(f,'rage',1);state(f,'weaponAge',2);f.run();assert.equal(f.v('rearOpportunity'),0);assert.equal(f.v('fire'),0);f.set('arms.behindRange',.99);f.run();assert.equal(f.v('rearOpportunity'),1);assert.equal(f.v('fire'),1);});


test('each weapon class takes its intended tactical opportunity after pickup delay',()=>{
  const cases=[['barnBurner',{'aheadRange':.15,'aheadBearing':.03}],['repoHook',{'aheadRange':.3}],['grudgeSeeker',{}],['prizeBull',{}],['grandPiano',{}],...['welcomeMat','oilSlick','smokeBomb','bedspring'].map(k=>[k,{behindRange:.4}]),['threshingWhirl',{closeRivals:.25}],['foghorn',{closeRivals:.25}]];
  for(const [key,extra] of cases){const f=fixture();f.set('arms.'+key,1);f.set('arms.ready',1);for(const [n,v] of Object.entries(extra))f.set('arms.'+n,v);if(key==='barnBurner')rival(f,10,{fwd:.15*Math.cos(.03),right:.15*Math.sin(.03),dist:.15,relVelFwd:0});f.run();assert.equal(f.v('fire'),0,key);state(f,'weaponAge',2);f.run();assert.equal(f.v('fire'),1,key);assert.equal(f.v('weaponAgeNext'),0);}
  const f=fixture();f.set('arms.barnBurner',1);f.set('arms.ready',1);f.set('arms.aheadRange',.1);f.set('arms.aheadBearing',.3);state(f,'weaponAge',2);f.run();assert.equal(f.v('fire'),0);f.set('arms.aheadBearing',0);f.set('ego.wheelsDown',0);f.run();assert.equal(f.v('fire'),0);
});


test('fixed mine encounter detours clear with road margin',async()=>{const {hazardCase}=await import('../tools/nn/hazard-case.mjs');const r=hazardCase('mine');assert.ok(r.clear);assert.ok(r.minRoad>1.6);assert.equal(r.health,1);assert.ok(r.progress>=70);});


test('settling exception permits urgent real obstruction but preserves forced-motion protection',()=>{
  const setup=()=>{const f=fixture();f.set('ego.stallTimer',.7);f.set('ray0',2/45);f.set('ego.hitTaken',.5);state(f,'settle',1.8);return f;};
  const f=setup();for(let k=0;k<20;k++)f.run();assert.equal(f.v('settleEscape'),1);assert.equal(f.v('recoveryAllowed'),1);assert.equal(f.v('escapeActive'),1);assert.equal(f.v('reverse'),1);
  for(const [n,x] of [['ego.wheelsDown',0],['ego.upright',.6],['ego.speedRight',3.1/40],['ray0',1],['arms.whirling',1],['ego.stallTimer',.5]]){const g=setup();g.set(n,x);g.run();assert.equal(g.v('settleEscape'),0,n);assert.equal(g.v('recoveryAllowed'),0,n);}
  const retained=setup();state(retained,'recover',1);state(retained,'gear',1);retained.run();assert.equal(retained.v('escapeActive'),1);
});

test('hazards rotate from nose to road and the selected waypoint rotates back',()=>{
  for(const degrees of [-15,0,15])for(const lateral of [-1,0,1]){const f=fixture(),angle=degrees*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle);f.set('ego.headingCos',cs);f.set('ego.headingSin',sn);f.set('arms.toHazard',(40*cs-lateral*sn)/60);f.set('arms.hazardRight',(40*sn+lateral*cs)/10);f.run();close(f.v('hazardLinePosition'),lateral,2e-6);close(f.v('hazardRoadForward'),40,1e-5);assert.equal(f.v('hazardAvoid'),1);const u=f.v('hazardAimFloor'),v=f.v('hazardAimRoadRight');close(f.v('hazardAimForward'),u*f.obs[OBS.index['ego.headingCos']]-v*f.obs[OBS.index['ego.headingSin']],1e-8);close(f.v('hazardAimRight'),u*f.obs[OBS.index['ego.headingSin']]+v*f.obs[OBS.index['ego.headingCos']],1e-8);}
});

test('rocket corridor rejects a three-metre miss and relative lateral interception failures',()=>{
  for(const [right,vr,expected] of [[3,0,0],[0,20.5,0],[0,0,1],[1,0,1]]){const f=fixture(),distance=Math.hypot(30,right);rival(f,0,{fwd:.3,right:right/100,dist:distance/100,relVelFwd:0,relVelRight:vr/40});f.set('arms.barnBurner',1);f.set('arms.ready',1);f.set('arms.aheadRange',distance/100);f.set('arms.aheadBearing',Math.atan2(right,30));state(f,'weaponAge',2);f.run();assert.equal(f.v('rocketOpportunity'),expected,JSON.stringify({right,vr}));assert.equal(f.v('fire'),expected);close(f.v('rocketFlightTime'),(100*f.obs[OBS.index['opp0.fwd']]-3.4)/ARSENAL.rocket.speed,1e-8);}
});

test('rocket blast attribution survives nested wheelOff and does not count a fly-by',async()=>{const {rocketCase}=await import('../tools/nn/rocket-case.mjs');const hit=rocketCase(0),miss=rocketCase(3);assert.ok(hit.damage>ARSENAL.rocket.damage*.65);assert.ok(hit.wheelOff>0);assert.equal(hit.damagingShots,1);assert.equal(miss.damage,0);assert.equal(miss.damagingShots,0);});

test('physical oil encounter clears its full body corridor',async()=>{const {hazardCase}=await import('../tools/nn/hazard-case.mjs');const r=hazardCase('oil');assert.ok(r.clear);assert.ok(r.minRoad>1.6);assert.ok(r.seconds<3);assert.equal(r.health,1);});

test('no-crates grid pins measured checkpoints and retains the recovery requirement',async()=>{const {gridRegression}=await import('../tools/nn/grid-regression.mjs');const r=gridRegression();assert.equal(r.preWeapons.koTotal,6);assert.equal(r.beforeReview.koTotal,8);assert.ok(r.current.finishedByLaps);assert.ok(r.current.koTotal<=r.beforeReview.koTotal);assert.ok(r.current.stalled<=r.beforeReview.stalled);});


test('hard expiry clock fires targetless only at nineteen seconds and never while airborne',()=>{const f=fixture();f.set('arms.barnBurner',1);f.set('arms.ready',1);let first=0;for(let k=1;k<=580;k++){f.run();if(f.v('fire')){first=k;break;}}assert.ok(first>=570&&first<=571);f.set('ego.wheelsDown',0);state(f,'weaponAge',18.99);for(let k=0;k<90;k++){f.run();assert.equal(f.v('fire'),0);}f.set('ego.wheelsDown',1);f.run();assert.equal(f.v('fire'),1);});


test('rocket matching and interception have no graph path into driving actions',()=>{const seen=new Set();function visit(id){if(seen.has(id))return;seen.add(id);if(id<spec.inputCount)return;for(let j=spec.offsets[id-spec.inputCount];j<spec.offsets[id-spec.inputCount+1];j++)visit(spec.columns[j]);}spec.actions.slice(0,5).forEach(visit);for(const name of ['rocketIntercept','rocketFlightTime','rocketCorridor','rocketOpportunity'])assert.ok(!seen.has(spec.names.indexOf(name)),name);});


test('open-road closing response solves relative braking distance and cannot enforce a preferred gap',()=>{
 for(const speed of [6,20,40,58])for(const delta of [-40,-15,-5,0,5])for(const d of [7,15,30,55]){
  const f=fixture();f.set('ego.speedFwd',speed/40);f.set('ego.pace',1.45);rival(f,0,{fwd:d/100,dist:d/100,right:0,relVelFwd:delta/40});f.run();
  const v=40*f.obs[OBS.index['ego.speedFwd']],rel=40*f.obs[OBS.index['opp0.relVelFwd']],distance=100*f.obs[OBS.index['opp0.fwd']],closing=Math.max(0,-rel);
  const urgent=closing>1+1e-6&&distance<=5.5+.25*closing+closing*closing/16;
  const safe=-2+Math.sqrt(4+16*Math.max(0,distance-5.5));
  const expected=urgent?Math.max(5/40,Math.min(1.5,(v+rel+safe)/40)):1.5;
  close(.25*safe+safe*safe/16,Math.max(0,distance-5.5),1e-8);
  close(f.v('trafficSpeedLimit'),expected,1e-8);close(f.v('desiredSpeed'),Math.min(f.v('freeDesiredSpeed'),expected),1e-8);
 }
 const f=fixture();rival(f,0,{fwd:-.04,dist:.04,right:0});f.run();close(f.v('trafficSpeedLimit'),1.5);
});

test('crossroads and landing grace disable new yielding, while grounded hit grace does not',()=>{
 const f=fixture();f.set('ego.speedFwd',.75);f.set('ego.pace',1);rival(f,0,{fwd:.08,dist:.08,right:0,relVelFwd:-.25});
 f.set('ego.toCrossing',.1);f.run();close(f.v('trafficSpeedLimit'),1.5);close(f.v('desiredSpeed'),f.v('freeDesiredSpeed'));
 f.set('ego.toCrossing',1);for(let k=0;k<20;k++){f.run();close(f.v('trafficSpeedLimit'),1.5);}for(let k=0;k<5;k++)f.run();assert.ok(f.v('trafficSpeedLimit')<.75);
 f.set('ego.wheelsDown',0);f.run();f.set('ego.wheelsDown',1);for(let k=0;k<25;k++){f.run();close(f.v('trafficSpeedLimit'),1.5);}for(let k=0;k<7;k++)f.run();assert.ok(f.v('trafficSpeedLimit')<.75);
 state(f,'settle',1.8);f.run();assert.ok(f.v('trafficSpeedLimit')<.75);
 f.set('arms.whirling',1);f.run();close(f.v('trafficSpeedLimit'),1.5);
});

test('open-road elbow remains off and occupied lanes do not get a passing request',()=>{
 const f=fixture();rival(f,0);for(let k=0;k<300;k++){f.run();assert.equal(f.v('leaning'),0);}
 rival(f,1,{fwd:.02,right:-.03,dist:.04});rival(f,2,{fwd:.02,right:.03,dist:.04});f.run();assert.equal(f.v('freePass'),0);close(f.v('requestedOffset'),0);
});


test('contact metrics separate generated crossing and landing zones and preserve nested damage',async()=>{
 const {contactMetrics}=await import('../tools/nn/contact-metrics.mjs');const w=createWorld({carCount:2}),m=contactMetrics(w),cross=w.track.crossings[0],j=w.track.jumps[0];
 const hit=(x,z)=>({type:'hit',a:0,b:1,x,z,closing:7,strength:.4,upper:-1,zoneA:'front',zoneB:'rear',dmgA:.1,dmgB:0});
 w.cars[0].trackS=cross.sA;w.cars[1].trackS=cross.sB;m.event(hit(cross.x,cross.z));
 w.cars.forEach(c=>c.trackS=cross.sA);m.event(hit(cross.x,cross.z));
 w.cars[0].trackS=j.lipS+j.airLength+j.maxSpeed-.1;m.event(hit(-500,-500));
 w.cars.forEach(c=>c.trackS=200);m.event(hit(-500,-500));
 w.cars[0].health-=.1;w.events.push({type:'wheelOff'});w.events.push({type:'blast'});
 const result=m.result();assert.equal(result.crossing.all,1);assert.equal(result.landing.all,1);assert.equal(result.open.hard,2);close(result.damage[0].weapon,.1);assert.equal(result.damage[0].car,0);
});

test('launch and pulling-away traffic never request new slowing, and a free road lane wins',()=>{
 for(const v of [0,5,20,40])for(const relative of [-.9,0,5])for(const d of [6,14,25]){
  const f=fixture();f.set('ego.speedFwd',v/40);f.set('ego.pace',1.45);for(let k=0;k<5;k++)f.set(`look${k}.pace`,1.45);rival(f,0,{fwd:d/100,dist:d/100,relVelFwd:relative/40});f.run();
  close(f.v('trafficSpeedLimit'),1.5);close(f.v('desiredSpeed'),f.v('freeDesiredSpeed'));assert.equal(f.v('brake'),0);
 }
 const f=fixture();f.set('ego.trackOffset',.5);f.set('ego.lineOffset',0);f.set('ray3',1);f.set('ray4',.8);rival(f,0);f.run();assert.equal(f.v('leanLane1'),0);assert.equal(f.v('leanLane0'),1);assert.equal(f.v('passDirection'),-1);assert.equal(f.v('freePass'),1);
});

test('passing begins in time, survives speed matching, and lets a lapped obstacle be passed',()=>{
 const f=fixture();f.set('ego.speedFwd',1);f.set('ego.pace',1.4);rival(f,0,{fwd:.45,dist:.45,relVelFwd:-.1});f.run();assert.equal(f.v('passing'),1);assert.equal(f.v('freePass'),1);
 for(let k=0;k<5;k++)f.run();f.set('opp0.relVelFwd',0);f.run();assert.equal(f.v('passing'),1);assert.equal(f.v('trafficSpeedLimit'),1.5);
 const b=fixture();b.set('ego.speedFwd',.5);b.set('ego.pace',1);rival(b,0,{fwd:.2,dist:.2,relVelFwd:0,raceGap:-1});b.run();assert.equal(b.v('passing'),1);
 const w=fixture();rival(w,0,{alive:0,fwd:.25,dist:.25,headingCos:-1});w.run();assert.equal(w.v('passing'),1);
});

test('merge guard retains the lane beside another body and releases behind its full length',()=>{
 for(const side of [-1,1])for(const angle of [-.25,0,.25]){
  const f=fixture(),cs=Math.cos(angle),sn=Math.sin(angle),offset=side*3;
  f.set('ego.speedFwd',.5);f.set('ego.lineOffset',offset/9);f.set('ego.headingCos',cs);f.set('ego.headingSin',sn);state(f,'passOffset',offset);state(f,'neutralOffset',offset);
  rival(f,0,{fwd:(1*cs+offset*sn)/100,right:(1*sn-offset*cs)/100,dist:Math.sqrt(10)/100,relVelFwd:0});f.run();assert.equal(f.v('returnBlocked'),1);close(f.v('requestedOffset'),offset);close(f.v('neutralOffset'),offset);
  f.set('opp0.fwd',(-7*cs+offset*sn)/100);f.set('opp0.right',(-7*sn-offset*cs)/100);f.run();assert.equal(f.v('returnBlocked'),0);close(f.v('requestedOffset'),0);
 }
});

test('physical alongside fixture keeps its lane instead of starting an early merge',async()=>{
 const {passingCase}=await import('../tools/nn/passing-case.mjs');const r=passingCase();assert.equal(r.frames[0].hold,1);assert.equal(r.frames[0].offset,-3);assert.equal(r.hits,0);assert.equal(r.health,1);assert.ok(r.roadMargin>2);
});

test('open-road lane occupancy is measured about the racing-line destination, not the displaced nose',()=>{
 for(const side of [-1,1])for(const angle of [-.2,0,.2]){
  const f=fixture(),cs=Math.cos(angle),sn=Math.sin(angle),ego=side*3,other=-side*3;
  f.set('ego.speedFwd',.5);f.set('ego.lineOffset',ego/9);f.set('ego.headingCos',cs);f.set('ego.headingSin',sn);
  const delta=other-ego; rival(f,0,{fwd:(10*cs-delta*sn)/100,right:(10*sn+delta*cs)/100,dist:Math.hypot(10,delta)/100});f.run();
  assert.equal(f.v(`passingLane${side>0?0:1}.0`),1);
  f.set('opp0.solid',0);f.run();assert.equal(f.v(`passingLane${side>0?0:1}.0`),0);
 }
});
