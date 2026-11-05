// Lowest-priority lateral racing-line target. Every calculation emits neurons.
export function crates(c,{i,e,ground,active,away,slip,pass,danger,half,low,high,neutral,occupied}) {
  const not=(n,x)=>c.affine(n,[[x,-1]],1),distance=c.affine('crateDistance',[[i('arms.toCrate'),120]]);
  const egoLine=c.mul('crateEgoLine',e('lineOffset'),half);
  const originF=c.affine('crateLineOriginF',[[c.mul('crateOriginSin',egoLine,e('headingSin')),1/70]]);
  const originR=c.affine('crateLineOriginR',[[c.mul('crateOriginCos',egoLine,e('headingCos')),-1/70]]);
  // Interpolate the line at the crate's route station. Route arc metres are
  // not nose-forward metres, especially approaching a corner.
  const stations=[0,8,16,28,45,65],ramps=stations.slice(0,-1).map((s,k)=>c.clip(`crateSegment${k}`,[[distance,1/(stations[k+1]-s)]],s===0?0:-s/(stations[k+1]-s)));
  const interpolate=(name,origin)=>{
    const points=[origin,...Array.from({length:5},(_,k)=>i(`look${k}.${name}`))];
    return c.affine('crateLine.'+name,[[origin,1],...ramps.map((r,k)=>[c.mul(`crateLerp.${name}.${k}`,r,c.affine(`crateDelta.${name}.${k}`,[[points[k+1],1],[points[k],-1]])),1])]);
  };
  const lineF=interpolate('fwd',originF),lineR=interpolate('right',originR);
  const tangent=name=>{let v=i(`crateDelta.${name}.0`);for(let k=1;k<5;k++)v=c.mux(`crateTangent.${name}.${k}`,c.step(`cratePast.${name}.${k}`,[[distance,1]],-stations[k]),i(`crateDelta.${name}.${k}`),v,3);return v;};
  const futureAligned=c.step('crateFutureAligned',[[tangent('fwd'),Math.tan(Math.PI/6)],[c.abs('crateTangentRight',tangent('right')),-1]]);
  const noseError=c.affine('crateNoseError',[[c.mul('crateRightMetres',i('arms.crateRight'),half),1],[lineR,-70]]);
  const cosine=c.max('crateCosFloor',e('headingCos'),c.affine('crateCosMinimum',[],.5));
  const error=c.mul('crateLineError',noseError,c.unit('crateInverseCos',[[cosine,1]],0,'reciprocal'));
  // Original 2.7 m pickup reach less .5–.9 m tracking margin; the current
  // 3.3 m simulator reach adds .6 m of margin without changing this threshold.
  const allowance=c.affine('crateAllowance',[[e('temperAggression'),-.4]],2.2);
  // Pickup reach decides whether to detour; once committed, aim at the centre.
  // A boundary target leaves no margin for the finite lane-change response.
  const detour=c.affine('crateDetour',[[error,1]]);
  const range=c.affine('crateRange',[[e('temperAggression'),15]],45);
  const ramp=c.clip('crateRamp',[[range,1/20],[distance,-1/20]]);
  // Limit the requested step from the car, not from the old racing line:
  // otherwise an already-partly-completed detour can never reach a far row.
  const limited=c.affine('crateLimited',[[egoLine,1],[c.clip('crateStep',[[detour,1],[egoLine,-1]],0,-4,4),1]]);
  const request=c.mul('crateRequest',limited,ramp);
  const filtered=c.affine('crateFiltered',[[i('memory.crateOffset'),13/15],[request,2/15]]);
  // Check the side the filtered target actually asks us to move toward.
  const right=c.step('crateToRight',[[filtered,1],[egoLine,-1]]);
  const ray=c.mux('crateSideRay',right,i('ray3'),i('ray4'),1.5);
  const lanes=occupied.map((xs,k)=>c.step(`crateLaneClear${k}`,xs.map(x=>[x,-1]),.5));
  const lane=c.mux('crateTrafficClear',right,lanes[1],lanes[0],1);
  // 4 m over the existing 20 m ramp gives a gentle 1:5 approach cone.
  // At >30 m/s tighten it to retain at most 6 m/s average lateral travel.
  // Use the full target error: clipping/filtering must not hide a late retarget.
  const reachError=c.abs('crateReachError',c.affine('crateReachDelta',[[error,1],[egoLine,-1]]));
  const reachSpeed=c.max('crateReachSpeed',c.abs('crateReachAbsSpeed',e('speedFwd')),c.affine('crateReachSpeedFloor',[],.75));
  const reachAllowance=c.mul('crateReachAllowance',c.affine('crateReachDistance',[[distance,.15]]),c.unit('crateReachInverseSpeed',[[reachSpeed,1]],0,'reciprocal'));
  const reachable=c.step('crateReachable',[[reachAllowance,1],[reachError,-1]]);
  // Keep the original minimum 1.5 s of approach time at first acquisition.
  // At high speed a 45–60 m optional pickup is too short a lane-change window.
  const timeRoom=c.step('crateTimeRoom',[[range,1],[i('horizontalSpeed'),-60]]);
  const seek=c.and('crateSeeking',[ground,away,futureAligned,lane,reachable,timeRoom,not('crateNotRecovering',active),not('crateNotHazard',danger.avoid),not('crateNotPassing',pass),not('crateEmpty',i('weaponHeld')),not('crateNotOiled',i('arms.oiled')),not('crateNotWhirling',i('arms.whirling')),
    c.step('crateAligned',[[e('headingCos'),1]],-Math.cos(Math.PI/6)),c.step('crateSlipOK',[[slip,-1]],.2),c.step('crateUnderPace',[[e('pace'),1],[e('speedFwd'),-1]]),c.step('crateNear',[[range,1],[distance,-1]]),c.step('crateMoveNeeded',[[c.abs('crateErrorMagnitude',error),1],[allowance,-1]]),c.step('cratePassSettled',[[c.abs('cratePassTail',neutral),-1]],.25),c.step('crateSideClear',[[ray,1]],-2.6/(45*Math.sin(32*Math.PI/180)))]);
  const offset=c.gate('crateOffset',filtered,seek,32);
  // Crates retain a 2.6 m wall margin, a metre more than passing requires.
  const lower=c.affine('crateLower',[[low,1]],1),upper=c.affine('crateUpper',[[high,1]],-1);
  const safe=c.affine('crateBounded',[[lower,1],[c.relu('crateAboveLower',[[offset,1],[lower,-1]]),1],[c.relu('crateAboveUpper',[[offset,1],[upper,-1]]),-1]]);
  return{seek,offset,safe,lineF,lineR,distance,egoLine};
}
