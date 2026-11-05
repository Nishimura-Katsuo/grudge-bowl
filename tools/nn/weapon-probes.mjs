// Fixed input contrasts, not candidate policies or parameter selection.
import {writeFileSync} from 'node:fs';
import spec from '../../src/ai/weights.js';
import {OBS} from '../../src/sim/sensors.js';
import {compileNetwork,createRuntime} from '../../src/ai/network.js';
const net=compileNetwork(spec);
function probe(label,values,memory={}){
  const obs=new Float32Array(OBS.size),r=createRuntime(net),set=(n,v)=>obs[OBS.index[n]]=v;
  const defaults={'ego.wheelsDown':1,'ego.raceActive':1,'ego.headingCos':1,'ego.halfWidth':.9,'ego.toJump':1,'ego.toCrossing':1,'ego.pace':.7,'arms.toCrate':1,'arms.toHazard':1,'arms.aheadRange':1,'arms.behindRange':1,'arms.ready':1};
  for(const [n,v] of Object.entries({...defaults,...values}))set(n,v);
  if(values['arms.barnBurner']){const d=values['arms.aheadRange'];for(const [n,v] of Object.entries({solid:1,alive:1,los:1,fwd:d,dist:d,headingCos:1}))set('opp10.'+n,v);}
  for(let k=0;k<14;k++)set('ray'+k,1);
  for(const [n,v] of Object.entries(memory))r.state[spec.names.indexOf('memory.'+n)-OBS.size]=v;
  for(let tick=1;tick<=600;tick++){
    r.forward(obs);
    if(r.values[spec.actions[5]]>.5)return{label,seconds:tick/30,values,memory};
  }
  throw Error('Unbounded weapon dwell: '+label);
}
const rows=[];
for(const aggression of [0,1])rows.push(probe('Aggression '+aggression+': rocket, rival 15 m ahead',{'arms.barnBurner':1,'arms.aheadRange':.15,'ego.temperAggression':aggression}));
for(const vengeance of [0,1])rows.push(probe('Vengeance '+vengeance+': grudge at rear quarter',{'arms.barnBurner':1,'arms.aheadRange':.15,'ego.temperAggression':1,'ego.temperVengeance':vengeance,'opp0.solid':1,'opp0.alive':1,'opp0.fwd':-.1,'opp0.right':.1,'opp0.dist':.15},{grudge0:1}));
for(const nerve of [0,1])rows.push(probe('Nerve '+nerve+': Foghorn, incoming=.75',{'arms.foghorn':1,'arms.incoming':.75,'ego.temperNerve':nerve}));
for(const rage of [0,1])rows.push(probe('Initial driving rage '+rage+': rocket, rival 35 m ahead',{'arms.barnBurner':1,'arms.aheadRange':.35,'ego.temperAggression':.5},{rage}));
writeFileSync(new URL('./weapon-probes.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify(rows.map(({label,seconds})=>({label,seconds}))));
