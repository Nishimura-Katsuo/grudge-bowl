// The same review inputs through two named checkpoints; never candidate selection.
import {readFileSync,writeFileSync} from 'node:fs';
import current from '../../src/ai/weights.js';
import {OBS} from '../../src/sim/sensors.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
const before=JSON.parse(readFileSync(new URL('./weapons-review-baseline.json',import.meta.url),'utf8'));
const defaults={'ego.wheelsDown':1,'ego.upright':1,'ego.raceActive':1,'ego.headingCos':1,'ego.halfWidth':.9,'ego.toJump':1,'ego.temperAggression':.8,'arms.toCrate':1,'arms.toHazard':1,'arms.aheadRange':1,'arms.behindRange':1};
const slot={solid:1,alive:1,los:1,fwd:.3,dist:.3,headingCos:1};
const front=extra=>Object.fromEntries(Object.entries({...slot,...extra}).map(([k,v])=>['opp0.'+k,v]));
const cases=[
  {name:'Urgent obstruction during settling',obs:{'ego.stallTimer':.7,'ego.hitTaken':.5,ray0:2/45},state:{settle:1.8,stuck:.6,recover:1}},
  {name:'Centred road hazard with nose fifteen degrees right',obs:{'ego.headingCos':Math.cos(Math.PI/12),'ego.headingSin':-Math.sin(Math.PI/12),'arms.toHazard':40*Math.cos(Math.PI/12)/60,'arms.hazardRight':-40*Math.sin(Math.PI/12)/10}},
  {name:'Rocket misses three metres sideways',obs:{...front({right:.03,dist:Math.hypot(.3,.03)}),'arms.ready':1,'arms.barnBurner':1,'arms.aheadRange':Math.hypot(.3,.03),'arms.aheadBearing':Math.atan2(3,30)},state:{weaponAge:2}},
  {name:'Rocket crosses fast lateral traffic',obs:{...front({relVelRight:20.5/40}),'arms.ready':1,'arms.barnBurner':1,'arms.aheadRange':.3},state:{weaponAge:2}},
  {name:'Targetless soft deadline',obs:{'arms.ready':1,'arms.barnBurner':1},state:{weaponAge:18}},
  {name:'Airborne hard expiry',obs:{'arms.ready':1,'arms.barnBurner':1,'ego.wheelsDown':0},state:{weaponAge:20}},
];
const rows=cases.map(c=>({name:c.name,...Object.fromEntries([['before',before],['after',current]].map(([name,spec])=>{
  const r=createRuntime(compileNetwork(spec)),obs=new Float32Array(OBS.size);for(let k=0;k<14;k++)obs[OBS.index['ray'+k]]=1;
  for(const [n,v] of Object.entries({...defaults,...c.obs}))obs[OBS.index[n]]=v;
  for(const [n,v] of Object.entries(c.state??{}))r.state[spec.names.indexOf('memory.'+n)-OBS.size]=v;
  r.forward(obs);return[name,Object.fromEntries(['recoveryAllowed','escapeActive','hazardLinePosition','hazardAvoid','rocketOpportunity','fire'].map(n=>[n,r.values[spec.names.indexOf(n)]]))];
}))}));
writeFileSync(new URL('./review-fixtures.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify(rows));
