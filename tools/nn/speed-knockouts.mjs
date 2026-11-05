import {createWorld,stepWorld} from '../../src/sim/world.js';
import {createBrain} from '../../src/ai/index.js';
import {simRevision} from './revision.mjs';
console.log(JSON.stringify({simRevision:simRevision()}));
for(const seed of [1,7,42]){
  const w=createWorld({seed,brainFactory:createBrain}),hist=w.cars.map(()=>[]),fail=[];let cursor=0;
  while(w.phase!=='finished'){
    stepWorld(w);
    if(w.step%8===0)for(const c of w.cars){if(!c.alive)continue;hist[c.id].push({time:w.time,s:c.trackS,v:Math.hypot(c.vx,c.vz),up:c.R[4],height:c.py-w.track.heightAt(c.px,c.pz),oil:c.onOil,whirl:!!c.whirl,steer:c.input.steer,brake:c.input.brake,toLip:w.track.toNextLip(c.trackS),slip:Math.atan2(-c.vx*c.R[6]+c.vz*c.R[0],Math.abs(c.vx*c.R[0]+c.vz*c.R[6])),health:c.health});if(hist[c.id].length>210)hist[c.id].shift();}
    for(;cursor<w.events.length;cursor++){const e=w.events[cursor];if(e.type==='ko')fail.push({event:e,history:hist[e.car].slice(),events:w.events.slice(Math.max(0,cursor-100),cursor+1).filter(x=>x.time>=e.time-8&&(x.car===e.car||x.a===e.car||x.b===e.car||x.target===e.car))});}
  }
  console.log(JSON.stringify({seed,fail}));
}
