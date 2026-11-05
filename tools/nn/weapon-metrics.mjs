// Observer only: no policy inputs or simulator state are modified.
import {OBS} from '../../src/sim/sensors.js';
export function weaponMetrics(w){
  const shots=[],pickups=new Map(),health=w.cars.map(c=>c.health),encounters=new Map(),completed=[],seen=new Set(),previousShots=[];
  let rocketDamage=0,swats=0,maxHeld=0,maxHeldNonRoof=0,maxHoldRecord=null;
  const behind=car=>{const l=Math.hypot(car.R[0],car.R[6])||1,hx=car.R[0]/l,hz=car.R[6]/l;return w.cars.some(o=>o!==car&&o.alive&&Math.hypot(o.px-car.px,o.pz-car.pz)<40&&((o.px-car.px)*hx+(o.pz-car.pz)*hz)<-Math.cos(.6)*Math.hypot(o.px-car.px,o.pz-car.pz));};
  const push=w.events.push.bind(w.events);
  w.events.push=(event)=>{
    if(event.type==='pickup')pickups.set(event.car,{time:event.time,weapon:event.weapon});
    if(event.type==='fired'){
      const car=w.cars[event.car],p=pickups.get(car.id),obs=w.obs[car.id];
      shots.push({car:car.id,name:car.name,temper:car.temper,weapon:event.weapon,dwell:p?event.time-p.time:null,behind:behind(car),aheadRange:obs[OBS.index['arms.aheadRange']]*100,incoming:obs[OBS.index['arms.incoming']],time:event.time});pickups.delete(car.id);
      if(event.weapon===11)swats+=previousShots.filter(s=>s.owner!==car.id&&s.kind!=='hand'&&Math.hypot(s.x-car.px,s.z-car.pz)<=18&&!w.arsenal.shots.some(t=>t.id===s.id)).length;
    }
    if(event.type==='blast'&&event.weapon===1&&w.cars.some(c=>c.id!==event.owner&&health[c.id]>c.health&&Math.hypot(c.px-event.x,c.py-event.y,c.pz-event.z)<event.radius))rocketDamage++;
    // wheelOff/ko are nested inside applyDamage, before the enclosing blast.
    if(!['wheelOff','ko'].includes(event.type))for(const c of w.cars)health[c.id]=c.health;
    return push(event);
  };
  function before(){for(const c of w.cars)health[c.id]=c.health;previousShots.length=0;for(const s of w.arsenal.shots)previousShots.push({...s});}
  function sample(){
    for(const c of w.cars){if(!c.alive)continue;const p=pickups.get(c.id);if(p){const dwell=w.time-p.time;if(dwell>maxHeld){maxHeld=dwell;maxHoldRecord={car:c.id,time:w.time,upright:c.R[4],dwell};}if(c.R[4]>0)maxHeldNonRoof=Math.max(maxHeldNonRoof,dwell);}}
    if(w.step%8)return;
    for(const c of w.cars){if(!c.alive)continue;const l=Math.hypot(c.R[0],c.R[6])||1,hx=c.R[0]/l,hz=c.R[6]/l,obs=w.obs[c.id];
      for(const h of w.arsenal.hazards){if(!['mine','oil'].includes(h.kind)||h.arm>0)continue;
        const dx=h.x-c.px,dz=h.z-c.pz,forward=dx*hx+dz*hz,right=-dx*hz+dz*hx,key=c.id+':'+h.id;
        const cs=obs[OBS.index['ego.headingCos']],sn=obs[OBS.index['ego.headingSin']],routeF=forward*cs+right*sn,routeR=right*cs-forward*sn;
        let q=encounters.get(key);
        if(!q&&!seen.has(key)&&routeF>10&&routeF<55&&Math.abs(routeR)<h.radius+1){
          const half=obs[OBS.index['ego.halfWidth']]*10,ego=obs[OBS.index['ego.trackOffset']]*half;
          const room=[-1,1].some(s=>Math.abs(ego+routeR+s*(h.radius+1.2))<=half-1.6);
          if(room){seen.add(key);q={x:h.x,z:h.z,car:c.id,hazard:h.id,kind:h.kind,start:w.time,speed:Math.hypot(c.vx,c.vz),minSpeed:Infinity,minDistance:Infinity,steered:false,radius:h.radius};encounters.set(key,q);}
        }
        if(q){q.minDistance=Math.min(q.minDistance,Math.hypot(dx,dz));q.minSpeed=Math.min(q.minSpeed,Math.hypot(c.vx,c.vz));q.steered ||=c.input.steer*right<-.01;if(routeF<0||w.time-q.start>5){q.clear=q.minDistance>h.radius+1;q.seconds=w.time-q.start;completed.push(q);encounters.delete(key);}}
      }
    }
    for(const [key,q] of encounters)if(!w.arsenal.hazards.some(h=>h.id===q.hazard)){
      const car=w.cars[q.car],distance=Math.hypot(q.x-car.px,q.z-car.pz);q.minDistance=Math.min(q.minDistance,distance);
      if(distance<q.radius+3){q.clear=false;q.seconds=w.time-q.start;completed.push(q);}encounters.delete(key);
    }
  }
  return{before,sample,result(){const ds=shots.map(s=>s.dwell).filter(x=>x!==null).sort((a,b)=>a-b),dropped=shots.filter(s=>[3,4,5,8].includes(s.weapon)),rockets=shots.filter(s=>s.weapon===1);return{fired:shots.length,weaponCounts:Array.from({length:11},(_,k)=>shots.filter(s=>s.weapon===k+1).length),medianDwell:ds.length?ds[Math.floor(ds.length/2)]:null,maxDwell:Math.max(0,...ds),maxHeld,maxHeldNonRoof,maxHoldRecord,rocketShots:rockets.length,rocketDamaging:rocketDamage,rocketHitPercent:rockets.length?100*rocketDamage/rockets.length:null,dropped:dropped.length,droppedBehind:dropped.filter(s=>s.behind).length,dropBehindPercent:dropped.length?100*dropped.filter(s=>s.behind).length/dropped.length:null,hornSwats:swats,shots,hazards:{encounters:completed.length,clear:completed.filter(q=>q.clear).length,steeredClear:completed.filter(q=>q.clear&&q.steered).length,meanSpeedLoss:completed.length?completed.reduce((s,q)=>s+Math.max(0,q.speed-q.minSpeed),0)/completed.length:null,censored:encounters.size,byKind:Object.fromEntries(['mine','oil'].map(kind=>{const qs=completed.filter(q=>q.kind===kind);return[kind,{encounters:qs.length,clear:qs.filter(q=>q.clear).length,steeredClear:qs.filter(q=>q.clear&&q.steered).length,meanSpeedLoss:qs.length?qs.reduce((s,q)=>s+Math.max(0,q.speed-q.minSpeed),0)/qs.length:null}];}))}};}};
}
