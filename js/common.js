// Shared helpers for every page: DOM building, sign-in gate, timers, leaderboards.
import { watchAuth, logOut } from "./firebase.js";
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
  let started = false;
  watchAuth((user) => {
    if (!user) {
      const here = location.pathname.split("/").pop() + location.search;
      location.replace("index.html?next=" + encodeURIComponent(here));
      return;
    }
    renderUserChip(user);
    if (!started) {
      started = true;
      onReady(user);
    }
  });
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

/**
 * Ranked list of players.
 * opts: { me, prevRanks, gains, limit, showTeams, compact }
 */
export function leaderboardView(players, opts = {}) {
  const ranked = rankPlayers(players);
  let rows = ranked;
  if (opts.limit && ranked.length > opts.limit) {
    rows = ranked.slice(0, opts.limit);
    const mine = ranked.find((p) => p.id === opts.me);
    if (mine && !rows.includes(mine)) rows = [...rows, mine];
  }
  if (!rows.length) return h("p", { class: "muted center" }, "No players yet.");

  return h("ol", { class: `leaderboard${opts.compact ? " compact" : ""}` },
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
}

export function teamTotalsView(players, teamCount) {
  const totals = teamTotals(players, teamCount);
  const top = totals[0]?.score || 1;
  return h("div", { class: "team-totals" },
    totals.map((t) => h("div", { class: "team-row" },
      h("span", { class: "team-name" }, h("span", { class: "team-dot", style: { background: t.color } }), t.name),
      h("div", { class: "team-bar" }, h("div", { style: { width: `${Math.max(4, (t.score / top) * 100)}%`, background: t.color } })),
      h("span", { class: "score" }, t.score.toLocaleString()))));
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
        const isPoints = /^\d+$/.test(cell.label || "");
        grid.append(h("div", { class: `board-cell used${isPoints ? "" : " used-wild"}` },
          isPoints ? h("span", { class: "used-points" }, cell.label) : cell.label ? icon(cell.label) : null));
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
        revealed && opts.counts ? h("span", { class: "answer-count", title: "Players who chose this" }, String(opts.counts[i] || 0)) : null,
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

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
