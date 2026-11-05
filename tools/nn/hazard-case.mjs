// A fixed straight-road encounter, for inspecting anticipation without traffic.
import {fileURLToPath} from 'node:url';
import {createWorld,stepWorld} from '../../src/sim/world.js';
import {createBrain} from '../../src/ai/index.js';
import {OBS} from '../../src/sim/sensors.js';
import {ARSENAL} from '../../src/sim/config.js';
export function hazardCase(kind='oil',avoid=true){
  const factory=avoid?createBrain:car=>{const b=createBrain(car),copy=new Float32Array(OBS.size);return{telemetry:b.telemetry,act(obs){copy.set(obs);copy[OBS.index['arms.toHazard']]=1;copy[OBS.index['arms.hazardRight']]=0;return b.act(copy);}};};
  const w=createWorld({seed:1,carCount:1,brainFactory:factory,spawnOverride:(_,track)=>{
    const p=track.sampleLine(50,{});return {...p,s:50};
  }}),c=w.cars[0],h=w.track.sampleLine(105,{});
  w.phase='racing';w.time=3;w.arsenal.crates.length=0;
  c.vx=c.R[0]*25;c.vz=c.R[6]*25;
  w.arsenal.hazards.push({id:10000,kind,x:h.x,z:h.z,y:w.track.heightAt(h.x,h.z),radius:ARSENAL[kind].radius,life:20,arm:0,owner:0,weapon:kind==='oil'?4:3});
  let minDistance=Infinity,minRoad=Infinity,steps=0;
  for(;steps<6*240&&c.alive;steps++){
    stepWorld(w);minDistance=Math.min(minDistance,Math.hypot(c.px-h.x,c.pz-h.z));minRoad=Math.min(minRoad,w.track.sdfAt(c.px,c.pz));
    if(c.trackS>120)break;
  }
  return{kind,avoid,seconds:steps/240,minDistance,minRoad,health:c.health,progress:c.trackS-50,clear:minDistance>ARSENAL[kind].radius+1};
}
if(process.argv[1]===fileURLToPath(import.meta.url))for(const kind of ['mine','oil'])for(const avoid of [true,false])console.log(JSON.stringify(hazardCase(kind,avoid)));
