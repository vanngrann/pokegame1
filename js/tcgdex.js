// Thin wrapper around the free TCGdex API (https://tcgdex.dev). No API key needed.
const BASE = "https://api.tcgdex.net/v2/en";
const DAY = 24 * 60 * 60 * 1000;

// In-memory cache so repeated requests in one session are free.
const memo = new Map();

function getJSON(path) {
  if (memo.has(path)) return memo.get(path);
  const promise = fetch(BASE + path).then((res) => {
    if (!res.ok) throw new Error(`TCGdex ${res.status} on ${path}`);
    return res.json();
  });
  memo.set(path, promise);
  promise.catch(() => memo.delete(path)); // let failed requests retry
  return promise;
}

// Bigger lists that rarely change are also kept in localStorage for a day.
async function getCached(path, ttl = DAY) {
  const key = "tcgdex:" + path;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const { t, d } = JSON.parse(raw);
      if (Date.now() - t < ttl) return d;
    }
  } catch { /* storage unavailable or corrupt: just refetch */ }

  const data = await getJSON(path);
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data }));
  } catch { /* quota full or private mode: fine */ }
  return data;
}

/** All sets (brief): [{ id, name, logo?, symbol?, cardCount: { total, official } }] */
export const getSets = () => getCached("/sets");

/** All illustrator names: ["5ban Graphics", ...] */
export const getIllustrators = () => getCached("/illustrators");

/** One set with its card list: { id, name, serie, cards: [{ id, localId, name, image? }] } */
export const getSet = (id) => getJSON("/sets/" + encodeURIComponent(id));

/** One card with full details: { name, image, category, hp, types, illustrator, set, ... } */
export const getCard = (id) => getJSON("/cards/" + encodeURIComponent(id));

/** TCGdex image fields are a base URL; add quality + extension. */
export function cardImage(base, quality = "high", ext = "webp") {
  return `${base}/${quality}.${ext}`;
}
