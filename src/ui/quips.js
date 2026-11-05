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
  'REV. LIMITER': {
    any: [
      'Let us pray. Not for me. For {second}.',
      'The Lord giveth, and at seven thousand rpm He taketh away.',
      'And on the fifth lap, I rested.',
    ],
    clean: ['Without blemish, as the good book requires.'],
    wrecked: ['I have been tested. Mostly by the wall.'],
    brawler: ['Turn the other cheek, I said. Then I hit that one too.'],
    survivor: ['The meek shall inherit the road. I appear to be the meek.'],
  },
  'CRASH TEST DEREK': {
    any: [
      "Data's looking great. I can't feel my legs, but the data's great.",
      'Hit me again, {second}. For science.',
      'Same time tomorrow? Same wall?',
    ],
    clean: ['No impacts recorded. This is the worst day of my career.'],
    wrecked: ['Seven out of seven stars! Best crash of my life!'],
    brawler: ['Turns out it\'s even better from the other side.'],
    survivor: ['Everyone else failed the test. I passed it. I failed it upwards.'],
  },
  'THE LATE BARRY': {
    any: [
      'Late to everything for forty years. First across that line, though.',
      "Don't feel bad, {second}. You can't lose what I've got left.",
      "Someone tell my widow I won. She's got the good Ouija board.",
    ],
    clean: ['Not a scratch. They did a lovely job on me at the funeral home.'],
    wrecked: ["Can't say it hurt. Can't say much of anything hurts now."],
    brawler: ["They're with me now. Bit crowded in the back."],
    survivor: ['Everyone passes eventually. I just got it over with early.'],
  },
  'ALAN IN ACCOUNTS': {
    any: [
      'As per my last email, I won.',
      "That's a variance of one lap, {second}. I'll need a receipt.",
      'I took a half day for this.',
    ],
    clean: ['No write-offs this quarter. I may allow myself a biscuit.'],
    wrecked: ["The car depreciated rapidly, but it's still on the books."],
    brawler: ['Those are what we call reductions in headcount.'],
    survivor: ["The budget has been balanced. There's one of me left in it."],
  },
  'VLAD THE IMPOUNDER': {
    any: [
      'Your car is mine now. There is a fee.',
      'Release form is in triplicate, {second}. In blood. Mostly yours.',
      'The yard is open Monday to Never.',
    ],
    clean: ['Not one scratch upon the property of Vlad.'],
    wrecked: ["Vlad's own car is also impounded. Vlad has charged himself."],
    brawler: ['They were parked on my road. I have removed them.'],
    survivor: ['Every car is in the yard. It is a good day for the yard.'],
  },
  'NO BRAKES NIGEL': {
    any: [
      "I'd love to stop and celebrate. I can't stop. Tell my wife.",
      "Sorry {second}! Can't stop! Literally! Still going!",
      'Are we finished? Someone put a wall up, would you?',
    ],
    clean: ['Not a scratch! Nobody dared get in front of me!'],
    wrecked: ['Found the brakes! They were in the wall!'],
    brawler: ['Excuse me! Sorry! Excuse me! Coming through! Sorry!'],
    survivor: ['Everyone stopped. Must be nice. Must be really nice.'],
  },
  'DISCOUNT DAVE': {
    any: [
      'One careful owner, this win. Yours for nine ninety-nine.',
      "Tell you what, {second}, I'll take second off your hands for a tenner.",
      "Everything must go! It's all gone! Final reductions!",
    ],
    clean: ['Immaculate condition. Never raced. Ignore that I just raced it.'],
    wrecked: ["That's not damage, that's character. Two hundred extra, that is."],
    brawler: ['Lovely trade-ins, that lot. Terrible condition now.'],
    survivor: ["Last one in stock! Get it while it's still got doors!"],
  },
  'SMUG HYBRID': {
    any: [
      'Zero emissions. Zero survivors. Well, some survivors.',
      "I'd explain my fuel economy to you, {second}, but I already have.",
      'Actually, the win is carbon neutral.',
    ],
    clean: ["Regenerative braking. You wouldn't understand. I'm very clean."],
    wrecked: ["It's fine. It's fine. The battery's fully recyclable."],
    brawler: ["You've all been offset."],
    survivor: ['Your cars were already obsolete. Now they\'re also on fire.'],
  },
  'MASTER CYLINDER': {
    any: [
      'The brake pedal is the only pedal. Contemplate this.',
      'To win is nothing. To lose is nothing. {second} is second.',
      'Be like brake fluid, {second}. It also goes where it is pushed.',
    ],
    clean: ['I was never touched. There was no one there to touch.'],
    wrecked: ['The car is broken. The car was always broken. Breathe.'],
    brawler: ['I did not strike them. I merely stood where they were.'],
    survivor: ['All things pass. I passed them.'],
  },
  'GOOD BOY': {
    any: [
      "Who's a good boy? It's me. I'm the good boy. I won the car thing.",
      'I chased the cars! I CAUGHT the cars! What do I do now?',
      'You throw it, {second}! Throw the flag! Throw it!',
    ],
    clean: ['No scratches! No bath! Best day!'],
    wrecked: ["I ate part of the car. I don't regret it. I might be sick."],
    brawler: ['They ran away so I bit them. With the car.'],
    survivor: ["Everyone's gone? I'll wait here. I'm good at waiting."],
  },
  'PARCEL PETE': {
    any: [
      'Sorry I missed you, {second}. Left your trophy with a neighbour.',
      'Signed for it myself. Nobody was in.',
      'Attempted delivery of one defeat. Successful.',
    ],
    clean: ["Handle with care, it says. I don't know how that happened."],
    wrecked: ['This side up. Not sure which side, mind.'],
    brawler: ['All of those were thrown over a fence. Professionally.'],
    survivor: ['Nobody home anywhere. Leaving a card on the whole track.'],
  },
  'BINGO BEV': {
    any: [
      'HOUSE! Hold on, wrong place. HOUSE anyway!',
      'Two little ducks, {second}. And you came second. Quack quack.',
      "Eyes down, love. That's the last you'll see of me.",
    ],
    clean: ['Full house and not a dab on me.'],
    wrecked: ['Legs eleven. Well, four. Well, three now.'],
    brawler: ["I've dabbed every one of you, my darlings."],
    survivor: ["Everyone's gone for the bus, have they? More raffle for me."],
  },
  'CARAVAN CLIVE': {
    any: [
      'We stopped for a flask of tea on lap three. Still won.',
      "You'd have got past, {second}, if this was a dual carriageway.",
      'Forty years of holidays, and this is the nicest lay-by.',
    ],
    clean: ['Not one cup fell off the draining board.'],
    wrecked: ["Awning's gone. Margaret's gone. Lovely weather, though."],
    brawler: ['They wanted to overtake. That was their mistake.'],
    survivor: ['Got the whole site to ourselves. Just how we like it.'],
  },
  'L-PLATE LIZ': {
    any: [
      'Was that... did I pass?',
      'Sorry, {second}! I was looking for third gear!',
      'My mum is going to be so upset about the car.',
    ],
    clean: ['Mirror, signal, manoeuvre. They really do work!'],
    wrecked: ["I'd like to retake the parallel parking part."],
    brawler: ['I thought that was the brake! All of those times!'],
    survivor: ["Oh no. Oh no, they've all stopped. Was I supposed to stop?"],
  },
  'MINICAB MICK': {
    any: [
      "That'll be forty quid, {second}. Meter was running.",
      'Had that trophy in the back of the cab once. Lovely fella.',
      'I know a shortcut, and it goes through all of you.',
    ],
    clean: ['Five stars. Not a mark on her. Drove like an angel, I did.'],
    wrecked: ["Cash only, mate. The card machine's in the wall back there."],
    brawler: ["I don't do south of the river, and I don't do brakes."],
    survivor: ["Quiet tonight, innit? Everyone's gone home or to the hospital."],
  },
  'VANILLA VINCE': {
    any: [
      'Nice little bumper, {second}. Shame if it melted.',
      "You want sprinkles? You got sprinkles. It's glass.",
      "Nobody walks away from Vince's van without paying.",
    ],
    clean: ["Not a drip on me. The boys'll tell you, I keep it clean."],
    wrecked: ["It's a cone now. They made me a cone. Somebody's gonna pay."],
    brawler: ['Two scoops. One for each of them. Capisce?'],
    survivor: ["Everybody got what they ordered. The neighbourhood's quiet again."],
  },
  'JUST MARRIED': {
    any: [
      "Sorry I'm late, darling. I had to win this first.",
      'You may now kiss my bumper, {second}.',
      'Till death us do part. For most of them that was lap two.',
    ],
    clean: ['Not a petal out of place. Send the photographer.'],
    wrecked: ['The cans fell off. The marriage might have too.'],
    brawler: ['Someone objected. I drove over them.'],
    survivor: ['Speak now or forever hold your peace. Nobody spoke.'],
  },
  'ESTATE AGENT': {
    any: [
      'A deceptively spacious lead, {second}. Viewing is recommended.',
      'First place: sought-after, rarely available, no onward chain.',
      'Characterful, this win. That means there was damp.',
    ],
    clean: ['Immaculately presented throughout. Must be seen.'],
    wrecked: ['In need of some modernisation. Ideal for a keen investor.'],
    brawler: ['Those properties have now come on the market as rubble.'],
    survivor: ['An exclusive gated community of one.'],
  },
  FLATPACK: {
    any: [
      'There were six bolts left over. I feel great.',
      'Step nine, {second}: insert defeat into slot B.',
      'Some assembly required. Some assembly achieved.',
    ],
    clean: ['Everything still attached. Even the bits I put on backwards.'],
    wrecked: ['The instructions never mentioned this part.'],
    brawler: ['I used the little hex key on them.'],
    survivor: ['Last one standing, which was never in the diagram.'],
  },
  'DR. WHIPLASH': {
    any: [
      'Have you or a loved one been overtaken by me? Call now.',
      "That neck's not looking good, {second}. Who's your insurer?",
      "I'll see you all in my waiting room.",
    ],
    clean: ['Not a scratch. Professionally, I find that very disappointing.'],
    wrecked: ["It's soft tissue. It's all soft tissue. I want a settlement."],
    brawler: ['First do no harm. I did this second.'],
    survivor: ['My whole client list, one afternoon. Very efficient.'],
  },
  'GREASY SPOON': {
    any: [
      'Order up! One full English, hold the competition.',
      "You want that with chips, {second}? You've got chips. Down both sides.",
      "Extra grease. Always extra grease. That's the secret.",
    ],
    clean: ['Not a spot on me, which is a first for this establishment.'],
    wrecked: ["Slightly burnt on one side. That's how we serve everything."],
    brawler: ["Scrambled. All of 'em. Two minutes a side."],
    survivor: ["Last sitting's over, love. We're closed."],
  },
  "LIL' LUGNUT": {
    any: [
      "I'M BIG! I'M SO BIG! DID YOU SEE HOW BIG I AM?",
      'Hold me back! Hold me back, {second}!',
      "My dad's a lorry. He says well done.",
    ],
    clean: ["They can't hit what they can't see. I'm VERY small."],
    wrecked: ["Nobody's stronger than me. I've just got fewer parts now."],
    brawler: ['I bit its ankle! I bit all the ankles!'],
    survivor: ["Come on then! Who's next? Where's everyone going?"],
  },
  'HAZARD HAZEL': {
    any: [
      "I'll only be a minute. Just popping across this finish line.",
      "It's fine, {second}, I've got my hazards on.",
      "Hazards on means you can park anywhere. That's the law.",
    ],
    clean: ['Not a scratch. I always put my hazards on for safety.'],
    wrecked: ["I can't think why they all hit me. I was only stopped on the bend."],
    brawler: ['They could have gone round. There was a whole other lane.'],
    survivor: ['Oh, has everyone gone? I was just waiting for someone.'],
  },
  'MR. CLIPBOARD': {
    any: [
      "That's a fail, {second}. Undue hesitation on the third lap.",
      "Pull over here, please. I'm afraid that concludes your test.",
      "I've marked all of you down. I've marked myself up.",
    ],
    clean: ['No minors. No majors. I shall still find something.'],
    wrecked: ["A dangerous fault. I've noted it. It's me."],
    brawler: ['Failure to give way. I made them give way.'],
    survivor: ["I've examined everyone here. Pass rate: one."],
  },
};

const FALLBACK = { any: ['First across the line, and not sorry about it.'] };
const NOBODY = 'Nobody made it. The tractor drivers would like a word.';

// Reads "SGT. DENT" as "Sgt. Dent" and "VLAD THE IMPOUNDER" as "Vlad the Impounder".
function spoken(name) {
  return name.toLowerCase()
    .replace(/(^|\s)(\S)/g, (_, gap, letter) => gap + letter.toUpperCase())
    .replace(/ (The|In) /g, (word) => word.toLowerCase());
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
