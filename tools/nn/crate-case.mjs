// Fixed physical regression. Masking the crate is a measurement-only control.
import {fileURLToPath} from 'node:url';
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {createBrain} from '../../src/ai/index.js';
import {OBS} from '../../src/sim/sensors.js';
import spec from '../../src/ai/weights.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
export function crateCase({held=false,seek=true}={}){
  const diagnostic=createRuntime(compileNetwork(spec));
  const factory=car=>{const b=createBrain(car),copy=new Float32Array(OBS.size);return{telemetry:b.telemetry,act(obs){copy.set(obs);if(!seek){copy[OBS.index['arms.toCrate']]=1;copy[OBS.index['arms.crateRight']]=0;}diagnostic.forward(copy);return b.act(copy);}};};
  const w=createWorld({seed:1,carCount:1,brainFactory:factory,spawnOverride:(_,track)=>({...track.sampleLine(50,{}),s:50})}),c=w.cars[0],p=w.track.sampleLine(100,{});
  const crate={id:10000,s:100,x:p.x-p.tz*4.5,z:p.z+p.tx*4.5,respawn:0};crate.y=w.track.heightAt(crate.x,crate.z)+1.1;
  w.arsenal.crates=[crate];w.phase='racing';w.time=3;c.vx=c.R[0]*25;c.vz=c.R[6]*25;
  if(held){c.weapon=1;c.fireLock=100;}
  let minDistance=Infinity,minRoad=Infinity,lateralAtSpot=null,steps=0;
  const frames=[];
  for(;steps<5*240&&c.alive;steps++){
    stepWorld(w);minDistance=Math.min(minDistance,Math.hypot(c.px-crate.x,c.pz-crate.z));minRoad=Math.min(minRoad,w.track.sdfAt(c.px,c.pz));
    if(w.step%24===0)frames.push({s:c.trackS,steer:c.input.steer,speed:Math.hypot(c.vx,c.vz),...Object.fromEntries(['crateSeeking','crateLineError','crateOffset','crateLaneError','crateAppliedCurvature','pursuitBaseCurvature','pursuitCurvature'].map(n=>[n,diagnostic.values[spec.names.indexOf(n)]]))});
    if(c.trackS>105){lateralAtSpot=(c.px-p.x)*(-p.tz)+(c.pz-p.z)*p.tx;break;}
  }
  return{held,seek,collected:w.events.some(e=>e.type==='pickup'),minDistance,minRoad,health:c.health,wallHits:w.events.filter(e=>e.type==='wall').length,lateralAtSpot,seconds:steps/240,frames};
}
if(process.argv[1]===fileURLToPath(import.meta.url))for(const opts of [{},{seek:false},{held:true},{held:true,seek:false}])console.log(JSON.stringify(crateCase(opts)));
