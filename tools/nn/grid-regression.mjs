// Three named revisions, not a parameter sweep: isolate the reported no-crates regression.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import current from '../../src/ai/weights.js';
import {evaluate} from './eval.mjs';
import {simRevision} from './revision.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
export function brainFromSpec(spec){
  const net=compileNetwork(spec);
  return()=>{const r=createRuntime(net),obs=new Float32Array(spec.observationCount),action=new Float32Array(6),telemetry={mode:'race'};
    return{telemetry,act(input){for(let k=0;k<obs.length;k++)obs[k]=input[k];const v=r.forward(obs);for(let k=0;k<spec.actions.length;k++)action[k]=v[spec.actions[k]];let m=0;for(let k=1;k<4;k++)if(v[spec.modes[k]]>v[spec.modes[m]])m=k;telemetry.mode=['hunt','race','drift','unstick'][m];return action;}};};
}
export function gridRegression(){return Object.fromEntries([['preWeapons',read('./pre-weapons.json')],['beforeReview',read('./weapons-review-baseline.json')],['current',current]].map(([name,spec])=>[name,evaluate(1,{weapons:false,brainFactory:brainFromSpec(spec)})]));}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify({simRevision:simRevision(),...gridRegression()}));

