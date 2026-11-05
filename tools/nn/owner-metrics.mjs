// Exact reproduction of scratchpad/bal/run.mjs, kept separate from diagnostics.
export function ownerMetrics(w) {
  const passes=[79,129,466,516,799,850],L=w.track.length;
  const near=s=>passes.some(x=>{const d=Math.abs((((s-x)%L)+L)%L);return Math.min(d,L-d)<25;});
  let open=0,hard=0,cross=0,leads=0,leader=-1,fired=0,crossLate=0;
  return {
    sample(){if(w.step%24===0&&w.phase==='racing'){
      const car=w.cars.filter(c=>c.alive).sort((a,b)=>b.progress-a.progress)[0];
      if(car&&car.id!==leader){if(leader>=0&&w.raceTime>10)leads++;leader=car.id;}
    }},
    event(e){if(e.type==='fired')fired++;if(e.type!=='hit')return;
      const a=w.cars[e.a],b=w.cars[e.b];
      const dot=Math.abs(a.R[0]*b.R[0]+a.R[6]*b.R[6]);
      const isX=near(a.trackS)&&near(b.trackS)&&dot<.8&&Math.abs(a.progress-b.progress)>60;
      if(isX){cross++;if(w.leaderLaps>=1)crossLate++;}else{open++;if(e.closing>6)hard++;}
    },
    result(){const alive=w.cars.filter(c=>c.alive).sort((a,b)=>b.progress-a.progress);
      const kos={};for(const c of w.cars)if(!c.alive){const k=c.koReason==='stalled out'?'stalled':c.koReason;kos[k]=(kos[k]??0)+1;}
      return{seed:w.seed,flag:!!alive[0]&&alive[0].progress>=w.laps*L,T:+w.raceTime.toFixed(1),run:alive.length,gap:alive[1]?Math.round(alive[0].progress-alive[1].progress):null,leads,open,hard,cross,crossLate,fired,kos,prog:+(w.cars.reduce((s,c)=>s+Math.max(0,c.progress),0)/L).toFixed(1)};
    }
  };
}
