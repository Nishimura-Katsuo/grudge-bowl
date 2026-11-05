// What each car says when it wins. Five moods per car: `any` always fits, and the
// others fit how the race went. {second} becomes the runner-up's name.

const QUIPS = {
  KEVIN: {
    any: [
      "I honestly didn't think that would work. I'll be thinking about it for years.",
      'Nobody ever expects the beige one.',
      "I'd like it on record that {second} started it. I have no proof. I don't need any.",
    ],
    clean: ["Not a scratch. Please don't tell anyone, I have a reputation to start."],
    wrecked: ["I'm fine. Everything's fine. Has anyone seen my bumper? It's personal."],
    brawler: ['I said excuse me. Twice. Let the record show I said excuse me.'],
    survivor: ['Am I... is everyone else... okay. Okay. Was that me? Don\'t answer that.'],
  },
  TETANUS: {
    any: [
      "You should've kept your shots up to date.",
      'Everyone gets a little bit of me eventually.',
      "Walk it off, {second}. It'll set in around Thursday.",
    ],
    clean: ['Not a mark on me. Just the old rust, doing what it does.'],
    wrecked: ["Flaking isn't damage. Flaking is how I spread."],
    brawler: ['One little scratch. That is all it ever takes.'],
    survivor: ['Last one standing. They always look so surprised at the end.'],
  },
  'GRUDGE JUDY': {
    any: [
      'Paid in full.',
      "It's all in the book, {second}. Page nine. Underlined.",
      "I don't get mad. I get it in writing.",
    ],
    clean: ['Not one entry against me. A rare and beautiful page.'],
    wrecked: ['Every dent is itemised, and every one of you will be invoiced.'],
    brawler: ['The court finds the defendants guilty. Sentence already carried out.'],
    survivor: ['The docket is clear. I cleared it.'],
  },
  'SCRAP DADDY': {
    any: [
      "Come to Daddy, trophy. You'll look great on the stack.",
      "Easy now, {second}. Everybody's a donor someday.",
      "You don't beat me. You just become spare parts for me.",
    ],
    clean: ["A clean finish? Somebody dent me, I feel naked."],
    wrecked: ["Half of me ain't even mine. Still won, didn't it?"],
    brawler: ['Lovely bits on that lot. Somebody fetch a wheelbarrow.'],
    survivor: ["A whole yard of parts, and Daddy didn't pay a cent."],
  },
  'OIL BARON': {
    any: [
      'Put it on my tab. In fact, buy the tab.',
      'Splendid. Have someone polish {second} and send them back.',
      "I didn't win this race, darling. I acquired it.",
    ],
    clean: ["One doesn't get dented. One has people for that."],
    wrecked: ['Insured. All of it. Several times.'],
    brawler: ['A hostile takeover. Those are my favourite kind.'],
    survivor: ['The field has consolidated. I am pleased to report I own it.'],
  },
  'SGT. DENT': {
    any: [
      'Objective secured. Somebody get that flag off my hood.',
      "Is that all you've got, {second}? Drop and give me twenty laps.",
      "I've had tougher mornings than that race.",
    ],
    clean: ['Zero casualties. Disgraceful. Who trained you people?'],
    wrecked: ["It's just a flesh wound. And a chassis wound. And most of the car."],
    brawler: ['Enemy neutralised. Paperwork to follow.'],
    survivor: ['Last unit operational. As ordered.'],
  },
  'MRS. PISTON': {
    any: [
      'Manners cost nothing, dear. Second place costs everything.',
      "I'll be telling your mother about this, {second}.",
      'Indicators are not decorative, young man.',
    ],
    clean: ['Not a hair out of place. That, children, is how it is done.'],
    wrecked: ['Look at the state of me. Somebody is getting a very stern letter.'],
    brawler: ['I did warn them. I warned them with my bumper.'],
    survivor: ["Everyone's gone home, have they? Good. Less washing up."],
  },
  'HEAD GASKET': {
    any: [
      "I'm fine. That's not steam. That's feelings.",
      'Deep breaths. Deep breaths. I WON. Deep breaths.',
      'Do NOT look at my temperature gauge, {second}.',
    ],
    clean: ["Not a scratch and I'm still furious. Doctor says that's the problem."],
    wrecked: ['Everything is leaking, and for the first time in my life I feel relaxed.'],
    brawler: ['They pushed me. They pushed me and I went off, like they said I would.'],
    survivor: ["Everyone blew up before I did. Nobody's more surprised than my radiator."],
  },
  'ROAD KAREN': {
    any: [
      "I'd like to speak to whoever manages second place.",
      'One star. The star is me.',
      '{second} was in my lane. They are all my lane.',
    ],
    clean: ['Finally, a race conducted to my standards.'],
    wrecked: ['Who did this to my finish? I will need names. And a refund.'],
    brawler: ['I asked them to move. Nicely. Once.'],
    survivor: ['Thank you, everyone else can go now. Oh. You have.'],
  },
  'MAD MUFFLER': {
    any: [
      'WHAT? SPEAK UP! I WON!',
      "IT'S NOT LOUD, {second}! YOU'RE JUST BEHIND ME!",
      'THERE WAS A FLAG? I THOUGHT THAT WAS A BIRD!',
    ],
    clean: ['NOBODY HIT ME! THEY ALL HEARD ME COMING!'],
    wrecked: ['SOMETHING FELL OFF! IT\'S FINE! IT WAS THE QUIET PART!'],
    brawler: ["SORRY! DIDN'T HEAR YOU OVER THE CRASHING!"],
    survivor: ['HELLO? WHERE DID EVERYONE GO? HELLO?'],
  },
  "OL' SMOKEY": {
    any: [
      'Back in my day this was all gravel. I won on that too.',
      "Ain't fast, {second}. Just still here.",
      "Give me a minute. I'll celebrate when I've caught my breath.",
    ],
    clean: ["Never saw a one of 'em. Couldn't see a thing, in fact. Is that the smoke?"],
    wrecked: ['Been falling apart since before you were built, son.'],
    brawler: ["Didn't mean to hit a soul. Reckon I'd do it again, though."],
    survivor: ['Outlasted the whole lot. Slow and steady, and a fair bit of coughing.'],
  },
  'BAD NEIGHBOUR': {
    any: [
      'Your hedge is on my side, {second}. So is the trophy.',
      "I'll return your bumper when I'm done with it.",
      "Party's at my place. It's been at my place since midnight.",
    ],
    clean: ['Not a mark on the paintwork. Unlike your fence.'],
    wrecked: ["You scratched my car? I've got it on camera. I've got everything on camera."],
    brawler: ['They were parked too close. I fixed that.'],
    survivor: ["Finally, some peace and quiet. I'll be revving at dawn."],
  },
};

const FALLBACK = { any: ['First across the line, and not sorry about it.'] };
const NOBODY = 'Nobody made it. The tractor drivers would like a word.';

// Reads "SGT. DENT" as "Sgt. Dent" and "OL' SMOKEY" as "Ol' Smokey".
function spoken(name) {
  return name.toLowerCase().replace(/(^|\s)(\S)/g, (_, gap, letter) => gap + letter.toUpperCase());
}

// How the winner's race went, most telling first.
function moodOf(world, car) {
  const distance = world.laps * world.track.length;
  if (car.progress < distance && world.cars.filter((c) => c.alive).length === 1) return 'survivor';
  if (car.health < 0.4) return 'wrecked';
  if (car.knockouts > 0) return 'brawler';
  if (car.health > 0.92) return 'clean';
  return 'any';
}

export function quipFor(world, rng = Math.random) {
  const car = world.cars[world.winner];
  if (!car) return NOBODY;
  const lines = QUIPS[car.name] ?? FALLBACK;
  const mood = moodOf(world, car);
  // Sometimes the car has something else on its mind.
  const pool = mood !== 'any' && lines[mood] && rng() < 0.75 ? lines[mood] : lines.any;
  const line = pool[Math.floor(rng() * pool.length)];
  const runnerUp = world.cars[world.finishOrder[1]];
  const name = runnerUp ? spoken(runnerUp.name) : 'nobody';
  const shouting = line.replace('{second}', '') === line.replace('{second}', '').toUpperCase();
  return line.replace('{second}', shouting ? name.toUpperCase() : name);
}

export { QUIPS };
