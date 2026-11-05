// The soundtrack: Suno's own player, with a fresh song from a shuffled deck for each
// race. Songs outlast a race, so the timer only matters if the game sits paused.
// Suno has no playlist embed and its player is cross-origin, so the page can't see
// inside it or hear from it, and volume and pause are out of reach. Stopping a song
// means removing the player.
// If Suno can't be reached, the track bundled with the game loops until it can.

const PLAYER = 'https://suno.com/embed/';
const REACH_LIMIT = 8; // seconds to wait for Suno, which now and then takes over 4 to answer
const LOAD_LIMIT = 10; // seconds for a player to load before giving up on it
const START_LAG = 4; // seconds a loaded player takes to start, measured at 2 to 3
const RETRY_AFTER = 60; // seconds on the backup between tries at getting Suno back

export const SONGS = [
  { id: '1359289e-099f-4d38-8bed-9103c06d4af1', title: 'Derby Destruction', seconds: 239.88 },
  { id: '88192567-1aad-487c-926b-4b2ed5599132', title: 'Agent of Fury', seconds: 239.6 },
  { id: '035c91be-c50a-4ccc-bbef-6e50a7e46eb7', title: 'Gasoline!', seconds: 239.8 },
  { id: '9b828d42-647e-4557-bf0e-bd9a29f1eec0', title: 'Highway to the Danger Pwn', seconds: 239.8 },
  { id: '846fe060-ef0c-4d33-aee5-4c7cd8f06535', title: 'Hit and Run', seconds: 239.96 },
  { id: 'ce5cbdb9-eba4-4249-93e0-60c38eeed09e', title: 'Nitro King', seconds: 239.92 },
  { id: '8e93e424-332b-4925-974f-ba513e450577', title: 'Bad Parking', seconds: 239.84 },
  { id: '9497d943-c94b-4c04-a823-89126d353e6c', title: 'Automotive Terrorism', seconds: 240.16 },
];

// One full pass in random order, never opening on the song that just played.
export function shuffled(songs, last = null, random = Math.random) {
  const deck = [...songs];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  if (deck.length > 1 && deck[0] === last) [deck[0], deck[1]] = [deck[1], deck[0]];
  return deck;
}

async function reachable(song) {
  try {
    await fetch(PLAYER + song.id, { mode: 'no-cors', signal: AbortSignal.timeout(REACH_LIMIT * 1000) });
    return true;
  } catch {
    return false;
  }
}

export class Radio {
  constructor(host, backup) {
    this.host = host;
    this.backup = backup;
    this.deck = [];
    this.song = null;
    this.muted = false;
    this.started = false;
    this.onBackup = false;
    this.turn = 0; // anything still waiting from an earlier turn stands down
    this.nextTimer = 0;
    this.loadTimer = 0;
  }

  // Runs inside the click on Start. The backup is begun here, silently, because
  // some browsers won't let it start later on, outside a click.
  start() {
    if (this.started) return;
    this.started = true;
    this.backup.muted = true;
    this.backup.play().catch(() => {
      // Blocked, or the file is missing. The race runs regardless.
    });
    if (this.muted) this.backup.pause();
  }

  // The first race after Start is the first song. The race behind the title screen
  // gets nothing, because nobody has clicked anything yet.
  newRace() {
    if (this.started && !this.muted) this.next();
  }

  pick() {
    if (this.deck.length === 0) this.deck = shuffled(SONGS, this.song);
    this.song = this.deck.shift();
    return this.song;
  }

  stopWaiting() {
    this.turn++;
    clearTimeout(this.nextTimer);
    clearTimeout(this.loadTimer);
  }

  async next() {
    this.stopWaiting();
    this.onBackup = false;
    const turn = this.turn;
    const song = this.pick();
    const ok = await reachable(song);
    if (turn !== this.turn) return;
    if (!ok) {
      this.useBackup();
      return;
    }
    this.backup.pause();
    const frame = document.createElement('iframe');
    frame.src = `${PLAYER}${song.id}?autoplay=1`;
    frame.allow = 'autoplay; encrypted-media';
    frame.title = `${song.title}, playing on Suno`;
    frame.tabIndex = -1;
    frame.scrolling = 'no'; // old but still the only way to set this from outside the frame
    this.loadTimer = setTimeout(() => this.useBackup(), LOAD_LIMIT * 1000);
    frame.addEventListener('load', () => {
      if (turn !== this.turn) return;
      clearTimeout(this.loadTimer);
      this.nextTimer = setTimeout(() => this.next(), (song.seconds + START_LAG) * 1000);
    });
    this.host.replaceChildren(frame);
  }

  useBackup() {
    if (this.onBackup) return;
    this.stopWaiting();
    this.onBackup = true;
    this.host.replaceChildren();
    this.backup.muted = this.muted;
    this.backup.play().catch(() => {
      // Same as in start(): nothing more can be done from here.
    });
    this.retryLater();
  }

  // A slow reply shouldn't cost the playlist for the rest of the session.
  retryLater() {
    this.nextTimer = setTimeout(() => this.retry(), RETRY_AFTER * 1000);
  }

  async retry() {
    const turn = this.turn;
    const back = !this.muted && await reachable(this.song);
    if (turn !== this.turn) return;
    if (back) this.next();
    else this.retryLater();
  }

  // The player can't be silenced from outside, so muting takes it away and
  // unmuting moves on to the next song.
  setMuted(muted) {
    this.muted = muted;
    this.backup.muted = muted;
    if (this.onBackup || !this.started) return;
    if (muted) {
      this.stopWaiting();
      this.host.replaceChildren();
    } else {
      this.next();
    }
  }
}
