// Host screen. The host's browser is the referee: it keeps the hidden answers,
// runs the timers, scores every answer and moves the game from step to step.
// Players' phones only send picks and answers (see play.js).
import {
  db, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where,
  onSnapshot, writeBatch, increment, arrayUnion, serverTimestamp,
} from "./firebase.js";
import {
  h, requireUser, startTimers, timerBar, toast, leaderboardView, teamTotalsView,
  avatar, boardGrid, optionGrid, ordinal, plain,
} from "./common.js";
import { BANK } from "./questions.js";
import {
  DEFAULT_SETTINGS, TEAMS, WILDCARDS, WHEEL, FINAL_SECONDS, TIEBREAK_SECONDS, SPIN_MS,
  buildBoard, optionsFor, scoreCorrect, resolveWild, rankPlayers, makeRoomCode, shuffle,
  clampWager, smallestTeam, opponentsOf,
} from "./game.js";

const app = document.getElementById("app");

let me = null;
let code = "";
let roomRef = null;
let privRef = null;
let room = null;            // live copy of rooms/{code}
let secret = null;          // hidden contents + answers: rooms/{code}/private/host (host-only)
let players = new Map();    // id -> player doc
let answers = new Map();    // uid -> answer doc for the active round
let answersRound = null;
let answersUnsub = null;
let busy = false;
let closeTimer = null;
let allAnsweredTimer = null;
let spinTimer = null;
let lastKey = "";
let fixingPlayers = false;

const playerRef = (uid) => doc(db, "rooms", code, "players", uid);
const playerList = () => [...players.values()];
const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : typeof t === "number" ? t : null);
const teamMode = () => room?.settings?.mode === "teams";

// ---------- Start up ----------
requireUser(async (user) => {
  me = user;
  try {
    code = (new URLSearchParams(location.search).get("room") || "").toUpperCase();
    if (code) {
      const snap = await getDoc(doc(db, "rooms", code));
      if (!snap.exists() || snap.data().hostUid !== me.uid) code = "";
    }
    if (!code) {
      code = await createRoom();
      history.replaceState(null, "", `?room=${code}`);
    }
    roomRef = doc(db, "rooms", code);
    privRef = doc(db, "rooms", code, "private", "host");
    const priv = await getDoc(privRef);
    secret = priv.exists() ? priv.data() : null;
    subscribe();
  } catch (e) {
    console.error(e);
    fatal("Couldn’t open a room. Make sure the Firestore rules are published, then refresh.");
  }
});

async function createRoom() {
  for (let i = 0; i < 8; i++) {
    const c = makeRoomCode();
    const ref = doc(db, "rooms", c);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, { hostUid: me.uid, status: "lobby", settings: { ...DEFAULT_SETTINGS }, game: 0, createdAt: serverTimestamp() });
    return c;
  }
  throw new Error("Couldn’t find a free room code");
}

function subscribe() {
  onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) return fatal("This room was deleted.");
    room = snap.data({ serverTimestamps: "estimate" });
    syncAnswers();
    scheduleAutoClose();
    resumeSpin();
    fixPlayers();
    render();
  }, (e) => { console.error(e); fatal("Lost access to the room. Check the Firestore rules."); });

  onSnapshot(collection(db, "rooms", code, "players"), (snap) => {
    players = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    fixPlayers();
    checkAllAnswered();
    render();
  });

  // Picks, targets and spins sent by players' phones.
  onSnapshot(collection(db, "rooms", code, "actions"), (snap) => {
    snap.docChanges().forEach((ch) => { if (ch.type === "added") handleAction(ch.doc); });
  });

  startTimers();
}

// ---------- Answers ----------
function activeRound() {
  if (!room) return null;
  switch (room.status) {
    case "question": return room.current?.round || null;
    case "final-wager": return `g${room.game}w`;
    case "final-question": return `g${room.game}f`;
    case "tiebreak": return room.tiebreak?.round || null;
    default: return null;
  }
}

function syncAnswers() {
  const r = activeRound();
  if (!r || r === answersRound) return;
  answersUnsub?.();
  answers = new Map();
  answersRound = r;
  answersUnsub = onSnapshot(query(collection(db, "rooms", code, "answers"), where("round", "==", r)), (snap) => {
    answers = new Map(snap.docs.map((d) => [d.data().uid, d.data()]));
    patchCounts();
    checkAllAnswered();
  });
}

function expectedAnswerers() {
  if (room?.status === "tiebreak") return (room.tiebreak?.uids || []).filter((id) => players.has(id));
  return [...players.keys()];
}

function patchCounts() {
  const el = document.getElementById("answer-count");
  if (!el || !room) return;
  const exp = expectedAnswerers();
  const done = exp.filter((id) => answers.has(id)).length;
  el.textContent = room.status === "final-wager" ? `${done} / ${exp.length} wagers locked in` : `${done} / ${exp.length} answered`;
}

function checkAllAnswered() {
  clearTimeout(allAnsweredTimer);
  if (!room || !answersRound || answersRound !== activeRound()) return;
  const exp = expectedAnswerers();
  if (exp.length && exp.every((id) => answers.has(id))) {
    allAnsweredTimer = setTimeout(closeCurrent, 900);
  }
}

function scheduleAutoClose() {
  clearTimeout(closeTimer);
  if (!room) return;
  let started = null;
  let seconds = 0;
  if (room.status === "question" || room.status === "final-question") {
    started = ms(room.current?.startedAt);
    seconds = room.current?.seconds || 20;
  } else if (room.status === "tiebreak") {
    started = ms(room.tiebreak?.startedAt);
    seconds = room.tiebreak?.seconds || TIEBREAK_SECONDS;
  }
  if (!started) return;
  closeTimer = setTimeout(closeCurrent, Math.max(0, started + seconds * 1000 + 1000 - Date.now()));
}

function closeCurrent() {
  if (!room) return;
  if (room.status === "question") transition(closeQuestion);
  else if (room.status === "final-wager") transition(showFinalQuestion);
  else if (room.status === "final-question") transition(closeFinal);
  else if (room.status === "tiebreak") transition(closeTiebreak);
}

// ---------- Players' actions ----------
function handleAction(snapDoc) {
  const a = snapDoc.data();
  deleteDoc(snapDoc.ref).catch(() => {});
  if (!room) return;
  const w = room.wild;
  if (a.type === "pick" && room.status === "board" && a.uid === room.pickerUid) {
    transition(() => pickCell(a.cellId));
  } else if (a.type === "target" && room.status === "wild" && w?.type === "thief" && w.stage === "choose" && a.uid === w.by) {
    transition(() => finishWild({ target: a.targetUid }));
  } else if (a.type === "spin" && room.status === "wild" && w?.type === "wheel" && w.stage === "choose" && a.uid === w.by) {
    transition(spinWheel);
  }
}

/** Runs one game step at a time so double-clicks and timers can't collide. */
async function transition(fn) {
  if (busy) { setTimeout(() => transition(fn), 400); return; }
  busy = true;
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast("Something went wrong: " + (e.message || e));
  } finally {
    busy = false;
  }
}

// Late joiners get a turn; in team mode everyone needs a team.
function fixPlayers() {
  if (!room || fixingPlayers) return;
  const writes = [];
  if (room.status !== "lobby" && Array.isArray(room.turnOrder)) {
    const missing = [...players.keys()].filter((id) => !room.turnOrder.includes(id));
    if (missing.length) writes.push(updateDoc(roomRef, { turnOrder: arrayUnion(...missing) }));
  }
  if (teamMode()) {
    const valid = TEAMS.slice(0, room.settings.teamCount).map((t) => t.id);
    const list = playerList();
    const fixes = {};
    for (const p of list) {
      if (!valid.includes(p.team)) {
        const team = smallestTeam(list.map((q) => ({ ...q, team: fixes[q.id] || q.team })), room.settings.teamCount);
        fixes[p.id] = team;
      }
    }
    for (const [id, team] of Object.entries(fixes)) writes.push(updateDoc(playerRef(id), { team }));
  }
  if (!writes.length) return;
  fixingPlayers = true;
  Promise.all(writes).catch(console.error).finally(() => { fixingPlayers = false; });
}

// ---------- Game steps ----------
async function saveSecret() {
  await setDoc(privRef, secret);
}

function rankMap() {
  return Object.fromEntries(rankPlayers(playerList()).map((p) => [p.id, p.rank]));
}

/** Applies score changes + flags to players and updates the room in one batch. */
async function applyDeltas({ deltas = {}, flags = {} }, roomFields) {
  const batch = writeBatch(db);
  const prevRanks = rankMap();
  const gains = {};
  for (const [uid, d] of Object.entries(deltas)) {
    if (!d || !players.has(uid)) continue;
    batch.update(playerRef(uid), { score: increment(d) });
    gains[uid] = d;
  }
  for (const [uid, f] of Object.entries(flags)) {
    if (players.has(uid)) batch.update(playerRef(uid), f);
  }
  batch.update(roomRef, { ...roomFields, prevRanks, gains });
  await batch.commit();
}

function wildContext(by) {
  return {
    by,
    teamMode: teamMode(),
    players: playerList().map((p) => ({ id: p.id, name: p.name || "Trainer", score: p.score || 0, team: p.team || null })),
  };
}

function currentPicker() {
  if (players.has(room.pickerUid)) return room.pickerUid;
  return (room.turnOrder || []).find((id) => players.has(id)) || playerList()[0]?.id || null;
}

async function updateSetting(key, value) {
  await updateDoc(roomRef, { [`settings.${key}`]: value });
}

async function startGame() {
  if (room.status !== "lobby") return;
  const list = playerList();
  if (!list.length) return toast("Wait for at least one player to join.");
  const settings = { ...DEFAULT_SETTINGS, ...room.settings };
  const built = buildBoard(BANK, settings);
  const game = (room.game || 0) + 1;

  secret = { cells: built.cells, current: null, final: null };
  await saveSecret();

  const batch = writeBatch(db);
  const teamCounts = list.map((p) => ({ ...p }));
  for (const p of teamCounts) {
    const fields = { score: 0, doubleNext: false };
    if (settings.mode === "teams" && !TEAMS.slice(0, settings.teamCount).some((t) => t.id === p.team)) {
      p.team = smallestTeam(teamCounts.filter((q) => q !== p), settings.teamCount);
      fields.team = p.team;
    }
    batch.update(playerRef(p.id), fields);
  }
  const order = shuffle(list.map((p) => p.id));
  batch.update(roomRef, {
    status: "board", game, qCount: 0,
    categories: built.categories, board: built.board,
    turnOrder: order, turn: 0, pickerUid: order[0],
    current: null, reveal: null, wild: null, final: null, tiebreak: null,
    prevRanks: {}, gains: {},
  });
  await batch.commit();
}

async function pickCell(cellId) {
  if (room.status !== "board") return;
  const pub = (room.board || []).find((c) => c.id === cellId);
  if (!pub || pub.used) return;
  const cell = secret?.cells?.[cellId];
  if (!cell) return toast("This board’s hidden answers are missing. End the game and start a new one.");

  const by = currentPicker();
  const label = cell.kind === "q" ? String(cell.points) : WILDCARDS[cell.wild].icon;
  const board = room.board.map((c) => (c.id === cellId ? { ...c, used: true, label } : c));

  if (cell.kind === "q") {
    const cat = BANK.categories[cell.col];
    const q = cat.questions[cell.qIndex];
    const { options, correctIndex } = optionsFor(q);
    const qCount = (room.qCount || 0) + 1;
    const round = `g${room.game}q${qCount}`;
    secret.current = { round, correctIndex, answer: q.answer };
    await saveSecret();
    await updateDoc(roomRef, {
      status: "question", board, qCount, pickerUid: by, reveal: null, wild: null,
      current: {
        round, cellId, category: cat.name, note: cat.note || null, points: cell.points,
        prompt: q.prompt, options, pickerUid: by, seconds: room.settings.seconds || 20,
        startedAt: serverTimestamp(),
      },
    });
    return;
  }

  const def = WILDCARDS[cell.wild];
  const wild = { type: cell.wild, by, cellId, stage: def.needs ? "choose" : "done", summary: null, wheelIndex: null, spinAt: null };
  if (def.needs) {
    await updateDoc(roomRef, { status: "wild", board, pickerUid: by, wild, current: null, reveal: null });
  } else {
    const res = resolveWild(cell.wild, wildContext(by));
    await applyDeltas(res, { status: "wild", board, pickerUid: by, wild: { ...wild, summary: res.summary }, current: null, reveal: null });
  }
}

async function closeQuestion() {
  if (room.status !== "question") return;
  const c = room.current;
  if (!secret?.current || secret.current.round !== c.round) {
    const priv = await getDoc(privRef);
    secret = priv.data();
  }
  const correctIndex = secret.current.correctIndex;
  const start = ms(c.startedAt) || Date.now();
  const counts = c.options.map(() => 0);
  const results = {};
  const deltas = {};
  const flags = {};

  for (const [uid, a] of answers) {
    const p = players.get(uid);
    if (!p || a.round !== c.round || typeof a.choice !== "number") continue;
    if (a.choice >= 0 && a.choice < counts.length) counts[a.choice]++;
    const correct = a.choice === correctIndex;
    let gained = 0;
    if (correct) {
      const elapsed = (ms(a.at) || Date.now()) - start;
      gained = scoreCorrect({ points: c.points, elapsedMs: elapsed, seconds: c.seconds, isPicker: uid === c.pickerUid, doubled: !!p.doubleNext });
      deltas[uid] = gained;
      if (p.doubleNext) flags[uid] = { doubleNext: false };
    }
    results[uid] = { choice: a.choice, correct, gained, doubled: correct && !!p.doubleNext };
  }

  await applyDeltas({ deltas, flags }, {
    status: "reveal",
    reveal: { correctIndex, answer: secret.current.answer, counts, results },
  });
}

async function spinWheel() {
  const w = room.wild;
  if (room.status !== "wild" || w?.type !== "wheel" || w.stage !== "choose") return;
  const wheelIndex = Math.floor(Math.random() * WHEEL.length);
  await updateDoc(roomRef, { "wild.stage": "spinning", "wild.wheelIndex": wheelIndex, "wild.spinAt": Date.now() });
}

function resumeSpin() {
  const w = room?.wild;
  if (room?.status !== "wild" || w?.stage !== "spinning" || spinTimer) return;
  const left = (w.spinAt || 0) + SPIN_MS + 700 - Date.now();
  spinTimer = setTimeout(() => {
    spinTimer = null;
    transition(() => finishWild({}));
  }, Math.max(0, left));
}

async function finishWild({ target }) {
  const w = room.wild;
  if (room.status !== "wild" || !w || w.stage === "done") return;
  const res = resolveWild(w.type, { ...wildContext(w.by), target, wheelIndex: w.wheelIndex });
  await applyDeltas(res, { "wild.stage": "done", "wild.summary": res.summary, "wild.target": target || null });
}

function nextTurn() {
  const order = room.turnOrder || [];
  for (let i = 1; i <= order.length; i++) {
    const t = ((room.turn || 0) + i) % order.length;
    if (players.has(order[t])) return { turn: t, pickerUid: order[t] };
  }
  return { turn: 0, pickerUid: null };
}

async function next() {
  switch (room.status) {
    case "reveal":
      return updateDoc(roomRef, { status: "leaderboard" });
    case "wild":
      if (room.wild?.stage !== "done") return;
      return updateDoc(roomRef, { status: "leaderboard" });
    case "leaderboard": {
      if ((room.board || []).every((c) => c.used)) return startFinal();
      const t = nextTurn();
      return updateDoc(roomRef, { status: "board", ...t, current: null, reveal: null, wild: null });
    }
    case "final-reveal":
    case "tiebreak-reveal":
      return updateDoc(roomRef, { status: "podium" });
  }
}

// ---------- Final round ----------
async function startFinal() {
  if (!BANK.final) return updateDoc(roomRef, { status: "podium" });
  const { options, correctIndex } = optionsFor(BANK.final);
  secret.final = { options, correctIndex, answer: BANK.final.answer };
  await saveSecret();
  await updateDoc(roomRef, {
    status: "final-wager", pickerUid: null, current: null, reveal: null, wild: null,
    final: { category: BANK.final.category },
  });
}

async function showFinalQuestion() {
  if (room.status !== "final-wager") return;
  if (!secret?.final) secret = (await getDoc(privRef)).data();
  const wagers = {};
  for (const p of playerList()) {
    const a = answers.get(p.id);
    wagers[p.id] = a && a.round === `g${room.game}w` ? clampWager(a.value, p.score) : 0;
  }
  await updateDoc(roomRef, {
    status: "final-question",
    final: { category: BANK.final.category, prompt: BANK.final.prompt, options: secret.final.options, wagers },
    current: { round: `g${room.game}f`, seconds: FINAL_SECONDS, startedAt: serverTimestamp() },
  });
}

async function closeFinal() {
  if (room.status !== "final-question") return;
  if (!secret?.final) secret = (await getDoc(privRef)).data();
  const { correctIndex, answer } = secret.final;
  const wagers = room.final?.wagers || {};
  const counts = room.final.options.map(() => 0);
  const results = {};
  const deltas = {};
  for (const p of playerList()) {
    const a = answers.get(p.id);
    const choice = a && a.round === `g${room.game}f` && typeof a.choice === "number" ? a.choice : null;
    if (choice !== null && choice < counts.length) counts[choice]++;
    const correct = choice === correctIndex;
    const wager = clampWager(wagers[p.id], p.score);
    const gained = correct ? wager : -wager;
    if (gained) deltas[p.id] = gained;
    results[p.id] = { choice, correct, wager, gained };
  }
  await applyDeltas({ deltas }, { status: "final-reveal", reveal: { correctIndex, answer, counts, results } });
}

// ---------- Tiebreaker ----------
function tiedLeaders() {
  const ranked = rankPlayers(playerList());
  return ranked.filter((p) => p.rank === 1).map((p) => p.id);
}

async function startTiebreak() {
  const uids = tiedLeaders();
  if (uids.length < 2 || !BANK.tiebreaker) return;
  const n = (room.tiebreak?.n || 0) + 1;
  await updateDoc(roomRef, {
    status: "tiebreak",
    tiebreak: { n, round: `g${room.game}t${n}`, prompt: BANK.tiebreaker.prompt, uids, seconds: TIEBREAK_SECONDS, startedAt: serverTimestamp() },
  });
}

async function closeTiebreak() {
  if (room.status !== "tiebreak") return;
  const tb = room.tiebreak;
  const target = BANK.tiebreaker.answer;
  const entries = tb.uids.map((uid) => {
    const a = answers.get(uid);
    const ok = a && a.round === tb.round && Number.isFinite(a.value);
    return { uid, value: ok ? a.value : null, at: ok ? ms(a.at) || Infinity : Infinity };
  });
  const ranked = entries
    .filter((e) => e.value !== null)
    .sort((x, y) => Math.abs(x.value - target) - Math.abs(y.value - target) || x.at - y.at);
  const winner = ranked[0]?.uid || null;
  const results = Object.fromEntries(entries.map((e) => [e.uid, e.value]));
  await applyDeltas({ deltas: winner ? { [winner]: 1 } : {} }, {
    status: "tiebreak-reveal",
    "tiebreak.results": results,
    "tiebreak.answer": target,
    "tiebreak.winner": winner,
  });
}

// ---------- Rendering ----------
// Each snapshot rebuilds the screen only if something visible changed.
function render() {
  if (!room) return;
  const r = plain(room);
  const ps = playerList().map((p) => ({
    id: p.id, name: p.name || "Trainer", score: p.score || 0, team: p.team || null, photo: p.photo || "", doubleNext: !!p.doubleNext,
  }));
  const key = JSON.stringify({ r, ps });
  if (key === lastKey) return patchCounts();
  lastKey = key;
  const view = VIEWS[r.status] || lobbyView;
  app.replaceChildren(view(r, ps));
  patchCounts();
}

function fatal(message) {
  lastKey = "";
  app.replaceChildren(h("div", { class: "panel center narrow" },
    h("h2", null, "Hmm…"), h("p", null, message), h("a", { class: "btn btn-primary", href: "index.html" }, "Back to start")));
}

const btn = (label, onclick, cls = "btn-primary") => h("button", { class: `btn ${cls} btn-inline`, type: "button", onclick }, label);

function endGameButton() {
  return h("button", {
    class: "btn-link", type: "button",
    onclick: () => { if (confirm("End the game now and show the final standings?")) transition(() => updateDoc(roomRef, { status: "podium" })); },
  }, "End game");
}

function nameOf(ps, id) {
  return ps.find((p) => p.id === id)?.name || "Someone";
}

// ----- Lobby -----
function lobbyView(r, ps) {
  const s = { ...DEFAULT_SETTINGS, ...r.settings };
  const joinUrl = new URL(`play.html?code=${code}`, location.href).href;
  const siteUrl = new URL(".", location.href).href.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(joinUrl)}`;

  const select = (key, values, labelFn) => h("select", {
    class: "input", onchange: (e) => updateSetting(key, key === "mode" ? e.target.value : Number(e.target.value)),
  }, values.map((v) => h("option", { value: String(v), selected: s[key] === v }, labelFn(v))));

  const settings = h("section", { class: "panel" },
    h("h3", null, "Game settings"),
    h("label", { class: "field" }, h("span", null, "Play as"),
      select("mode", ["solo", "teams"], (v) => (v === "solo" ? "Everyone for themselves" : "Teams"))),
    s.mode === "teams"
      ? h("label", { class: "field" }, h("span", null, "Number of teams"), select("teamCount", [2, 3, 4], (v) => `${v} teams`))
      : null,
    h("label", { class: "field" }, h("span", null, "Time per question"), select("seconds", [15, 20, 30, 45], (v) => `${v} seconds`)),
    h("label", { class: "field check" },
      h("input", { type: "checkbox", checked: s.wildcards, onchange: (e) => updateSetting("wildcards", e.target.checked) }),
      h("span", null, "Include wildcards (one hidden in each column)")));

  const personRow = (p) => h("li", null, avatar(p), h("span", { class: "name" }, p.name),
    h("button", {
      class: "btn-link kick", type: "button", title: `Remove ${p.name}`,
      onclick: () => { if (confirm(`Remove ${p.name} from the room?`)) deleteDoc(playerRef(p.id)); },
    }, "✕"));

  let roster;
  if (s.mode === "teams") {
    roster = h("div", { class: "team-columns" },
      TEAMS.slice(0, s.teamCount).map((t) => h("div", { class: "team-col" },
        h("h4", null, h("span", { class: "team-dot", style: { background: t.color } }), t.name),
        h("ul", { class: "roster" }, ps.filter((p) => p.team === t.id).map(personRow)))),
      ps.some((p) => !TEAMS.slice(0, s.teamCount).some((t) => t.id === p.team))
        ? h("p", { class: "muted small" }, "Players without a team are placed automatically.")
        : null);
  } else {
    roster = h("ul", { class: "roster" }, ps.map(personRow));
  }

  return h("div", { class: "lobby" },
    h("section", { class: "panel join-card center" },
      h("p", { class: "eyebrow" }, "Join on your phone"),
      h("p", { class: "join-url" }, siteUrl),
      h("p", { class: "room-code", "aria-label": `Room code ${code.split("").join(" ")}` }, code),
      h("img", { class: "qr", src: qr, alt: "QR code to join", width: "240", height: "240", onerror: (e) => { e.target.hidden = true; } })),
    h("div", { class: "lobby-side" },
      h("section", { class: "panel" },
        h("h3", null, `Players (${ps.length})`),
        ps.length ? roster : h("p", { class: "muted" }, "Waiting for players to join…"),
        h("button", { class: "btn btn-primary btn-lg", type: "button", disabled: !ps.length, onclick: () => transition(startGame) }, "Start game")),
      settings));
}

// ----- Board -----
function boardView(r, ps) {
  const picker = ps.find((p) => p.id === r.pickerUid);
  return h("div", { class: "board-screen" },
    h("div", { class: "banner" },
      picker ? [avatar(picker), h("span", null, h("strong", null, picker.name), " is picking a card…")] : h("span", null, "Pick a card")),
    boardGrid(r.categories, r.board, (cellId) => transition(() => pickCell(cellId))),
    h("div", { class: "host-footer" },
      h("span", { class: "muted small" }, "Click a card to pick on someone’s behalf."),
      endGameButton()));
}

// ----- Question (board + final) -----
function questionView(r, ps) {
  const isFinal = r.status === "final-question";
  const c = r.current || {};
  const total = (c.seconds || 20) * 1000;
  const deadline = (c.startedAt || Date.now()) + total;
  const picker = ps.find((p) => p.id === c.pickerUid);
  return h("div", { class: "question-screen" },
    h("div", { class: "q-meta" },
      h("span", { class: "chip" }, isFinal ? `Final round · ${r.final.category}` : c.category),
      isFinal ? h("span", { class: "chip chip-accent" }, "Wagers on the line") : h("span", { class: "chip chip-accent" }, `${c.points} pts`),
      picker ? h("span", { class: "chip" }, `Picked by ${picker.name}`) : null,
      h("span", { class: "countdown big-count", dataset: { deadline: String(deadline), total: String(total) } })),
    timerBar(deadline, total),
    c.note ? h("p", { class: "muted small center" }, c.note) : null,
    h("h2", { class: "prompt" }, isFinal ? r.final.prompt : c.prompt),
    optionGrid(isFinal ? r.final.options : c.options),
    h("div", { class: "host-footer" },
      h("span", { id: "answer-count", class: "muted" }),
      btn("Reveal now", closeCurrent, "btn-ghost")));
}

// ----- Reveal (board + final) -----
function revealView(r, ps) {
  const isFinal = r.status === "final-reveal";
  const c = r.current || {};
  const rv = r.reveal || {};
  const results = rv.results || {};
  const options = isFinal ? r.final.options : c.options;

  let detail;
  if (isFinal) {
    detail = h("ul", { class: "result-list" },
      [...ps].sort((a, b) => (results[b.id]?.gained || 0) - (results[a.id]?.gained || 0)).map((p) => {
        const res = results[p.id] || { wager: 0, gained: 0, correct: false };
        return h("li", null, avatar(p), h("span", { class: "name" }, p.name),
          h("span", { class: "muted small" }, `wagered ${res.wager}`),
          h("span", { class: `gain ${res.gained > 0 ? "plus" : res.gained < 0 ? "minus" : ""}` },
            res.correct ? `✓ +${res.gained}` : res.gained ? `✗ ${res.gained}` : "✗ 0"));
      }));
  } else {
    const right = ps.filter((p) => results[p.id]?.correct).sort((a, b) => results[b.id].gained - results[a.id].gained);
    const answered = Object.keys(results).length;
    detail = h("div", null,
      h("p", { class: "center muted" }, `${right.length} of ${answered || 0} answers were correct`),
      right.length ? h("ul", { class: "result-list" }, right.map((p, i) => h("li", null,
        avatar(p), h("span", { class: "name" }, p.name),
        i === 0 ? h("span", { class: "badge" }, "⚡ fastest") : null,
        p.id === c.pickerUid ? h("span", { class: "badge" }, "🎯 picker bonus") : null,
        results[p.id].doubled ? h("span", { class: "badge" }, "⚔️ ×2") : null,
        h("span", { class: "gain plus" }, `+${results[p.id].gained}`)))) : null);
  }

  return h("div", { class: "question-screen" },
    h("div", { class: "q-meta" },
      h("span", { class: "chip" }, isFinal ? `Final round · ${r.final.category}` : c.category),
      !isFinal ? h("span", { class: "chip chip-accent" }, `${c.points} pts`) : null),
    h("h2", { class: "prompt" }, isFinal ? r.final.prompt : c.prompt),
    optionGrid(options, { correctIndex: rv.correctIndex, counts: rv.counts }),
    h("section", { class: "panel" }, detail),
    h("div", { class: "host-footer" }, h("span"), btn(isFinal ? "Final standings" : "Leaderboard", () => transition(next))));
}

// ----- Leaderboard -----
function leaderboardScreen(r, ps) {
  const left = (r.board || []).filter((c) => !c.used).length;
  const tm = r.settings?.mode === "teams";
  return h("div", { class: "leaderboard-screen" },
    h("h2", { class: "center" }, "Leaderboard"),
    tm ? h("section", { class: "panel" }, teamTotalsView(ps, r.settings.teamCount)) : null,
    h("section", { class: "panel" }, leaderboardView(ps, { prevRanks: r.prevRanks, gains: r.gains, showTeams: tm, limit: 12 })),
    h("div", { class: "host-footer" },
      h("span", { class: "muted" }, left ? `${left} card${left === 1 ? "" : "s"} left on the board` : "Board cleared!"),
      endGameButton(),
      btn(left ? "Next turn" : BANK.final ? "Final round" : "Final standings", () => transition(next))));
}

// ----- Wildcards -----
function wheelView(w) {
  const n = WHEEL.length;
  const slice = 360 / n;
  const colors = ["#003e7e", "#ffd200", "#2f6fd6", "#d6453d", "#1e9e5a", "#ffd200", "#7b3fb8", "#e07a00"];
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "-102 -102 204 204");
  svg.setAttribute("class", "wheel-svg");
  WHEEL.forEach((s, i) => {
    const a0 = ((i * slice - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * slice - 90) * Math.PI) / 180;
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", `M0 0 L${100 * Math.cos(a0)} ${100 * Math.sin(a0)} A100 100 0 0 1 ${100 * Math.cos(a1)} ${100 * Math.sin(a1)} Z`);
    path.setAttribute("fill", colors[i % colors.length]);
    path.setAttribute("stroke", "#fff");
    path.setAttribute("stroke-width", "1.5");
    svg.append(path);
    const text = document.createElementNS(svgNS, "text");
    const mid = (i + 0.5) * slice - 90;
    // Flip labels on the left half so none of them read upside down.
    const flip = Math.cos((mid * Math.PI) / 180) < -0.01 ? " rotate(180)" : "";
    text.setAttribute("transform", `rotate(${mid}) translate(60 0)${flip}`);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("font-size", "11");
    text.setAttribute("font-weight", "700");
    text.setAttribute("fill", colors[i % colors.length] === "#ffd200" ? "#003e7e" : "#ffffff");
    text.textContent = s.short;
    svg.append(text);
  });
  const hub = document.createElementNS(svgNS, "circle");
  hub.setAttribute("r", "12");
  hub.setAttribute("fill", "#ffffff");
  hub.setAttribute("stroke", "#003e7e");
  hub.setAttribute("stroke-width", "3");
  svg.append(hub);

  const rot = h("div", { class: "wheel-rot" }, svg);
  if (w.wheelIndex != null) {
    const target = 360 * 6 - (w.wheelIndex + 0.5) * slice;
    if (w.stage === "spinning") {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        rot.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.85, 0.25, 1)`;
        rot.style.transform = `rotate(${target}deg)`;
      }));
    } else {
      rot.style.transform = `rotate(${target}deg)`;
    }
  }
  return h("div", { class: "wheel" }, h("div", { class: "wheel-pointer" }), rot);
}

function wildView(r, ps) {
  const w = r.wild;
  const def = WILDCARDS[w.type];
  const by = ps.find((p) => p.id === w.by);
  const parts = [];

  if (w.stage === "choose" && w.type === "thief") {
    const opp = opponentsOf(w.by, ps, r.settings?.mode === "teams");
    parts.push(
      h("p", { class: "muted" }, `Waiting for ${by?.name || "the picker"} to choose on their phone… or choose for them:`),
      h("div", { class: "target-list" }, opp.map((p) => h("button", {
        class: "btn btn-ghost btn-inline", type: "button",
        onclick: () => transition(() => finishWild({ target: p.id })),
      }, `${p.name} · ${p.score}`))));
    if (!opp.length) parts.push(btn("Continue", () => transition(() => finishWild({}))));
  }
  if (w.stage === "choose" && w.type === "wheel") {
    parts.push(h("p", { class: "muted" }, `${by?.name || "The picker"} can spin from their phone.`), btn("Spin for them", () => transition(spinWheel)));
  }
  if (w.stage === "spinning") parts.push(h("p", { class: "muted" }, "Spinning…"));
  if (w.stage === "done") {
    parts.push(
      h("p", { class: "wild-summary" }, w.summary || ""),
      h("div", { class: "host-footer" }, h("span"), btn("Leaderboard", () => transition(next))));
  }

  return h("div", { class: "wild-screen center" },
    h("div", { class: "wild-row" },
      h("div", { class: "wild-card" },
        h("div", { class: "wild-icon", "aria-hidden": "true" }, def.icon),
        h("p", { class: "eyebrow" }, "Wildcard!"),
        h("h2", null, def.name),
        h("p", null, def.text),
        by ? h("p", { class: "muted small" }, `Found by ${by.name}`) : null),
      w.type === "wheel" ? wheelView(w) : null),
    ...parts);
}

// ----- Final wager -----
function finalWagerView(r) {
  return h("div", { class: "final-screen center" },
    h("p", { class: "eyebrow" }, "Final round"),
    h("h2", { class: "final-category" }, r.final.category),
    h("p", null, "Everyone: choose how much of your score to wager on your phone. Get it right to win your wager, get it wrong to lose it."),
    h("p", { id: "answer-count", class: "muted" }),
    btn("Show the question", () => transition(showFinalQuestion)));
}

// ----- Podium -----
function podiumView(r, ps) {
  const ranked = rankPlayers(ps);
  const tied = ranked.filter((p) => p.rank === 1).length > 1;
  const top = ranked.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const tm = r.settings?.mode === "teams";

  return h("div", { class: "podium-screen center" },
    h("h2", null, tied ? "It’s a tie for first!" : "Final standings"),
    tm && ps.length ? h("section", { class: "panel" }, teamTotalsView(ps, r.settings.teamCount)) : null,
    h("div", { class: "podium" }, order.map((p) => h("div", { class: `podium-spot place-${p.rank}` },
      avatar(p, "lg"),
      h("strong", null, p.name),
      h("span", { class: "muted" }, `${p.score.toLocaleString()} pts`),
      h("div", { class: "podium-block" }, ordinal(p.rank))))),
    h("section", { class: "panel" }, leaderboardView(ps, { showTeams: tm })),
    h("div", { class: "host-footer" },
      tied && BANK.tiebreaker ? btn("Play the tiebreaker", () => transition(startTiebreak)) : h("span"),
      btn("Play again", () => transition(() => updateDoc(roomRef, { status: "lobby" })), tied ? "btn-ghost" : "btn-primary")));
}

// ----- Tiebreaker -----
function tiebreakView(r, ps) {
  const tb = r.tiebreak;
  const total = (tb.seconds || TIEBREAK_SECONDS) * 1000;
  const deadline = (tb.startedAt || Date.now()) + total;
  return h("div", { class: "question-screen center" },
    h("p", { class: "eyebrow" }, "Tiebreaker · closest guess wins"),
    h("span", { class: "countdown big-count", dataset: { deadline: String(deadline), total: String(total) } }),
    timerBar(deadline, total),
    h("h2", { class: "prompt" }, tb.prompt),
    h("p", null, tb.uids.map((id) => nameOf(ps, id)).join(" vs ")),
    h("div", { class: "host-footer" }, h("span", { id: "answer-count", class: "muted" }), btn("Reveal now", closeCurrent, "btn-ghost")));
}

function tiebreakRevealView(r, ps) {
  const tb = r.tiebreak;
  return h("div", { class: "question-screen center" },
    h("p", { class: "eyebrow" }, "Tiebreaker"),
    h("h2", { class: "prompt" }, tb.prompt),
    h("p", { class: "big-answer" }, String(tb.answer)),
    h("ul", { class: "result-list" }, tb.uids.map((id) => {
      const v = tb.results?.[id];
      return h("li", { class: id === tb.winner ? "me" : null },
        h("span", { class: "name" }, nameOf(ps, id)),
        h("span", null, v == null ? "no guess" : `guessed ${v} (off by ${Math.abs(v - tb.answer)})`),
        id === tb.winner ? h("span", { class: "badge" }, "🏆 winner") : null);
    })),
    h("div", { class: "host-footer" }, h("span"), btn("Final standings", () => transition(next))));
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
