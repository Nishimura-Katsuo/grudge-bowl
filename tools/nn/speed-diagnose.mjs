// Trace one fixed policy. No parameter generation, ranking or tuning loop.
import {readFileSync} from 'node:fs';
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import current from '../../src/ai/weights.js';
import {OBS} from '../../src/sim/sensors.js';
import {simRevision} from './revision.mjs';
const spec=process.argv.includes('--baseline')?JSON.parse(readFileSync(new URL('./pre-speed.json',import.meta.url),'utf8')):current;
const r=createRuntime(compileNetwork(spec)),action=new Float32Array(6);
const w=createWorld({seed:1,carCount:1,brainFactory:()=>({act(obs){const v=r.forward(obs);spec.actions.forEach((id,k)=>action[k]=Math.max(k?0:-1,Math.min(1,v[id])));return action;}})});
if(!process.argv.includes('--armed'))w.arsenal.crates.length=0;
const frames=[],lips=[],car=w.cars[0];let lastLip=120,cursor=0;
const nodes=['speed','slip','fastSlipGrip','spinGrip','slipGrip','desiredSpeed','paceShare','speedError','followingSteer','pursuitCurvature','expectedYaw','throttleDemand','rearTractionTarget','brakingFeedforward','paceGradient','previewPace','jumpSpeedLimit','crateSeeking','hazardAvoid','escapeActive'];
const fields=['ego.speedFwd','ego.speedRight','ego.rearSlip','ego.frontSlip','ego.headingSin','ego.headingCos','ego.lineOffset','ego.toJump','ego.pace','ego.wheelsDown','ego.yawRate','ego.steerActual'];
while(w.phase!=='finished'){
  stepWorld(w);if(w.phase!=='racing'||w.step%8)continue;
  const row={time:w.raceTime,s:car.trackS,progress:car.progress,health:car.health,...Object.fromEntries(fields.map(n=>[n,w.obs[0][OBS.index[n]]])),...Object.fromEntries(nodes.filter(n=>spec.names.includes(n)).map(n=>[n,r.values[spec.names.indexOf(n)]])),action:[...action]};
  const lip=row['ego.toJump']*120;if(lip>lastLip+50)lips.push(frames.at(-1));lastLip=lip;frames.push(row);
}
console.log(JSON.stringify({simRevision:simRevision(),baseline:process.argv.includes('--baseline'),armed:process.argv.includes('--armed'),events:w.events.filter(e=>['lap','ko','wall'].includes(e.type)),lips,frames}));
