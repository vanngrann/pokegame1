// Player screen (phones). Shows what's happening and sends picks and answers.
// The host's browser does all the scoring, so nothing here decides points.
import {
  db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, onSnapshot, serverTimestamp, reconnect,
} from "./firebase.js";
import {
  h, requireUser, startTimers, timerBar, toast, store, leaderboardView, teamTotalsView,
  avatar, teamDot, boardGrid, optionGrid, ordinal, plain, icon, badge, signed, promptClass, stayConnected, loadWatchdog, setLive,
  animatedLeaderboard, displayScores, countUp, signedFormat, confetti, once, cardVisual, safeTap,
} from "./common.js";
import { TEAMS, WILDCARDS, FINAL_MIN_WAGER, AWAY_AFTER, rankPlayers, smallestTeam, opponentsOf, clampWager, maxWager } from "./game.js";

const app = document.getElementById("app");

// If the page hasn't shown anything useful after a few seconds, reconnect, then reload.
const loaded = loadWatchdog();

// Stop drawing (and, on the host, stop running the game) if another tab switches accounts.
let frozen = false;
document.addEventListener("tt-account-switched", () => { frozen = true; });

let me = null;
let code = "";
let roomRef = null;
let myRef = null;
let room = null;
let players = new Map();
let playersLoaded = false;
let playersConfirmed = false; // latest player list came from the server, not the phone's saved copy
let lastKey = "";
let pendingAction = null;       // shows "sending…" after a pick/target/spin
let pendingTimer = null;
let wagerDraft = null;          // final-round slider value (kept outside the view so redraws don't reset it)
let local = { answers: {}, sent: {}, seen: {} }; // this device's answers, which ones the server confirmed, and when each question first appeared

const saveLocal = () => store.set(`tt-play-${code}-${me.uid}`, local);

// ---------- Start up ----------
requireUser(async (user) => {
  me = user;
  code = (new URLSearchParams(location.search).get("code") || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== 4) return askForCode();
  roomRef = doc(db, "rooms", code);
  myRef = doc(db, "rooms", code, "players", me.uid);
  local = { answers: {}, sent: {}, seen: {}, ...store.get(`tt-play-${code}-${me.uid}`, {}) };

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
  loaded();
  const input = h("input", { class: "input code-input", maxlength: "4", placeholder: "ABCD", autocapitalize: "characters", "aria-label": "Room code" });
  input.addEventListener("input", () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, ""); });
  app.replaceChildren(h("form", {
    class: "panel center",
    onsubmit: (e) => { e.preventDefault(); if (input.value.length === 4) location.href = `play.html?code=${input.value}`; },
  }, h("h2", null, "Enter the room code"), input, h("button", { class: "btn btn-primary btn-lg", type: "submit" }, "Join")));
  input.focus();
}

function message(title, text, withHome) {
  loaded();
  lastKey = "";
  app.replaceChildren(h("div", { class: "panel center" },
    h("h2", null, title), h("p", { class: "muted" }, text),
    withHome ? h("a", { class: "btn btn-primary", href: "index.html" }, "Back to start") : null));
}

function showJoinForm(r) {
  loaded();
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
  // Remember this game so the start page can offer "Rejoin" if the player leaves.
  store.set("tt-last-room", { code, at: Date.now() });

  // includeMetadataChanges: also tells us when data is only from the phone's saved copy
  // (fromCache), which is how we know the connection to the server is down.
  onSnapshot(roomRef, { includeMetadataChanges: true }, (snap) => {
    setLive(!snap.metadata.fromCache);
    if (!snap.exists()) {
      if (snap.metadata.fromCache) return; // not confirmed by the server yet
      loaded();
      return message("The game has ended", "The host closed this room.", true);
    }
    loaded();
    const before = stageKey(room);
    room = snap.data({ serverTimestamps: "estimate" });
    if (stageKey(room) !== before) clearPending();
    render();
  }, (e) => { console.error(e); message("Lost connection", "Refresh the page to reconnect.", true); });

  onSnapshot(collection(db, "rooms", code, "players"), { includeMetadataChanges: true }, (snap) => {
    players = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    // Only trust "you're not in the player list" when the server confirms it. A shaky
    // connection can briefly show an incomplete saved list, which used to look like a kick.
    playersConfirmed = !snap.metadata.fromCache;
    playersLoaded = true;
    render();
  });

  startTimers();

  // Coming back to the tab after a while or regaining signal: reconnect and redraw.
  stayConnected(() => { lastKey = ""; render(true); });
}

const stageKey = (r) => (r ? [r.status, r.current?.round, r.wild?.stage, r.pickerUid].join("|") : "");

// ---------- Sending ----------
async function submitAnswer(round, payload) {
  if (local.answers[round] !== undefined) return;
  local.answers[round] = payload.choice ?? payload.value;
  delete local.sent[round];
  saveLocal();
  render(true);
  const ref = doc(db, "rooms", code, "answers", `${round}_${me.uid}`);
  try {
    await setDoc(ref, { uid: me.uid, round, choice: payload.choice ?? null, value: payload.value ?? null, at: serverTimestamp() });
    local.sent[round] = true;
  } catch (e) {
    console.error(e);
    // A refused write can mean the answer was already saved (a double tap). Check before giving up.
    let saved = false;
    try { saved = (await getDoc(ref)).exists(); } catch { /* not readable: treat as not saved */ }
    if (saved) {
      local.sent[round] = true;
    } else {
      delete local.answers[round];
      toast(e.code === "permission-denied"
        ? "Your answer wasn’t accepted. If you were removed from the game, join again."
        : "Couldn’t send your answer. Check your connection and tap again.");
    }
  }
  saveLocal();
  render(true);
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
  if (frozen) return;
  if (!players.has(me.uid)) {
    if (!playersConfirmed) return; // keep the current screen until the server confirms
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
    ps: displayScores([...players.values()].map((p) => ({
      id: p.id, name: p.name || "Trainer", score: p.score || 0, team: p.team || null, photo: p.photo || "", doubleNext: !!p.doubleNext,
      away: !!p.away,
    })), r),
    meId: me.uid,
    round,
    mine: round ? local.answers[round] : undefined,
    sent: round ? !!local.sent[round] : false,
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

// ---------- Points animations ----------
// What the score bar last showed, so a change counts up instead of jumping.
let shownScore = null;

/** Turn id, so each turn's animations play once. */
const turnKey = (r) => `${code}:${r.game}:${r.qCount}:${r.wild?.cellId || ""}:${r.status.startsWith("final") ? "final" : ""}`;

/** Tells a player they've been marked away and how to get back in. */
function awayBanner(m, short = false) {
  if (!mePlayer(m).away) return null;
  return h("div", { class: `away-banner${short ? " short" : ""}`, role: "status" }, icon("clock"),
    h("span", null, short
      ? "You’re marked away. Answer this one to jump back in."
      : `You were marked away after missing ${AWAY_AFTER} questions. Answer the next question to jump back in.`));
}

function meBar(m) {
  const ranked = rankPlayers(m.ps);
  const mine = ranked.find((p) => p.id === m.meId);
  const num = h("span", null, mine.score.toLocaleString());
  const from = shownScore ?? mine.score;
  shownScore = mine.score;
  // Wait for the result animation on screen to finish before ticking the bar.
  if (from !== mine.score) countUp(num, from, mine.score, { delay: 2200, duration: 900 });
  return h("div", { class: "me-bar" },
    avatar(mine),
    h("span", { class: "name" }, teamMode(m) ? teamDot(mine.team) : null, mine.name, mine.doubleNext ? badge("swords", "", "badge-icon") : null),
    h("span", { class: "muted" }, `${ordinal(mine.rank)} of ${ranked.length}`),
    h("span", { class: "score" }, num, " pts"));
}

/** The big "+240" on a result, counting up from zero the first time it's shown. */
function gainBig(gain, key, cls = "") {
  const el = h("p", { class: `gain-big ${cls}`.trim() }, signed(gain));
  if (gain && once("gain:" + key)) countUp(el, 0, gain, { delay: 250, duration: 750, format: signedFormat });
  return el;
}

/** "Your total": the points just won fly into the total, which then counts up. */
function pointsFlow(m, gain, key) {
  const after = mePlayer(m).score;
  const before = after - gain;
  const total = h("span", { class: "total-num" }, after.toLocaleString());
  const fly = h("span", { class: `fly ${gain < 0 ? "minus" : "plus"}`, "aria-hidden": "true" }, signed(gain));
  if (gain && once("flow:" + key)) {
    total.textContent = before.toLocaleString();
    fly.classList.add("go");
    countUp(total, before, after, { delay: 1500, duration: 900 });
  }
  return h("div", { class: "total-row" },
    h("span", { class: "muted" }, "Your total"),
    h("span", { class: "total-wrap" }, gain ? fly : null, total));
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
    h("section", { class: "panel fill" },
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
    awayBanner(m),
    picking
      ? h("div", { class: "banner you" }, m.pending ? "Flipping your card…" : "Your turn! Pick a card.")
      : h("div", { class: "banner" }, `${nameOf(m, m.r.pickerUid)} is picking a card…`),
    boardGrid(m.r.categories, m.r.board, canPick ? (cellId) => sendAction("pick", { cellId }) : null, { compact: true }),
    picking ? h("p", { class: "muted small center" }, "Higher values are harder. Some cards hide a wildcard.") : null);
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
    answered ? null : awayBanner(m, true),
    h("div", { class: "q-meta" },
      h("span", { class: "chip" }, isFinal ? r.final.category : c.category),
      isFinal ? h("span", { class: "chip chip-accent" }, `Wager ${wager.toLocaleString()}`) : h("span", { class: "chip chip-accent" }, `${c.points} points`),
      !isFinal && c.pickerUid === m.meId ? badge("target", "Your pick: bonus if right") : null,
      !isFinal && mine.doubleNext ? badge("swords", "Double points") : null),
    timerBar(deadline, total),
    // Once answered, the answer tiles disappear so nobody nearby can copy the pick.
    answered ? null : cardVisual(isFinal ? r.final?.picture : c.picture, "question"),
    h("h2", { class: promptClass(isFinal ? r.final.prompt : c.prompt) }, isFinal ? r.final.prompt : c.prompt),
    answered
      ? lockedPanel(m.sent)
      : optionGrid(isFinal ? r.final.options : c.options, { onPick: (i) => submitAnswer(m.round, { choice: i }) }));
}

/** Shown after answering: confirms the answer is in without showing what it was. */
function lockedPanel(sent, what = "answer") {
  return h("section", { class: `panel center locked-panel fill${sent ? " sent" : ""}` },
    h("div", { class: "lock-icon" }, icon(sent ? "lock" : "clock")),
    h("h2", null, sent ? `Your ${what} is locked in` : `Sending your ${what}…`),
    h("p", { class: "muted" }, sent ? "It stays hidden until the reveal, so no peeking." : "Hang on a second."));
}

// ----- Reveal (board + final) -----
function revealView(m) {
  const r = m.r;
  const isFinal = r.status === "final-reveal";
  const res = r.reveal?.results?.[m.meId];
  const myRound = isFinal ? `g${r.game}f` : r.current?.round;
  const triedToAnswer = myRound && local.answers[myRound] !== undefined;
  let result;
  if (!res || res.choice === null) {
    result = h("div", { class: "result neutral" }, h("div", { class: "result-icon" }, icon("clock")),
      h("h2", null, triedToAnswer ? "Your answer arrived too late" : "No answer this time"),
      triedToAnswer ? h("p", { class: "result-note" }, "Answers count only if they reach the host before time runs out.") : null,
      isFinal && res?.gained ? gainBig(res.gained, `${turnKey(r)}:${m.meId}`) : null);
  } else if (res.correct) {
    result = h("div", { class: "result good" }, h("div", { class: "result-icon" }, icon("check")), h("h2", null, "Correct"),
      gainBig(res.gained, `${turnKey(r)}:${m.meId}`),
      !isFinal && r.current?.pickerUid === m.meId ? h("p", { class: "result-note" }, "Includes your picker bonus") : null,
      res.doubled ? h("p", { class: "result-note" }, "Doubled by Swords Dance") : null);
  } else {
    result = h("div", { class: "result bad" }, h("div", { class: "result-icon" }, icon("cross")), h("h2", null, "Not quite"),
      isFinal && res.gained ? gainBig(res.gained, `${turnKey(r)}:${m.meId}`) : null);
  }
  const gained = res?.gained || 0;
  return h("div", { class: "stack" },
    meBar(m),
    result,
    gained ? pointsFlow(m, gained, `${turnKey(r)}:${m.meId}`) : null,
    h("section", { class: "panel center answer-panel" },
      cardVisual(r.reveal?.picture, "reveal", "small"),
      h("div", null, h("p", { class: "muted small" }, "The answer was"), h("p", { class: "answer-text-big" }, r.reveal?.answer || ""))));
}

// ----- Leaderboard -----
function leaderboardScreen(m) {
  const ranked = rankPlayers(m.ps);
  const mine = ranked.find((p) => p.id === m.meId);
  const key = turnKey(m.r);
  const gain = m.r.gains?.[m.meId] || 0;
  const prevRank = m.r.prevRanks?.[m.meId];
  const moved = prevRank ? prevRank - mine.rank : 0;
  const fresh = once("myrank:" + key);

  // Start from where you were, then reveal the new rank once the list has moved.
  const rankEl = h("p", { class: "big-rank" }, ordinal(fresh && prevRank ? prevRank : mine.rank));
  const scoreEl = h("span", null, mine.score.toLocaleString());
  const moveEl = h("p", { class: `move ${moved > 0 ? "up" : "down"} center`, hidden: fresh ? true : !moved },
    moved ? [icon(moved > 0 ? "up" : "down"), moved > 0 ? `Up ${moved}` : `Down ${-moved}`] : null);
  if (fresh) {
    if (gain) countUp(scoreEl, mine.score - gain, mine.score, { delay: 900, duration: 900 });
    setTimeout(() => {
      rankEl.textContent = ordinal(mine.rank);
      if (moved) { rankEl.classList.add("pop"); moveEl.hidden = false; }
    }, 2300);
  }

  return h("div", { class: "stack" },
    h("section", { class: "panel center" },
      h("p", { class: "eyebrow" }, "You’re in"),
      rankEl,
      h("p", { class: "muted" }, scoreEl, " points", gain ? ` (${signed(gain)} this round)` : ""),
      moveEl),
    teamMode(m) ? h("section", { class: "panel" }, teamTotalsView(m.ps, m.r.settings.teamCount, { prevScores: m.r.prevScores, animKey: key })) : null,
    h("section", { class: "panel fill" }, animatedLeaderboard(m.ps, {
      me: m.meId, prevRanks: m.r.prevRanks, prevScores: m.r.prevScores, gains: m.r.gains, animKey: key,
      limit: 5, compact: true, showTeams: teamMode(m), holdMs: 700,
    })));
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
        ...safeTap(() => sendAction("target", { targetUid: p.id })),
      }, avatar(p), h("span", { class: "grow" }, p.name), h("span", { class: "muted" }, `${p.score.toLocaleString()} points`)))));
  } else if (mineToAct && w.type === "wheel") {
    parts.push(h("button", { class: "btn btn-primary btn-lg spin-btn", type: "button", disabled: !!m.pending, ...safeTap(() => sendAction("spin")) }, icon("wheel"), "Spin the wheel"));
  } else if (w.stage === "choose") {
    parts.push(h("p", { class: "muted" }, `Waiting for ${nameOf(m, w.by)}…`));
  } else if (w.stage === "spinning") {
    parts.push(h("p", { class: "muted" }, "The wheel is spinning. Watch the big screen!"));
  } else if (w.stage === "done") {
    const gain = m.r.gains?.[m.meId] || 0;
    parts.push(h("p", { class: "wild-summary" }, w.summary || ""),
      gain ? gainBig(gain, `${turnKey(m.r)}:wild:${m.meId}`, `center ${gain < 0 ? "minus" : "plus"}`) : null,
      gain ? pointsFlow(m, gain, `${turnKey(m.r)}:wild:${m.meId}`) : null,
      h("p", { class: "muted center small" }, "This card’s question is up next."));
  }

  return h("div", { class: "stack" },
    meBar(m),
    h("div", { class: "wild-card" },
      h("div", { class: "wild-icon" }, icon(def.icon)),
      h("p", { class: "eyebrow" }, w.by === m.meId ? "You found a wildcard!" : `${nameOf(m, w.by)} found a wildcard`),
      h("h2", null, def.name),
      h("p", null, def.text)),
    ...parts);
}

// ----- Final round: wager -----
function finalWagerView(m) {
  const mine = mePlayer(m);
  const max = maxWager(mine.score);
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
      mine.score >= FINAL_MIN_WAGER
        ? h("p", { class: "muted" }, `How much of your ${mine.score.toLocaleString()} points will you risk?`)
        : h("p", { class: "muted" }, `Everyone can wager up to ${FINAL_MIN_WAGER}. A wrong answer can’t take you below 0.`),
      value,
      slider,
      h("div", { class: "quick-wagers" },
        h("button", { class: "btn btn-ghost btn-inline", type: "button", onclick: () => setWager(0) }, "Nothing"),
        h("button", { class: "btn btn-ghost btn-inline", type: "button", onclick: () => setWager(Math.round(max / 2)) }, "Half"),
        h("button", { class: "btn btn-ghost btn-inline", type: "button", onclick: () => setWager(max) }, "All in")),
      h("button", {
        class: "btn btn-primary btn-lg", type: "button",
        ...safeTap(() => submitAnswer(m.round, { value: clampWager(wagerDraft, max) })),
      }, "Lock in wager")));
}

// ----- Podium -----
function podiumView(m) {
  const ranked = rankPlayers(m.ps);
  const mine = ranked.find((p) => p.id === m.meId);
  const tied = ranked.filter((p) => p.rank === 1).length > 1;
  if (mine.rank === 1 && !tied && once(`podium:${code}:${m.r.game}`)) setTimeout(() => confetti(60), 400);
  return h("div", { class: "stack" },
    h("section", { class: "panel center" },
      h("p", { class: "eyebrow" }, "Final result"),
      h("p", { class: "big-rank" }, mine.rank === 1 ? (tied ? "Tied 1st" : "1st") : ordinal(mine.rank)),
      mine.rank === 1 && !tied ? h("p", { class: "winner-line" }, icon("trophy"), "You won!") : null,
      h("p", { class: "muted" }, `${mine.score.toLocaleString()} pts`)),
    teamMode(m) ? h("section", { class: "panel" }, teamTotalsView(m.ps, m.r.settings.teamCount)) : null,
    h("section", { class: "panel fill" }, leaderboardView(m.ps, { me: m.meId, limit: 10, compact: true, showTeams: teamMode(m) })));
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
    return h("div", { class: "stack" }, meBar(m), lockedPanel(m.sent, "guess"));
  }
  const input = h("input", { class: "input guess-input", type: "number", inputmode: "numeric", placeholder: "Your guess", "aria-label": "Your guess" });
  return h("div", { class: "stack" },
    meBar(m),
    h("p", { class: "eyebrow center" }, "Tiebreaker: closest guess wins"),
    timerBar(deadline, total),
    h("h2", { class: promptClass(tb.prompt) }, tb.prompt),
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
    h("h2", null, tb.winner ? (won ? "You win the tiebreaker!" : `${nameOf(m, tb.winner)} wins the tiebreaker`) : "Nobody guessed!")));
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
