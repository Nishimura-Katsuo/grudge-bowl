// Two named policies, never parameter search. Fresh seeds are reserved until freeze.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {evaluate,benchmark} from './eval.mjs';
import {brainFromSpec} from './grid-regression.mjs';
import {simRevision} from './revision.mjs';
export const development=[1,7,42,1201,1709,2309,2903,3613,4801];
export const heldOut=[6007,6011,6029,6043,6053,6067,6073,6089,6101,6113,6121];
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const baseline=process.argv[2]==='baseline',seeds=process.argv.length>3?process.argv.slice(3).map(Number):[...development,...heldOut],revision=simRevision();
 const options=baseline?{brainFactory:brainFromSpec(JSON.parse(readFileSync(new URL('./pre-open-road.json',import.meta.url),'utf8')))}:{};
 console.log(JSON.stringify({simRevision:revision,policy:baseline?'pre-open-road':'final',development,heldOut}));
 for(const seed of seeds)console.log(JSON.stringify({...evaluate(seed,options),role:heldOut.includes(seed)?'held-out':'development'}));
 console.log(JSON.stringify({benchmark:benchmark(options.brainFactory)}));
 if(simRevision().sha256!==revision.sha256)throw Error('Sim changed');
}
