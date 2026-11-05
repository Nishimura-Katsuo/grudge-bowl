// Driving-only ablation: pickups still occur; discard each item before it fires.
// This isolates crate steering from the extra weapons it earns. Not a race score.
import {readFileSync} from 'node:fs';
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import current from '../../src/ai/weights.js';
import {simRevision} from './revision.mjs';
function drive(spec){
  const net=compileNetwork(spec),r=createRuntime(net),a=new Float32Array(6),frames=[];
  const w=createWorld({seed:1,carCount:1,brainFactory:()=>({act(obs){const v=r.forward(obs);for(let k=0;k<5;k++)a[k]=Math.max(k?0:-1,Math.min(1,v[spec.actions[k]]));return a;}})});
  const c=w.cars[0];let cursor=0,stuck=0,pickups=0;const events=[];
  while(w.phase!=='finished'){
    stepWorld(w);c.weapon=0;
    for(;cursor<w.events.length;cursor++){const event=w.events[cursor];if(event.type==='pickup')pickups++;if(['wall','lap','ko'].includes(event.type))events.push({...event,s:c.trackS});}
    if(w.phase==='racing'&&w.step%8===0){if(w.raceTime>5&&Math.hypot(c.vx,c.vz)<3)stuck+=1/30;
      if(w.step%120===0)frames.push({time:w.raceTime,s:c.trackS,speed:Math.hypot(c.vx,c.vz),...Object.fromEntries(['crateSeeking','crateLineError','crateOffset','crateDistance','aimRight','steer'].map(n=>[n,r.values[spec.names.indexOf(n)]]))});}
  }
  return{race:w.raceTime,alive:c.alive,pickups,stuck,events,frames};
}
console.log(JSON.stringify({simRevision:simRevision(),before:drive(JSON.parse(readFileSync(new URL('./pre-crates.json',import.meta.url),'utf8'))),after:drive(current)}));
