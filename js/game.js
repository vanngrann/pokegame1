// Game rules: board building, scoring, wildcards and the wheel.
// Everything here is plain logic (no Firebase, no DOM), so it's easy to tweak.

// ---------- Settings ----------
export const DEFAULT_SETTINGS = {
  mode: "solo",      // "solo" (everyone for themselves) or "teams"
  teamCount: 2,      // 2–4 when mode is "teams"
  seconds: 20,       // time to answer each board question
  wildcards: true,   // hide one wildcard in each column
};

export const POINT_VALUES = [100, 200, 300, 400, 500];
export const SPEED_BONUS = 0.25;   // answering instantly adds up to +25% of the card's points
export const PICKER_BONUS = 0.25;  // the player who picked the card gets +25% if they're right
export const FINAL_SECONDS = 30;
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
export const OPTION_SHAPES = ["▲", "◆", "●", "■"];

// ---------- Wildcards ----------
// `needs` = the picker has to do something before it resolves.
export const WILDCARDS = {
  thief:     { name: "Thief",          icon: "🦹", text: `Steal ${STEAL_AMOUNT} points from a player of your choice.`, needs: "target" },
  wheel:     { name: "Spin the Wheel", icon: "🎡", text: "Spin for a random prize… or a penalty!", needs: "spin" },
  swords:    { name: "Swords Dance",   icon: "⚔️", text: "Your next correct answer scores double." },
  transform: { name: "Transform",      icon: "🔀", text: "Swap scores with a random opponent!" },
  candy:     { name: "Rare Candy",     icon: "🍬", text: "Free +300 points." },
  payday:    { name: "Pay Day",        icon: "🪙", text: "Everyone gets +100." },
  quake:     { name: "Earthquake",     icon: "🌋", text: "Every opponent loses 100." },
};

export const WHEEL = [
  { short: "+100",       label: "+100 points",               kind: "self", value: 100 },
  { short: "+300",       label: "+300 points",               kind: "self", value: 300 },
  { short: "−200",       label: "Lose 200 points",           kind: "self", value: -200 },
  { short: "All +100",   label: "Everyone gets +100",        kind: "all", value: 100 },
  { short: "+500",       label: "+500 points",               kind: "self", value: 500 },
  { short: "Rob leader", label: "Steal 300 from the leader", kind: "stealLeader", value: 300 },
  { short: "⚔️ ×2",      label: "Swords Dance",              kind: "swords" },
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
export function buildBoard(bank, { wildcards }) {
  const wildTypes = shuffle(Object.keys(WILDCARDS));
  const cells = {};
  const board = [];

  bank.categories.forEach((cat, col) => {
    const points = shuffle(POINT_VALUES);
    const column = cat.questions.map((q, qIndex) => ({ kind: "q", qIndex, points: points[qIndex % points.length] }));
    if (wildcards) {
      const at = Math.floor(Math.random() * (column.length + 1));
      column.splice(at, 0, { kind: "wild", wild: wildTypes[col % wildTypes.length] });
    }
    column.forEach((cell, row) => {
      const id = `c${col}r${row}`;
      cells[id] = { ...cell, col };
      board.push({ id, col, row, used: false, label: null });
    });
  });

  return { categories: bank.categories.map((c) => c.name), board, cells };
}

export function optionsFor(q) {
  const options = shuffle([q.answer, ...q.wrong]);
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

export function clampWager(value, score) {
  const max = Math.max(0, score || 0);
  return Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
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

  if (effect) summary = `🎡 ${effect.label}! ${summary}`;
  return { deltas, flags, summary };
}
