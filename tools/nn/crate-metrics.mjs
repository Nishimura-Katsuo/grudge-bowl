// The user's spot-pass definition, sampled at the same 30 Hz as decisions.
export function crateMetrics(world) {
  const pending=new Map();let passes=0,empty=0,collected=0,missedLive=0,noneLeft=0,heldLive=0,samples=0,emptySamples=0;
  return {
    sample(){
      if(world.phase!=='racing'||world.step%8||world.raceTime<=3)return;
      for(const car of world.cars){
        if(!car.alive)continue;samples++;if(!car.weapon)emptySamples++;
        for(const spot of world.track.crateSpots){
          const key=car.id+':'+spot.s,was=pending.get(key),distance=world.track.route(car.trackS,spot.s);
          if(distance<30&&!was)pending.set(key,{held:!!car.weapon});
          if(was&&distance>500){
            pending.delete(key);passes++;
            const live=world.arsenal.crates.some(c=>c.s===spot.s&&c.respawn<=0);
            if(was.held){if(live)heldLive++;}
            else {empty++;if(car.weapon)collected++;else if(live)missedLive++;else noneLeft++;}
          }
        }
      }
    },
    result(){return {passes,empty,collected,missedLive,noneLeft,heldLive,collectionPercent:100*collected/Math.max(1,empty),missedLivePercent:100*missedLive/Math.max(1,empty),heldPercent:100*(samples-emptySamples)/Math.max(1,samples)};}
  };
}
