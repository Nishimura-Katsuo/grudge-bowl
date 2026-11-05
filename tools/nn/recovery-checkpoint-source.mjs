// Construction only. Every predicate, latch and phase transition becomes a row.
export function recovery(c,{i,e,o,ground,direction,settleReady}){
  const not=(n,x)=>c.affine(n,[[x,-1]],1),or=(n,bits)=>c.step(n,bits.map(x=>[x,1]),-.5);
  const front=[],rear=[];
  for(let k=0;k<11;k++){
    const sin=c.abs(`body${k}.sin`,o(k,'headingSin')),cos=c.abs(`body${k}.cos`,o(k,'headingCos'));
    const length=c.affine(`body${k}.length`,[[cos,2.45/100],[sin,1/100]],2.95/100);
    const width=c.affine(`body${k}.width`,[[sin,2.45/100],[cos,1/100]],1.25/100);
    const overlap=c.and(`body${k}.overlap`,[o(k,'solid'),c.step(`body${k}.lateral`,[[width,1],[c.abs(`body${k}.right`,o(k,'right')),-1]])]);
    front.push(c.and(`body${k}.front`,[overlap,c.step(`body${k}.forward`,[[o(k,'fwd'),1]]),c.step(`body${k}.frontNear`,[[length,1],[o(k,'fwd'),-1]])]));
    rear.push(c.and(`body${k}.rear`,[overlap,c.step(`body${k}.backward`,[[o(k,'fwd'),-1]]),c.step(`body${k}.rearNear`,[[length,1],[o(k,'fwd'),1]])]));
  }
  const wall=(n,ks)=>or(n,ks.map(k=>c.step(`${n}.${k}`,[[i(`ray${k}`),-1]],3.2/45)));
  // At ±32° a ray intersects the front corner: half-width/sin(32°),
  // plus .5 m contact margin. The three central rays miss this wedge.
  const cornerWall=or('frontCornerWall',[3,4].map(k=>c.step(`cornerWall${k}`,[[i(`ray${k}`),-1]],(1/Math.sin(32*Math.PI/180)+.5)/45)));
  const blocked=or('forwardBlocked',[wall('noseWall',[0,1,2]),cornerWall,...front]);
  // The ±150° rays hit a parallel side wall outside the body; only the rear
  // centre ray proves the reverse path blocked. Side clearance chooses the lock.
  const behind=or('rearBlocked',[wall('tailWall',[13]),...rear]);
  const clear=not('forwardClear',blocked),aligned=c.step('headingGood',[[e('headingCos'),1]],-Math.cos(Math.PI/6));
  // Release beyond a body length plus stopping margin, not at the entry edge.
  const releaseRoad=c.and('releaseRoad',[not('noFrontBody',or('frontBodies',front)),...[0,1,2].map(k=>c.step(`releaseRay${k}`,[[i(`ray${k}`),1]],-6.4/45))]);
  const backwards=c.step('facingBackward',[[e('headingCos'),-1]]);
  const moving=c.and('forwardProgress',[c.step('forwardSpeedRecovered',[[e('speedFwd'),1]],-1/40),c.step('routeSpeedRecovered',[[e('progressRate'),1]],-.5/40)]);
  const safe=c.and('safeForward',[releaseRoad,not('notBackwards',backwards)]);
  const release=c.mux('recoveryRelease',i('memory.turning'),c.and('turnComplete',[aligned,releaseRoad]),safe,1);
  const need=or('recoveryNeeded',[blocked,backwards]);
  const slow=c.step('slow',[[c.unit('velocityF2',[[e('speedFwd'),1]],0,'square'),-1],[c.unit('velocityR2',[[e('speedRight'),1]],0,'square'),-1]],(3/40)**2);
  // A six-second rule-level stall with grounded upright obstruction is genuine,
  // even if contact keeps refreshing the post-impact settling countdown.
  const settleEscape=c.and('settleEscape',[ground,c.step('escapeUpright',[[e('upright'),1]],-Math.SQRT1_2),slow,blocked,not('escapeNotWhirling',i('arms.whirling')),not('escapeStallExceeded',c.step('escapeStallNotExceeded',[[e('stallTimer'),-1]],.5))]);
  const recoveryAllowed=or('recoveryAllowed',[settleReady,settleEscape]);
  // A car driving the wrong way can be fast yet still accumulate route debt.
  // Reuse the sustained .5 s evidence and settling/launch guards, not a new timer.
  const wrongWay=c.and('wrongWayTravel',[backwards,c.step('losingRoute',[[e('progressRate'),-1]],-.5/40)]);
  const integrate=c.and('integrateStuck',[recoveryAllowed,or('recoveryMotionEvidence',[slow,wrongWay]),need,not('notMakingProgress',moving),e('raceActive'),ground,not('notEscaping',i('memory.recover'))]);
  const stuck=c.gate('stuck',c.clip('stuckAdvance',[[i('memory.stuck'),1]],1/30,0,.6),integrate,1);
  const trigger=c.and('escapeTrigger',[c.step('stuckReady',[[stuck,1]],-.5),c.step('launchGrace',[[e('stallTimer'),1]],-.1),not('escapeAvailable',i('memory.recover'))]);
  const active=c.and('escapeActive',[recoveryAllowed,or('escapeHeld',[i('memory.recover'),trigger]),not('notReleased',release),e('raceActive')]);
  const turning=c.and('turning',[active,or('turnHeld',[i('memory.turning'),c.and('turnStart',[trigger,backwards])])]);
  // A 4.9 m body at 4.5 m/s² takes 1.48 s to back one length: allow 1.7 s.
  // The clock advances only in the requested gear and direction of travel.
  const matches=c.step('gearMatches',[[c.abs('gearDifference',c.affine('gearDelta',[[i('memory.gear'),1],[e('inReverse'),-1]])),-1]],.5);
  const wrongTravel=c.step('phaseWrongTravel',[[c.mul('phaseTravel',e('speedFwd'),c.affine('phaseTravelSign',[[i('memory.gear'),-2]],1)),-1]],-.2/40);
  const phaseBlocked=c.mux('phaseBlocked',i('memory.gear'),behind,blocked,1);
  const phaseSlow=c.gate('phaseSlowAdvance',c.clip('phaseSlowSum',[[i('memory.phaseSlow'),1]],1/30,0,1),c.and('phaseNotMoving',[i('memory.recover'),matches,not('phaseNoWrongTravel',wrongTravel),c.step('phaseLowSpeed',[[c.unit('phaseF2',[[e('speedFwd'),1]],0,'square'),-1],[c.unit('phaseR2',[[e('speedRight'),1]],0,'square'),-1]],(.2/40)**2)]),1);
  // Route debt survives leg changes. Movement away from the course is not success.
  const debt=c.gate('routeDebt',c.clip('routeDebtSum',[[i('memory.routeDebt'),1],[e('progressRate'),-40/30]],0,0,8),active,8);
  const routeConcern=or('routeConcern',[c.step('routeLostBodyHalf',[[debt,1]],-2.45),c.step('stallDeadline',[[e('stallTimer'),1]],-.5)]);
  // A turn away from the route initially loses metres while reducing heading error.
  // Only an engaged gear earns this exemption; a failed shift still times out.
  const headingYaw=c.mul('headingYawAgreement',e('headingSin'),e('yawRate'));
  const turnImproving=c.and('turnImproving',[matches,not('headingYawPositive',c.step('headingYawNonPositive',[[headingYaw,-1]]))]);
  const routeFailed=c.and('routeFailed',[i('memory.recover'),routeConcern,not('routeTurnNotImproving',turnImproving),c.step('routeNotRecovered',[[e('progressRate'),-1]],.5/40),c.step('routeLegDeadline',[[i('memory.legTime'),1]],-1.7)]);
  const failed=or('phaseFailed',[c.step('phaseImmobile',[[phaseSlow,1]],-.8),routeFailed]);
  const change=c.and('phaseChange',[i('memory.recover'),or('minimumPhaseOrDeadline',[c.step('minimumPhase',[[i('memory.escape'),1]],-.5),routeFailed]),or('phaseDone',[phaseBlocked,failed,c.and('backoffDone',[i('memory.gear'),c.step('phaseExpired',[[i('memory.escape'),1]],-1.7)])])]);
  const reset=or('phaseReset',[trigger,change]);
  const noMotion=c.gate('phaseSlow',phaseSlow,not('phaseNotRestarted',reset),1);
  const timer=c.gate('escapeTimer',c.clip('phaseAdvance',[[i('memory.escape'),1],[c.and('phaseAdvances',[matches,not('phaseRightTravel',wrongTravel)]),1/30]],0,0,1.8),c.and('phaseContinues',[active,not('phaseNotReset',reset)]),2);
  const legTime=c.gate('legTime',c.clip('legTimeAdvance',[[i('memory.legTime'),1]],1/30,0,2),c.and('legContinues',[active,not('legNotReset',reset)]),2);
  const routeGear=c.mux('routeGear',not('routeRearClear',behind),backwards,c.affine('routeForwardGear',[],0),1);
  const switchedGear=c.mux('routeGearChoice',routeFailed,routeGear,not('oppositeGear',i('memory.gear')),1);
  const gear=c.gate('escapeGear',c.mux('gearEntry',trigger,c.and('reverseEntry',[blocked,not('rearClear',behind)]),c.mux('gearSwitch',change,switchedGear,i('memory.gear'),1),1),active,1);
  const headingSign=c.affine('headingTurnSign',[[c.step('trackRight',[[e('headingSin'),1]]),2]],-1);
  const preferred=c.mux('preferredTurn',c.step('headingAmbiguous',[[c.abs('headingSine',e('headingSin')),-1]],.5),direction,headingSign,1);
  const leftPin=c.step('turnLeftWall',[[i('ray8'),-1]],2.6/45),rightPin=c.step('turnRightWall',[[i('ray7'),-1]],2.6/45);
  const wallSide=c.wta('turnWallSide',[
    c.affine('turnLeftScore',[[i('ray8'),1],[leftPin,-4],[preferred,-.25]]),
    c.affine('turnRightScore',[[i('ray7'),1],[rightPin,-4],[preferred,.25]])]);
  const bothSides=c.and('turnSidesClear',[not('turnLeftClear',leftPin),not('turnRightClear',rightPin)]);
  const definite=c.step('headingDefinite',[[c.abs('turnHeadingMagnitude',e('headingSin')),1]],-Math.sin(Math.PI/18));
  const lowSpeed=c.step('turnLowSpeed',[[c.unit('turnF2',[[e('speedFwd'),1]],0,'square'),-1],[c.unit('turnR2',[[e('speedRight'),1]],0,'square'),-1]],(6/40)**2);
  const stale=c.step('turnStale',[[c.mul('turnAgreement',i('memory.turn'),e('headingSin')),-1]],-Math.sin(Math.PI/18));
  const reselect=c.and('turnReconsider',[active,lowSpeed,bothSides,definite,stale]);
  const wallChoice=c.affine('wallTurnChoice',[[wallSide[0],-1],[wallSide[1],1]]);
  const turnChoice=c.mux('turnChoice',c.and('shortestTurnSafe',[bothSides,definite]),headingSign,wallChoice,1);
  const turn=c.gate('escapeTurn',c.mux('turnLatch',or('chooseTurn',[trigger,failed,change,reselect]),turnChoice,i('memory.turn'),1),active,1);
  const reverse=c.and('reverse',[active,gear]);
  const signedTurn=c.mul('recoverySteer',turn,c.affine('gearSteerSign',[[reverse,-2]],1));
  const braking=or('recoveryBrake',[c.step('gearBrake',[[c.abs('requestedGearError',c.affine('requestedGearDelta',[[reverse,1],[e('inReverse'),-1]])),1]],-.5),c.and('directionBrake',[active,c.step('oppositeMotion',[[c.mul('requestedTravel',e('speedFwd'),c.affine('requestedTravelSign',[[reverse,-2]],1)),-1]],-.2/40)])]);
  return{stuck,timer,gear,turn,active,turning,noMotion,reverse,signedTurn,braking,debt,legTime};
}
