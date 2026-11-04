// Measurements of a fixed policy, never a search over policy constants.
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createWorld, stepWorld } from '../../src/sim/world.js';
import { createBrain } from '../../src/ai/index.js';
import { testDriver } from '../../test/helpers/testDriver.js';
import { simRevision } from './revision.mjs';
import { horizontalSpeed, horizontalSlip } from './metrics.mjs';
export function progressLeader(cars,incumbent){return cars.filter(c=>c.alive).reduce((a,c)=>!a||c.progress>a.progress+1e-6?c:a,cars[incumbent]?.alive?cars[incumbent]:null);}
export function evaluate(seed,options={}) {
  const w=createWorld({seed,brainFactory:createBrain,...options}),n=w.cars.length;
  const lapAt=Array(n).fill(0),best=Array(n).fill(Infinity),stop=Array(n).fill(0),lapTimes=[];
  let cursor=0,hits=0,hard=0,cross=0,above=0,samples=0,stuck=0,moving=0,sliding=0,longest=0,leader=-1,changes=0,leaderBest=Infinity,lean=0;
  while(w.phase!=='finished') {
    stepWorld(w);
    const front=progressLeader(w.cars,leader);
    for(;cursor<w.events.length;cursor++) {
      const event=w.events[cursor];
      if(event.type==='hit'){hits++;if(event.upper>=0)above++;if(event.strength>=.35)hard++;if(w.track.crossings.some(p=>Math.hypot(p.x-event.x,p.z-event.z)<=16))cross++;}
      if(event.type==='lap'){const t=event.time-3,dt=t-lapAt[event.car];lapAt[event.car]=t;best[event.car]=Math.min(best[event.car],dt);lapTimes.push({car:event.car,lap:event.lap,seconds:dt});if(front?.id===event.car)leaderBest=Math.min(leaderBest,dt);}
    }
    if(w.phase!=='racing'||w.step%8)continue;
    if(w.raceTime>5){if(leader>=0&&front&&front.id!==leader)changes++;leader=front?.id??-1;}
    for(const car of w.cars){if(!car.alive)continue;const speed=horizontalSpeed(car);
      if(speed>6){moving++;if(Math.abs(horizontalSlip(car))>Math.PI/18)sliding++;}
      if(w.brains[car.id].telemetry?.mode==='hunt')lean++;
      if(w.raceTime<=5)continue;samples++;if(speed<3){stuck++;stop[car.id]+=1/30;longest=Math.max(longest,stop[car.id]);}else stop[car.id]=0;
    }
  }
  const ko={};for(const c of w.cars)if(!c.alive)ko[c.koReason]=(ko[c.koReason]??0)+1;
  const round=x=>Number.isFinite(x)?Math.round(x*1000)/1000:null;
  return {seed,role:[3613,4801].includes(seed)?'held-out':'development',finishedByLaps:!!w.cars[w.winner]?.alive&&w.cars[w.winner].progress>=w.laps*w.track.length,winner:w.cars[w.winner]?.name,raceSeconds:round(w.raceTime),leaderBestLap:round(leaderBest),winnerBestLap:round(best[w.winner]),
    ko,koTotal:n-w.cars.filter(c=>c.alive).length,running:w.cars.filter(c=>c.alive).length,stalled:ko['stalled out']??0,turtled:ko.turtled??0,
    liveCarSeconds:round(samples/30),stuckCarSeconds:round(stuck/30),stuckPercent:round(100*stuck/Math.max(1,samples)),longestStop:round(longest),hits,hitsPerMinute:round(60*hits/w.raceTime),hardHits:hard,hardPerMinute:round(60*hard/w.raceTime),crossingHitPercent:round(100*cross/Math.max(1,hits)),fromAbove:above,leadChanges:changes,movingSlipPercent:round(100*sliding/Math.max(1,moving)),movingSamples:moving,slidingSamples:sliding,leaningSeconds:round(lean/30),lapTimes:lapTimes.map(l=>({...l,seconds:round(l.seconds)}))};
}
export function benchmark(){const w=createWorld({brainFactory:createBrain});for(let k=0;k<2400;k++)stepWorld(w);const ts=[];for(let k=0;k<10000;k++){const start=performance.now();for(let j=0;j<12;j++)w.brains[j].act(w.obs[j]);ts.push(performance.now()-start);}ts.sort((a,b)=>a-b);return{calls:12,batches:ts.length,meanMs:ts.reduce((a,b)=>a+b)/ts.length,p95Ms:ts[9500],maxMs:ts.at(-1)};}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const revision=simRevision();console.log(JSON.stringify({simRevision:revision}));
  if(process.argv.includes('--solo')){console.log(JSON.stringify({network:evaluate(1,{carCount:1}),reference:evaluate(1,{carCount:1,brainFactory:()=>testDriver()})}));}
  else {for(const seed of process.argv.length>2?process.argv.slice(2).map(Number):[1,7,42,1201,1709,2309,2903,3613,4801])console.log(JSON.stringify(evaluate(seed)));console.log(JSON.stringify({benchmark:benchmark()}));}
  if(simRevision().sha256!==revision.sha256)throw Error('Simulator changed during evaluation');
}
