// Game rules: board building, scoring, wildcards and the wheel.
// Everything here is plain logic (no Firebase, no DOM), so it's easy to tweak.

// ---------- Settings ----------
export const DEFAULT_SETTINGS = {
  mode: "solo",        // "solo" (everyone for themselves) or "teams"
  teamCount: 2,        // 2 to 4 when mode is "teams"
  seconds: 20,         // time to answer each board question
  wildcardCount: 6,    // how many cards also carry a wildcard (0 up to every card)
  wildTypes: null,     // which wildcards can appear; null means all of them
};

export const POINT_VALUES = [100, 200, 300, 400, 500];
export const SPEED_BONUS = 0.25;   // answering instantly adds up to +25% of the card's points
export const PICKER_BONUS = 0.25;  // the player who picked the card gets +25% if they're right
export const FINAL_SECONDS = 30;
export const FINAL_MIN_WAGER = 500; // everyone may wager at least this much, even with a low score
export const AWAY_AFTER = 2;          // missed questions in a row before a player is marked away
export const ANSWER_GRACE_MS = 1500; // extra time the host waits for answers still on their way
export const TIEBREAK_SECONDS = 30;
export const STEAL_AMOUNT = 200;
export const SPIN_MS = 4000;       // wheel spin animation length

export const TEAMS = [
  { id: "mystic", name: "Team Mystic", color: "#2f6fd6" },
  { id: "valor", name: "Team Valor", color: "#d6453d" },
  { id: "instinct", name: "Team Instinct", color: "#e0a800" },
  { id: "rocket", name: "Team Rocket", color: "#7b3fb8" },
];

// The four answer buttons (Kahoot-style shape + color).
export const OPTION_SHAPES = ["shape0", "shape1", "shape2", "shape3"]; // icon names, see icons.js

// ---------- Wildcards ----------
// `needs` = the picker has to do something before it resolves.
export const WILDCARDS = {
  thief:     { name: "Thief",          icon: "thief", text: `Steal ${STEAL_AMOUNT} points from a player of your choice.`, needs: "target" },
  wheel:     { name: "Spin the Wheel", icon: "wheel", text: "Spin for a random prize, or a penalty.", needs: "spin" },
  swords:    { name: "Swords Dance",   icon: "swords", text: "Your next correct answer scores double." },
  transform: { name: "Transform",      icon: "transform", text: "Swap scores with a random opponent!" },
  candy:     { name: "Rare Candy",     icon: "candy", text: "Free +300 points." },
  payday:    { name: "Pay Day",        icon: "payday", text: "Everyone gets +100." },
  quake:     { name: "Earthquake",     icon: "quake", text: "Every opponent loses 100." },
};

export const WHEEL = [
  { short: "+100",       label: "+100 points",               kind: "self", value: 100 },
  { short: "+300",       label: "+300 points",               kind: "self", value: 300 },
  { short: "−200",       label: "Lose 200 points",           kind: "self", value: -200 },
  { short: "All +100",   label: "Everyone gets +100",        kind: "all", value: 100 },
  { short: "+500",       label: "+500 points",               kind: "self", value: 500 },
  { short: "Rob leader", label: "Steal 300 from the leader", kind: "stealLeader", value: 300 },
  { short: "Double",     label: "Swords Dance",              kind: "swords" },
  { short: "Swap last",  label: "Swap scores with last place", kind: "swapLast" },
];

// ---------- Helpers ----------
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const round10 = (n) => Math.round(n / 10) * 10;

export function makeRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O
  let code = "";
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}

// ---------- Board ----------
/**
 * Returns the public board (safe for everyone to see) and the hidden cell contents.
 * public: [{ id, col, row, used, label }]
 * cells:  { [id]: { col, kind: "q", qIndex, points } | { col, kind: "wild", wild } }
 */
// ---------- Difficulty ----------
// Every question has a level; its points are level x 100.
//   1 = 100 very easy, 2 = 200 easy, 3 = 300 medium, 4 = 400 hard, 5 = 500 very hard
export const LEVELS = [1, 2, 3, 4, 5];
export const pointsFor = (level) => level * 100;
// The board is 7 columns: up to 5 hand-written categories from questions.js, plus the
// "Card Spotter" and "Price Check" columns generated from the card database each game.
// With more than 5 categories in the bank, the extras sit out a game in rotation.
export const HAND_COLUMNS = 5;
export const GENERATED_COLUMNS = 2;

/** Cards on the board: one per level in every column. */
export function boardSize(bank) {
  return (Math.min(bank.categories.length, HAND_COLUMNS) + GENERATED_COLUMNS) * LEVELS.length;
}

/**
 * Picks which hand-written categories play this game. When there are more than
 * HAND_COLUMNS, the ones that sat out longest ago (or never) sit out next.
 * recent: names that sat out before, most recent last. Returns { play, satOut } in bank order.
 */
export function chooseCategories(categories, recent = []) {
  const extra = Math.max(0, categories.length - HAND_COLUMNS);
  if (!extra) return { play: categories, satOut: [] };
  const age = (c) => { const i = recent.lastIndexOf(c.name); return i < 0 ? -1 : i; };
  const order = shuffle([...categories]).sort((a, b) => age(a) - age(b));
  const out = new Set(order.slice(0, extra));
  return { play: categories.filter((c) => !out.has(c)), satOut: [...out].map((c) => c.name) };
}

/** Wildcard count from settings (older rooms used an on/off switch). */
export function wildcardCountOf(settings, bank) {
  const n = settings.wildcardCount ?? (settings.wildcards === false ? 0 : DEFAULT_SETTINGS.wildcardCount);
  return Math.max(0, Math.min(boardSize(bank), Math.floor(Number(n) || 0)));
}

export function enabledWildTypes(settings) {
  const all = Object.keys(WILDCARDS);
  const picked = Array.isArray(settings.wildTypes) ? settings.wildTypes.filter((t) => all.includes(t)) : all;
  return picked.length ? picked : all;
}

/**
 * This game's questions: one per level in each category, picked at random among the
 * questions written for that level. If a level has none, the closest level fills in.
 */
export function pickDeck(categories) {
  return categories.map((cat) => {
    const used = new Set();
    const questions = LEVELS.map((level) => {
      const free = cat.questions.filter((q) => !used.has(q));
      const best = Math.min(...free.map((q) => Math.abs((q.level || 3) - level)));
      const pool = free.filter((q) => Math.abs((q.level || 3) - level) === best);
      const q = pool[Math.floor(Math.random() * pool.length)];
      if (q) used.add(q);
      return q ? { ...q, level } : null;
    }).filter(Boolean);
    return { name: cat.name, note: cat.note || null, questions };
  });
}

/**
 * Lays out this game's deck: one column per category, 100 at the top to 500 at the bottom.
 * public board: [{ id, col, row, value, used, label, icon }] (values are visible, wildcards aren't)
 * cells (hidden): { [id]: { col, kind: "q", q, points, wild } }
 */
export function buildBoard(deck, settings) {
  const total = deck.reduce((n, c) => n + c.questions.length, 0);
  const wildCount = Math.min(total, wildcardCountOf(settings, { categories: deck }));
  const types = enabledWildTypes(settings);
  const cells = {};
  const board = [];

  // Every card is a question. Some cards also carry a wildcard, which plays first.
  // Spread the wildcards across the columns as evenly as possible.
  const perCol = deck.map(() => 0);
  const order = shuffle(deck.map((_, i) => i));
  for (let placed = 0, k = 0; placed < wildCount && k < total * 2; k++) {
    const col = order[k % order.length];
    if (perCol[col] < deck[col].questions.length) { perCol[col]++; placed++; }
  }
  // Cycle through the enabled wildcard types so the board gets a good mix.
  let typeBag = [];
  const nextType = () => { if (!typeBag.length) typeBag = shuffle(types); return typeBag.pop(); };

  deck.forEach((cat, col) => {
    const size = cat.questions.length;
    const wildRows = new Set(shuffle([...Array(size).keys()]).slice(0, perCol[col]));
    cat.questions.forEach((q, row) => {
      const id = `c${col}r${row}`;
      const points = pointsFor(q.level);
      cells[id] = { col, kind: "q", q, points, wild: wildRows.has(row) ? nextType() : null };
      board.push({ id, col, row, value: points, used: false, label: null, icon: null });
    });
  });

  return { categories: deck.map((c) => c.name), notes: deck.map((c) => c.note || null), board, cells };
}

/** Final-round and tiebreaker pools (older banks had a single `final` / `tiebreaker`). */
export const finalsOf = (bank) => (Array.isArray(bank.finals) && bank.finals.length ? bank.finals : bank.final ? [bank.final] : []);
export const tiebreakersOf = (bank) => (Array.isArray(bank.tiebreakers) && bank.tiebreakers.length ? bank.tiebreakers : bank.tiebreaker ? [bank.tiebreaker] : []);

export function optionsFor(q) {
  // Questions can fix the answer order (price answers read lowest to highest).
  const options = Array.isArray(q.inOrder) && q.inOrder.includes(q.answer) ? [...q.inOrder] : shuffle([q.answer, ...q.wrong]);
  return { options, correctIndex: options.indexOf(q.answer) };
}

// ---------- Scoring ----------
export function scoreCorrect({ points, elapsedMs, seconds, isPicker, doubled }) {
  const timeLeft = Math.min(1, Math.max(0, 1 - elapsedMs / (seconds * 1000)));
  let total = points + points * SPEED_BONUS * timeLeft;
  if (isPicker) total += points * PICKER_BONUS;
  if (doubled) total *= 2;
  return round10(total);
}

/** The most a player can wager in the final round. */
export function maxWager(score) {
  return Math.max(FINAL_MIN_WAGER, score || 0);
}

export function clampWager(value, score) {
  return Math.max(0, Math.min(maxWager(score), Math.floor(Number(value) || 0)));
}

/** Sorted copy with a `rank` field; equal scores share a rank. */
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name).localeCompare(String(b.name)));
  let rank = 0;
  let prev = null;
  return sorted.map((p, i) => {
    if ((p.score || 0) !== prev) { rank = i + 1; prev = p.score || 0; }
    return { ...p, rank };
  });
}

export function teamTotals(players, teamCount) {
  return TEAMS.slice(0, teamCount)
    .map((t) => {
      const members = players.filter((p) => p.team === t.id);
      return { ...t, members: members.length, score: members.reduce((s, p) => s + (p.score || 0), 0) };
    })
    .sort((a, b) => b.score - a.score);
}

export function smallestTeam(players, teamCount) {
  const teams = TEAMS.slice(0, teamCount);
  const counts = teams.map((t) => players.filter((p) => p.team === t.id).length);
  return teams[counts.indexOf(Math.min(...counts))].id;
}

// ---------- Wildcard effects ----------
/** Players who count as opponents (in team mode, teammates are excluded). */
export function opponentsOf(byId, players, teamMode) {
  const me = players.find((p) => p.id === byId);
  return players.filter((p) => p.id !== byId && !(teamMode && me?.team && p.team === me.team));
}

/**
 * Works out what a wildcard does. Pure function: returns score changes, flags and a summary.
 * ctx: { by, players: [{id,name,score,team}], teamMode, target?, wheelIndex?, random? }
 */
export function resolveWild(type, ctx) {
  const { by, players, teamMode } = ctx;
  const random = ctx.random || Math.random;
  const me = players.find((p) => p.id === by) || { id: by, name: "Someone", score: 0 };
  const opp = opponentsOf(by, players, teamMode);
  const deltas = {};
  const flags = {};
  const add = (id, v) => { if (v) deltas[id] = (deltas[id] || 0) + v; };
  const lossFrom = (p, amount) => Math.min(amount, Math.max(0, p.score || 0)); // scores never go below 0
  const consolation = (why) => { add(me.id, 100); return `${why} ${me.name} gets +100 instead.`; };
  let summary = "";

  const effect = type === "wheel" ? WHEEL[ctx.wheelIndex] : null;
  const kind = effect ? effect.kind : type;

  switch (kind) {
    case "thief": {
      const t = opp.find((p) => p.id === ctx.target);
      if (!t) { summary = consolation("Nobody to rob!"); break; }
      const amt = lossFrom(t, STEAL_AMOUNT);
      add(me.id, amt); add(t.id, -amt);
      summary = amt ? `${me.name} stole ${amt} points from ${t.name}!` : `${t.name} had nothing to steal!`;
      break;
    }
    case "candy":
      add(me.id, 300);
      summary = `${me.name} gets a free +300!`;
      break;
    case "payday":
      players.forEach((p) => add(p.id, 100));
      summary = "Pay Day! Everyone gets +100.";
      break;
    case "quake": {
      if (!opp.length) { summary = consolation("No opponents to shake up!"); break; }
      opp.forEach((p) => add(p.id, -lossFrom(p, 100)));
      summary = `Earthquake! Every opponent of ${me.name} loses 100.`;
      break;
    }
    case "transform": {
      if (!opp.length) { summary = consolation("Nobody to swap with!"); break; }
      const t = opp[Math.floor(random() * opp.length)];
      add(me.id, (t.score || 0) - (me.score || 0));
      add(t.id, (me.score || 0) - (t.score || 0));
      summary = `${me.name} swapped scores with ${t.name}!`;
      break;
    }
    case "swords":
      flags[me.id] = { doubleNext: true };
      summary = `${me.name}’s next correct answer scores double!`;
      break;

    // ----- wheel-only outcomes -----
    case "self": {
      const v = effect.value > 0 ? effect.value : -lossFrom(me, -effect.value);
      add(me.id, v);
      summary = v >= 0 ? `${me.name} wins +${v}!` : `Ouch! ${me.name} loses ${-v}.`;
      break;
    }
    case "all":
      players.forEach((p) => add(p.id, effect.value));
      summary = `Everyone gets +${effect.value}!`;
      break;
    case "stealLeader": {
      const leader = [...opp].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      if (!leader || (leader.score || 0) <= 0 || (leader.score || 0) <= (me.score || 0)) {
        summary = consolation("You’re already out in front!");
        break;
      }
      const amt = lossFrom(leader, effect.value);
      add(me.id, amt); add(leader.id, -amt);
      summary = `${me.name} robbed the leader, ${leader.name}, of ${amt} points!`;
      break;
    }
    case "swapLast": {
      const last = [...opp].sort((a, b) => (a.score || 0) - (b.score || 0))[0];
      if (!last || (last.score || 0) >= (me.score || 0)) {
        summary = consolation("You’re already in last place!");
        break;
      }
      add(me.id, (last.score || 0) - (me.score || 0));
      add(last.id, (me.score || 0) - (last.score || 0));
      summary = `${me.name} swapped scores with last place, ${last.name}!`;
      break;
    }
    default:
      summary = "Nothing happened.";
  }

  // Wheel outcomes that can fall back to a consolation prize say what they landed on first.
  if (effect && (effect.kind === "stealLeader" || effect.kind === "swapLast")) summary = `${effect.label}! ${summary}`;
  return { deltas, flags, summary };
}
