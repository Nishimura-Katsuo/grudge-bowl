import {writeFileSync} from 'node:fs';
import spec from '../../src/ai/weights.js';
import {OBS} from '../../src/sim/sensors.js';
import {createRuntime,compileNetwork} from '../../src/ai/network.js';
import {ACTIVATIONS} from './circuits.mjs';
const consumers=spec.names.map(()=>[]);
for(let row=0;row<spec.biases.length;row++)for(let k=spec.offsets[row];k<spec.offsets[row+1];k++)consumers[spec.columns[k]].push(row+spec.inputCount);
const map=['# The Knot: generated neuron inventory','',`Each row computes activation(bias + sum(weight × source)). L0 has ${OBS.size} observations and ${spec.stateOutputs.length} previous-state inputs. All dependencies are from earlier layers.`,'','| Layer | First | Last | Units |','|---:|---:|---:|---:|',...spec.layers.slice(0,-1).map((s,l)=>`| ${l+1} | ${s} | ${spec.layers[l+1]-1} | ${spec.layers[l+1]-s} |`),'','| Input | Name | Consumers |','|---:|---|---|',...spec.names.slice(0,spec.inputCount).map((n,k)=>`| ${k} | ${n} | ${consumers[k].join(', ')} |`),'','| Layer | Unit | Name | Activation | Affine expression | Consumers |','|---:|---:|---|---|---|---|'];
for(let l=0;l<spec.layers.length-1;l++)for(let id=spec.layers[l];id<spec.layers[l+1];id++){const row=id-spec.inputCount,terms=[];for(let k=spec.offsets[row];k<spec.offsets[row+1];k++)terms.push(`${spec.weights[k]} × v${spec.columns[k]}`);terms.push(spec.biases[row]);map.push(`| ${l+1} | ${id} | ${spec.names[id]} | ${ACTIVATIONS[spec.activations[row]]} | ${terms.join(' + ')} | ${consumers[id].join(', ')} |`);}
for(const name of ['actions','stateOutputs','targets','modes','rageOutput','grudgeOutputs'])map.push('',`${name}: ${spec[name].join(', ')}`);
writeFileSync(new URL('../../docs/NEURON_MAP.md',import.meta.url),map.join('\n')+'\n');
const obs=new Float32Array(OBS.size),set=(n,x)=>obs[OBS.index[n]]=x;
for(const [n,x] of Object.entries({'ego.speedFwd':.5,'arms.toCrate':1,'arms.toHazard':1,'arms.aheadRange':1,'arms.behindRange':1,'ego.pace':.7,'ego.halfWidth':.9,'ego.wheelsDown':1,'ego.upright':1,'ego.raceActive':1,'ego.health':1,'ego.engineHealth':1,'ego.surfaceGrip':1.15,'ego.headingCos':1,'ego.toJump':1,'ego.toCrossing':1,'ego.temperAggression':.8,'ego.temperNerve':.7,'ego.temperVengeance':.7,'opp0.solid':1,'opp0.alive':1,'opp0.los':1,'opp0.headingCos':1,'opp0.fwd':.07,'opp0.dist':.07,'opp0.relVelFwd':-.1}))set(n,x);
for(let k=0;k<14;k++)set(`ray${k}`,1);for(let k=0;k<5;k++){set(`look${k}.fwd`,[8,16,28,45,65][k]/70);set(`look${k}.right`,.03);set(`look${k}.pace`,.7);}
const r=createRuntime(compileNetwork(spec)),frames=[];
const names=['openRoad','crossGrace','trafficFlightGrace','follow0.valid','follow0.closing','follow0.gap','follow0.speedCap','trafficSpeedLimit','freeDesiredSpeed','freePass','horizontalSpeed','previewMetres','steeringSpeedFloor','frontAxleYawTime','frontAxleYawFeedback','physicalGrip','previewPace','paceDeceleration','brakingFeedforward','jumpSettleDistance','awayFromJump','crateTimeRoom','settleEscape','rocketCorridor','rocketIntercept','rocketFlightTime','hardExpiry','hazardRoadForward','hazardLinePosition','hazardAimForward','hazardAimRight','fire','weaponAge','triggerDelay','rocketOpportunity','rearOpportunity','reserveForGrudge','settleClock','recoveryAllowed','hazardAvoid','hazardOffset','oilSteer','oilThrottle','grudge0','rage','displayRage','shownRage','leanSafe','leanClock','leaning','neutralOffset','boundedNeutral','effectiveNarrowing','routeDebt','headingYawAgreement','turnImproving','routeFailed','legTime','turnReconsider','traffic0.valid','target0','trafficExists','passDirection','passing','aggression','activeLean','passWidth','requestedOffset','passOffset','passLower','passUpper','boundedOffset','look.fwd.2','aimRight','aimRadius2','pursuitCurvature','pursuitWheel','expectedYaw','followingSteer','wallReflex','jumpSteer','ground','paceShare','desiredSpeed','speedError','throttleDemand','slipAuthority','fastSlipGrip','slipGrip','spinGrip','forwardBlocked','rearBlocked','releaseRoad','forwardProgress','stuck','escapeTrigger','escapeActive','turning','escapeTimer','phaseSlow','phaseChange','escapeTurn','recoveryBrake','reverse','steer','throttle','brake'];
names.push('follow0.clearance','follow0.safeRoot','follow0.closingNow','follow0.urgent','passRange','passCommitted','returnBlocked','mergeEgoLine','merge0.position','passingLane0.0','passingLane1.0');
function step(label){const state=[...r.state];r.forward(obs);if(label)frames.push({label,observation:[...obs],initialState:state,nextState:[...r.state],activations:names.map(n=>({name:n,id:spec.names.indexOf(n),value:r.values[spec.names.indexOf(n)]})),action:spec.actions.map(id=>r.values[id])});}
step('Passing a slower rival');set('ego.wheelsDown',0);set('ego.speedFwd',.9);set('ego.toJump',0);step('Airborne overspeed');
r.state.fill(0);r.state[12]=.6;set('ego.wheelsDown',1);set('ego.speedFwd',0);set('ego.stallTimer',.3);set('ego.toJump',1);step('Clear road rejects stale stuck evidence');
set('ray0',2/45);r.state[12]=.6;step('Nose-wall recovery requests reverse');
set('ego.inReverse',1);set('ego.speedFwd',-3/40);step('Reverse gear uses the opposing lock');
for(let k=0;k<55;k++)step(null);step('Back-off complete: shift to forward');
set('ego.inReverse',0);set('ego.speedFwd',0);set('ray0',1);step('Clearance releases recovery');
set('ego.speedFwd',1/40);set('ego.slipAngle',Math.atan(1.4/2.85*Math.tan(.6)));step('Kinematic low-speed slip keeps drive');
r.state.fill(0);for(const [key,value] of Object.entries({recover:1,turning:1,turn:1,escape:1,legTime:1.8,routeDebt:3}))r.state[spec.names.indexOf('memory.'+key)-OBS.size]=value;
set('opp0.solid',0);set('ego.headingSin',-Math.sin(138*Math.PI/180));set('ego.headingCos',Math.cos(138*Math.PI/180));set('ego.speedFwd',5.2/40);set('ego.progressRate',-4/40);set('ego.slipAngle',0);set('ego.stallTimer',.7);step('Stale turn and moving route debt replan');
r.state.fill(0);for(const [key,value] of Object.entries({recover:1,turning:1,turn:1,escape:1,legTime:1.8,routeDebt:3}))r.state[spec.names.indexOf('memory.'+key)-OBS.size]=value;
set('ego.headingSin',Math.sin(151.2*Math.PI/180));set('ego.headingCos',Math.cos(151.2*Math.PI/180));set('ego.speedFwd',3.5/40);set('ego.progressRate',3.5*Math.cos(151.2*Math.PI/180)/40);set('ego.yawRate',.396/3);step('Engaged improving turn suppresses route deadline');
set('ego.inReverse',1);step('Wrong engaged gear preserves failed-shift deadline');
r.state.fill(0);set('ego.headingCos',1);set('ego.headingSin',0);set('ego.speedFwd',.5);set('ego.speedRight',0);set('ego.yawRate',0);set('ego.inReverse',0);set('ego.hitTaken',0);set('ego.stallTimer',0);set('ego.progressRate',.5);set('arms.ready',1);set('arms.barnBurner',1);set('arms.aheadRange',.2);set('arms.aheadBearing',.05);for(const [n,v] of Object.entries({solid:1,alive:1,los:1,fwd:.2*Math.cos(.05),right:.2*Math.sin(.05),dist:.2,relVelFwd:0}))set('opp10.'+n,v);
r.state[spec.names.indexOf('memory.weaponAge')-OBS.size]=2;step('Barn Burner aligned at twenty metres');
set('arms.barnBurner',0);set('arms.foghorn',1);set('arms.incoming',.9);step('Foghorn defends against close incoming shot');
set('arms.foghorn',0);set('arms.ready',0);set('arms.whirling',1);r.state[17]=1;r.state[12]=.6;set('ego.headingCos',-1);step('Whirl cancels recovery');
set('arms.whirling',0);set('ego.headingCos',1);set('arms.toHazard',.3);step('Hazard offset uses clear road');
set('arms.oiled',1);step('Oil limits steering and throttle');
// Review fixtures: explicit states isolate each repaired path.
r.state.fill(0);set('arms.oiled',0);set('arms.toHazard',1);set('ego.speedFwd',0);set('ego.progressRate',0);set('ego.upright',1);set('ego.stallTimer',.7);set('ego.hitTaken',.5);set('ray0',2/45);r.state[12]=.6;r.state[27]=1.8;step('Urgent grounded obstruction overrides settling');
r.state.fill(0);set('ego.hitTaken',0);set('ego.stallTimer',0);set('ray0',1);set('ego.headingCos',Math.cos(Math.PI/12));set('ego.headingSin',-Math.sin(Math.PI/12));set('arms.toHazard',40*Math.cos(Math.PI/12)/60);set('arms.hazardRight',-40*Math.sin(Math.PI/12)/10);step('Yawed nose sees a centred road hazard');
set('arms.toHazard',1);set('arms.hazardRight',0);set('ego.headingCos',1);set('ego.headingSin',0);set('arms.barnBurner',1);set('arms.ready',1);set('arms.aheadRange',Math.hypot(.3,.03));set('arms.aheadBearing',Math.atan2(3,30));for(const [n,v] of Object.entries({fwd:.3,right:.03,dist:Math.hypot(.3,.03)}))set('opp10.'+n,v);r.state[26]=2;step('Three-metre rocket fly-by is rejected');
set('arms.aheadRange',1);r.state[26]=18;step('Targetless soft expiry waits');
set('ego.wheelsDown',0);r.state[26]=20;step('Airborne hard expiry waits for grounding');
set('ego.wheelsDown',1);step('Grounded hard expiry releases the item');
const crateNames=['crateDistance','crateLine.right','crateLineError','crateAllowance','crateRange','crateRamp','crateFutureAligned','crateTrafficClear','crateEgoLine','crateFiltered','crateToRight','crateReachError','crateReachAllowance','crateReachable','crateSeeking','crateRequest','crateOffset','crateBounded','crateLaneError','crateHorizon','crateLaneCurvature','crateCancelReturn','crateCurvatureBudget','crateAppliedCurvature','pursuitBaseCurvature'];
names.push(...crateNames);
r.state.fill(0);obs.fill(0);
for(const [n,v] of Object.entries({'ego.speedFwd':.625,'ego.pace':.9,'ego.halfWidth':.9,'ego.wheelsDown':1,'ego.upright':1,'ego.raceActive':1,'ego.headingCos':1,'ego.toJump':1,'ego.toCrossing':1,'ego.surfaceGrip':1.15,'ego.temperAggression':.8,'arms.toHazard':1,'arms.toCrate':40/120,'arms.crateRight':.5,'arms.aheadRange':1,'arms.behindRange':1}))set(n,v);
for(let k=0;k<14;k++)set('ray'+k,1);for(let k=0;k<5;k++){set('look'+k+'.fwd',[8,16,28,45,65][k]/70);set('look'+k+'.pace',.9);}
step('Empty car approaches a crate forty metres ahead and 4.5 metres right');
set('arms.barnBurner',1);step('Pickup immediately removes the crate detour');
set('arms.barnBurner',0);set('arms.toCrate',1);step('Passed or absent crate cannot remain a target');
r.state.fill(0);set('arms.toCrate',35/120);set('arms.crateRight',4/9);set('ego.lineOffset',2.5/9);set('ego.trackOffset',2.5/9);
for(let k=0;k<5;k++)set(`look${k}.right`,-2.5/70);
for(const [n,v] of Object.entries({solid:1,alive:1,los:1,headingCos:1,fwd:-.02,right:-.03,dist:.04}))set('opp0.'+n,v);
step('Filtered crate target goes left: left-side rival vetoes the detour');
r.state.fill(0);set('opp0.right',.03);step('Opposite-side rival leaves the filtered crate lane clear');
r.state.fill(0);r.state[44]=2.26;set('opp0.solid',0);set('opp0.alive',0);set('ego.lineOffset',0);set('ego.trackOffset',0);set('ego.speedFwd',29.63/40);set('arms.toCrate',3.64/120);set('arms.crateRight',7.76/9);
for(let k=0;k<5;k++)set(`look${k}.right`,0);
step('Late row change is unreachable: keep the racing line');
r.state.fill(0);obs.fill(0);
for(const [n,v] of Object.entries({'ego.speedFwd':.81,'ego.pace':.9,'ego.halfWidth':.9,'ego.wheelsDown':1,'ego.upright':1,'ego.raceActive':1,'ego.headingCos':1,'ego.toJump':20/120,'ego.toCrossing':1,'ego.surfaceGrip':1.1,'ego.temperAggression':.8,'arms.toHazard':1,'arms.toCrate':1,'arms.aheadRange':1,'arms.behindRange':1}))set(n,v);
for(let k=0;k<14;k++)set('ray'+k,1);for(let k=0;k<5;k++){set('look'+k+'.fwd',[8,16,28,45,65][k]/70);set('look'+k+'.pace',.85);}
step('Fast car anticipates falling pace before a jump');
set('ego.speedFwd',.6);set('ego.speedRight',.8);set('ego.slipAngle',Math.atan2(32,24));step('Sideways forty metres per second still needs braking');
r.state.fill(0);set('ego.speedFwd',1.25);set('ego.speedRight',0);set('ego.slipAngle',0);set('ego.pace',1.45);set('ego.toJump',1);set('arms.toCrate',.3);set('arms.crateRight',.5);step('Optional high-speed crate is skipped for insufficient approach time');
writeFileSync(new URL('./trace.json',import.meta.url),JSON.stringify(frames,null,2)+'\n');
const inspection={layers:spec.layers.length-1,units:spec.biases.length,edges:spec.weights.length,parameters:spec.weights.length+spec.biases.length,states:spec.stateOutputs.length,traceFrames:frames.length};
writeFileSync(new URL('./inspection.json',import.meta.url),JSON.stringify(inspection,null,2)+'\n');
console.log(JSON.stringify(inspection));
