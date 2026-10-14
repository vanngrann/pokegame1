// UI + game flow.
import { watchAuth, signInWithGoogle, signInAsGuest, logOut, getPlayer, saveGame, getLeaderboard } from "./firebase.js";
import { makeQuestion } from "./questions.js";

const ROUNDS = 10;
const SECONDS = 15;
const BASE_POINTS = 100;
const MAX_SPEED_BONUS = 50; // max score per game = 10 × 150 = 1500

const $ = (id) => document.getElementById(id);

let user = null;
let game = null;

// ---------- screens ----------
function show(name) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.toggle("active", s.id === "screen-" + name);
  });
  window.scrollTo(0, 0);
}

function firstName(name) {
  return (name || "Trainer").split(" ")[0];
}

function renderUserChip() {
  const chip = $("user-chip");
  if (!user) { chip.hidden = true; return; }
  chip.hidden = false;
  $("user-name").textContent = user.isAnonymous ? "Guest" : user.displayName || "Trainer";
  const photo = $("user-photo");
  if (user.photoURL) { photo.src = user.photoURL; photo.hidden = false; } else { photo.hidden = true; }
  $("btn-signout").textContent = user.isAnonymous ? "Sign in" : "Sign out";
}

// ---------- auth ----------
watchAuth((u) => {
  user = u;
  renderUserChip();
  if (!u) {
    endGame();
    show("login");
    return;
  }
  if (!game) goHome();
});

$("btn-google").addEventListener("click", async () => {
  const err = $("login-error");
  err.hidden = true;
  try {
    await signInWithGoogle();
  } catch (e) {
    console.error(e);
    err.textContent = e.code === "auth/unauthorized-domain"
      ? "This site isn’t on the Firebase authorized domains list yet."
      : "Sign-in failed. Please try again.";
    err.hidden = false;
  }
});

$("btn-guest").addEventListener("click", async () => {
  try {
    await signInAsGuest();
  } catch (e) {
    console.error(e);
    $("login-error").textContent = "Guest play isn’t enabled. Turn on Anonymous sign-in in Firebase.";
    $("login-error").hidden = false;
  }
});

$("btn-signout").addEventListener("click", () => logOut());

// ---------- home ----------
async function goHome() {
  endGame();
  show("home");
  $("home-greeting").textContent = user.isAnonymous ? "Ready, Trainer?" : `Ready, ${firstName(user.displayName)}?`;
  const stats = $("home-stats");
  stats.textContent = user.isAnonymous ? "Playing as a guest, so scores won’t be saved." : "";
  if (!user.isAnonymous) {
    getPlayer(user.uid)
      .then((p) => { if (p) stats.textContent = `Best: ${p.bestScore} pts · Games played: ${p.gamesPlayed ?? 0}`; })
      .catch(() => {});
  }
  loadLeaderboard();
}

async function loadLeaderboard() {
  const list = $("leaderboard");
  list.replaceChildren(textItem("Loading…"));
  try {
    const rows = await getLeaderboard(10);
    if (!rows.length) { list.replaceChildren(textItem("No scores yet. Be the first!")); return; }
    list.replaceChildren(...rows.map((r, i) => leaderboardRow(r, i + 1)));
  } catch (e) {
    console.error(e);
    list.replaceChildren(textItem("Couldn’t load the leaderboard."));
  }
}

function textItem(text) {
  const li = document.createElement("li");
  li.className = "muted";
  li.textContent = text;
  return li;
}

function leaderboardRow(row, rank) {
  const li = document.createElement("li");
  if (user && row.id === user.uid) li.classList.add("me");

  const rankEl = document.createElement("span");
  rankEl.className = "rank";
  rankEl.textContent = rank;

  let pic;
  if (row.photoURL) {
    pic = document.createElement("img");
    pic.className = "avatar";
    pic.alt = "";
    pic.referrerPolicy = "no-referrer";
    pic.src = row.photoURL;
  } else {
    pic = document.createElement("span");
    pic.className = "avatar-fallback";
    pic.textContent = (row.displayName || "?").charAt(0).toUpperCase();
  }

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = row.displayName || "Trainer";

  const score = document.createElement("span");
  score.className = "score";
  score.textContent = row.bestScore ?? 0;

  li.append(rankEl, pic, name, score);
  return li;
}

// ---------- game ----------
function prefetch() {
  const p = makeQuestion();
  p.catch(() => {}); // avoid "unhandled rejection" noise; errors are handled when awaited
  return p;
}

function endGame() {
  if (game) clearInterval(game.timerId);
  game = null;
}

function startGame() {
  endGame();
  game = { round: 0, score: 0, correct: 0, current: null, answered: true, timerId: null, timeLeft: SECONDS, next: prefetch() };
  show("game");
  nextRound();
}

function updateHud() {
  $("hud-round").textContent = `${Math.min(game.round, ROUNDS)} / ${ROUNDS}`;
  $("hud-score").textContent = `${game.score} pts`;
}

function setTimerBar(fraction) {
  const bar = $("timer-bar");
  bar.style.transform = `scaleX(${fraction})`;
  bar.classList.toggle("low", fraction < 0.3);
}

function setStageLoading(on) {
  const stage = $("card-stage");
  stage.classList.toggle("loading", on);
  if (on) stage.classList.remove("revealed");
}

async function nextRound() {
  const g = game;
  if (!g) return;
  if (g.round >= ROUNDS) return finishGame();

  g.round++;
  g.answered = true; // locked until the question is on screen
  updateHud();
  setTimerBar(1);
  setStageLoading(true);
  $("question").textContent = "Shuffling the deck…";
  $("options").replaceChildren();
  $("feedback").hidden = true;

  let q;
  try {
    q = await g.next;
  } catch {
    try {
      q = await makeQuestion();
    } catch (e) {
      console.error(e);
      if (game !== g) return;
      g.round--;
      $("question").textContent = "Couldn’t load a card. Check your connection.";
      $("feedback-text").textContent = "";
      $("feedback-detail").textContent = "";
      $("btn-next").textContent = "Try again";
      $("feedback").hidden = false;
      return;
    }
  }
  if (game !== g) return; // player quit while loading

  g.next = g.round < ROUNDS ? prefetch() : null;
  g.current = q;
  renderQuestion(q);
  g.answered = false;
  startTimer(g);
}

function renderQuestion(q) {
  $("card-crop").src = q.imageSrc;
  const full = $("card-full");
  full.src = q.imageSrc;
  full.alt = "";
  setStageLoading(false);

  $("question").textContent = q.prompt;
  $("options").replaceChildren(
    ...q.options.map((text) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "option";
      b.textContent = text;
      b.addEventListener("click", () => answer(text, b));
      return b;
    })
  );
}

function startTimer(g) {
  const start = performance.now();
  g.timeLeft = SECONDS;
  clearInterval(g.timerId);
  g.timerId = setInterval(() => {
    g.timeLeft = Math.max(0, SECONDS - (performance.now() - start) / 1000);
    setTimerBar(g.timeLeft / SECONDS);
    if (g.timeLeft <= 0) answer(null, null);
  }, 100);
}

function answer(choice, button) {
  const g = game;
  if (!g || g.answered) return;
  g.answered = true;
  clearInterval(g.timerId);

  const q = g.current;
  const right = choice === q.answer;
  let gained = 0;
  if (right) {
    gained = BASE_POINTS + Math.round((g.timeLeft / SECONDS) * MAX_SPEED_BONUS);
    g.score += gained;
    g.correct++;
  }

  document.querySelectorAll("#options .option").forEach((b) => {
    b.disabled = true;
    if (b.textContent === q.answer) b.classList.add("correct");
    else if (b === button) b.classList.add("wrong");
  });

  $("card-stage").classList.add("revealed");
  $("card-full").alt = q.card.name;

  $("feedback-text").textContent = right
    ? `Correct! +${gained}`
    : choice === null
      ? `Time’s up! It was ${q.answer}.`
      : `Not quite. It was ${q.answer}.`;
  $("feedback-detail").textContent = q.detail;
  $("btn-next").textContent = g.round >= ROUNDS ? "See results" : "Next";
  $("feedback").hidden = false;
  updateHud();
  $("feedback").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function finishGame() {
  const g = game;
  endGame();
  show("results");
  $("final-score").textContent = g.score;
  $("final-detail").textContent = `${g.correct} of ${ROUNDS} correct`;

  const note = $("final-note");
  if (!user || user.isAnonymous) {
    note.textContent = "Sign in with Google to save your score to the leaderboard.";
    return;
  }
  note.textContent = "Saving your score…";
  try {
    const result = await saveGame(user, { score: g.score, correct: g.correct });
    note.textContent = result.newBest ? "New personal best!" : `Your best: ${result.bestScore} pts`;
  } catch (e) {
    console.error(e);
    note.textContent = "Couldn’t save your score.";
  }
}

// ---------- buttons ----------
$("btn-start").addEventListener("click", startGame);
$("btn-again").addEventListener("click", startGame);
$("btn-home").addEventListener("click", goHome);
$("btn-next").addEventListener("click", nextRound);
$("btn-quit").addEventListener("click", () => {
  if (confirm("Quit this game? Your score won’t be saved.")) goHome();
});
