// Open-road following only. Crossroads and jump/forced-motion corridors are exempt.
export function traffic(c,{i,e,o,ground,horizontal}){
 const not=(n,x)=>c.affine(n,[[x,-1]],1);
 const near=c.step('crossContactZone',[[e('toCrossing'),-120]],30);
 const grace=c.mux('crossGrace',near,c.affine('crossGraceDuration',[],.75),c.clip('crossGraceDecay',[[i('memory.crossGrace'),1]],-1/30,0,.75),1);
 const flight=c.mux('trafficFlightGrace',not('trafficAirborne',ground),c.affine('trafficLandingDuration',[],1),c.clip('trafficFlightDecay',[[i('memory.trafficFlight'),1]],-1/30,0,1),1);
 const zone=c.and('openRoadZone',[c.step('crossRoadClear',[[e('toCrossing'),120]],-45),c.step('crossGraceExpired',[[grace,-1]]),c.step('trafficJumpClear',[[e('toJump'),120]],-60),c.step('trafficFlightClear',[[flight,-1]])]);
 const open=c.and('openRoad',[zone,ground,c.step('trafficAligned',[[e('headingCos'),1]],-.8),not('trafficNotWhirling',i('arms.whirling'))]);
 let limit=c.affine('trafficUnlimited',[],1.5);
 for(let k=0;k<11;k++){
  const closing=c.relu(`follow${k}.closing`,[[o(k,'relVelFwd'),-40]]);
  // Relative braking distance at 8 m/s², plus .25 s control allowance.
  // Equal-speed launch packs never satisfy closing > 1 m/s.
  const gap=c.affine(`follow${k}.gap`,[[closing,.25],[c.unit(`follow${k}.closing2`,[[closing,1]],0,'square'),1/16]],5.5);
  const valid=c.and(`follow${k}.valid`,[o(k,'solid'),o(k,'los'),c.step(`follow${k}.closingNow`,[[closing,1]],-1-1e-6),c.step(`follow${k}.urgent`,[[gap,1],[o(k,'fwd'),-100]]),c.step(`follow${k}.ahead`,[[o(k,'fwd'),100]],-.5),c.step(`follow${k}.near`,[[o(k,'fwd'),-100]],60),c.step(`follow${k}.parallel`,[[o(k,'headingCos'),1]],-.5),c.step(`follow${k}.lane`,[[c.abs(`follow${k}.across`,o(k,'right')),-100]],2.6)]);
  // Match only the imminent closing rate. A 5 m/s floor keeps this reflex
  // from parking or defeating recovery; it is not a collision-free guarantee.
  const clearance=c.relu(`follow${k}.clearance`,[[o(k,'fwd'),100]],-5.5);
  // Solve clearance = .25*c + c²/16 for its positive root.
  const safe=c.unit(`follow${k}.safeRoot`,[[clearance,16]],4,'sqrt');
  const cap=c.clip(`follow${k}.speedCap`,[[e('speedFwd'),1],[o(k,'relVelFwd'),1],[safe,1/40]],-2/40,5/40,1.5);
  const selected=c.mux(`follow${k}.limit`,valid,cap,c.names.get('trafficUnlimited'),1.5);
  limit=c.affine(`trafficLimit${k}`,[[limit,1],[c.relu(`trafficLimit${k}.excess`,[[limit,1],[selected,-1]]),-1]]);
 }
 const speedLimit=c.mux('trafficSpeedLimit',open,limit,c.names.get('trafficUnlimited'),1.5);
 return{open,zone,grace,flight,speedLimit};
}
