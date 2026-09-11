/**
 * Emoji for the picker: a hand-picked set, grouped, each with the words you
 * might search it by — enough to say most things on a page without shipping
 * the whole Unicode list (and its 400 KB of names) to every phone.
 *
 * Plus the ones you used last, kept on this device.
 */

export type EmojiGroup = { key: string; label: string; icon: string; emoji: [string, string][] };

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    key: "faces",
    label: "Faces",
    icon: "😀",
    emoji: [
      ["😀", "grin smile happy"], ["😃", "smile happy joy"], ["😄", "smile laugh happy"], ["😁", "grin beam teeth"],
      ["😆", "laugh lol"], ["😅", "sweat nervous laugh"], ["🤣", "rofl rolling laugh lol"], ["😂", "joy tears laugh lol crying"],
      ["🙂", "slight smile"], ["🙃", "upside down silly"], ["🫠", "melt melting hot embarrassed"], ["😉", "wink"],
      ["😊", "blush smile shy"], ["😇", "angel halo innocent"], ["🥰", "love hearts adore"], ["😍", "heart eyes love crush"],
      ["🤩", "star eyes starstruck wow"], ["😘", "kiss blow love"], ["😋", "yum tasty food"], ["😛", "tongue playful"],
      ["😜", "wink tongue crazy"], ["🤪", "zany crazy goofy"], ["😝", "squint tongue"], ["🤑", "money rich"],
      ["🤗", "hug hugging"], ["🤭", "oops giggle hand mouth"], ["🫢", "gasp shock hand"], ["🤫", "shush quiet secret"],
      ["🤔", "think thinking hmm"], ["🫡", "salute respect"], ["🤐", "zip mouth secret"], ["🤨", "raised eyebrow sus doubt"],
      ["😐", "neutral meh"], ["😑", "expressionless blank"], ["😶", "no mouth silent"], ["🫥", "dotted invisible"],
      ["😏", "smirk"], ["😒", "unamused annoyed"], ["🙄", "eye roll whatever"], ["😬", "grimace awkward"],
      ["😮‍💨", "exhale sigh relief"], ["🤥", "lie liar"], ["😌", "relieved calm peace"], ["😔", "pensive sad"],
      ["😪", "sleepy tired"], ["🤤", "drool"], ["😴", "sleep sleeping zzz tired"], ["😷", "mask sick"],
      ["🤒", "sick fever ill"], ["🤢", "nauseous sick gross"], ["🤮", "vomit puke gross"], ["🥵", "hot sweating heat"],
      ["🥶", "cold freezing"], ["🥴", "woozy dizzy drunk"], ["😵", "dizzy knocked"], ["😵‍💫", "spiral dizzy confused"],
      ["🤯", "mind blown exploding shock"], ["🤠", "cowboy yeehaw"], ["🥳", "party celebrate birthday"], ["🥸", "disguise"],
      ["😎", "cool sunglasses"], ["🤓", "nerd geek glasses study"], ["🧐", "monocle curious"], ["😕", "confused"],
      ["🫤", "diagonal mouth unsure"], ["😟", "worried"], ["🙁", "frown sad"], ["😮", "open mouth wow surprised"],
      ["😯", "hushed surprised"], ["😲", "astonished shocked"], ["😳", "flushed embarrassed"], ["🥺", "pleading puppy please"],
      ["🥹", "holding tears grateful touched"], ["😦", "frown open"], ["😧", "anguished"], ["😨", "fear scared"],
      ["😰", "anxious sweat"], ["😥", "sad relieved"], ["😢", "cry sad tear"], ["😭", "sob crying loud"],
      ["😱", "scream fear"], ["😖", "confounded"], ["😣", "persevere"], ["😞", "disappointed"],
      ["😓", "downcast sweat"], ["😩", "weary tired"], ["😫", "tired exhausted"], ["🥱", "yawn bored tired"],
      ["😤", "huff triumph angry"], ["😡", "angry mad rage"], ["😠", "angry mad"], ["🤬", "cursing swearing"],
      ["😈", "devil smiling evil"], ["💀", "skull dead lmao dying"], ["☠️", "skull crossbones"], ["💩", "poop"],
      ["🤡", "clown"], ["👻", "ghost boo"], ["👽", "alien"], ["🤖", "robot"],
    ],
  },
  {
    key: "love",
    label: "Hearts",
    icon: "❤️",
    emoji: [
      ["❤️", "red heart love"], ["🩷", "pink heart"], ["🧡", "orange heart"], ["💛", "yellow heart"],
      ["💚", "green heart"], ["🩵", "light blue heart"], ["💙", "blue heart"], ["💜", "purple heart"],
      ["🖤", "black heart"], ["🩶", "grey heart"], ["🤍", "white heart"], ["🤎", "brown heart"],
      ["💔", "broken heart heartbreak"], ["❤️‍🔥", "heart fire passion"], ["❤️‍🩹", "mending heart healing"], ["💕", "two hearts love"],
      ["💞", "revolving hearts"], ["💓", "beating heart"], ["💗", "growing heart"], ["💖", "sparkling heart"],
      ["💘", "cupid arrow heart"], ["💝", "heart ribbon gift"], ["💌", "love letter"], ["💋", "kiss lips"],
      ["🫶", "heart hands love"], ["💯", "hundred perfect"], ["💢", "anger"], ["💥", "boom collision"],
      ["💫", "dizzy star"], ["💦", "sweat drops water"], ["💨", "dash wind fast"], ["🕳️", "hole"],
    ],
  },
  {
    key: "hands",
    label: "People",
    icon: "👋",
    emoji: [
      ["👋", "wave hi hello bye"], ["🤚", "raised back hand"], ["✋", "hand stop high five"], ["🖖", "vulcan"],
      ["👌", "ok perfect"], ["🤌", "pinched fingers italian"], ["✌️", "peace victory"], ["🤞", "fingers crossed luck"],
      ["🫰", "money snap heart"], ["🤟", "love you"], ["🤘", "rock on metal"], ["🤙", "call me shaka"],
      ["👈", "point left"], ["👉", "point right"], ["👆", "point up"], ["👇", "point down"],
      ["☝️", "index up one"], ["👍", "thumbs up like yes good"], ["👎", "thumbs down dislike no"], ["✊", "fist"],
      ["👊", "punch fist bump"], ["👏", "clap applause"], ["🙌", "raise hands celebrate yay"], ["👐", "open hands"],
      ["🤲", "palms up"], ["🤝", "handshake deal"], ["🙏", "pray please thanks"], ["✍️", "writing"],
      ["💅", "nails sassy"], ["💪", "muscle strong gym flex"], ["🦾", "mechanical arm"], ["🧠", "brain smart"],
      ["👀", "eyes look see"], ["👁️", "eye"], ["👅", "tongue"], ["👄", "mouth lips"],
      ["🫦", "biting lip"], ["🙋", "raise hand me"], ["🤷", "shrug idk"], ["🤦", "facepalm"],
      ["🙇", "bow sorry"], ["💃", "dance dancing"], ["🕺", "dance man"], ["🏃", "run running"],
      ["🧘", "yoga meditate calm"], ["🛌", "bed sleep"], ["👯", "besties dancing"], ["🫂", "hug people"],
    ],
  },
  {
    key: "fun",
    label: "Activities",
    icon: "🎧",
    emoji: [
      ["🎧", "headphones music listening"], ["🎵", "music note song"], ["🎶", "music notes songs"], ["🎤", "mic sing karaoke"],
      ["🎸", "guitar"], ["🎹", "piano keys"], ["🥁", "drum"], ["🎷", "sax"],
      ["🎮", "game gaming controller"], ["🕹️", "joystick arcade"], ["🎲", "dice game"], ["♟️", "chess"],
      ["🎬", "movie film clapper"], ["🍿", "popcorn movie"], ["📺", "tv"], ["🎨", "art paint"],
      ["📸", "camera photo"], ["📷", "camera"], ["🎟️", "ticket"], ["🎉", "party popper celebrate"],
      ["🎊", "confetti"], ["🎂", "birthday cake"], ["🎁", "gift present"], ["🎈", "balloon"],
      ["⚽", "football soccer"], ["🏀", "basketball"], ["🏏", "cricket"], ["🏸", "badminton"],
      ["🎾", "tennis"], ["🏐", "volleyball"], ["🏓", "ping pong"], ["🥊", "boxing"],
      ["🏋️", "gym weights lift"], ["🚴", "cycling bike"], ["🏊", "swim"], ["🏆", "trophy win"],
      ["🥇", "gold medal first"], ["📚", "books study read exams"], ["📖", "book read"], ["✏️", "pencil write"],
      ["📝", "memo notes write"], ["💻", "laptop work code"], ["📱", "phone"], ["⌨️", "keyboard"],
    ],
  },
  {
    key: "food",
    label: "Food",
    icon: "🍕",
    emoji: [
      ["☕", "coffee chai tea hot"], ["🍵", "tea matcha"], ["🧋", "boba bubble tea"], ["🥤", "drink soda"],
      ["🧃", "juice"], ["🍺", "beer"], ["🍻", "cheers beers"], ["🥂", "cheers toast"],
      ["🍷", "wine"], ["🍹", "cocktail"], ["🍕", "pizza"], ["🍔", "burger"],
      ["🍟", "fries"], ["🌭", "hotdog"], ["🌮", "taco"], ["🌯", "burrito wrap"],
      ["🍜", "noodles ramen maggi"], ["🍝", "pasta spaghetti"], ["🍛", "curry rice"], ["🍚", "rice"],
      ["🍣", "sushi"], ["🥟", "dumpling momo"], ["🍗", "chicken"], ["🥪", "sandwich"],
      ["🥗", "salad healthy"], ["🍳", "egg cooking"], ["🥞", "pancakes"], ["🧇", "waffle"],
      ["🍩", "donut"], ["🍪", "cookie"], ["🎂", "cake"], ["🍰", "cake slice"],
      ["🧁", "cupcake"], ["🍫", "chocolate"], ["🍬", "candy sweet"], ["🍦", "ice cream"],
      ["🍓", "strawberry"], ["🍉", "watermelon"], ["🥭", "mango"], ["🍌", "banana"],
      ["🍎", "apple"], ["🥑", "avocado"], ["🌶️", "chilli spicy hot"], ["🧊", "ice cube cold"],
    ],
  },
  {
    key: "nature",
    label: "Nature",
    icon: "🌙",
    emoji: [
      ["🌙", "moon night"], ["🌚", "new moon face"], ["🌝", "full moon face"], ["⭐", "star"],
      ["🌟", "glowing star"], ["✨", "sparkles magic"], ["⚡", "lightning zap energy"], ["🔥", "fire lit hot"],
      ["🌈", "rainbow"], ["☀️", "sun sunny"], ["🌤️", "sun cloud"], ["☁️", "cloud"],
      ["🌧️", "rain rainy"], ["⛈️", "storm thunder"], ["❄️", "snow cold"], ["🌊", "wave ocean sea beach"],
      ["💧", "droplet water"], ["🌸", "cherry blossom flower spring"], ["🌹", "rose flower"], ["🌻", "sunflower"],
      ["🌷", "tulip"], ["🌼", "blossom"], ["🍀", "clover luck"], ["🌿", "herb plant"],
      ["🌱", "seedling grow"], ["🌴", "palm tree beach"], ["🍂", "autumn leaves"], ["🍁", "maple leaf"],
      ["🐶", "dog puppy"], ["🐱", "cat kitty"], ["🐰", "bunny rabbit"], ["🦊", "fox"],
      ["🐻", "bear"], ["🐼", "panda"], ["🐨", "koala"], ["🐯", "tiger"],
      ["🦁", "lion"], ["🐸", "frog"], ["🐵", "monkey"], ["🙈", "see no evil monkey"],
      ["🐧", "penguin"], ["🦋", "butterfly"], ["🐝", "bee"], ["🐢", "turtle slow"],
      ["🦄", "unicorn"], ["🐍", "snake"], ["🐙", "octopus"], ["🦈", "shark"],
    ],
  },
  {
    key: "places",
    label: "Places",
    icon: "✈️",
    emoji: [
      ["✈️", "plane flight travel trip"], ["🚗", "car drive"], ["🏍️", "bike motorcycle"], ["🛵", "scooter"],
      ["🚌", "bus"], ["🚆", "train"], ["🚇", "metro"], ["🚀", "rocket launch"],
      ["🗺️", "map"], ["🧳", "luggage travel"], ["🏖️", "beach holiday"], ["🏝️", "island"],
      ["⛰️", "mountain"], ["🏔️", "snow mountain"], ["🏕️", "camping"], ["🌋", "volcano"],
      ["🏠", "home house"], ["🏫", "school"], ["🏢", "office"], ["🏥", "hospital"],
      ["🌃", "night city"], ["🌆", "city dusk"], ["🌅", "sunrise"], ["🌄", "sunrise mountains"],
      ["🎡", "ferris wheel"], ["🎢", "roller coaster"], ["🗽", "statue liberty"], ["🕌", "mosque"],
      ["🛕", "temple"], ["⛪", "church"], ["🌍", "earth world"], ["🇮🇳", "india flag"],
    ],
  },
  {
    key: "things",
    label: "Symbols",
    icon: "💭",
    emoji: [
      ["💭", "thought bubble thinking"], ["💬", "speech chat"], ["🗯️", "anger bubble"], ["💤", "zzz sleep"],
      ["🔔", "bell"], ["🔕", "mute"], ["📌", "pin"], ["📍", "location pin"],
      ["⏰", "alarm clock"], ["⌛", "hourglass time"], ["🔒", "lock"], ["🔑", "key"],
      ["💡", "idea bulb"], ["🔋", "battery"], ["🪫", "low battery tired"], ["💸", "money flying broke"],
      ["💰", "money bag"], ["🛍️", "shopping"], ["👟", "sneaker shoe"], ["👗", "dress"],
      ["🕶️", "sunglasses"], ["💍", "ring"], ["👑", "crown king queen"], ["💎", "gem diamond"],
      ["🎀", "ribbon bow"], ["🪩", "disco ball party"], ["🕯️", "candle"], ["🧿", "evil eye nazar"],
      ["✅", "check done yes"], ["❌", "cross no wrong"], ["⚠️", "warning"], ["🚫", "no prohibited"],
      ["❓", "question"], ["❗", "exclamation"], ["‼️", "double exclamation"], ["⁉️", "interrobang"],
      ["🆗", "ok"], ["🆕", "new"], ["🔝", "top"], ["🔜", "soon"],
      ["➕", "plus"], ["♾️", "infinity forever"], ["🎯", "target goal"], ["🪄", "magic wand"],
    ],
  },
];

const ALL: [string, string][] = EMOJI_GROUPS.flatMap((g) => g.emoji);

/**
 * Emoji whose words start with what you typed (or contain it, after those),
 * each once. An emoji typed straight in finds itself.
 */
export function searchEmoji(q: string, limit = 48): string[] {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  const starts: string[] = [];
  const within: string[] = [];
  for (const [e, words] of ALL) {
    if (e === term) starts.unshift(e);
    else if (words.split(" ").some((w) => w.startsWith(term))) starts.push(e);
    else if (words.includes(term)) within.push(e);
  }
  return [...new Set([...starts, ...within])].slice(0, limit);
}

// ── Recently used, on this device ─────────────────────────────────────────

const KEY = "hypefy.emoji.recent";
export const RECENT_MAX = 24;
const listeners = new Set<() => void>();
let cache: { raw: string | null; list: string[] } = { raw: null, list: [] };

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage blocked: no recents, nothing breaks */
  }
  if (raw === cache.raw) return cache.list;
  let list: string[] = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    list = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    list = [];
  }
  cache = { raw, list };
  return list;
}

const NONE: string[] = [];

/** Most recent first. For useSyncExternalStore — so every snapshot is a
 *  cached array, the same one until the recents change. */
export const recentEmoji = {
  get: read,
  server: (): string[] => NONE,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** Move an emoji to the front of the recents. */
export function rememberEmoji(e: string): void {
  const next = [e, ...read().filter((x) => x !== e)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return;
  }
  listeners.forEach((fn) => fn());
}

// ── The reaction a tap sends ─────────────────────────────────────────────
// Its own memory, not the recents: an emoji typed into your own page should
// not become what a quick tap sends to someone else's.

const REACT_KEY = "hypefy.react.last";
export const DEFAULT_REACTION = "❤️";
const reactListeners = new Set<() => void>();
let reactCache: { raw: string | null; value: string } = { raw: null, value: DEFAULT_REACTION };

/** For useSyncExternalStore: the emoji you reacted with last. */
export const lastReaction = {
  get(): string {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(REACT_KEY);
    } catch {
      /* storage blocked */
    }
    if (raw !== reactCache.raw) reactCache = { raw, value: raw && raw.length <= 16 ? raw : DEFAULT_REACTION };
    return reactCache.value;
  },
  server: (): string => DEFAULT_REACTION,
  subscribe(fn: () => void) {
    reactListeners.add(fn);
    return () => reactListeners.delete(fn);
  },
};

/** Remember a reaction as the one a tap sends next. */
export function rememberReaction(e: string): void {
  try {
    localStorage.setItem(REACT_KEY, e);
  } catch {
    return;
  }
  reactListeners.forEach((fn) => fn());
}

/** A row of `n`: your recents first, then `defaults` to fill it. */
export function quickRow(recent: string[], defaults: readonly string[], n: number): string[] {
  return [...new Set([...recent, ...defaults])].slice(0, n);
}
