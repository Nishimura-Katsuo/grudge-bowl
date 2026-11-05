// Read-only neuron observer; actions are copied directly from the chosen graph.
import {readFileSync} from 'node:fs';
import {OBS} from '../../src/sim/sensors.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import {evaluate} from './eval.mjs';
import {simRevision} from './revision.mjs';
const source=process.argv.includes('--final')?'../../src/ai/weights.js':'./open-road-pass1.json';
const raw=readFileSync(new URL(source,import.meta.url),'utf8');
const spec=JSON.parse(source.endsWith('.js')?raw.split('export default ')[1].trim().slice(0,-1):raw),net=compileNetwork(spec),idx=Object.fromEntries(spec.names.map((n,k)=>[n,k]));
console.log(JSON.stringify({simRevision:simRevision()}));
for(const seed of process.argv.slice(2).filter(x=>x!=='--final').map(Number)){
 const stats=[];
 const brainFactory=car=>{
  const r=createRuntime(net),action=new Float32Array(6),telemetry={mode:'race'},s={car:car.id,capped:0,leading:0,wreck:0,lapped:0,matched:0,freeLane:0,blockedLane:0,nearStopped:0,desiredZero:0,longest:0,leadProxyLoss:0,lap:Array(5).fill(0),episodes:[]};stats.push(s);let duration=0,start=null,t=0;
  return{telemetry,act(obs){const v=r.forward(obs),read=n=>v[idx[n]];
   for(let j=0;j<6;j++)action[j]=Math.max(j?-0:-1,Math.min(1,v[net.actions[j]]));
   let mode=0;for(let j=1;j<4;j++)if(v[net.modes[j]]>v[net.modes[mode]])mode=j;telemetry.mode=['hunt','race','drift','unstick'][mode];
   if(obs[OBS.index['ego.raceActive']]>.5){t+=1/30;const delta=read('freeDesiredSpeed')-read('desiredSpeed');
    if(delta>.025&&read('escapeActive')===0){let slot=0;for(let k=1;k<11;k++)if(read(`follow${k}.limit`)<read(`follow${slot}.limit`))slot=k;
     const get=n=>obs[OBS.index[`opp${slot}.${n}`]],leader=obs[OBS.index['ego.racePosition']]===0;
     if(!duration)start={time:t,slot,alive:get('alive'),raceGap:get('raceGap'),fwd:100*get('fwd'),relative:40*get('relVelFwd'),freePass:read('freePass'),line:obs[OBS.index['ego.lineOffset']]*obs[OBS.index['ego.halfWidth']]*10};
     duration+=1/30;s.capped+=1/30;s.longest=Math.max(s.longest,duration);s.leading+=leader/30;s.wreck+=(get('alive')===0)/30;s.lapped+=(get('raceGap')<-.5)/30;s.matched+=(Math.abs(get('relVelFwd'))<.025)/30;s.freeLane+=read('freePass')/30;s.blockedLane+=(1-read('freePass'))/30;s.nearStopped+=(read('horizontalSpeed')<3/40)/30;s.desiredZero+=(read('desiredSpeed')<.025)/30;s.lap[Math.min(4,Math.floor(obs[OBS.index['ego.raceDone']]*5))]+=1/30;s.leadProxyLoss+=leader*delta/Math.max(.1,read('freeDesiredSpeed'))/30;
    }else if(duration){if(duration>.5)s.episodes.push({...start,duration});duration=0;}
   }return action;}};
 };
 const result=evaluate(seed,{brainFactory});console.log(JSON.stringify({seed,raceSeconds:result.raceSeconds,flag:result.finishedByLaps,winner:result.winner,cars:result.cars,lapTimes:result.lapTimes,stats}));
}
