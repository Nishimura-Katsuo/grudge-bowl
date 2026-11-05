import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import current from '../../src/ai/weights.js';
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import {OBS} from '../../src/sim/sensors.js';
import {testDriver} from '../../test/helpers/testDriver.js';
export function passingCase(spec=current){
 const net=compileNetwork(spec),r=createRuntime(net),action=new Float32Array(6),frames=[];
 r.state[spec.names.indexOf('memory.passOffset')-OBS.size]=-3;r.state[spec.names.indexOf('memory.neutralOffset')-OBS.size]=-3;
 const brainFactory=car=>car.id?testDriver({targetSpeed:20}):{telemetry:{mode:'race'},act(obs){const v=r.forward(obs);for(let k=0;k<6;k++)action[k]=v[net.actions[k]];return action;}};
 const w=createWorld({carCount:2,brainFactory,spawnOverride:(id,t)=>{const s=550+id,p=t.sampleLine(s,{}),offset=id?0:-3;return{...p,x:p.x-p.tz*offset,z:p.z+p.tx*offset,s};}});
 w.arsenal.crates=[];for(let k=0;k<720;k++)stepWorld(w);
 r.state.fill(0);r.state[spec.names.indexOf('memory.passOffset')-OBS.size]=-3;r.state[spec.names.indexOf('memory.neutralOffset')-OBS.size]=-3;
 w.phase='racing';w.time=3;for(const c of w.cars){c.vx=c.R[0]*20;c.vz=c.R[6]*20;}
 for(let k=0;k<240;k++){stepWorld(w);if(w.step%8===1)frames.push({t:w.raceTime,steer:w.cars[0].input.steer,offset:r.values[spec.names.indexOf('requestedOffset')],pass:r.values[spec.names.indexOf('passing')],hold:r.values[spec.names.indexOf('returnBlocked')]??null,obs:[w.obs[0][OBS.index['opp0.fwd']],w.obs[0][OBS.index['opp0.right']]]});}
 return{frames,hits:w.events.filter(e=>e.type==='hit').length,health:w.cars[0].health,roadMargin:w.track.sdfAt(w.cars[0].px,w.cars[0].pz)};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const before=JSON.parse(readFileSync(new URL('./road2-development-a-weights.json',import.meta.url),'utf8'));console.log(JSON.stringify({before:passingCase(before),after:passingCase()}));}
