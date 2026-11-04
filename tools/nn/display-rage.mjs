// Observe the display and control memories together; never alter observations.
import {createWorld,stepWorld} from '../../src/sim/world.js';
import spec from '../../src/ai/weights.js';
import {createBrain} from '../../src/ai/index.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import {simRevision} from './revision.mjs';
const revision=simRevision(),net=compileNetwork(spec);
console.log(JSON.stringify({simRevision:revision,atRaceSeconds:30}));
for(const seed of [1,7,42,1201,1709,2309,2903,3613,4801]){
  const memories=[];
  const w=createWorld({seed,brainFactory:car=>{
    const brain=createBrain(car),r=createRuntime(net);memories[car.id]=r;
    return{telemetry:brain.telemetry,act(obs){r.forward(obs);return brain.act(obs);}};
  }});
  while(w.raceTime<30&&w.phase!=='finished')stepWorld(w);
  console.log(JSON.stringify({seed,cars:w.cars.filter(c=>c.alive).map(c=>({id:c.id,driving:memories[c.id].state[11],display:w.brains[c.id].telemetry.rage}))}));
}
if(simRevision().sha256!==revision.sha256)throw Error('Simulator changed during display measurement');
