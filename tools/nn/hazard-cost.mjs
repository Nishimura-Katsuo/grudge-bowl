// Fixed-policy ablation, not a parameter search. Only hazard observations differ.
import {readFileSync} from 'node:fs';
import {createBrain} from '../../src/ai/index.js';
import {OBS} from '../../src/sim/sensors.js';
import {evaluate} from './eval.mjs';
import {compareLaps} from './aggression.mjs';
import {simRevision} from './revision.mjs';
const records=readFileSync(new URL('./results-final.jsonl',import.meta.url),'utf8').trim().split(/\r?\n/).map(JSON.parse),revision=simRevision();
if(records[0].simRevision.sha256!==revision.sha256)throw Error('Simulator changed');
console.log(JSON.stringify({simRevision:revision}));
for(const on of records.filter(r=>r.seed!==undefined)){
  const off=evaluate(on.seed,{brainFactory:car=>{const b=createBrain(car),copy=new Float32Array(OBS.size);return{telemetry:b.telemetry,act(obs){copy.set(obs);copy[OBS.index['arms.toHazard']]=1;copy[OBS.index['arms.hazardRight']]=0;return b.act(copy);}};}});
  console.log(JSON.stringify({seed:on.seed,...compareLaps(on,off),off}));
}
if(simRevision().sha256!==revision.sha256)throw Error('Simulator changed during ablation');
