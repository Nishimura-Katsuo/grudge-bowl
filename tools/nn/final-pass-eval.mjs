// Named checkpoints, fixed seeds. No parameter search or automatic selection.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {evaluate} from './eval.mjs';
import {brainFromSpec} from './grid-regression.mjs';
import {simRevision} from './revision.mjs';
import {oldGridWorld} from './road2-eval.mjs';
export const development=[1,7,42,1201,1709,2309,2903,3613,4801,6007,6011,6029,6043,6053,6067,6073,6089,6101,6113,6121,8101,8111,8117,8123,8147,8161,8171,8191];
export const heldOut=[9103,9113,9133,9151,9173,9199,9203,9221,9239,9257];
export const ownerAdded=[10007,10037,10061,10093,10103,10133,10151,10177,10211,10243,10267,10289];
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const policy=process.argv[2]??'final',seeds=process.argv.length>3?process.argv.slice(3).map(Number):[...development,...heldOut,...ownerAdded],revision=simRevision();
 const options=policy==='final'?{}:{brainFactory:brainFromSpec(JSON.parse(readFileSync(new URL(policy==='before'?'./pre-balance-pass2.json':policy==='original9'?'./pre-open-road.json':`./${policy}.json`,import.meta.url),'utf8')))};
 if(policy==='original9')options.worldFactory=await oldGridWorld();
 console.log(JSON.stringify({simRevision:revision,policy,development,heldOut,ownerAdded,grid:policy==='original9'?'9 m historical grid override in memory; current finish and balance':'live 14 m'}));
 for(const seed of seeds)console.log(JSON.stringify({...evaluate(seed,options),role:ownerAdded.includes(seed)?'owner-added':heldOut.includes(seed)?'previous-held-out':'development'}));
 if(simRevision().sha256!==revision.sha256)throw Error('Simulator changed during evaluation');
}
