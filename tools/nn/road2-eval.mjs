// Named frozen policies and explicit historical grid, never a parameter search.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {evaluate} from './eval.mjs';
import {brainFromSpec} from './grid-regression.mjs';
import {simRevision} from './revision.mjs';
export const development=[1,7,42,1201,1709,2309,2903,3613,4801,6007,6011,6029,6043,6053,6067,6073,6089,6101,6113,6121,7001,7013,7019,7027,7039,7043,7057,7069];
export const heldOut=[8101,8111,8117,8123,8147,8161,8171,8191];
export async function oldGridWorld(){
 const url=new URL('../../src/sim/world.js',import.meta.url);
 let text=readFileSync(url,'utf8');
 if(!text.includes('const ROW_GAP = 14;')||!text.includes('const SPAWN_LAST_ROW_S = -32;'))throw Error('Unexpected live grid');
 text=text.replace('const ROW_GAP = 14;','const ROW_GAP = 9;').replace('const SPAWN_LAST_ROW_S = -32;','const SPAWN_LAST_ROW_S = -2;');
 text=text.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,url).href}'`);
 return (await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'))).createWorld;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const policy=process.argv[2],seeds=process.argv.length>3?process.argv.slice(3).map(Number):development,revision=simRevision();
 const old=policy==='baseline9',options={};
 if(policy!=='final')options.brainFactory=brainFromSpec(JSON.parse(readFileSync(new URL(policy==='pass1'?'./open-road-pass1.json':'./pre-open-road.json',import.meta.url),'utf8')));
 if(old)options.worldFactory=await oldGridWorld();
 console.log(JSON.stringify({simRevision:revision,policy,grid:old?'historical 9 m; only grid constants replaced in memory':'live 14 m',development,heldOut}));
 for(const seed of seeds)console.log(JSON.stringify({...evaluate(seed,options),role:heldOut.includes(seed)?'held-out':'development'}));
 if(simRevision().sha256!==revision.sha256)throw Error('Simulator changed');
}
