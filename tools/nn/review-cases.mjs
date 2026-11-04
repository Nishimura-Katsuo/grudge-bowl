// Frozen review reproduction and one-car continuation, never parameter search.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {OBS} from '../../src/sim/sensors.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import current from '../../src/ai/weights.js';
import {simRevision} from './revision.mjs';
export const baseline=JSON.parse(readFileSync(new URL('./review-baseline.json',import.meta.url),'utf8'));
export function fixture(spec=current){
  const obs=new Float32Array(OBS.size),set=(name,value)=>obs[OBS.index[name]]=value;
  for(const [name,value] of Object.entries({'ego.speedFwd':.5,'ego.pace':.7,'ego.halfWidth':.9,'ego.headingCos':1,'ego.wheelsDown':1,'ego.raceActive':1,'ego.toJump':1,'ego.toCrossing':1,'ego.temperAggression':.8,'ego.temperNerve':.7,'ego.temperVengeance':.7}))set(name,value);
  for(let k=0;k<14;k++)set(`ray${k}`,1);
  for(let k=0;k<5;k++){set(`look${k}.fwd`,[8,16,28,45,65][k]/70);set(`look${k}.pace`,.7);}
  const r=createRuntime(compileNetwork(spec)),v=name=>r.values[spec.names.indexOf(name)];
  return{obs,set,r,v,run:()=>r.forward(obs)};
}
export function rival(f,k,extra={}){for(const [name,value] of Object.entries({alive:1,solid:1,los:1,headingCos:1,fwd:.08,right:0,dist:.08,relVelFwd:-.1,...extra}))f.set(`opp${k}.${name}`,value);}
export function staticReview(spec){
  const mask=fixture(spec);rival(mask,0,{fwd:-.035,right:.035,dist:Math.hypot(.035,.035),relVelFwd:0});rival(mask,1,{alive:0,fwd:.12,dist:.12});mask.run();
  const air=fixture(spec);rival(air,0);air.set('ego.wheelsDown',0);air.run();
  const slide=fixture(spec);slide.set('ego.speedFwd',0);slide.set('ego.speedRight',.5);slide.set('ego.slipAngle',1.5);slide.run();
  const clamp=fixture(spec);rival(clamp,0);clamp.set('ego.halfWidth',.64);clamp.set('ego.trackOffset',-.75);clamp.run();
  const mode=f=>['hunt','race','drift','unstick'][spec.modes.map(id=>f.r.values[id]).indexOf(Math.max(...spec.modes.map(id=>f.r.values[id])))];
  return{mask:{target0:mask.v('target0'),target1:mask.v('target1'),passing:mask.v('passing'),requested:mask.v('requestedOffset')},air:{mode:mode(air),steer:air.v('steer')},slide:{mode:mode(slide)},clamp:{mode:mode(clamp),offset:clamp.v('boundedOffset')}};
}
export function continuation(seed,carId,switchAt,useCurrent=false){
  const net=compileNetwork(baseline.spec),rs=[],specs=[];
  const make=(car,spec)=>{const r=createRuntime(spec);rs[car.id]=r;specs[car.id]=spec;const action=new Float32Array(5);return{act(obs){const values=r.forward(obs);for(let k=0;k<5;k++)action[k]=values[spec.actions[k]];return action;}};};
  const w=createWorld({seed,brainFactory:car=>make(car,net)}),car=w.cars[carId],frames=[];let switched=false,snapshot=null;
  while(w.phase!=='finished'){
    if(!switched&&w.raceTime>=switchAt){switched=true;snapshot={observation:[...w.obs[carId]],state:[...rs[carId].state],progress:car.progress};if(useCurrent){const oldState=rs[carId].state,oldNames=net.names.slice(OBS.size,net.inputCount);w.brains[carId]=make(car,compileNetwork(current));for(let k=0;k<oldState.length;k++){const at=current.names.slice(OBS.size,current.inputCount).indexOf(oldNames[k]);if(at>=0)rs[carId].state[at]=oldState[k];}}}
    stepWorld(w);
    if(switched&&w.step%120===0&&car.alive&&frames.length<30){const obs=w.obs[carId],r=rs[carId],s=specs[carId],v=n=>r.values[s.names.indexOf(n)];frames.push({t:w.raceTime,progress:car.progress,angle:Math.atan2(obs[OBS.index['ego.headingSin']],obs[OBS.index['ego.headingCos']])*180/Math.PI,speed:Math.hypot(car.vx,car.vz),stall:car.stallTime,turn:v('escapeTurn'),phase:v('escapeTimer'),active:v('escapeActive'),...car.input});}
  }
  return{seed,car:carId,switchAt,useCurrent,alive:car.alive,ko:car.koReason,koTime:car.koTime-3,progress:car.progress,snapshot,frames};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(simRevision().sha256!==baseline.simRevision.sha256)throw Error('Review replay simulator changed');
  console.log(JSON.stringify({simRevision:simRevision(),baselineStatic:staticReview(baseline.spec),testedStatic:staticReview(process.argv.includes('--current')?current:baseline.spec)}));
  for(const [seed,time] of [[4801,30],[42,107]])console.log(JSON.stringify(continuation(seed,8,time,process.argv.includes('--current'))));
}
