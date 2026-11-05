// Read-only recurrent-state observer. Does not alter any policy decisions.
import {readFileSync} from 'node:fs';
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {OBS} from '../../src/sim/sensors.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import {simRevision} from './revision.mjs';
const spec=JSON.parse(readFileSync(new URL('./pre-balance-pass2.json',import.meta.url),'utf8')),net=compileNetwork(spec);
const names=['forwardBlocked','rearBlocked','noseWall','tailWall','releaseRoad','headingGood','forwardProgress','slow','settleClock','recoveryAllowed','integrateStuck','stuck','escapeTrigger','escapeActive','turning','escapeTimer','phaseSlow','phaseBlocked','phaseFailed','phaseChange','gearMatches','routeDebt','routeFailed','turnImproving','legTime','escapeTurn','recoverySteer','recoveryBrake','reverse','openRoad','freePass','returnBlocked','trafficSpeedLimit','desiredSpeed','slipGrip','spinGrip','oilThrottle'];
const raws=['speedFwd','speedRight','progressRate','stallTimer','headingSin','headingCos','wheelsDown','upright','hitTaken','slipAngle','yawRate','inReverse','engineHealth'];
const at=Object.fromEntries(spec.names.map((n,k)=>[n,k]));
console.log(JSON.stringify({simRevision:simRevision()}));
for(const seed of process.argv.slice(2).map(Number)){
 const controllers=[];let world;
 const brainFactory=car=>{const r=createRuntime(net),action=new Float32Array(6);let count=0;
   const info={id:car.id,frames:[],full:null};controllers.push(info);
   return{act(obs){const old=[...r.state],v=r.forward(obs);for(let j=0;j<6;j++)action[j]=Math.max(j?0:-1,Math.min(1,v[spec.actions[j]]));
     if(world?.phase==='racing'&&++count%3===0){
       const frame={t:world.raceTime,s:car.trackS,progress:car.progress,mark:car.stallMark,sdf:world.track.sdfAt(car.px,car.pz),action:[...action],raw:Object.fromEntries(raws.map(n=>[n,obs[OBS.index['ego.'+n]]])),neural:Object.fromEntries(names.map(n=>[n,v[at[n]]])),rays:[...obs.slice(OBS.index.ray0,OBS.index.ray0+14)],oiled:obs[OBS.index['arms.oiled']],whirling:obs[OBS.index['arms.whirling']]};
       info.frames.push(frame);if(info.frames.length>140)info.frames.shift();
       if(obs[OBS.index['ego.stallTimer']]>.6&&obs[OBS.index['ego.stallTimer']]<.61)info.full={t:world.raceTime,observation:[...obs],state:old};
     }return action;}};
 };
 world=createWorld({seed,brainFactory});
 while(world.phase!=='finished')stepWorld(world);
 // Dead-car records are authoritative, including their last live decisions.
 const failures=world.cars.filter(c=>c.koReason==='stalled out').map(c=>({id:c.id,name:c.name,health:c.health,engine:c.engineHealth,...controllers[c.id]}));
 console.log(JSON.stringify({seed,failures}));
}

