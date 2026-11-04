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
for(const [n,x] of Object.entries({'ego.speedFwd':.5,'ego.pace':.7,'ego.halfWidth':.9,'ego.wheelsDown':1,'ego.raceActive':1,'ego.health':1,'ego.engineHealth':1,'ego.surfaceGrip':1,'ego.headingCos':1,'ego.toJump':1,'ego.toCrossing':1,'ego.temperAggression':.8,'ego.temperNerve':.7,'ego.temperVengeance':.7,'opp0.solid':1,'opp0.alive':1,'opp0.los':1,'opp0.headingCos':1,'opp0.fwd':.08,'opp0.dist':.08,'opp0.relVelFwd':-.1}))set(n,x);
for(let k=0;k<14;k++)set(`ray${k}`,1);for(let k=0;k<5;k++){set(`look${k}.fwd`,[8,16,28,45,65][k]/70);set(`look${k}.right`,.03);set(`look${k}.pace`,.7);}
const r=createRuntime(compileNetwork(spec)),frames=[];
const names=['grudge0','rage','displayRage','shownRage','leanSafe','leanClock','leaning','neutralOffset','boundedNeutral','effectiveNarrowing','routeDebt','headingYawAgreement','turnImproving','routeFailed','legTime','turnReconsider','traffic0.valid','target0','trafficExists','passDirection','passing','aggression','activeLean','passWidth','requestedOffset','passOffset','passLower','passUpper','boundedOffset','look.fwd.2','aimRight','aimRadius2','pursuitCurvature','pursuitWheel','expectedYaw','followingSteer','wallReflex','jumpSteer','ground','paceShare','desiredSpeed','speedError','throttleDemand','slipAuthority','fastSlipGrip','slipGrip','spinGrip','forwardBlocked','rearBlocked','releaseRoad','forwardProgress','stuck','escapeTrigger','escapeActive','turning','escapeTimer','phaseSlow','phaseChange','escapeTurn','recoveryBrake','reverse','steer','throttle','brake'];
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
writeFileSync(new URL('./trace.json',import.meta.url),JSON.stringify(frames,null,2)+'\n');
const inspection={layers:spec.layers.length-1,units:spec.biases.length,edges:spec.weights.length,parameters:spec.weights.length+spec.biases.length,states:spec.stateOutputs.length,traceFrames:frames.length};
writeFileSync(new URL('./inspection.json',import.meta.url),JSON.stringify(inspection,null,2)+'\n');
console.log(JSON.stringify(inspection));
