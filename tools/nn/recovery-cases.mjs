// Fixed physical regressions, not candidate selection or parameter search.
import {fileURLToPath} from 'node:url';
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {createBrain} from '../../src/ai/index.js';
import spec from '../../src/ai/weights.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import {OBS} from '../../src/sim/sensors.js';
import {simRevision} from './revision.mjs';
export const recoveryCases=[
  {name:'A: clear aligned launch',s:69,angle:1,offset:0},
  {name:'B: backward beside left wall',s:577,angle:-178,offset:-7.8},
  {name:'B: backward beside right wall',s:958,angle:178,offset:6.1},
  {name:'C: oblique clear launch',s:519,angle:-45,offset:0},
  {name:'C: shallow clear launch',s:131,angle:-24,offset:0},
  {name:'C: thirty degrees',s:652,angle:-30,offset:0},
  {name:'D: stale post-collision turn with route debt',s:943,angle:-138,offset:0,state:{recover:1,turning:1,turn:1,escape:1,legTime:1.8,routeDebt:3}},
];
export function recoveryCase(example,seconds=10){
  const factory=example.state?()=>{
    const r=createRuntime(compileNetwork(spec)),action=new Float32Array(5),telemetry={mode:'unstick'};
    for(const [key,value] of Object.entries(example.state))r.state[spec.names.indexOf('memory.'+key)-OBS.size]=value;
    return{telemetry,act(obs){const v=r.forward(obs);for(let k=0;k<5;k++)action[k]=v[spec.actions[k]];let mode=0;for(let k=1;k<4;k++)if(v[spec.modes[k]]>v[spec.modes[mode]])mode=k;telemetry.mode=['hunt','race','drift','unstick'][mode];return action;}};
  }:createBrain;
  const w=createWorld({seed:1,carCount:1,brainFactory:factory,spawnOverride:(_,track)=>{
    const p=track.sample(example.s,{}),angle=example.angle*Math.PI/180;
    return{x:p.x-p.tz*example.offset,z:p.z+p.tx*example.offset,tx:p.tx*Math.cos(angle)+p.tz*Math.sin(angle),tz:p.tz*Math.cos(angle)-p.tx*Math.sin(angle),s:example.s};
  }});
  w.phase='racing';w.time=3;
  const car=w.cars[0],start=car.progress,frames=[];let firstForward=null,reversals=0,previousReverse=false,reverseMetres=0;
  for(let tick=0;tick<seconds*240&&car.alive;tick++){
    stepWorld(w);if(tick%8)continue;
    const obs=w.obs[0],v=obs[OBS.index['ego.speedFwd']]*40,cos=obs[OBS.index['ego.headingCos']];
    if(firstForward===null&&v>3&&cos>Math.cos(Math.PI/6))firstForward=w.raceTime;
    if(car.input.reverse>.5&&!previousReverse)reversals++;previousReverse=car.input.reverse>.5;
    if(car.input.reverse>.5)reverseMetres+=Math.max(0,-v)/30;
    if(tick%120===0)frames.push({t:+w.raceTime.toFixed(3),s:+car.trackS.toFixed(2),v:+v.toFixed(3),angle:+(Math.atan2(obs[OBS.index['ego.headingSin']],cos)*180/Math.PI).toFixed(2),sdf:+w.track.sdfAt(car.px,car.pz).toFixed(3),mode:w.brains[0].telemetry.mode,...car.input});
  }
  return{name:example.name,firstForward,progress:car.progress-start,alive:car.alive,health:car.health,reversals,reverseMetres,frames};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify({simRevision:simRevision()}));
  for(const example of recoveryCases)console.log(JSON.stringify(recoveryCase(example)));
}
