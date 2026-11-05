// Controlled real arsenal flight with stationary bodies, independent of driving.
import {fileURLToPath} from 'node:url';
import {createWorld} from '../../src/sim/world.js';
import {fireWeapon,stepArsenal} from '../../src/sim/arsenal.js';
import {fillObservation} from '../../src/sim/sensors.js';
import {weaponMetrics} from './weapon-metrics.mjs';
export function rocketCase(right=0){
  const w=createWorld({seed:1,carCount:2,spawnOverride:(id,track)=>{
    const p=track.sampleLine(50,{});return{x:p.x+p.tx*30*id-p.tz*right*id,z:p.z+p.tz*30*id+p.tx*right*id,tx:p.tx,tz:p.tz,s:50+30*id};
  }});
  w.phase='racing';w.time=3;w.arsenal.crates.length=0;
  const [a,b]=w.cars;a.weapon=1;a.fireLock=0;for(const wheel of b.wheels)wheel.hp=.0001;
  fillObservation(w,a,w.obs[0]);const log=weaponMetrics(w);log.before();fireWeapon(w,a);
  for(let k=0;k<540&&w.arsenal.shots.length;k++){log.before();w.time+=1/240;stepArsenal(w,1/240);}
  return{right,damage:1-b.health,wheelOff:w.events.filter(e=>e.type==='wheelOff').length,damagingShots:log.result().rocketDamaging,blast:w.events.find(e=>e.type==='blast')};
}
if(process.argv[1]===fileURLToPath(import.meta.url))for(const right of [0,3])console.log(JSON.stringify(rocketCase(right)));
