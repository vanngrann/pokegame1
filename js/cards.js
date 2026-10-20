// Card pictures from the free TCGdex database (https://tcgdex.dev). No key needed.
// The host looks cards up and shares the image address with everyone through the room,
// so players' phones never call the database themselves.
const API = "https://api.tcgdex.net/v2/en";
const TIMEOUT_MS = 4000;

// TCG Pocket sets (A1, A2a, B1, P-A...) use a different card layout, so skip them.
const POCKET = /^(A\d|B\d|P-A)/i;

const cache = new Map(); // spec key -> Promise<{ base, name } | null>

async function getJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function lookup(spec) {
  if (spec.id) {
    const card = await getJSON(`${API}/cards/${encodeURIComponent(spec.id)}`);
    return card?.image ? { base: card.image, name: card.name } : null;
  }
  if (spec.name) {
    const list = await getJSON(`${API}/cards?name=${encodeURIComponent("eq:" + spec.name)}`);
    const usable = (Array.isArray(list) ? list : []).filter((c) => c.image && !POCKET.test(c.id));
    if (!usable.length) return null;
    const pick = usable[Math.floor(Math.random() * usable.length)]; // a different printing each game
    return { base: pick.image, name: pick.name };
  }
  return null;
}

/** Cached GET of any TCGdex path, e.g. api("/sets/swsh7"). Resolves to null on failure. */
const apiCache = new Map();
export function api(path) {
  if (!apiCache.has(path)) apiCache.set(path, getJSON(API + path).catch(() => null));
  return apiCache.get(path);
}

export const isPocket = (id) => POCKET.test(String(id || ""));

/** Finds a picture for a question's `card` spec. Resolves to { base, name } or null; never throws. */
export function findCard(spec) {
  if (!spec || (!spec.id && !spec.name)) return Promise.resolve(null);
  const key = spec.id || `name:${spec.name}`;
  if (!cache.has(key)) cache.set(key, lookup(spec).catch(() => null));
  return cache.get(key);
}

/** Starts loading the image itself, so it appears instantly when the question opens. */
export function warmImage(base) {
  if (!base) return;
  const img = new Image();
  img.src = imageUrl(base);
}

export function imageUrl(base, quality = "high") {
  return `${base}/${quality}.webp`;
}

/** Waits for a lookup, but no longer than `ms`, so a slow database never holds up the game. */
export function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}
