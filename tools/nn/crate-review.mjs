// Named review fixtures only; no search or selection of policies.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import spec from '../../src/ai/weights.js';
import {OBS} from '../../src/sim/sensors.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
import {simRevision} from './revision.mjs';
const before=JSON.parse(readFileSync(new URL('./crate-review-baseline.json',import.meta.url),'utf8'));
function run(s,{offset=0,target=7.76,distance=3.64,memory=2.26,left=false}={}){
  const obs=new Float32Array(OBS.size),set=(n,v)=>obs[OBS.index[n]]=v;
  for(const [n,v] of Object.entries({'ego.speedFwd':29.63/40,'ego.pace':.9,'ego.halfWidth':.9,'ego.lineOffset':offset/9,'ego.trackOffset':offset/9,'ego.wheelsDown':1,'ego.upright':1,'ego.raceActive':1,'ego.headingCos':1,'ego.toJump':1,'ego.surfaceGrip':1,'ego.temperAggression':.8,'arms.toCrate':distance/120,'arms.crateRight':(target-offset)/9,'arms.toHazard':1,'arms.aheadRange':1,'arms.behindRange':1}))set(n,v);
  for(let k=0;k<14;k++)set('ray'+k,1);
  for(let k=0;k<5;k++){set(`look${k}.fwd`,[8,16,28,45,65][k]/70);set(`look${k}.right`,-offset/70);set(`look${k}.pace`,.9);}
  if(left)for(const [n,v] of Object.entries({solid:1,alive:1,los:1,headingCos:1,fwd:-.02,right:-.03,dist:.04}))set('opp0.'+n,v);
  const r=createRuntime(compileNetwork(s));r.state[s.names.indexOf('memory.crateOffset')-OBS.size]=memory;r.forward(obs);
  return Object.fromEntries(['crateLineError','crateEgoLine','crateRequest','crateFiltered','crateToRight','crateTrafficClear','crateReachAllowance','crateReachError','crateReachable','crateSeeking','crateOffset','steer'].map(n=>[n,s.names.includes(n)?r.values[s.names.indexOf(n)]:null]));
}
export function crateReview(){return [
  {name:'Filtered target goes left while raw request goes right',options:{offset:2.5,target:6.5,distance:35,memory:0,left:true}},
  {name:'Disappearing middle crate leaves an unreachable late target',options:{}},
].map(({name,options})=>({name,before:run(before,options),after:run(spec,options)}));}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify({simRevision:simRevision(),cases:crateReview()}));
