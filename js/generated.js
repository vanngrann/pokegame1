// The two columns built from the TCGdex card database each game, five questions each
// (one per difficulty level):
//   Card Spotter: who's on the card, which series or set, who drew it
//   Price Check:  what a card sells for raw (ungraded), from TCGplayer market prices
// If the database can't be reached, hand-written questions fill in, so a column is never empty.
import { api, isPocket } from "./cards.js";
import { shuffle } from "./game.js";

export const CARD_CATEGORY = "Card Spotter";
export const PRICE_CATEGORY = "Price Check";
const GIVE_UP_MS = 7000; // the host waits at most this long when starting a game

// Pokémon for the picture questions. Level 100 uses household names; 200 uses
// Pokémon fans know but casual players might not. Edit freely: names must match
// TCGdex card names exactly.
const FAMOUS = [
  "Pikachu", "Charizard", "Eevee", "Snorlax", "Gengar", "Mewtwo", "Bulbasaur", "Squirtle",
  "Charmander", "Jigglypuff", "Psyduck", "Lucario", "Greninja", "Mew", "Gyarados", "Dragonite",
];
const FAN_FAVORITES = [
  "Ampharos", "Togekiss", "Absol", "Gardevoir", "Tyranitar", "Salamence", "Metagross", "Luxray",
  "Zoroark", "Decidueye", "Dragapult", "Corviknight", "Tinkaton", "Ceruledge", "Flygon", "Houndoom",
  "Scizor", "Umbreon", "Espeon", "Lapras", "Arcanine", "Ninetales", "Altaria", "Milotic", "Rayquaza",
];
// Series offered as answers for the 300 question.
const SERIES = ["Scarlet & Violet", "Sword & Shield", "Sun & Moon", "XY", "Black & White"];
const SERIES_IDS = ["sv", "swsh", "sm", "xy", "bw"];

// Used for any level the database couldn't supply.
const FALLBACK = {
  1: { prompt: "Which Pokémon is on the cover of Pokémon Red?", answer: "Charizard", wrong: ["Blastoise", "Venusaur", "Pikachu"] },
  2: { prompt: "Before Scarlet & Violet, most English Pokémon cards had this border color.", answer: "Yellow", wrong: ["Silver", "Blue", "Black"] },
  3: { prompt: "This was the first English Pokémon TCG set.", answer: "Base Set", wrong: ["Jungle", "Fossil", "Team Rocket"] },
  4: { prompt: "English cards switched from yellow to silver borders in this year.", answer: "2023", wrong: ["2021", "2022", "2024"] },
  5: { prompt: "This artist illustrated the original Base Set Charizard.", answer: "Mitsuhiro Arita", wrong: ["Ken Sugimori", "Atsuko Nishida", "Kagemaru Himeno"] },
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const picture = (card, mode) => ({ base: card.image, name: card.name, mode });

/** A random usable printing of a Pokémon (has an image, not TCG Pocket). */
async function randomPrinting(name) {
  const list = await api(`/cards?name=${encodeURIComponent("eq:" + name)}`);
  const usable = (Array.isArray(list) ? list : []).filter((c) => c.image && !isPocket(c.id));
  return usable.length ? pick(usable) : null;
}

/** A random card with full details from one of the main modern series. */
async function randomModernCard() {
  for (const name of shuffle([...FAMOUS, ...FAN_FAVORITES]).slice(0, 5)) {
    const brief = await randomPrinting(name);
    if (!brief) continue;
    const card = await api(`/cards/${encodeURIComponent(brief.id)}`);
    if (!card?.image || !card.set?.id) continue;
    const set = await api(`/sets/${encodeURIComponent(card.set.id)}`);
    if (!set?.serie?.id || !SERIES_IDS.includes(set.serie.id)) continue;
    return { card, set };
  }
  return null;
}

// ----- One builder per level -----
async function whoIs(names, prompt, level) {
  const name = pick(names);
  const card = await randomPrinting(name);
  if (!card) return null;
  const wrong = shuffle(names.filter((n) => n !== name)).slice(0, 3);
  return { level, prompt, answer: name, wrong, picture: picture(card, "art") };
}

async function whichSeries() {
  const found = await randomModernCard();
  if (!found) return null;
  const answer = found.set.serie.name;
  const wrong = shuffle(SERIES.filter((_, i) => SERIES_IDS[i] !== found.set.serie.id)).slice(0, 3);
  return { level: 3, prompt: "Which series is this card from?", answer, wrong, picture: picture(found.card, "card") };
}

async function whichSet() {
  const found = await randomModernCard();
  if (!found) return null;
  const serie = await api(`/series/${encodeURIComponent(found.set.serie.id)}`);
  const answer = found.set.name;
  const others = (serie?.sets || [])
    .map((s) => s.name)
    .filter((n) => n && n !== answer && !/promo|trainer kit|mcdonald|energ/i.test(n));
  if (others.length < 3) return null;
  return { level: 4, prompt: "Which set is this card from?", answer, wrong: shuffle(others).slice(0, 3), picture: picture(found.card, "card") };
}

async function whoIllustrated() {
  const found = await randomModernCard();
  const artist = found?.card?.illustrator;
  if (!artist) return null;
  const all = await api("/illustrators");
  const wrong = shuffle((Array.isArray(all) ? all : []).filter((n) => n && n !== artist)).slice(0, 3);
  if (wrong.length < 3) return null;
  return { level: 5, prompt: "Who illustrated this card?", answer: artist, wrong, picture: picture(found.card, "art") };
}

const BUILDERS = {
  1: () => whoIs(FAMOUS, "Who’s that Pokémon?", 1),
  2: () => whoIs(FAN_FAVORITES, "Name the Pokémon on this card.", 2),
  3: whichSeries,
  4: whichSet,
  5: whoIllustrated,
};

// ----- Price Check -----
// Chase cards keep the prices interesting; the Pokémon lists above add everyday cards.
const CHASE = [
  "Charizard ex", "Charizard V", "Charizard VMAX", "Umbreon VMAX", "Rayquaza VMAX", "Giratina V",
  "Lugia V", "Mew ex", "Mewtwo ex", "Pikachu ex", "Gardevoir ex", "Gengar VMAX", "Sylveon VMAX",
  "Espeon VMAX", "Pikachu VMAX", "Mew VMAX", "Iono", "Lillie", "Marnie",
];
// Each level's four answers are prices this many times apart: far apart is easy, close is hard.
const PRICE_STEP = { 1: 10, 2: 5, 3: 3, 4: 2, 5: 1.5 };
// TCGplayer lists some cards in several versions; use the main one.
const VARIANTS = ["holofoil", "normal", "unlimited-holofoil", "unlimited", "1st-edition-holofoil", "1st-edition", "reverse-holofoil"];
const PRICE_NOTE = "Raw (ungraded) TCGplayer market price in US dollars.";

/** The card's TCGplayer market price in dollars, or null if it has none. */
function marketPrice(card) {
  const tp = card?.pricing?.tcgplayer;
  if (!tp || typeof tp !== "object") return null;
  const keys = [...VARIANTS, ...Object.keys(tp).filter((k) => !VARIANTS.includes(k))];
  for (const k of keys) {
    const v = tp[k];
    const p = v && typeof v === "object" ? Number(v.marketPrice || v.midPrice) : 0;
    if (p > 0) return { price: p, updated: tp.updated || null };
  }
  return null;
}

/** "$0.35", "$4.50", "$25", "$250", "$1,200" */
export function money(n) {
  if (n < 1) return "$" + (Math.round(n * 20) / 20).toFixed(2);
  if (n < 10) return "$" + (Math.round(n * 4) / 4).toFixed(2);
  if (n < 100) return "$" + Math.round(n);
  if (n < 1000) return "$" + Math.round(n / 5) * 5;
  return "$" + (Math.round(n / 50) * 50).toLocaleString("en-US");
}

/** Four price answers `step` times apart, with the real price at a random rung. */
export function priceOptions(price, step) {
  let rung = Math.floor(Math.random() * 4);
  const ceiling = Math.max(price * step, 5000); // always room for one answer above
  while (rung < 3 && price * step ** (3 - rung) > ceiling) rung++; // no silly prices on top
  while (rung > 0 && price / step ** rung < 0.1) rung--; // nothing below ten cents
  const labels = [0, 1, 2, 3].map((i) => money(price * step ** (i - rung)));
  if (new Set(labels).size < 4) return null;
  // inOrder: shown lowest to highest instead of shuffled, which reads better for prices.
  return { answer: labels[rung], wrong: labels.filter((_, i) => i !== rung), inOrder: labels };
}

const usedPriceCards = new Set(); // keeps the five Price Check cards different within a game

// Bulk cards (under $1) always land on the lowest answer, which gives the game away,
// so they're used only when nothing pricier turns up.
async function pricedCard(names) {
  let bulk = null;
  for (const name of names) {
    const brief = await randomPrinting(name);
    if (!brief || usedPriceCards.has(brief.id)) continue;
    usedPriceCards.add(brief.id);
    const card = await api(`/cards/${encodeURIComponent(brief.id)}`);
    const found = card?.image ? marketPrice(card) : null;
    if (found && found.price >= 1) return { card, ...found };
    if (found && !bulk) bulk = { card, ...found };
  }
  return bulk;
}

function asOf(updated) {
  const d = updated ? new Date(updated) : null;
  return d && !isNaN(d) ? ` As of ${d.toLocaleDateString("en-US", { month: "short", year: "numeric" })}.` : "";
}

async function priceQuestion(level, names) {
  const found = await pricedCard(names);
  if (!found) return null;
  const opts = priceOptions(found.price, PRICE_STEP[level]);
  if (!opts) return null;
  return {
    level, prompt: "About how much does this card sell for, raw?", ...opts,
    note: PRICE_NOTE + asOf(found.updated),
    picture: picture(found.card, "card"),
  };
}

const PRICE_FALLBACK = {
  1: { prompt: "A “raw” card is one that is...", answer: "Not graded", wrong: ["Damaged", "Still sealed in a pack", "A misprint"] },
  2: { prompt: "The same card usually sells for the most in which condition?", answer: "Graded PSA 10", wrong: ["Raw, near mint", "Graded PSA 8", "Raw, lightly played"] },
  3: { prompt: "TCGplayer’s Market Price is based on...", answer: "Recent sales", wrong: ["The lowest listing", "The highest listing", "The price printed on packs"] },
  4: { prompt: "Cardmarket, Europe’s big card marketplace, lists prices in...", answer: "Euros", wrong: ["Pounds", "US dollars", "Swiss francs"] },
  5: { prompt: "In 2022, a PSA 10 Pikachu Illustrator set a Pokémon card sales record. About how much did it sell for?", answer: "$5.3 million", wrong: ["$900,000", "$2.1 million", "$12 million"] },
};

// ----- Putting a column together -----
async function buildColumn(name, note, builders, fallback) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), GIVE_UP_MS));
  const made = await Promise.all([1, 2, 3, 4, 5].map((level) =>
    Promise.race([builders[level]().catch(() => null), timeout])));
  const questions = made.map((q, i) => q || { level: i + 1, ...fallback[i + 1] });
  return { name, note, questions, fromDatabase: made.filter(Boolean).length };
}

/** This game's Card Spotter column. Never throws; takes at most GIVE_UP_MS. */
export function buildCardCategory() {
  return buildColumn(CARD_CATEGORY, null, BUILDERS, FALLBACK);
}

/** This game's Price Check column. Never throws; takes at most GIVE_UP_MS. */
export function buildPriceCategory() {
  usedPriceCards.clear();
  const pool = shuffle([...CHASE, ...FAMOUS, ...FAN_FAVORITES]);
  // Each level gets its own slice of names to try, so they don't compete for the same cards.
  const slice = (i) => pool.slice(i * 5, i * 5 + 5);
  const builders = Object.fromEntries([1, 2, 3, 4, 5].map((l) => [l, () => priceQuestion(l, slice(l - 1))]));
  return buildColumn(PRICE_CATEGORY, null, builders, PRICE_FALLBACK);
}
