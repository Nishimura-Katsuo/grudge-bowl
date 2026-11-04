// Paired counterfactual measurement of a single fixed network, never a search.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createBrain} from '../../src/ai/index.js';
import {OBS} from '../../src/sim/sensors.js';
import {evaluate} from './eval.mjs';
import {simRevision} from './revision.mjs';
export function peacefulBrain(car){
  const brain=createBrain(car),copy=new Float32Array(OBS.size);
  return{telemetry:brain.telemetry,act(obs){copy.set(obs);copy[OBS.index['ego.temperAggression']]=0;copy[OBS.index['ego.temperVengeance']]=0;for(let k=0;k<11;k++)copy[OBS.index[`opp${k}.hitMe`]]=0;return brain.act(copy);}};
}
export function compareLaps(on,off){
  const matched=[];for(const a of on.lapTimes){const b=off.lapTimes.find(b=>a.car===b.car&&a.lap===b.lap);if(b)matched.push({car:a.car,lap:a.lap,on:a.seconds,off:b.seconds,cost:a.seconds-b.seconds});}
  return{pairs:matched.length,unmatchedOn:on.lapTimes.length-matched.length,unmatchedOff:off.lapTimes.length-matched.length,meanCost:matched.length?matched.reduce((s,x)=>s+x.cost,0)/matched.length:null,maxCost:matched.length?Math.max(...matched.map(x=>x.cost)):null,minCost:matched.length?Math.min(...matched.map(x=>x.cost)):null,overOneSecond:matched.filter(x=>x.cost>1).length,matched};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const revision=simRevision(),records=readFileSync(new URL('./results-final.jsonl',import.meta.url),'utf8').trim().split(/\r?\n/).map(JSON.parse);
  if(revision.sha256!==records[0].simRevision.sha256)throw Error('Re-evaluate the current simulator first');
  console.log(JSON.stringify({simRevision:revision,description:'Production policy versus aggression=0, vengeance=0, hitMe=0 from decision zero. Rage and nerve are unchanged; grudges remain exactly zero.'}));
  for(const on of records.filter(x=>x.seed!==undefined)){
    const off=evaluate(on.seed,{brainFactory:peacefulBrain});
    // Car zero is fixed in advance; everyone else's production policy is held.
    const focalOff=evaluate(on.seed,{brainFactory:car=>car.id===0?peacefulBrain(car):createBrain(car)});
    const focal=compareLaps({lapTimes:on.lapTimes.filter(l=>l.car===0)},{lapTimes:focalOff.lapTimes.filter(l=>l.car===0)});
    console.log(JSON.stringify({seed:on.seed,role:on.role,onRaceSeconds:on.raceSeconds,offRaceSeconds:off.raceSeconds,onStalled:on.stalled,offStalled:off.stalled,...compareLaps(on,off),off,focal:{car:0,...focal},focalOff}));
  }
  if(simRevision().sha256!==revision.sha256)throw Error('Simulator changed during ablation');
}
