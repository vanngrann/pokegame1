// Player screen (phones). Shows what's happening and sends picks and answers.
// The host's browser does all the scoring, so nothing here decides points.
import {
  db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, onSnapshot, serverTimestamp,
} from "./firebase.js";
import {
  h, requireUser, startTimers, timerBar, toast, store, leaderboardView, teamTotalsView,
  avatar, teamDot, boardGrid, optionGrid, ordinal, plain,
} from "./common.js";
import { TEAMS, WILDCARDS, rankPlayers, smallestTeam, opponentsOf, clampWager } from "./game.js";

const app = document.getElementById("app");

let me = null;
let code = "";
let roomRef = null;
let myRef = null;
let room = null;
let players = new Map();
let playersLoaded = false;
let lastKey = "";
let pendingAction = null;       // shows "sending…" after a pick/target/spin
let pendingTimer = null;
let wagerDraft = null;          // final-round slider value (kept outside the view so redraws don't reset it)
let local = { answers: {}, seen: {} }; // this device's answers + when each question first appeared

const saveLocal = () => store.set(`tt-play-${code}-${me.uid}`, local);

// ---------- Start up ----------
requireUser(async (user) => {
  me = user;
  code = (new URLSearchParams(location.search).get("code") || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== 4) return askForCode();
  roomRef = doc(db, "rooms", code);
  myRef = doc(db, "rooms", code, "players", me.uid);
  local = store.get(`tt-play-${code}-${me.uid}`, { answers: {}, seen: {} });

  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return message(`No game called ${code}`, "Double-check the code on the host’s screen.", true);
    const mine = await getDoc(myRef);
    if (mine.exists()) subscribe();
    else showJoinForm(snap.data());
  } catch (e) {
    console.error(e);
    message("Couldn’t connect", "Check your connection and try again.", true);
  }
});

function askForCode() {
  const input = h("input", { class: "input code-input", maxlength: "4", placeholder: "ABCD", autocapitalize: "characters", "aria-label": "Room code" });
  input.addEventListener("input", () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, ""); });
  app.replaceChildren(h("form", {
    class: "panel center",
    onsubmit: (e) => { e.preventDefault(); if (input.value.length === 4) location.href = `play.html?code=${input.value}`; },
  }, h("h2", null, "Enter the room code"), input, h("button", { class: "btn btn-primary btn-lg", type: "submit" }, "Join")));
  input.focus();
}

function message(title, text, withHome) {
  lastKey = "";
  app.replaceChildren(h("div", { class: "panel center" },
    h("h2", null, title), h("p", { class: "muted" }, text),
    withHome ? h("a", { class: "btn btn-primary", href: "index.html" }, "Back to start") : null));
}

function showJoinForm(r) {
  lastKey = "";
  const suggested = store.get("tt-name", "") || (me.isAnonymous ? "" : (me.displayName || "").split(" ")[0]);
  const input = h("input", { class: "input", maxlength: "20", value: suggested, placeholder: "Your name", autocomplete: "nickname", "aria-label": "Your name", required: true });
  const submit = h("button", { class: "btn btn-primary btn-lg", type: "submit" }, "Join game");
  app.replaceChildren(h("form", {
    class: "panel center",
    onsubmit: async (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/\s+/g, " ").slice(0, 20);
      if (!name) return;
      submit.disabled = true;
      try {
        await join(name);
      } catch (err) {
        console.error(err);
        toast("Couldn’t join. Try again.");
        submit.disabled = false;
      }
    },
  },
  h("p", { class: "eyebrow" }, `Room ${code}`),
  h("h2", null, "What should we call you?"),
  input,
  submit,
  r && r.status !== "lobby" ? h("p", { class: "muted small" }, "This game has already started. You can jump right in.") : null));
  input.focus();
}

async function join(name) {
  store.set("tt-name", name);
  const r = (await getDoc(roomRef)).data();
  let team = null;
  if (r?.settings?.mode === "teams") {
    const snap = await getDocs(collection(db, "rooms", code, "players"));
    team = smallestTeam(snap.docs.map((d) => d.data()), r.settings.teamCount);
  }
  await setDoc(myRef, {
    name, team, photo: me.photoURL || "", score: 0, doubleNext: false, joinedAt: serverTimestamp(), hostUid: r.hostUid,
  });
  subscribe();
}

function subscribe() {
  onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) return message("The game has ended", "The host closed this room.", true);
    const before = stageKey(room);
    room = snap.data({ serverTimestamps: "estimate" });
    if (stageKey(room) !== before) clearPending();
    render();
  }, (e) => { console.error(e); message("Lost connection", "Refresh the page to reconnect.", true); });

  onSnapshot(collection(db, "rooms", code, "players"), (snap) => {
    players = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    playersLoaded = true;
    render();
  });

  startTimers();
}

const stageKey = (r) => (r ? [r.status, r.current?.round, r.wild?.stage, r.pickerUid].join("|") : "");

// ---------- Sending ----------
async function submitAnswer(round, payload) {
  if (local.answers[round] !== undefined) return;
  local.answers[round] = payload.choice ?? payload.value;
  saveLocal();
  render(true);
  try {
    await setDoc(doc(db, "rooms", code, "answers", `${round}_${me.uid}`), {
      uid: me.uid, round, choice: payload.choice ?? null, value: payload.value ?? null, at: serverTimestamp(),
    });
  } catch (e) {
    console.error(e);
    // permission-denied usually means this answer was already saved, so keep it locked.
    if (e.code !== "permission-denied") {
      delete local.answers[round];
      saveLocal();
      render(true);
      toast("Couldn’t send your answer. Tap again.");
    }
  }
}

async function sendAction(type, extra = {}) {
  pendingAction = type;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { clearPending(); render(true); }, 6000);
  render(true);
  try {
    await addDoc(collection(db, "rooms", code, "actions"), {
      uid: me.uid, type, cellId: extra.cellId ?? null, targetUid: extra.targetUid ?? null, at: serverTimestamp(),
    });
  } catch (e) {
    console.error(e);
    clearPending();
    render(true);
    toast("Couldn’t send. Try again.");
  }
}

function clearPending() {
  pendingAction = null;
  clearTimeout(pendingTimer);
}

async function leave() {
  if (!confirm("Leave this game? Your points will be lost.")) return;
  await deleteDoc(myRef).catch(() => {});
  location.href = "index.html";
}

// ---------- Rendering ----------
function activeRound(r) {
  switch (r.status) {
    case "question": return r.current?.round || null;
    case "final-wager": return `g${r.game}w`;
    case "final-question": return `g${r.game}f`;
    case "tiebreak": return r.tiebreak?.round || null;
    default: return null;
  }
}

function render(force = false) {
  if (!room || !playersLoaded) return;
  if (!players.has(me.uid)) {
    lastKey = "removed";
    return app.replaceChildren(h("div", { class: "panel center" },
      h("h2", null, "You’re not in this game"),
      h("p", { class: "muted" }, "You left or were removed by the host."),
      h("button", { class: "btn btn-primary", type: "button", onclick: () => showJoinForm(room) }, "Join again")));
  }

  const r = plain(room);
  const round = activeRound(r);
  if (round && local.seen[round] == null) {
    local.seen[round] = Date.now();
    saveLocal();
  }
  const m = {
    view: r.status,
    r,
    ps: [...players.values()].map((p) => ({
      id: p.id, name: p.name || "Trainer", score: p.score || 0, team: p.team || null, photo: p.photo || "", doubleNext: !!p.doubleNext,
    })),
    meId: me.uid,
    round,
    mine: round ? local.answers[round] : undefined,
    seen: round ? local.seen[round] : null,
    pending: pendingAction,
  };
  const key = JSON.stringify(m);
  if (key === lastKey && !force) return;
  lastKey = key;
  app.replaceChildren((VIEWS[m.view] || lobbyView)(m));
}

const mePlayer = (m) => m.ps.find((p) => p.id === m.meId);
const nameOf = (m, id) => m.ps.find((p) => p.id === id)?.name || "Someone";
const teamMode = (m) => m.r.settings?.mode === "teams";

function meBar(m) {
  const ranked = rankPlayers(m.ps);
  const mine = ranked.find((p) => p.id === m.meId);
  return h("div", { class: "me-bar" },
    avatar(mine),
    h("span", { class: "name" }, teamMode(m) ? teamDot(mine.team) : null, mine.name, mine.doubleNext ? h("span", { class: "badge" }, "⚔️ ×2") : null),
    h("span", { class: "muted" }, `${ordinal(mine.rank)} of ${ranked.length}`),
    h("span", { class: "score" }, `${mine.score.toLocaleString()} pts`));
}

// ----- Lobby -----
function lobbyView(m) {
  const mine = mePlayer(m);
  const tm = teamMode(m);
  const count = m.r.settings?.teamCount || 2;
  return h("div", { class: "stack" },
    h("section", { class: "panel center" },
      avatar(mine, "lg"),
      h("h2", null, `You’re in, ${mine.name}!`),
      h("p", { class: "muted" }, "Keep an eye on the host’s screen. The game starts soon.")),
    tm ? h("section", { class: "panel" },
      h("h3", null, "Your team"),
      h("div", { class: "team-picker" }, TEAMS.slice(0, count).map((t) => {
        const active = mine.team === t.id;
        return h("button", {
          class: `team-btn${active ? " active" : ""}`, type: "button",
          style: { borderColor: t.color, background: active ? t.color : "" },
          onclick: () => updateDoc(myRef, { team: t.id }).catch(() => toast("Couldn’t switch teams.")),
        }, t.name, h("small", null, (() => { const n = m.ps.filter((p) => p.team === t.id).length; return `${n} player${n === 1 ? "" : "s"}`; })()));
      }))) : null,
    h("section", { class: "panel" },
      h("h3", null, `Players (${m.ps.length})`),
      h("ul", { class: "roster" }, m.ps.map((p) => h("li", null, avatar(p), h("span", { class: "name" }, tm ? teamDot(p.team) : null, p.name))))),
    h("button", { class: "btn btn-ghost", type: "button", onclick: leave }, "Leave game"));
}

// ----- Board -----
function boardView(m) {
  const picking = m.r.pickerUid === m.meId;
  const canPick = picking && !m.pending;
  return h("div", { class: "stack" },
    meBar(m),
    picking
      ? h("div", { class: "banner you" }, m.pending ? "Flipping your card…" : "Your turn! Pick a card.")
      : h("div", { class: "banner" }, `${nameOf(m, m.r.pickerUid)} is picking a card…`),
    boardGrid(m.r.categories, m.r.board, canPick ? (cellId) => sendAction("pick", { cellId }) : null, { compact: true }),
    picking ? h("p", { class: "muted small center" }, "Points are hidden until a card flips, and some cards are wildcards.") : null);
}

// ----- Question (board + final) -----
function questionView(m) {
  const r = m.r;
  const isFinal = r.status === "final-question";
  const c = r.current || {};
  const total = (c.seconds || 20) * 1000;
  const deadline = (m.seen || Date.now()) + total;
  const answered = m.mine !== undefined;
  const mine = mePlayer(m);
  const wager = isFinal ? r.final?.wagers?.[m.meId] || 0 : null;

  return h("div", { class: "stack" },
    meBar(m),
    h("div", { class: "q-meta" },
      h("span", { class: "chip" }, isFinal ? r.final.category : c.category),
      isFinal ? h("span", { class: "chip chip-accent" }, `Wager: ${wager}`) : h("span", { class: "chip chip-accent" }, `${c.points} pts`),
      !isFinal && c.pickerUid === m.meId ? h("span", { class: "chip" }, "🎯 Your pick: bonus if right") : null,
      !isFinal && mine.doubleNext ? h("span", { class: "chip" }, "⚔️ Double points") : null),
    timerBar(deadline, total),
    h("h2", { class: "prompt" }, isFinal ? r.final.prompt : c.prompt),
    optionGrid(isFinal ? r.final.options : c.options, {
      onPick: answered ? null : (i) => submitAnswer(m.round, { choice: i }),
      chosen: answered ? m.mine : null,
    }),
    answered ? h("p", { class: "locked center" }, "Answer locked in! Waiting for everyone else…") : null);
}

// ----- Reveal (board + final) -----
function revealView(m) {
  const r = m.r;
  const isFinal = r.status === "final-reveal";
  const res = r.reveal?.results?.[m.meId];
  let result;
  if (!res || res.choice === null) {
    result = h("div", { class: "result neutral" }, h("div", { class: "result-icon" }, "⏱"), h("h2", null, "No answer this time"),
      isFinal && res?.gained ? h("p", { class: "gain minus" }, `${res.gained}`) : null);
  } else if (res.correct) {
    result = h("div", { class: "result good" }, h("div", { class: "result-icon" }, "✓"), h("h2", null, "Correct!"),
      h("p", { class: "gain-big" }, `+${res.gained}`),
      !isFinal && r.current?.pickerUid === m.meId ? h("p", { class: "muted small" }, "Includes your picker bonus 🎯") : null,
      res.doubled ? h("p", { class: "muted small" }, "Doubled by Swords Dance ⚔️") : null);
  } else {
    result = h("div", { class: "result bad" }, h("div", { class: "result-icon" }, "✗"), h("h2", null, "Not quite"),
      isFinal && res.gained ? h("p", { class: "gain-big minus" }, `${res.gained}`) : null);
  }
  return h("div", { class: "stack" },
    meBar(m),
    result,
    h("section", { class: "panel center" }, h("p", { class: "muted small" }, "The answer was"), h("p", { class: "answer-text-big" }, r.reveal?.answer || "")));
}

// ----- Leaderboard -----
function leaderboardScreen(m) {
  const ranked = rankPlayers(m.ps);
  const mine = ranked.find((p) => p.id === m.meId);
  const gain = m.r.gains?.[m.meId] || 0;
  const prev = m.r.prevRanks?.[m.meId];
  const moved = prev ? prev - mine.rank : 0;
  return h("div", { class: "stack" },
    h("section", { class: "panel center" },
      h("p", { class: "eyebrow" }, "You’re in"),
      h("p", { class: "big-rank" }, ordinal(mine.rank)),
      h("p", { class: "muted" }, `${mine.score.toLocaleString()} pts`,
        gain ? ` (${gain > 0 ? "+" : ""}${gain})` : "",
        moved > 0 ? ` · up ${moved}` : moved < 0 ? ` · down ${-moved}` : "")),
    teamMode(m) ? h("section", { class: "panel" }, teamTotalsView(m.ps, m.r.settings.teamCount)) : null,
    h("section", { class: "panel" }, leaderboardView(m.ps, { me: m.meId, prevRanks: m.r.prevRanks, gains: m.r.gains, limit: 5, compact: true, showTeams: teamMode(m) })));
}

// ----- Wildcards -----
function wildView(m) {
  const w = m.r.wild;
  const def = WILDCARDS[w.type];
  const mineToAct = w.by === m.meId && w.stage === "choose";
  const parts = [];

  if (mineToAct && w.type === "thief") {
    const opp = opponentsOf(m.meId, m.ps, teamMode(m));
    parts.push(h("h3", null, "Who do you want to rob?"),
      h("div", { class: "target-list" }, opp.map((p) => h("button", {
        class: "btn btn-ghost", type: "button", disabled: !!m.pending,
        onclick: () => sendAction("target", { targetUid: p.id }),
      }, avatar(p), ` ${p.name} · ${p.score.toLocaleString()} pts`))));
  } else if (mineToAct && w.type === "wheel") {
    parts.push(h("button", { class: "btn btn-primary btn-lg spin-btn", type: "button", disabled: !!m.pending, onclick: () => sendAction("spin") }, "🎡 Spin!"));
  } else if (w.stage === "choose") {
    parts.push(h("p", { class: "muted" }, `Waiting for ${nameOf(m, w.by)}…`));
  } else if (w.stage === "spinning") {
    parts.push(h("p", { class: "muted" }, "The wheel is spinning. Watch the big screen!"));
  } else if (w.stage === "done") {
    const gain = m.r.gains?.[m.meId] || 0;
    parts.push(h("p", { class: "wild-summary" }, w.summary || ""),
      gain ? h("p", { class: `gain-big ${gain < 0 ? "minus" : ""}` }, gain > 0 ? `+${gain}` : `−${-gain}`) : null);
  }

  return h("div", { class: "stack" },
    meBar(m),
    h("div", { class: "wild-card" },
      h("div", { class: "wild-icon", "aria-hidden": "true" }, def.icon),
      h("p", { class: "eyebrow" }, w.by === m.meId ? "You found a wildcard!" : `${nameOf(m, w.by)} found a wildcard`),
      h("h2", null, def.name),
      h("p", null, def.text)),
    ...parts);
}

// ----- Final round: wager -----
function finalWagerView(m) {
  const mine = mePlayer(m);
  const max = Math.max(0, mine.score);
  const locked = m.mine !== undefined;
  const header = [meBar(m), h("p", { class: "eyebrow center" }, "Final round"), h("h2", { class: "center" }, m.r.final.category)];

  if (locked) {
    return h("div", { class: "stack" }, ...header,
      h("section", { class: "panel center" }, h("p", null, "Wager locked in:"), h("p", { class: "big-rank" }, String(m.mine)),
        h("p", { class: "muted" }, "The question appears when everyone’s ready.")));
  }

  if (wagerDraft == null || wagerDraft > max) wagerDraft = Math.round(max / 2 / 10) * 10;
  const value = h("p", { class: "big-rank" }, String(wagerDraft));
  const slider = h("input", { type: "range", class: "wager-slider", min: 0, max, step: 10, "aria-label": "Wager" });
  slider.value = String(wagerDraft);
  const setWager = (v) => { wagerDraft = clampWager(v, max); slider.value = String(wagerDraft); value.textContent = String(wagerDraft); };
  slider.addEventListener("input", () => setWager(slider.value));

  return h("div", { class: "stack" }, ...header,
    h("section", { class: "panel center" },
      max > 0
        ? h("p", { class: "muted" }, `How much of your ${max.toLocaleString()} points will you risk?`)
        : h("p", { class: "muted" }, "You don’t have points to wager, but you can still answer for bragging rights."),
      value,
      max > 0 ? slider : null,
      max > 0 ? h("div", { class: "quick-wagers" },
        h("button", { class: "btn btn-ghost btn-inline", type: "button", onclick: () => setWager(0) }, "Nothing"),
        h("button", { class: "btn btn-ghost btn-inline", type: "button", onclick: () => setWager(Math.round(max / 2)) }, "Half"),
        h("button", { class: "btn btn-ghost btn-inline", type: "button", onclick: () => setWager(max) }, "All in")) : null,
      h("button", {
        class: "btn btn-primary btn-lg", type: "button",
        onclick: () => submitAnswer(m.round, { value: clampWager(wagerDraft, max) }),
      }, "Lock in wager")));
}

// ----- Podium -----
function podiumView(m) {
  const ranked = rankPlayers(m.ps);
  const mine = ranked.find((p) => p.id === m.meId);
  const tied = ranked.filter((p) => p.rank === 1).length > 1;
  return h("div", { class: "stack" },
    h("section", { class: "panel center" },
      h("p", { class: "eyebrow" }, "Final result"),
      h("p", { class: "big-rank" }, mine.rank === 1 ? (tied ? "Tied 1st!" : "🏆 1st!") : ordinal(mine.rank)),
      h("p", { class: "muted" }, `${mine.score.toLocaleString()} pts`)),
    teamMode(m) ? h("section", { class: "panel" }, teamTotalsView(m.ps, m.r.settings.teamCount)) : null,
    h("section", { class: "panel" }, leaderboardView(m.ps, { me: m.meId, limit: 10, compact: true, showTeams: teamMode(m) })));
}

// ----- Tiebreaker -----
function tiebreakView(m) {
  const tb = m.r.tiebreak;
  const inIt = tb.uids.includes(m.meId);
  if (!inIt) {
    return h("div", { class: "stack" }, meBar(m), h("section", { class: "panel center" },
      h("p", { class: "eyebrow" }, "Tiebreaker"),
      h("h2", null, tb.uids.map((id) => nameOf(m, id)).join(" vs ")),
      h("p", { class: "muted" }, "Closest guess wins. Watch the big screen!")));
  }
  const total = (tb.seconds || 30) * 1000;
  const deadline = (m.seen || Date.now()) + total;
  if (m.mine !== undefined) {
    return h("div", { class: "stack" }, meBar(m), h("section", { class: "panel center" },
      h("p", null, "Your guess:"), h("p", { class: "big-rank" }, String(m.mine)), h("p", { class: "muted" }, "Waiting for the reveal…")));
  }
  const input = h("input", { class: "input guess-input", type: "number", inputmode: "numeric", placeholder: "Your guess", "aria-label": "Your guess" });
  return h("div", { class: "stack" },
    meBar(m),
    h("p", { class: "eyebrow center" }, "Tiebreaker · closest guess wins"),
    timerBar(deadline, total),
    h("h2", { class: "prompt" }, tb.prompt),
    h("form", {
      class: "panel center",
      onsubmit: (e) => {
        e.preventDefault();
        const v = Math.round(Number(input.value));
        if (Number.isFinite(v) && input.value !== "") submitAnswer(m.round, { value: v });
      },
    }, input, h("button", { class: "btn btn-primary btn-lg", type: "submit" }, "Lock in guess")));
}

function tiebreakRevealView(m) {
  const tb = m.r.tiebreak;
  const won = tb.winner === m.meId;
  return h("div", { class: "stack" }, meBar(m), h("section", { class: "panel center" },
    h("p", { class: "eyebrow" }, "Tiebreaker answer"),
    h("p", { class: "big-rank" }, String(tb.answer)),
    h("h2", null, tb.winner ? (won ? "🏆 You win the tiebreaker!" : `${nameOf(m, tb.winner)} wins the tiebreaker`) : "Nobody guessed!")));
}

const VIEWS = {
  lobby: lobbyView,
  board: boardView,
  question: questionView,
  reveal: revealView,
  leaderboard: leaderboardScreen,
  wild: wildView,
  "final-wager": finalWagerView,
  "final-question": questionView,
  "final-reveal": revealView,
  podium: podiumView,
  tiebreak: tiebreakView,
  "tiebreak-reveal": tiebreakRevealView,
};
