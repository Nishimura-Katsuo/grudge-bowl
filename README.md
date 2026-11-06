# Grudge Bowl

A five-lap race at last light on a road tied through itself, driven by twelve furious bots drawn from a roster of thirty-six. You watch. Each bot's brain is a recurrent neural network whose weights were derived by hand and assigned directly: nothing was trained.

**[Watch a race](https://nishimura-katsuo.github.io/grudge-bowl/)**

## Run it

To build from source:

```
npm install
npm run build     # writes dist/index.html
npm start         # builds and serves http://localhost:5178
npm test          # physics and network tests
```

`dist/` holds the page and its backup track, and works opened straight from disk. The soundtrack plays through Suno's embedded player, a random song each race, and needs a connection; without one the backup track loops.

## Watching

Races rotate through five worlds, each dealt once before any comes round again:

- **The Knot**, the county fairground at last light, where it all started.
- **Gutbuster Park**, a closed theme park at night, with the road through the big top and the rides still running.
- **Mount Cinder**, up the outside of a volcano, round its lava lake and down the throat, under falling lava bombs.
- **Davy's Driveway**, on the sea floor: glass tubes, a shipwreck, a whale and something large in the trench.
- **Lower Tranquillity**, on the Moon. Tyres on the ground drive normally. Once they leave it, cars float.

The Grudge Board is the running order. Click a name to follow that bot. Red yarn runs from each bot to whoever its network is leaning on right now, and the face at the end of its row shows how angry its rage neuron is. Keys 1 to 6 pick a camera (chase, grille, trackside, drone, tower, heli), A hands it back to the director, `[` and `]` step between cars, Space pauses, M mutes.

## Rules

Prize crates on the road hold eleven weapons, from the Barn Burner rocket and the Grudge Seeker, which hunts whoever hit you last, to the Backhander and the Grand Piano. `docs/BOT_CONTRACT.md` lists them all.

Races run back to back. The winner gets about 20 seconds of burnouts, confetti and a few words, then the next race starts on its own.

Twelve cars, five laps of the Knot, a 1152 m closed road with three level crossroads, each passed twice a lap. First car to finish wins and the rest are ranked by distance covered. A car is out when its health reaches zero, it loses three wheels, it stays on its roof or side for 4.5 seconds, or it gains no ground for 12 seconds. Wrecks stay on the road for 7 seconds, then they are towed.

Three jumps make the trouble worse. Hump launches out of a hairpin, where exit speeds differ most, so a quick car comes down on a slow one. Dropkick lands on the third crossroads, into whoever is crossing it. Pancake funnels traffic into one lane and lands it in the braking zone for the tightest hairpin on the track.

## Layout

| Path | What's there |
|---|---|
| `src/sim/` | Fixed-step 240 Hz 6-DOF vehicle physics, contacts, damage, sensors and race rules. No DOM; runs headless and replays from a seed. The track, its crossroads, racing line and pace notes are all derived from one table of control points in `track.js`. |
| `src/ai/` | Generic forward-pass runtime and the generated weights. |
| `tools/nn/` | The construction scripts that derive every weight, plus evaluation and inspection tools. |
| `src/render/` | three.js stage, cars with crumpling shells, effects, the spectator director, and sound effects rendered by inverse FFT in the browser. |
| `src/ui/` | Grudge Board, feed and posters. |
| `docs/NEURAL_NETWORK.md` | The full walkthrough of how the network was designed and programmed. |
| `docs/NEURON_MAP.md` | Every neuron, with its equation, layer and consumers. |
| `docs/BOT_CONTRACT.md` | The interface between the game and the brain. |
