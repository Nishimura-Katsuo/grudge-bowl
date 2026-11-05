// Attribution of fixed-policy contacts, not a controller or parameter search.
import {readFileSync} from 'node:fs';
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import {simRevision} from './revision.mjs';
const spec=JSON.parse(readFileSync(new URL('./pre-balance-pass2.json',import.meta.url),'utf8')),net=compileNetwork(spec),idx=Object.fromEntries(spec.names.map((n,k)=>[n,k]));
console.log(JSON.stringify({simRevision:simRevision()}));
for(const seed of process.argv.slice(2).map(Number)){
 const rows=[],states=[];let world;
 const names=['openRoad','openRoadZone','crossRoadClear','crossGraceExpired','trafficJumpClear','trafficFlightClear','freePass','returnBlocked','passOffset','trafficSpeedLimit','desiredSpeed','crateSeeking','escapeActive'];
 const brainFactory=car=>{const r=createRuntime(net),action=new Float32Array(6),info={frames:[]};states[car.id]=info;
  return{act(obs){const v=r.forward(obs);for(let j=0;j<6;j++)action[j]=Math.max(j?0:-1,Math.min(1,v[spec.actions[j]]));
   if(world?.phase==='racing'){info.frames.push({t:world.raceTime,n:Object.fromEntries(names.map(n=>[n,v[idx[n]]])),follow:Array.from({length:11},(_,k)=>Object.fromEntries(['valid','closing','gap','speedCap'].map(n=>[n,v[idx[`follow${k}.${n}`]]])))});if(info.frames.length>20)info.frames.shift();}return action;}};
 };
 world=createWorld({seed,brainFactory});let cursor=0;
 const near=s=>[79,129,466,516,799,850].some(p=>{const d=Math.abs((((s-p)%world.track.length)+world.track.length)%world.track.length);return Math.min(d,world.track.length-d)<25;});
 while(world.phase!=='finished'){stepWorld(world);for(;cursor<world.events.length;cursor++){const e=world.events[cursor];if(e.type!=='hit')continue;const a=world.cars[e.a],b=world.cars[e.b];if(near(a.trackS)&&near(b.trackS)&&Math.abs(a.R[0]*b.R[0]+a.R[6]*b.R[6])<.8&&Math.abs(a.progress-b.progress)>60)continue;
   rows.push({t:world.raceTime,closing:e.closing,zoneA:e.zoneA,zoneB:e.zoneB,a:{id:a.id,s:a.trackS,speed:Math.hypot(a.vx,a.vz),...states[a.id].frames[0]},b:{id:b.id,s:b.trackS,speed:Math.hypot(b.vx,b.vz),...states[b.id].frames[0]}});
 }}console.log(JSON.stringify({seed,rows}));
}
