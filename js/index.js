// Landing page: sign in, then join a room or host one.
import { watchAuth, signInWithGoogle, signInAsGuest, db, doc, getDoc } from "./firebase.js";
import { $, h, renderUserChip, store } from "./common.js";

// Where to send people after sign-in (only our own pages are allowed).
const next = new URLSearchParams(location.search).get("next");
const safeNext = next && /^(host|play)\.html(\?[A-Za-z0-9=&_-]*)?$/.test(next) ? next : null;

function show(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + name));
}

watchAuth((user) => {
  renderUserChip(user);
  if (!user) return show("login");
  if (safeNext) return location.replace(safeNext);
  show("hub");
  offerRejoin(user);
});

// If this device was in a game (as a player or host) that's still running, offer a one-tap way back.
async function offerRejoin(user) {
  const box = $("rejoin");
  const cards = [];
  try {
    const hosted = store.get("tt-host-room", null);
    if (hosted?.code) {
      const snap = await getDoc(doc(db, "rooms", hosted.code));
      if (snap.exists() && snap.data().hostUid === user.uid && snap.data().status !== "podium") {
        cards.push(h("div", { class: "panel center rejoin" },
          h("h2", null, "You’re hosting a game"),
          h("p", { class: "muted" }, `Room ${hosted.code} is still running.`),
          h("a", { class: "btn btn-primary btn-lg", href: `host.html?room=${hosted.code}` }, "Back to my room")));
      }
    }
    const played = store.get("tt-last-room", null);
    if (played?.code) {
      const [roomSnap, meSnap] = await Promise.all([
        getDoc(doc(db, "rooms", played.code)),
        getDoc(doc(db, "rooms", played.code, "players", user.uid)),
      ]);
      if (roomSnap.exists() && meSnap.exists() && roomSnap.data().status !== "podium") {
        cards.push(h("div", { class: "panel center rejoin" },
          h("h2", null, "You’re in a game"),
          h("p", { class: "muted" }, `Room ${played.code}, playing as ${meSnap.data().name}.`),
          h("a", { class: "btn btn-primary btn-lg", href: `play.html?code=${played.code}` }, "Rejoin game")));
      }
    }
  } catch (e) {
    console.warn("Couldn’t check for a game in progress", e);
  }
  box.replaceChildren(...cards);
}

function loginError(text) {
  const el = $("login-error");
  el.textContent = text;
  el.hidden = false;
}

$("btn-google").addEventListener("click", async () => {
  $("login-error").hidden = true;
  try {
    await signInWithGoogle();
  } catch (e) {
    console.error(e);
    loginError(e.code === "auth/unauthorized-domain"
      ? "This site isn’t on the Firebase authorized domains list yet."
      : "Sign-in failed. Please try again.");
  }
});

$("btn-guest").addEventListener("click", async () => {
  try {
    await signInAsGuest();
  } catch (e) {
    console.error(e);
    loginError("Guest play isn’t enabled. Turn on Anonymous sign-in in Firebase.");
  }
});

$("join-code").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
});

$("join-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = $("join-code").value.trim().toUpperCase();
  if (code.length === 4) location.href = `play.html?code=${code}`;
});
