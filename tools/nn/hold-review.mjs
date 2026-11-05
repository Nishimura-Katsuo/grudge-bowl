// Explain a measured hold-limit miss without changing policy or simulator.
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {createBrain} from '../../src/ai/index.js';
import {OBS} from '../../src/sim/sensors.js';
import {simRevision} from './revision.mjs';
const w=createWorld({seed:7,brainFactory:createBrain}),held=new Map(),frames=[];let cursor=0;
while(w.phase!=='finished'){
  stepWorld(w);
  for(;cursor<w.events.length;cursor++){const e=w.events[cursor];if(e.type==='pickup')held.set(e.car,{time:e.time,weapon:e.weapon});if(e.type==='fired')held.delete(e.car);}
  if(w.step%8)continue;
  for(const c of w.cars){const p=held.get(c.id);if(!c.alive||!p||w.time-p.time<20)continue;const obs=w.obs[c.id];frames.push({car:c.name,time:w.time,held:w.time-p.time,weapon:p.weapon,ready:obs[OBS.index['arms.ready']],wheels:obs[OBS.index['ego.wheelsDown']],whirling:obs[OBS.index['arms.whirling']],upright:obs[OBS.index['ego.upright']],fire:c.input.fire});}
}
console.log(JSON.stringify({simRevision:simRevision(),frames,ko:w.events.filter(e=>e.type==='ko')}));
