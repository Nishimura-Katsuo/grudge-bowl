import {ARSENAL} from '../../src/sim/config.js';
// Construction only: perception, clocks and trigger predicates are neural rows.
export const weaponKeys=['barnBurner','grudgeSeeker','welcomeMat','oilSlick','smokeBomb','threshingWhirl','repoHook','bedspring','backhander','grandPiano','foghorn'];
export function arms(c,{i,e,o,ground,slip,grudges,rage}){
  const a=n=>i('arms.'+n),not=(n,x)=>c.affine(n,[[x,-1]],1),or=(n,xs)=>c.step(n,xs.map(x=>[x,1]),-.5);
  const held=c.affine('weaponHeld',weaponKeys.map(k=>[a(k),1]));
  const age=c.gate('weaponAge',c.clip('weaponAgeAdvance',[[i('memory.weaponAge'),1]],1/30,0,20),held,20);
  const delay=c.affine('triggerDelay',[[e('temperAggression'),-.75],[rage,-.3]],1.5);
  const settled=c.and('weaponSettled',[ground,c.step('weaponSlipOK',[[slip,-1]],.3)]);
  const waited=c.step('triggerWaited',[[age,1],[delay,-1]]);
  const near=[],aligned=[];
  for(let k=0;k<11;k++){
    const g=c.and(`armsGrudge${k}`,[o(k,'solid'),o(k,'alive'),c.step(`armsGrudgeStrong${k}`,[[grudges[k],1]],-.2),c.step(`armsGrudgeNear${k}`,[[o(k,'dist'),-1]],.5)]);near.push(g);
    aligned.push(c.and(`armsGrudgeAim${k}`,[g,c.step(`armsGrudgeFront${k}`,[[o(k,'fwd'),1]],-.02),c.step(`armsGrudgeAcross${k}`,[[c.abs(`armsGrudgeRight${k}`,o(k,'right')),-1]],.04)]));
  }
  const reserve=c.and('reserveForGrudge',[or('nearGrudge',near),not('grudgeNotInAim',or('grudgeInAim',aligned)),c.step('vengeanceHold',[[e('temperVengeance'),1]],-.5),c.step('grudgeWaitRemaining',[[age,-1],[delay,1],[e('temperVengeance'),3]])]);
  const aimRange=c.affine('rocketRange',[[e('temperAggression'),.25],[rage,.1]],.2);
  // Match the visible ahead sensor to a fixed slot; then predict where the
  // rival crosses the straight rocket's plane. The rocket inherits ego velocity.
  const bearing=c.abs('weaponBearing',a('aheadBearing'));
  const matches=Array.from({length:11},(_,k)=>c.and(`rocketMatch${k}`,[o(k,'solid'),o(k,'alive'),o(k,'los'),c.step(`rocketForward${k}`,[[o(k,'fwd'),1]],-.01),c.step(`rocketCone${k}`,[[o(k,'fwd'),Math.tan(.35)],[c.abs(`rocketRight${k}`,o(k,'right')),-1]]),c.step(`rocketDistanceMatch${k}`,[[c.abs(`rocketDistanceError${k}`,c.affine(`rocketDistanceDelta${k}`,[[o(k,'dist'),1],[a('aheadRange'),-1]])),-1]],.001)]));
  const winner=c.wta('rocketWinner',matches.map((m,k)=>c.affine(`rocketScore${k}`,[[m,4],[o(k,'dist'),-1]],-4)));
  const selected=winner.map((w,k)=>c.and(`rocketSelected${k}`,[w,matches[k]]));
  const select=n=>c.affine('rocketSelected.'+n,selected.map((v,k)=>[c.gate(`rocketRead.${n}.${k}`,o(k,n),v,1.5),1]));
  const closing=c.max('rocketClosing',c.affine('rocketRelativeSpeed',[[select('relVelFwd'),-40]],ARSENAL.rocket.speed),c.affine('rocketClosingFloor',[],2));
  const flight=c.mul('rocketFlightTime',c.relu('rocketFlightDistance',[[select('fwd'),100]],-3.4),c.unit('rocketInverseClosing',[[closing,1]],0,'reciprocal'));
  const intercept=c.affine('rocketIntercept',[[select('right'),1],[c.mul('rocketLateralTravel',select('relVelRight'),flight),.4]]);
  const aim=c.and('rocketOpportunity',[settled,c.step('rocketHasMatch',selected.map(v=>[v,1]),-.5),c.step('rocketInRange',[[aimRange,1],[a('aheadRange'),-1]]),c.step('rocketBearing',[[bearing,-1],[e('temperAggression'),.04],[rage,.03]],.08),c.step('rocketCorridor',[[c.mul('rocketMissApprox',a('aheadRange'),bearing),-1]],.02),c.step('rocketInterceptClear',[[c.abs('rocketInterceptMagnitude',intercept),-1]],.02),c.step('rocketFlightValid',[[flight,-1]],ARSENAL.rocket.life)]);
  const hook=c.and('hookOpportunity',[settled,c.step('hookFarEnough',[[a('aheadRange'),1]],-.1),c.step('hookInRange',[[a('aheadRange'),-1],[e('temperAggression'),.2]],.4)]);
  const automatic=c.and('automaticOpportunity',[settled,c.step('incomingQuiet',[[a('incoming'),-1],[e('temperNerve'),.3]],.4)]);
  const rear=c.and('rearOpportunity',[not('rearPresent',c.step('rearAbsent',[[a('behindRange'),1]],-1)),c.step('rearInRange',[[a('behindRange'),-1],[e('temperAggression'),.4],[rage,.1]],.5)]);
  const close=c.step('closeOpportunity',[[a('closeRivals'),1]],-.125);
  const threat=c.step('hornDefence',[[a('incoming'),1],[e('temperNerve'),-.08],[e('temperAggression'),.02]],-.72);
  const dropDeadline=c.step('dropDeadline',[[age,1],[e('temperAggression'),4],[e('temperVengeance'),-2]],-12);
  const deadline=c.step('weaponDeadline',[[age,1],[e('temperAggression'),4],[rage,1]],-12);
  const aimedDeadline=c.step('aimedDeadline',[[age,1],[e('temperAggression'),4],[rage,1]],-18);
  const hardExpiry=c.step('hardExpiry',[[age,1]],-19);
  const opportunities=[aim,automatic,c.and('dropOpportunity',[settled,rear]),null,null,c.and('whirlOpportunity',[close,settled]),hook,null,automatic,automatic,or('hornOpportunity',[c.and('hornCloseSettled',[close,settled]),threat])];
  for(const k of [3,4,7])opportunities[k]=opportunities[2];
  const choices=weaponKeys.map((k,j)=>{
    const soft=[0,6].includes(j)?aimedDeadline:[2,3,4,7].includes(j)?dropDeadline:deadline;
    const permission=or('permission.'+k,[soft,c.and('patience.'+k,[waited,not('reserve.'+k,reserve)])]);
    return c.and('use.'+k,[a(k),or('reason.'+k,[hardExpiry,c.and('tactical.'+k,[permission,opportunities[j]]),...(j===10?[threat]:[])])]);
  });
  const fire=c.and('fire',[a('ready'),e('raceActive'),ground,not('fireNotWhirling',a('whirling')),or('useWeapon',choices)]);
  const ageNext=c.gate('weaponAgeNext',age,not('weaponNotFired',fire),20);
  const impulse=c.step('thrownImpulse',[[c.abs('throwDeltaF',c.affine('throwDF',[[e('speedFwd'),1],[i('memory.previousFwd'),-1]])),1],[c.abs('throwDeltaR',c.affine('throwDR',[[e('speedRight'),1],[i('memory.previousRight'),-1]])),1]],-.25);
  const effect=or('weaponDisturbance',[a('whirling'),not('weaponAirborne',ground),c.step('strongHit',[[e('hitTaken'),1]],-.25),impulse]);
  const settle=c.mux('settleClock',effect,c.affine('settleDuration',[],1.8),c.clip('settleDecay',[[i('memory.settle'),1]],-1/30,0,1.8),2);
  const settleReady=c.step('settleReady',[[settle,-1]]);
  return{fire,ageNext,settle,settleReady};
}

export function hazard(c,{i,e,ground,active,away,low,high,half}){
  const a=n=>i('arms.'+n),not=(n,x)=>c.affine(n,[[x,-1]],1);
  const egoLine=c.mul('egoLineMetres',e('lineOffset'),half);
  const roadRight=c.affine('hazardRoadRight',[[c.mul('hazardRightCos',a('hazardRight'),e('headingCos')),10],[c.mul('hazardForwardSin',a('toHazard'),e('headingSin')),-60]]);
  const roadForward=c.affine('hazardRoadForward',[[c.mul('hazardForwardCos',a('toHazard'),e('headingCos')),60],[c.mul('hazardRightSin',a('hazardRight'),e('headingSin')),10]]);
  const position=c.affine('hazardLinePosition',[[roadRight,1],[egoLine,1]]);
  const offsets=[-1,1].map((s,k)=>c.affine(`hazardCandidate${k}`,[[position,1]],s*7.2));
  const viable=offsets.map((x,k)=>c.and(`hazardViable${k}`,[c.step(`hazardLow${k}`,[[x,1],[low,-1]]),c.step(`hazardHigh${k}`,[[high,1],[x,-1]]),c.step(`hazardRay${k}`,[[i(k?'ray3':'ray4'),1]],-12/45)]));
  const wins=c.wta('hazardSide',offsets.map((x,k)=>c.affine(`hazardScore${k}`,[[viable[k],100],[c.abs(`hazardDistance${k}`,x),-1]],-100+(k?0:.01))));
  const exists=c.step('hazardRoom',viable.map(x=>[x,1]),-.5);
  const avoid=c.and('hazardAvoid',[ground,away,not('hazardNotRecovering',active),exists,c.step('hazardRouteAhead',[[roadForward,1]]),c.step('hazardNear',[[a('toHazard'),-1]],55/60),c.step('hazardOnLine',[[c.abs('hazardAcross',position),-1]],7.2)]);
  const selected=c.affine('hazardSelected',wins.map((w,k)=>[c.gate(`hazardSelect${k}`,offsets[k],w,100),1]));
  const request=c.gate('hazardRequest',selected,avoid,100);
  const offset=c.affine('hazardOffset',[[i('memory.hazardOffset'),13/15],[request,2/15]]);
  return{avoid,offset,roadForward,egoLine};
}
