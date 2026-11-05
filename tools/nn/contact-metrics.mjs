// Read-only contact classification. Categories are fixed before policy edits.
import {OBS} from '../../src/sim/sensors.js';
export function crossingContact(track,e,a,b){
  const distance=(s,t)=>Math.min(track.route(s,t),track.route(t,s));
  return track.crossings.some(p=>{
    if(Math.hypot(p.x-e.x,p.z-e.z)>25)return false;
    const aa=distance(a.trackS,p.sA),ab=distance(a.trackS,p.sB),ba=distance(b.trackS,p.sA),bb=distance(b.trackS,p.sB);
    // Route identity excludes same-strand launch packs, even inside the window.
    return Math.min(aa,ab)<=30&&Math.min(ba,bb)<=30&&(aa<ab)!==(ba<bb);
  });
}
export function contactMetrics(w){
  const initial=w.cars.map(c=>c.progress),events=[];
  const health=w.cars.map(c=>c.health),damage=w.cars.map(()=>({car:0,wall:0,weapon:0,other:0,last:null}));
  const push=w.events.push.bind(w.events);
  w.events.push=e=>{
    if(!['wheelOff','ko'].includes(e.type)){
      const kind=e.type==='hit'?'car':e.type==='wall'?'wall':['blast','cut','hooked','gored','pianoLands'].includes(e.type)?'weapon':'other';
      for(const c of w.cars){const d=Math.max(0,health[c.id]-c.health);damage[c.id][kind]+=d;if(d)damage[c.id].last=kind;health[c.id]=c.health;}
    }
    return push(e);
  };
  const nearJump=c=>w.track.jumps.some(j=>w.track.route(j.lipS,c.trackS)<=j.airLength+j.maxSpeed);
  function event(e){
    if(e.type!=='hit')return;
    const a=w.cars[e.a],b=w.cars[e.b];
    const crossing=crossingContact(w.track,e,a,b);
    const crossingWindow=w.track.crossings.some(p=>Math.hypot(p.x-e.x,p.z-e.z)<=25);
    const landing=e.upper>=0||nearJump(a)||nearJump(b);
    const parallel=(a.R[0]*b.R[0]+a.R[6]*b.R[6])/Math.max(.01,Math.hypot(a.R[0],a.R[6])*Math.hypot(b.R[0],b.R[6]))>.8;
    const rear=parallel&&[e.zoneA,e.zoneB].includes('rear')&&[e.zoneA,e.zoneB].includes('front');
    const snapshot=c=>({id:c.id,s:c.trackS,speed:Math.hypot(c.vx,c.vz),brake:c.input.brake,steer:c.input.steer,mode:w.brains[c.id]?.telemetry?.mode,crate:w.obs[c.id][OBS.index['arms.toCrate']]*120,held:c.weapon,ground:c.wheels.filter(x=>x.onGround).length});
    events.push({time:w.raceTime,leaderLap:w.leaderLaps,category:crossing?'crossing':landing?'landing':'open',crossing,crossingWindow,landing,hard:e.closing>6,strength:e.strength,closing:e.closing,rear,braking:a.input.brake>.1||b.input.brake>.1,damage:e.dmgA+e.dmgB,a:snapshot(a),b:snapshot(b)});
  }
  return{event,result(){const count=category=>{const es=events.filter(e=>e.category===category);return{all:es.length,hard:es.filter(e=>e.hard).length,rear:es.filter(e=>e.rear).length,braking:es.filter(e=>e.braking).length,lean:es.filter(e=>e.a.mode==='hunt'||e.b.mode==='hunt').length,crateNearby:es.filter(e=>[e.a,e.b].some(c=>!c.held&&c.crate<60)).length,early:es.filter(e=>e.time<40).length};};return{damage:damage.map((d,k)=>({...d,id:k,ko:w.cars[k].koReason})),carLaps:w.cars.reduce((s,c,k)=>s+Math.max(0,c.progress-initial[k])/w.track.length,0),open:count('open'),crossing:count('crossing'),landing:count('landing'),events};}};
}
