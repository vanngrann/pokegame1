// Landing page: sign in, then join a room or host one.
import { watchAuth, signInWithGoogle, signInAsGuest } from "./firebase.js";
import { $, renderUserChip } from "./common.js";

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
});

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
