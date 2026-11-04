// Fixed-seed trace recorder. It never changes observations or policy constants.
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {createBrain} from '../../src/ai/index.js';
import {OBS} from '../../src/sim/sensors.js';
import spec from '../../src/ai/weights.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
const net=compileNetwork(spec),runtimes=[];
const w=createWorld({seed:Number(process.argv[2]??7),brainFactory:car=>{const b=createBrain(car),r=createRuntime(net);runtimes[car.id]=r;return{telemetry:b.telemetry,act:obs=>{r.forward(obs);return b.act(obs);}};}}),history=w.cars.map(()=>[]);
let cursor=0;
while(w.phase!=='finished'){
  stepWorld(w);
  if(w.phase==='racing'&&w.step%120===0)for(const car of w.cars){if(!car.alive)continue;const obs=w.obs[car.id],v=n=>+obs[OBS.index[n]].toFixed(4);
    const frame={t:+w.raceTime.toFixed(2),s:+car.trackS.toFixed(1),vf:40*v('ego.speedFwd'),vr:40*v('ego.speedRight'),angle:Math.round(Math.atan2(v('ego.headingSin'),v('ego.headingCos'))*180/Math.PI),sdf:+w.track.sdfAt(car.px,car.pz).toFixed(2),stall:v('ego.stallTimer'),slip:v('ego.slipAngle'),spin:v('ego.rearSlip'),wheels:v('ego.wheelsDown'),front:45*v('ray0'),rear:45*v('ray13'),mode:w.brains[car.id].telemetry.mode,input:{...car.input}};
    frame.neural=Object.fromEntries(['forwardBlocked','rearBlocked','noseWall','tailWall','phaseBlocked','escapeTimer','phaseSlow','phaseChange','recoveryRelease','turning','escapeTurn'].map(n=>[n,+runtimes[car.id].values[spec.names.indexOf(n)].toFixed(3)]));
    frame.engine=+car.engineHealth.toFixed(3);frame.near=w.cars.filter(o=>o.id!==car.id&&!o.towed&&Math.hypot(car.px-o.px,car.pz-o.pz)<6).map(o=>o.id);
    history[car.id].push(frame);if(history[car.id].length>20)history[car.id].shift();
  }
  for(;cursor<w.events.length;cursor++){const event=w.events[cursor];if(event.type==='ko'&&event.reason==='stalled out')console.log(JSON.stringify({seed:w.seed,car:w.cars[event.car].name,history:history[event.car]}));}
}
