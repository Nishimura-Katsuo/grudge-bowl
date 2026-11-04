// Directly assigned racing circuits. No fitting or parameter search.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OBS } from '../../src/sim/sensors.js';
import { Circuit } from './circuits.mjs';
import { recovery } from './recovery.mjs';
export function construct() {
  const states=[...Array.from({length:11},(_,k)=>`memory.grudge${k}`),'memory.rage','memory.stuck','memory.escape','memory.gear','memory.turn','memory.passOffset','memory.recover','memory.turning','memory.phaseSlow','memory.routeDebt','memory.legTime','memory.leanClock','memory.neutralOffset','memory.displayRage','memory.previousPosition'];
  const c=new Circuit([...OBS.names,...states]),i=n=>c.names.get(n),e=n=>i('ego.'+n),o=(k,n)=>i(`opp${k}.${n}`);
  const zero=c.affine('zero',[],0),not=(n,x)=>c.affine(n,[[x,-1]],1);
  const speed=c.abs('speed',e('speedFwd')),slip=c.abs('slip',e('slipAngle'));
  const ground=c.step('ground',[[e('wheelsDown'),1]],-.125),lip=c.step('lip',[[e('toJump'),-1]],8/120);
  const away=c.step('awayFromJump',[[e('toJump'),1]],25/120*-1);
  const vengeance=c.affine('vengeance',[[e('temperVengeance'),1.5]],.5);
  const grudges=Array.from({length:11},(_,k)=>c.clip(`grudge${k}`,[[i(`memory.grudge${k}`),2**(-1/540)],[c.mul(`grudgeHit${k}`,o(k,'hitMe'),vengeance),1]]));
  const rage=c.clip('rage',[[i('memory.rage'),2**(-1/180)],[e('hitTaken'),.65],[e('stallTimer'),.008]]);
  const eligible=[],rivals=[],occupied=[[],[]];
  const scores=Array.from({length:11},(_,k)=>{
    const relevant=c.max(`traffic${k}.directionRelevant`,not(`traffic${k}.wreck`,o(k,'alive')),c.step(`traffic${k}.parallel`,[[o(k,'headingCos'),1]],-.5));
    const valid=c.and(`traffic${k}.valid`,[o(k,'solid'),o(k,'los'),c.step(`traffic${k}.ahead`,[[o(k,'fwd'),1]],-.015),c.step(`traffic${k}.lane`,[[c.abs(`traffic${k}.right`,o(k,'right')),-1]],.035),c.max(`traffic${k}.needed`,not(`traffic${k}.isWreck`,o(k,'alive')),c.step(`traffic${k}.slower`,[[o(k,'relVelFwd'),-1]],-.025)),c.step(`traffic${k}.near`,[[o(k,'dist'),-1]],.30),relevant]);
    eligible.push(valid);
    rivals.push(c.max(`traffic${k}.rival`,c.step(`traffic${k}.raceClose`,[[c.abs(`traffic${k}.gap`,o(k,'raceGap')),-1]],.12),c.step(`traffic${k}.grudgeClose`,[[grudges[k],1]],-.1)));
    for(let s=0;s<2;s++) occupied[s].push(c.and(`lane${s}.${k}.blocked`,[o(k,'solid'),c.step(`lane${s}.${k}.ahead`,[[o(k,'fwd'),1]],.04),c.step(`lane${s}.${k}.near`,[[o(k,'fwd'),-1]],.18),c.step(`lane${s}.${k}.overlap`,[[c.abs(`lane${s}.${k}.across`,c.affine(`lane${s}.${k}.delta`,[[o(k,'right'),1]],s?-.03:.03)),-1]],.025)]));
    return c.affine(`traffic${k}.score`,[[valid,4],[o(k,'dist'),-1]],-4);
  });
  const winners=c.wta('trafficWinner',scores),targets=winners.map((w,k)=>c.and(`target${k}`,[w,eligible[k]]));
  const exists=c.affine('trafficExists',targets.map(t=>[t,1]));
  const select=n=>c.affine('selected.'+n,targets.map((t,k)=>[c.gate(`select.${n}.${k}`,o(k,n),t,1.5),1]));
  const fwd=select('fwd'),right=select('right'),dist=select('dist'),alive=select('alive'),rel=select('relVelFwd');
  const grudge=c.affine('selectedGrudge',targets.map((t,k)=>[c.gate(`selectGrudge${k}`,grudges[k],t,1),1]));
  const rival=c.affine('selectedRival',targets.map((t,k)=>[c.gate(`selectRival${k}`,rivals[k],t,1),1]));
  const side=c.wta('passSide',[0,1].map(s=>c.affine(`lane${s}.score`,[[i(s?'ray3':'ray4'),1],...occupied[s].map(x=>[x,-2])],s?0:.01)));
  const direction=c.affine('passDirection',[[side[0],-1],[side[1],1]]);
  const pass=c.and('passing',[exists,away,c.step('passAhead',[[fwd,1]],-.015),c.step('passLane',[[c.abs('targetRight',right),-1]],.035),c.max('passNeeded',not('targetWreck',alive),c.step('slowerAhead',[[rel,-1]],-.025))]);
  const aggression=c.clip('aggression',[[e('temperAggression'),.5],[rage,.2],[grudge,.3]]);
  const {stuck,timer,gear,turn,active,turning,noMotion,reverse,signedTurn,braking,debt,legTime}=recovery(c,{i,e,o,ground,direction});
  const half=c.affine('halfWidthMetres',[[e('halfWidth'),10]]),line=c.mul('lineRoadPosition',c.affine('lineRoadFraction',[[e('trackOffset'),1],[e('lineOffset'),-1]]),half);
  const low=c.affine('passLower',[[half,-1],[line,-1]],1.6),high=c.affine('passUpper',[[half,1],[line,-1]],-1.6);
  const laneClear=[0,1].map(s=>c.and(`leanLane${s}`,[c.step(`leanOccupancy${s}`,occupied[s].map(x=>[x,-1]),.5),c.step(`leanRoad${s}`,[[s?high:low,s?1:-1]],-3),c.step(`leanRay${s}`,[[i(s?'ray3':'ray4'),1]],-12/45)]));
  const clearance=c.affine('leanClearance',side.map((x,s)=>[c.gate(`chosenLeanLane${s}`,laneClear[s],x,1),1]));
  const safeLean=c.and('leanSafe',[ground,not('leanOutsideRecovery',active),not('leanNotShifting',braking),c.step('leanAligned',[[e('headingCos'),1]],-Math.cos(Math.PI/12)),c.step('leanLowSlip',[[slip,-1]],.1),clearance]);
  const allowed=c.and('leanAllowed',[pass,alive,rival,away,safeLean,c.step('contactRange',[[dist,-1]],.10),c.step('leanTemper',[[aggression,1]],-.35)]);
  // One half-second elbow in a 4.5 s cycle: a bounded pulse and four-second rest.
  const start=c.and('leanStart',[allowed,c.step('leanReady',[[i('memory.leanClock'),-1]])]);
  const leanClock=c.mux('leanClock',start,c.affine('leanPeriod',[],4.5),c.clip('leanCountdown',[[i('memory.leanClock'),1]],-1/30,0,4.5),4.5);
  const lean=c.and('leaning',[allowed,c.step('leanPulse',[[leanClock,1]],-4-1e-9)]);
  const width=c.affine('passWidth',[[c.gate('elbow',aggression,lean,1),-.6]],3);
  const requested=c.gate('requestedOffset',c.mul('passSigned',direction,width),pass,3);
  const offset=c.affine('passOffset',[[i('memory.passOffset'),1-1/7.5],[requested,1/7.5]]);
  const neutral=c.affine('neutralOffset',[[i('memory.neutralOffset'),1-1/7.5],[c.gate('neutralRequest',c.affine('neutralSigned',[[direction,3]]),pass,3),1/7.5]]);
  const bound=(name,x)=>c.affine(name,[[low,1],[c.relu(name+'.aboveLow',[[x,1],[low,-1]]),1],[c.relu(name+'.aboveHigh',[[x,1],[high,-1]]),-1]]);
  const effectiveOffset=c.mux('effectiveOffset',lean,offset,neutral,3);
  const bounded=bound('boundedOffset',effectiveOffset),neutralBounded=bound('boundedNeutral',neutral);
  const fast=[14,24,34].map((v,k)=>c.step(`lookFast${k}`,[[speed,1]],-v/40));
  const look=n=>{let x=i('look1.'+n);for(let k=0;k<3;k++)x=c.mux(`look.${n}.${k}`,fast[k],i(`look${k+2}.${n}`),x,1.5);return x;};
  const x=look('fwd'),y=c.affine('aimRight',[[look('right'),1],[bounded,1/70]]);
  const r2=c.affine('aimRadius2',[[c.unit('aimX2',[[x,1]],0,'square'),1],[c.unit('aimY2',[[y,1]],0,'square'),1]]);
  const den=c.max('aimDen',r2,c.affine('radiusFloor',[],(4/70)**2));
  const curvature=c.affine('pursuitCurvature',[[c.mul('pursuitRatio',y,c.unit('aimInverse',[[den,1]],0,'reciprocal')),2/70]]);
  const wheel=c.unit('pursuitWheel',[[curvature,2.85]],0,'atan');
  const yaw=c.mul('expectedYaw',curvature,c.affine('velocityYawUnits',[[e('speedFwd'),40/3]]));
  const follow=c.affine('followingSteer',[[wheel,1.25/.6],[e('slipAngle'),.95],[e('yawRate'),-.12],[yaw,.12]]);
  const sign=c.affine('turnSign',[[c.step('routeRight',[[y,1]]),2]],-1);
  const raceSteer=c.mux('raceSteer',c.step('routeBehind',[[x,-1]]),c.affine('turnAround',[[sign,.7]]),follow,6);
  // Preserve the racing line's 2.6 m wall margin after contact displaces a car.
  const wall=c.affine('wallReflex',[[c.relu('wallLeft',[[i('ray8'),-1]],2.6/45),4],[c.relu('wallRight',[[i('ray7'),-1]],2.6/45),-4]]);
  const roadSteer=c.affine('roadSteer',[[raceSteer,1],[wall,1]]);
  const normal=c.mux('jumpSteer',lip,c.clip('lipSteer',[[roadSteer,1]],0,-.18,.18),roadSteer,6);
  const steerDemand=c.mux('steerChoice',active,signedTurn,normal,6);
  const steer=c.clip('steer',[[c.gate('groundSteer',steerDemand,ground,6),1],[e('alignment'),-1/3]],0,-1,1);
  const crossing=c.clip('crossingNear',[[e('toCrossing'),-120/12]],1);
  const lift=c.mul('crossingLift',crossing,c.affine('crossingCaution',[[e('temperNerve'),-.012]],.012));
  const share=c.affine('paceShare',[[lift,-1]],.97);
  const desired=c.mul('desiredSpeed',e('pace'),share),error=c.affine('speedError',[[desired,1],[e('speedFwd'),-1]]);
  // At full lock, atan((1.4/2.85)*tan(.6)) = .324 rad is ordinary
  // kinematic sideslip. It must not choke a low-speed drive-out.
  const fastSlipGrip=c.clip('fastSlipGrip',[[c.relu('slipExcess',[[slip,1]],-.10),-6]],1);
  const slipAuthority=c.clip('slipAuthority',[[c.unit('slipSpeedF2',[[e('speedFwd'),1]],0,'square'),50],[c.unit('slipSpeedR2',[[e('speedRight'),1]],0,'square'),50]],-.125);
  const slipGrip=c.affine('slipGrip',[[c.mul('slipReduction',slipAuthority,not('slipLoss',fastSlipGrip)),-1]],1);
  const spinGrip=c.clip('spinGrip',[[c.relu('spinExcess',[[e('rearSlip'),1]],-.12),-5]],1);
  const drag=c.unit('dragSpeed2',[[e('speedFwd'),1]],0,'square');
  const drive=c.mul('tractionThrottle',c.gate('positiveDemand',c.clip('throttleDemand',[[error,20],[drag,.15]],.04),c.step('belowPace',[[error,1]]),1),c.mul('tractionFactors',slipGrip,spinGrip));
  const throttle=c.gate('throttle',c.mux('recoveryThrottle',active,c.clip('recoveryPower',[[speed,-20]],2,0,.8),drive,1),not('notBraking',braking),1);
  const brake=c.gate('brake',c.mux('brakeChoice',braking,c.affine('shiftBrake',[],.7),c.mux('movingBrake',active,c.clip('recoveryOverspeed',[[speed,14]],-1.4),c.clip('overspeed',[[error,-14]]),1),1),ground,1);
  const drift=c.and('sliding',[c.step('slipVisible',[[slip,1]],-Math.PI/18),c.step('moving',[[c.unit('visibleF2',[[e('speedFwd'),1]],0,'square'),1],[c.unit('visibleR2',[[e('speedRight'),1]],0,'square'),1]],-((6/40)**2))]);
  const activeLean=c.and('activeLean',[lean,c.step('effectiveNarrowing',[[c.abs('neutralMagnitude',neutralBounded),1],[c.abs('actualMagnitude',bounded),-1]],-.01),not('leanRouteAhead',c.names.get('routeBehind')),c.step('leanSteerUnclipped',[[c.abs('leanSteerMagnitude',roadSteer),-1]],.98)]);
  // Show contact and lost places without changing any driving consumer of rage.
  let contact=e('hitTaken');for(let k=0;k<11;k++)contact=c.max(`displayContact${k}`,contact,o(k,'iHit'));
  const lost=c.gate('lostPlaces',c.relu('rankLoss',[[e('racePosition'),11],[i('memory.previousPosition'),-11]]),e('raceActive'),11);
  const displayRage=c.clip('displayRage',[[i('memory.displayRage'),2**(-1/240)],[contact,2.5],[lost,.2]]);
  const shownRage=c.max('shownRage',rage,displayRage);
  return c.compile({observationCount:OBS.size,paceShare:.97,actions:[steer,throttle,brake,zero,reverse],stateOutputs:[...grudges,rage,stuck,timer,gear,turn,offset,active,turning,noMotion,debt,legTime,leanClock,neutral,displayRage,e('racePosition')],targets:targets.map((t,k)=>c.and(`displayTarget${k}`,[t,o(k,'alive')])),
    modes:[c.affine('mode.hunt',[[activeLean,2]]),c.affine('mode.race',[],.5),c.affine('mode.drift',[[drift,3]]),c.affine('mode.unstick',[[active,4]])],rageOutput:[shownRage],grudgeOutputs:grudges,crossingOutput:[crossing]});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const spec=construct();writeFileSync(new URL('../../src/ai/weights.js',import.meta.url),'// Generated by tools/nn/build.mjs. Do not edit.\nexport default '+JSON.stringify(spec)+';\n');console.log(JSON.stringify({layers:spec.layers.length-1,units:spec.biases.length,edges:spec.weights.length,parameters:spec.weights.length+spec.biases.length}));}
