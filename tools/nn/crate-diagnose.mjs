// Fixed-seed traces explain failed spot approaches; this never edits or ranks weights.
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import spec from '../../src/ai/weights.js';
import {simRevision} from './revision.mjs';
const net=compileNetwork(spec),runtimes=[];
const w=createWorld({seed:Number(process.argv[2]??1),brainFactory:car=>{const r=runtimes[car.id]=createRuntime(net),a=new Float32Array(6);return{act(obs){const v=r.forward(obs);spec.actions.forEach((id,k)=>a[k]=Math.max(k?0:-1,Math.min(1,v[id])));return a;}};}});
const names=['crateSeeking','ground','awayFromJump','crateNotRecovering','crateNotHazard','crateNotPassing','crateEmpty','crateNotOiled','crateNotWhirling','crateAligned','crateSlipOK','crateUnderPace','crateNear','crateMoveNeeded','cratePassSettled','crateSideClear','crateLineError','crateEgoLine','crateRequest','crateFiltered','crateToRight','crateTrafficClear','crateFutureAligned','crateReachError','crateReachAllowance','crateReachable','crateOffset','crateBounded','crateDistance'];
const pending=new Map(),records=[];
while(w.phase!=='finished'){
  stepWorld(w);if(w.phase!=='racing'||w.step%8||w.raceTime<=3)continue;
  for(const car of w.cars){if(!car.alive)continue;const values=Object.fromEntries(names.map(n=>[n,runtimes[car.id].values[spec.names.indexOf(n)]]));
    for(const spot of w.track.crateSpots){const key=car.id+':'+spot.s,d=w.track.route(car.trackS,spot.s);let p=pending.get(key);
      if(d<50&&!p){p={car:car.id,s:spot.s,held:!!car.weapon,frames:[]};pending.set(key,p);}
      if(!p)continue;
      if(d<50&&!p.held)p.frames.push({time:w.raceTime,d,speed:Math.hypot(car.vx,car.vz),...values});
      if(d>500){pending.delete(key);if(!p.held)records.push({...p,collected:!!car.weapon,live:w.arsenal.crates.some(c=>c.s===spot.s&&c.respawn<=0)});}
    }
  }
}
console.log(JSON.stringify({simRevision:simRevision(),seed:w.seed,records}));
