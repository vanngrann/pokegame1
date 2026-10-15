// Shared helpers for every page: DOM building, sign-in gate, timers, leaderboards.
import { watchAuth, logOut, reconnect } from "./firebase.js";
import { TEAMS, OPTION_SHAPES, rankPlayers, teamTotals } from "./game.js";
import { icon, cardEmblem } from "./icons.js";

export { icon };

export const $ = (id) => document.getElementById(id);

/** Converts Firestore Timestamps to plain milliseconds, deeply. */
export function plain(v) {
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) o[k] = plain(v[k]);
    return o;
  }
  return v;
}

/** Tiny element builder: h("button", { class: "btn", onclick }, "Text") */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (typeof v !== "string" && k in el) el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

// ---------- Sign-in gate ----------
/** Runs onReady(user) once signed in. Signed-out visitors go to the sign-in page and come back after. */
export function requireUser(onReady) {
  let firstUid = null;
  watchAuth((user) => {
    if (!user) {
      const here = location.pathname.split("/").pop() + location.search;
      location.replace("index.html?next=" + encodeURIComponent(here));
      return;
    }
    // Sign-in is shared by every tab in this browser. If another tab signs in as someone
    // else, this tab would quietly start acting as that person, so stop and explain instead.
    if (firstUid && user.uid !== firstUid) return accountSwitched();
    renderUserChip(user);
    if (!firstUid) {
      firstUid = user.uid;
      onReady(user);
    }
  });
}

function accountSwitched() {
  const app = $("app") || document.querySelector("main");
  app.replaceChildren(h("div", { class: "panel center narrow" },
    h("h2", null, "You signed in as someone else in another tab"),
    h("p", null, "Every tab in this browser shares one sign-in, so this tab can’t keep playing as before."),
    h("p", { class: "muted" }, "To test as a second player, use a private window or another device."),
    h("button", { class: "btn btn-primary", type: "button", onclick: () => location.reload() }, "Reload this tab")));
  document.dispatchEvent(new CustomEvent("tt-account-switched"));
}

export function renderUserChip(user) {
  const chip = $("user-chip");
  if (!chip) return;
  if (!user) { chip.hidden = true; return; }
  chip.hidden = false;
  $("user-name").textContent = user.isAnonymous ? "Guest" : user.displayName || "Trainer";
  const photo = $("user-photo");
  if (user.photoURL) { photo.src = user.photoURL; photo.hidden = false; } else { photo.hidden = true; }
  const btn = $("btn-signout");
  if (!btn.dataset.wired) {
    btn.dataset.wired = "1";
    btn.addEventListener("click", async () => {
      await logOut();
      location.href = "index.html";
    });
  }
}

// ---------- Staying connected ----------
/**
 * Keeps a game page live without manual refreshes:
 *  - reconnects when the tab comes back to the screen or the network returns
 *  - reloads if the page was restored from the browser's back/forward cache (it would be frozen)
 *  - keeps the screen awake during a game where the browser allows it
 * onResume runs after each reconnect so the page can catch up (e.g. close an overdue question).
 */
export function stayConnected(onResume) {
  let wakeLock = null;
  const keepAwake = async () => {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible" && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      }
    } catch { /* not supported or not allowed: fine */ }
  };
  const resume = async () => {
    await reconnect();
    onResume?.();
    keepAwake();
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resume(); });
  window.addEventListener("online", resume);
  window.addEventListener("focus", keepAwake);
  window.addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });
  keepAwake();
  return resume;
}

/**
 * Watches for a page that never finishes loading: reconnects once, then reloads.
 * Call done() as soon as live data arrives.
 */
export function loadWatchdog({ reconnectAfter = 6000, reloadAfter = 15000 } = {}) {
  let done = false;
  const t1 = setTimeout(() => { if (!done) reconnect(); }, reconnectAfter);
  const t2 = setTimeout(() => {
    if (done) return;
    // Reload at most twice in two minutes, so a real outage doesn't loop forever.
    const key = "tt-reloads";
    const now = Date.now();
    let recent = [];
    try { recent = JSON.parse(sessionStorage.getItem(key) || "[]").filter((t) => now - t < 120000); } catch { /* ignore */ }
    if (recent.length >= 2) return toast("Still can’t reach the game. Check your connection, then refresh.");
    recent.push(now);
    try { sessionStorage.setItem(key, JSON.stringify(recent)); } catch { /* ignore */ }
    location.reload();
  }, reloadAfter);
  return () => { done = true; clearTimeout(t1); clearTimeout(t2); };
}

// ---------- Small storage wrapper (never throws) ----------
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode or full: ignore */ }
  },
};

// ---------- Countdown timers ----------
// Any element with data-deadline (ms) and data-total (ms) is animated:
//   .timer-bar shrinks, .countdown shows whole seconds left.
let timersRunning = false;
export function startTimers() {
  if (timersRunning) return;
  timersRunning = true;
  const tick = () => {
    const now = Date.now();
    document.querySelectorAll("[data-deadline]").forEach((el) => {
      const left = Math.max(0, Number(el.dataset.deadline) - now);
      const total = Number(el.dataset.total) || 1;
      if (el.classList.contains("timer-bar")) {
        const f = left / total;
        el.style.transform = `scaleX(${f})`;
        el.classList.toggle("low", f < 0.3);
      } else {
        el.textContent = Math.ceil(left / 1000);
        el.classList.toggle("urgent", left > 0 && left <= 5000);
      }
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function timerBar(deadline, totalMs) {
  return h("div", { class: "timer", "aria-hidden": "true" },
    h("div", { class: "timer-bar", dataset: { deadline: String(deadline), total: String(totalMs) } }));
}

// ---------- Toast ----------
export function toast(message) {
  let el = $("toast");
  if (!el) { el = h("div", { id: "toast", class: "toast", role: "status" }); document.body.append(el); }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3500);
}

// ---------- People ----------
export function teamOf(id) {
  return TEAMS.find((t) => t.id === id) || null;
}

// Initials avatars get a steady color from the player's name.
const AVATAR_COLORS = ["#2f6fd6", "#d6453d", "#13a57a", "#8a4fd8", "#e07a00", "#0f8fa8", "#c2407a", "#5b6b8a"];
function colorFor(name) {
  let n = 0;
  for (const ch of String(name)) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

export function avatar(p, size = "") {
  if (p.photo) return h("img", { class: `avatar ${size}`, alt: "", src: p.photo, referrerpolicy: "no-referrer" });
  return h("span", { class: `avatar avatar-fallback ${size}`, style: { background: colorFor(p.name || "?") } },
    (p.name || "?").charAt(0).toUpperCase());
}

/** Small labelled pill with an icon, e.g. badge("bolt", "Fastest"). */
export function badge(iconName, text, cls = "") {
  return h("span", { class: `badge ${cls}`.trim() }, icon(iconName), text ? h("span", null, text) : null);
}

export function teamDot(teamId) {
  const t = teamOf(teamId);
  return t ? h("span", { class: "team-dot", style: { background: t.color }, title: t.name }) : null;
}

// ---------- Animation helpers ----------
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Each animation plays once. Redrawing the same screen later shows the end state instead.
const played = new Set();
export function once(key) {
  if (played.has(key)) return false;
  played.add(key);
  return true;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => 1 - Math.pow(1 - t, 3);

/** Counts an element's number from `from` to `to`. */
export function countUp(el, from, to, { duration = 900, delay = 0, format = (n) => Math.round(n).toLocaleString() } = {}) {
  if (reducedMotion() || from === to) { el.textContent = format(to); return Promise.resolve(); }
  el.textContent = format(from);
  return wait(delay).then(() => new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      el.textContent = format(from + (to - from) * ease(p));
      if (p < 1) requestAnimationFrame(step);
      else { el.classList.remove("counted"); void el.offsetWidth; el.classList.add("counted"); resolve(); }
    };
    requestAnimationFrame(step);
  }));
}
export const signedFormat = (n) => signed(Math.round(n));

/** Gives each child a --i index so CSS can stagger their entrance. */
export function stagger(el) {
  [...el.children].forEach((c, i) => c.style.setProperty("--i", i));
  return el;
}

/**
 * Scores as they should look right now. The room stores each player's score from before
 * the latest change (prevScores) plus the change (gains), so every screen shows the same
 * numbers even if the players' own updates arrive a moment later.
 */
export function displayScores(players, room) {
  const prev = room?.prevScores;
  if (!prev) return players;
  return players.map((p) => {
    const gain = room.gains?.[p.id] || 0;
    // The player's own update hasn't arrived yet: show where it's about to land.
    if (gain && prev[p.id] != null && p.score === prev[p.id]) return { ...p, score: prev[p.id] + gain };
    return p;
  });
}

/** A short burst of falling confetti in the brand colors. */
export function confetti(count = 70) {
  if (reducedMotion()) return;
  const colors = ["#ffd200", "#2f6fd6", "#e5484d", "#13a57a", "#ffffff", "#f5b700"];
  const layer = h("div", { class: "confetti", "aria-hidden": "true" });
  for (let i = 0; i < count; i++) {
    const bit = h("i");
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${Math.random() * 0.9}s`;
    bit.style.animationDuration = `${2.4 + Math.random() * 1.8}s`;
    bit.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
    bit.style.setProperty("--spin", `${(Math.random() - 0.5) * 1080}deg`);
    layer.append(bit);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 5200);
}

/**
 * Ranked list of players.
 * opts: { me, prevRanks, gains, limit, showTeams, compact, from, twoCol }
 *   from:   skip the first N places (the podium already shows them)
 *   twoCol: two columns once there are more than 5 rows (keeps the big screen from scrolling)
 */
export function leaderboardView(players, opts = {}) {
  const ranked = rankPlayers(players).slice(opts.from || 0);
  let rows = ranked;
  if (opts.limit && ranked.length > opts.limit) {
    rows = ranked.slice(0, opts.limit);
    const mine = ranked.find((p) => p.id === opts.me);
    if (mine && !rows.includes(mine)) rows = [...rows, mine];
  }
  if (!rows.length) return opts.from ? null : h("p", { class: "muted center" }, "No players yet.");
  const extra = ranked.length - rows.length;
  const twoCol = opts.twoCol && rows.length > (opts.twoColAfter ?? 5);
  const cls = ["leaderboard", opts.compact ? "compact" : "", twoCol ? "two-col" : ""].join(" ").trim();

  const list = h("ol", { class: cls },
    rows.map((p) => {
      const gain = opts.gains?.[p.id] || 0;
      const prev = opts.prevRanks?.[p.id];
      const moved = prev ? prev - p.rank : 0;
      return h("li", { class: [p.id === opts.me ? "me" : "", p.rank <= 3 ? `top top-${p.rank}` : ""].join(" ").trim() || null },
        h("span", { class: "rank" }, p.rank),
        avatar(p),
        h("span", { class: "name" },
          opts.showTeams ? teamDot(p.team) : null,
          p.name || "Trainer",
          p.doubleNext ? badge("swords", "", "badge-icon") : null),
        moved > 0 ? h("span", { class: "move up", title: `Up ${moved}` }, icon("up"), moved)
          : moved < 0 ? h("span", { class: "move down", title: `Down ${-moved}` }, icon("down"), -moved) : null,
        gain ? h("span", { class: `gain ${gain > 0 ? "plus" : "minus"}` }, signed(gain)) : null,
        h("span", { class: "score" }, (p.score || 0).toLocaleString()));
    }));
  if (twoCol) list.style.setProperty("--half", Math.ceil(rows.length / 2));
  return extra > 0 && !opts.me ? h("div", null, list, h("p", { class: "muted small center more-note" }, `and ${extra} more`)) : list;
}

/**
 * Team bars. With opts.prevScores + opts.animKey the bars and totals grow from
 * where they were before this turn.
 */
function boardRow(p, opts, score, rank) {
  const scoreEl = h("span", { class: "score" }, score.toLocaleString());
  const rankEl = h("span", { class: "rank" }, rank);
  const gainEl = h("span", { class: "gain" });
  const moveEl = h("span", { class: "move" });
  const li = h("li", { class: [p.id === opts.me ? "me" : "", rank <= 3 ? `top top-${rank}` : ""].join(" ").trim() || null },
    rankEl, avatar(p),
    h("span", { class: "name" }, opts.showTeams ? teamDot(p.team) : null, p.name || "Trainer",
      p.doubleNext ? badge("swords", "", "badge-icon") : null),
    moveEl, gainEl, scoreEl);
  return { li, rankEl, scoreEl, gainEl, moveEl };
}

function setRank(row, rank) {
  row.rankEl.textContent = rank;
  row.li.classList.remove("top", "top-1", "top-2", "top-3");
  if (rank <= 3) row.li.classList.add("top", `top-${rank}`);
}

/**
 * The leaderboard with motion: it opens in the previous order with the old scores,
 * each player's gain pops in, scores count up, then rows glide to their new places.
 * Plays once per opts.animKey; otherwise it's the plain leaderboardView.
 * opts: leaderboardView options plus { prevScores, animKey }
 */
export function animatedLeaderboard(players, opts = {}) {
  const prev = opts.prevScores || {};
  const gains = opts.gains || {};
  const changed = players.some((p) => gains[p.id]);
  if (!opts.animKey || !changed || reducedMotion() || !once("lb:" + opts.animKey)) return leaderboardView(players, opts);

  const oldPlayers = players.map((p) => ({ ...p, score: prev[p.id] ?? p.score - (gains[p.id] || 0) }));
  const pick = (ranked) => {
    if (!opts.limit || ranked.length <= opts.limit) return ranked;
    const rows = ranked.slice(0, opts.limit);
    const mine = ranked.find((p) => p.id === opts.me);
    return mine && !rows.includes(mine) ? [...rows, mine] : rows;
  };
  const oldRanked = rankPlayers(oldPlayers);
  const newRanked = rankPlayers(players);
  const oldRows = pick(oldRanked);
  const newRows = pick(newRanked);
  const newById = new Map(newRanked.map((p) => [p.id, p]));
  const oldRankOf = new Map(oldRanked.map((p) => [p.id, p.rank]));

  const twoCol = opts.twoCol && Math.max(oldRows.length, newRows.length) > (opts.twoColAfter ?? 5);
  const list = h("ol", { class: ["leaderboard", "animated", opts.compact ? "compact" : "", twoCol ? "two-col" : ""].join(" ").trim() });
  if (twoCol) list.style.setProperty("--half", Math.ceil(Math.max(oldRows.length, newRows.length) / 2));

  const rows = new Map();
  for (const p of oldRows) {
    const row = boardRow(newById.get(p.id), opts, p.score, p.rank);
    rows.set(p.id, row);
    list.append(row.li);
  }

  (async () => {
    await wait(opts.holdMs ?? 900);
    // 1. Gains pop in and scores count up.
    for (const [id, row] of rows) {
      const g = gains[id] || 0;
      if (!g) continue;
      row.gainEl.textContent = signed(g);
      row.gainEl.className = `gain pop ${g > 0 ? "plus" : "minus"}`;
      countUp(row.scoreEl, oldPlayers.find((p) => p.id === id).score, newById.get(id).score, { duration: 900 });
    }
    await wait(1300);
    if (!list.isConnected) return;

    // 2. Glide to the new order (FLIP: measure, reorder, play the difference back).
    const first = new Map([...rows].map(([id, r]) => [id, r.li.getBoundingClientRect()]));
    const keep = new Set(newRows.map((p) => p.id));
    for (const [id, row] of rows) if (!keep.has(id)) { row.li.remove(); rows.delete(id); }
    for (const p of newRows) {
      let row = rows.get(p.id);
      if (!row) {
        row = boardRow(p, opts, p.score, p.rank);
        row.li.classList.add("enter");
        rows.set(p.id, row);
      }
      list.append(row.li); // appending in order moves existing rows too
      setRank(row, p.rank);
      const moved = (oldRankOf.get(p.id) ?? p.rank) - p.rank;
      if (moved) {
        row.moveEl.className = `move ${moved > 0 ? "up" : "down"}`;
        row.moveEl.replaceChildren(icon(moved > 0 ? "up" : "down"), String(Math.abs(moved)));
      }
      if (moved > 0) row.li.classList.add("rose");
    }
    for (const [id, row] of rows) {
      const a = first.get(id);
      if (!a) continue;
      const b = row.li.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (!dx && !dy) continue;
      row.li.style.transition = "none";
      row.li.style.transform = `translate(${dx}px, ${dy}px)`;
      row.li.style.zIndex = "2";
    }
    void list.offsetWidth;
    for (const row of rows.values()) {
      if (!row.li.style.transform) continue;
      row.li.style.transition = "transform 0.75s cubic-bezier(0.2, 0.9, 0.25, 1)";
      row.li.style.transform = "";
      row.li.addEventListener("transitionend", () => { row.li.style.zIndex = ""; }, { once: true });
    }
  })();
  return list;
}

export function teamTotalsView(players, teamCount, opts = {}) {
  const totals = teamTotals(players, teamCount);
  const animate = opts.prevScores && opts.animKey && !reducedMotion() && once("teams:" + opts.animKey);
  const before = animate
    ? new Map(teamTotals(players.map((p) => ({ ...p, score: opts.prevScores[p.id] ?? p.score })), teamCount).map((t) => [t.id, t.score]))
    : null;
  const top = Math.max(1, ...totals.map((t) => t.score), ...(before ? [...before.values()] : []));
  const width = (n) => `${Math.max(4, (n / top) * 100)}%`;
  return h("div", { class: "team-totals" },
    totals.map((t) => {
      const bar = h("div", { style: { width: width(before ? before.get(t.id) : t.score), background: t.color } });
      const num = h("span", { class: "score" }, (before ? before.get(t.id) : t.score).toLocaleString());
      if (before) {
        setTimeout(() => { bar.style.width = width(t.score); }, 700);
        countUp(num, before.get(t.id), t.score, { delay: 700, duration: 900 });
      }
      return h("div", { class: "team-row" },
        h("span", { class: "team-name" }, h("span", { class: "team-dot", style: { background: t.color } }), t.name),
        h("div", { class: "team-bar" }, bar),
        num);
    }));
}

// ---------- Board + answers ----------
/** The face-down card grid. onPick(cellId) makes unused cards clickable; omit it for a read-only board. */
export function boardGrid(categories, board, onPick, opts = {}) {
  const cols = categories.length;
  const grid = h("div", {
    class: `board${opts.compact ? " compact" : ""}`,
    style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` },
  });
  categories.forEach((name) => grid.append(h("div", { class: "board-head" }, name)));
  const rows = Math.max(0, ...board.map((c) => c.row + 1));
  grid.style.setProperty("--rows", rows); // lets the big screen fit every row
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = board.find((c) => c.col === col && c.row === row);
      if (!cell) grid.append(h("div", { class: "board-cell empty" }));
      else if (cell.used) {
        // Flipped card: its point value, plus the wildcard icon if it carried one.
        const isPoints = /^\d+$/.test(cell.label || "");
        const wildIcon = cell.icon || (!isPoints && cell.label ? cell.label : null); // older boards stored the icon as the label
        grid.append(h("div", { class: `board-cell used${wildIcon ? " used-wild" : ""}` },
          wildIcon ? icon(wildIcon) : null,
          isPoints ? h("span", { class: "used-points" }, cell.label) : null));
      } else {
        grid.append(h("button", {
          class: "board-cell", type: "button", disabled: !onPick,
          "aria-label": `${categories[col]}, card ${row + 1}`,
          onclick: onPick ? () => onPick(cell.id) : null,
        }, h("span", { class: "card-frame" }, cardEmblem())));
      }
    }
  }
  return grid;
}

function countSpan(n, key) {
  const el = h("span", { class: "answer-count", title: "Players who chose this" }, String(n));
  if (key && once("count:" + key)) countUp(el, 0, n, { duration: 800, delay: 350 });
  return el;
}

/**
 * The four colored answers.
 * opts: { onPick(i), chosen, correctIndex, counts }
 */
export function optionGrid(options, opts = {}) {
  const revealed = opts.correctIndex != null;
  return h("div", { class: `answer-grid${revealed ? " revealed" : ""}` },
    options.map((text, i) => {
      const cls = ["answer", `opt-${i}`];
      if (revealed) cls.push(i === opts.correctIndex ? "correct" : "dim");
      if (opts.chosen === i) cls.push("chosen");
      if (opts.chosen != null && opts.chosen !== i && !revealed) cls.push("dim");
      const inner = [
        h("span", { class: "shape" }, icon(OPTION_SHAPES[i])),
        h("span", { class: "answer-text" }, text),
        revealed && opts.counts ? countSpan(opts.counts[i] || 0, opts.animKey ? `${opts.animKey}:${i}` : null) : null,
        revealed && i === opts.correctIndex ? h("span", { class: "tick", title: "Correct answer" }, icon("check")) : null,
      ];
      return opts.onPick
        ? h("button", { class: cls.join(" "), type: "button", onclick: () => opts.onPick(i) }, inner)
        : h("div", { class: cls.join(" ") }, inner);
    }));
}

/** +120 / −80 with a real minus sign. */
export function signed(n) {
  return n > 0 ? `+${n.toLocaleString()}` : n < 0 ? `\u2212${(-n).toLocaleString()}` : "0";
}

/** Long questions get a smaller size class so they still fit on one screen. */
export function promptClass(text) {
  const n = String(text || "").length;
  return `prompt${n > 150 ? " long" : n > 95 ? " medium" : ""}`;
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
