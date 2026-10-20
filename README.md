# Trainer Trivia

A live Pokémon party-trivia game: a Jeopardy-style board on a shared screen, Kahoot-style answering from everyone's phones, and Mario Party-style wildcards. It runs as a static site on GitHub Pages, with Firebase for sign-in and real-time sync.

## How a game works

1. **The host** opens the site on a laptop or TV and clicks **Create a room**. The screen shows a 4-letter code and a QR code.
2. **Players** open the site on their phones (or scan the QR code), enter the code and a name.
3. The host picks **Everyone for themselves** or **Teams** (2 to 4 teams), the time per question, **how many of the 35 cards also carry a wildcard** (0 to 35), and **which wildcard types** can appear, then starts.
4. **Players take turns picking** a face-down card from the board. Columns are categories and rows are difficulty, and **each card shows its value**: the higher the value, the harder the question.

   | Value | Difficulty |
   |---|---|
   | 100 | Very easy |
   | 200 | Easy |
   | 300 | Medium |
   | 400 | Hard |
   | 500 | Very hard |

   Wildcards stay hidden until the card flips. The board has 7 columns: 5 categories from the question bank plus **Card Spotter** and **Price Check**, which are built fresh from the card database every game (see below). The bank has 6 categories, so one sits out each game, taking turns (the host's browser remembers who sat out last).
5. **Everyone answers every question** on their phone. A correct answer earns:
   - the card's points,
   - plus up to **25% extra for speed**,
   - plus **25% extra for the player who picked the card**.

   Wrong answers cost nothing.
6. After each answer reveal, everyone sees the **leaderboard**, including who moved up or down.
7. **Wildcards** are hidden on some cards, spread as evenly as possible across the columns. Every card still has its question: flipping a wildcard card plays the wildcard first, then the card's question runs as normal (picker bonus, speed bonus and all). The leaderboard after that turn shows both together:

   | Wildcard | Effect |
   |---|---|
   | Thief | Steal 200 points from a player you choose |
   | Spin the Wheel | Random outcome: +100, +300, +500, −200, everyone +100, rob the leader, Swords Dance, or swap scores with last place |
   | Swords Dance | Your next correct answer scores double |
   | Transform | Swap scores with a random opponent |
   | Rare Candy | Free +300 |
   | Pay Day | Everyone gets +100 |
   | Earthquake | Every opponent loses 100 |

   Scores never drop below 0. In team mode, "opponents" means players on other teams.
8. When the board is cleared, the **final round** starts with one of 7 hard questions, picked at random each game. Everyone sees the category, secretly wagers, then answers. Right wins the wager; wrong loses it. Everyone can wager up to 500 even with a low score, and a wrong answer never takes a score below 0.
9. If first place is tied, the host can run a **tiebreaker**: the closest number guess wins. If it's still tied, the next tiebreaker uses a different question.

In team mode, every player still answers on their own phone and takes their own turns picking. The team score is the sum of its members' scores.

## How points work

There are two kinds of points. **Game points** decide who wins a single game and reset every game. **Tokens** are what players keep and spend. The token shop runs in person, off the website, so nobody can cheat their way to tokens by editing the site's code.

### Game points (in each game)

| Event | Points |
|---|---|
| Correct answer | The card's value (100 to 500, random per card) |
| Answering fast | Up to 25% extra, depending on how much time was left |
| Picking the card and getting it right | 25% extra |
| Swords Dance active | Your next correct answer is doubled |
| Wrong or no answer | Nothing (no penalty) |
| Wildcards | Can add, steal, swap or take away points (see the wildcard table above) |
| Final round | Win or lose what you wagered. Everyone can wager up to 500, and a wrong answer never drops a score below 0 |

Game points swing a lot, since Transform swaps scores and an all-in final wager can double them. That's why they are never used as shop money.

### Tokens (kept across games)

> **Status: planned.** This describes the agreed mechanic. The website does not hand out tokens yet.

At the end of each game, every player's finish turns into a small, fixed number of tokens:

| Result | Tokens |
|---|---|
| Played the whole game | 1 |
| 3rd place | +1 |
| 2nd place | +2 |
| 1st place | +3 |
| Got the final question right | +1 |

- The most anyone can earn in one game is **5 tokens**, so shop prices stay meaningful.
- **Team mode:** everyone on the winning team gets the 1st-place bonus. The 2nd- and 3rd-place bonuses go to the 2nd and 3rd teams.
- **Ties:** tied players all get the bonus for the higher place.
- **Guests earn nothing.** Tokens need a Google sign-in, which gives players a reason to make an account.

### Recording tokens

1. **On screen:** the podium shows a "Tokens earned" column, and each phone shows "You earned X tokens", so players know what they're owed before they leave.
2. **Trainer ID:** every Google player gets a short ID, like `TR-4F7K`, shown on their phone and in the export. Nicknames change from game to game; the ID doesn't, so one person's tokens always add up in one place.
3. **Host export:** the podium screen has **Copy results** (pastes straight into Google Sheets) and **Download CSV**. Each row has the date, room code, player name, Trainer ID, place, final score and tokens earned.
4. **The bank:** one Google Sheet that only organizers can edit.
   - **Games tab:** paste in each game's results.
   - **Purchases tab:** one row per redemption (date, Trainer ID, item, tokens spent as a negative number).
   - **Balances tab:** `SUMIF` both tabs by Trainer ID.
5. **The shop:** players redeem in person, and an organizer checks the balance and logs the purchase. Nothing on the website can spend or change tokens.

**Fallback with no tech:** hand out physical tickets from the podium screen at the end of each game, arcade style. Easier to run, but a lost ticket is a lost token.

## Files

```
trainer-trivia/
├── index.html            sign in, join with a code, or create a room
├── host.html             the shared big screen
├── play.html             the phone screen
├── css/
│   └── styles.css        all styling: colors, fonts and sizes are set at the top
├── js/
│   ├── questions.js      THE QUESTION BANK: edit this to change questions
│   ├── game.js           rules: scoring, bonuses, wildcards, the wheel
│   ├── host.js           runs the game on the big screen
│   ├── play.js           the phone screen
│   ├── index.js          the start page
│   ├── common.js         shared helpers (leaderboards, board, timers)
│   ├── icons.js          the SVG icons (wildcards, answer shapes, badges)
│   ├── cards.js          looks up card pictures in the TCGdex card database
│   ├── generated.js      builds the Card Spotter and Price Check columns each game
│   ├── firebase.js       Firebase connection
│   └── firebase-config.js  your Firebase keys
├── firestore.rules       database security rules (paste into Firebase)
└── README.md
```

Files from the earlier solo version (`js/app.js` and `js/tcgdex.js`) are no longer used and can be deleted.

## Setup

### Firebase (one time)
1. **Authentication → Sign-in method:** enable **Google** and **Anonymous**.
2. **Authentication → Settings → Authorized domains:** `localhost` is already there. Add `127.0.0.1` for local testing, and `YOUR-USERNAME.github.io` before you deploy.
3. **Firestore Database:** create it (Standard edition, database ID `(default)`).
4. **Firestore → Rules:** replace everything with the contents of `firestore.rules` and click **Publish**. **Re-publish whenever this file changes**; the party version needs the new rules.
5. Put your config in `js/firebase-config.js`.

### Run locally
Open `index.html` with VS Code's **Live Server** extension. To test with phones on the same Wi-Fi, open `http://YOUR-COMPUTER-IP:5500` on the phone and add that IP to the authorized domains. You can also test alone: open the host in one browser window and each extra player in a **private window**. Don't use a second normal tab: every tab in a browser shares one sign-in, so choosing "Play as guest" in another tab would sign the host out too (the game now detects this and tells you).

### Deploy
Push the folder to a GitHub repo (with `index.html` at the root), then Settings → Pages → deploy from `main` / `(root)`.

## Customizing

- **Questions:** edit `js/questions.js`. Each question needs a `level` (1 to 5, which sets its value: 1 = 100 very easy up to 5 = 500 very hard), a `prompt`, the right `answer`, and exactly three `wrong` answers. Answer order is shuffled every game. Each game picks **one question per level from every category**, so a category can hold as many questions as you like: write several per level and the board changes from game to game. If a level is missing, the nearest level fills in. Up to 5 categories play each game; any beyond that take turns sitting out, so adding a seventh or eighth category is fine.
- **Scoring:** change `SPEED_BONUS`, `PICKER_BONUS`, `pointsFor` (points per level), `STEAL_AMOUNT` and the timer lengths at the top of `js/game.js`.
- **Default settings:** `DEFAULT_SETTINGS` at the top of `js/game.js` (the host can change them in the lobby).
- **Final round and tiebreakers:** the `finals` and `tiebreakers` lists at the bottom of `js/questions.js`. Add as many as you like; one final is picked each game. Finals should be the hardest questions in the game. Tiebreaker answers must be whole numbers.
- **Final-round minimum wager:** `FINAL_MIN_WAGER` in `js/game.js`.
- **Wildcards and the wheel:** edit `WILDCARDS` and `WHEEL` in `js/game.js`. A new wildcard type also needs a `case` in `resolveWild()`.
- **Teams:** names and colors are in `TEAMS` in `js/game.js`.

## Look and feel

- The host screen always uses the dark navy "stage" so it reads well on a TV. Phones follow the device's light or dark setting.
- Fonts are Bricolage Grotesque (headings, numbers, room codes) and Figtree (everything else), loaded from Google Fonts.
- Brand colors, answer-tile colors and corner sizes are tokens at the top of `css/styles.css`.
- **Animations:** points count up on phones and fly into each player's total, and leaderboards open in the old order before rows glide to their new places (players who climbed get a glow). Answer counts tick up on the reveal, the countdown pulses for the last five seconds, the podium rises 3rd, 2nd, then 1st, and confetti falls for the winner. Each animation plays once per turn, so a screen redraw never replays it. Everything is skipped on devices set to reduce motion. The timings live in `animatedLeaderboard()` and `countUp()` in `js/common.js` and the "Motion" section of `css/styles.css`.

## Card pictures

Some questions show a real Pokémon card, pulled from the free [TCGdex](https://tcgdex.dev) card database. A question opts in with a `card` line in `js/questions.js`, and its `mode` decides what players see, so a picture never gives the answer away:

| Mode | While answering | On the reveal | Used for |
|---|---|---|---|
| `art` (default) | Artwork only (name, HP, attacks and text hidden) | The full card | Who's That Pokémon?, the VMAX and Professor's Research questions, Moonbreon |
| `art-only` | Artwork only | Artwork only | Type Trouble and the final round (full cards print TCG weaknesses, which can differ from the video-game type chart) |
| `card` | The full card | The full card | Nothing yet. Full cards print the name, HP, attacks, weakness, rule boxes and set number, so only use it when the question is about none of those |
| `reveal` | Nothing | The full card | Evolution Puzzles answers |

```js
card: { name: "Garchomp", mode: "art" },   // a random printing of any card with this exact name
card: { id: "swsh7-215", mode: "art" },    // one specific card: TCGdex set id + card number
```

- **When cards load:** the host looks up all the cards when a game starts, so pictures appear instantly. Players' phones get the picture through the room and never contact the card database themselves.
- **If a lookup fails:** when the database is slow or unreachable, or a name doesn't match, the question simply shows without a picture. The game never waits more than about 2.5 seconds.
- **Card names must match exactly,** including capitals and punctuation (`"Umbreon VMAX"`, `"Professor's Research"`). If a picture never shows up, check the spelling against the card's name on tcgdex.dev.
- **Name lookups pick a random printing,** so the same question can show different art each game. TCG Pocket cards are skipped because their layout is different.
### Card Spotter

This column is made from the card database when the host presses **Start game** (the button shows "Shuffling cards..." for a moment). Every game gets new cards:

| Value | Question | Picture shown |
|---|---|---|
| 100 | Who's that Pokémon? (a household name, like Pikachu or Snorlax) | Artwork only |
| 200 | Name the Pokémon on this card (a fan favorite, like Ampharos or Corviknight) | Artwork only |
| 300 | Which series is this card from? (Scarlet & Violet, Sword & Shield, Sun & Moon, XY or Black & White) | Full card |
| 400 | Which set is this card from? (wrong answers come from the same series) | Full card |
| 500 | Who illustrated this card? | Artwork only (the full card prints the artist) |

- The Pokémon lists are at the top of `js/generated.js`; edit them freely, using exact card names.
- If the database is slow or unreachable, the game waits at most 7 seconds, then any missing question is swapped for a hand-written card question of the same level. The game always starts.

### Price Check

The last column shows a full card and asks **"About how much does this card sell for, raw?"** The price is the card's **TCGplayer market price, ungraded, in US dollars**, as reported by TCGdex (the host screen shows the source and month under the question). Graded (PSA) prices aren't available for free, so they aren't used.

The four answers are listed lowest to highest, and the difficulty comes from how close together they are:

| Value | Answers are this far apart | Example |
|---|---|---|
| 100 | 10 times | $0.60, $6, $60, $600 |
| 200 | 5 times | $4.25, $21, $105, $525 |
| 300 | 3 times | $9, $27, $81, $245 |
| 400 | 2 times | $23, $45, $90, $180 |
| 500 | 1.5 times | $27, $41, $61, $91 |

- Cards come from a list of chase cards (Charizard ex, Umbreon VMAX, Iono and others) plus the Pokémon lists, all at the top of `js/generated.js`. Bulk cards under $1 are avoided, since they would always be the lowest answer.
- To make the column easier or harder, change `PRICE_STEP` in `js/generated.js`.
- Prices change daily, so the same card can have a different answer next week. If the database has no price for a card, another card is tried, and if none turns up, a hand-written question about card prices fills in.

- **If artwork crops look off** (some full-art or older cards frame their art differently), adjust the `--art-*` values in the "Card pictures" section of `css/styles.css`.

## Leaving and coming back

- **Away players:** anyone who misses 2 questions in a row is marked **away** (`AWAY_AFTER` in `js/game.js`). The game stops waiting for them before revealing, their turn to pick is skipped, and their phone shows how to get back in. Answering any question makes them active again. Leaderboards show them faded with an "Away" tag.
- **Removing players:** during a game, the host's **Players** button (bottom of the board, question and leaderboard screens) lists everyone with Playing / Away and a **Remove** button. Removed players lose their points. They see "You're not in this game" and can join again as a new player if they come back. If the player whose turn it is leaves or goes away, the turn passes to the next active player.

- **Players:** if a phone closes the page, locks, or loses signal, opening the site again shows a **Rejoin game** card on the start page, and the same `play.html?code=...` link drops them straight back in. Their score and any answer they already locked in are kept.
- **Host:** opening `host.html` again returns to the room you were running, unless that game already finished. The start page also shows **Back to my room**. **Create a room** always starts a fresh one.
- **Connection trouble is handled quietly:** if a phone or the host loses the server for more than 3 seconds, a small **Reconnecting…** notice appears at the top, then **Back online** when it recovers. After 20 seconds offline the connection is reset. A page that hasn't loaded reconnects at 8 seconds and reloads itself only at 30 seconds, if it's online and on screen (once every two minutes at most). Coming back from another app reconnects only after an absence of 20 seconds or more. Screens are kept awake during a game where the browser allows it.
- **Nobody gets "kicked" by a bad connection:** a phone only shows "You're not in this game" once the server confirms the player was removed. A shaky connection can briefly show an incomplete player list, which used to look like a kick.
- **Keep the host tab on screen.** It runs the timers. If it's hidden, browsers slow it down; when it comes back, any question whose time ran out closes right away.
- **After you publish an update,** GitHub Pages can serve the old files for up to about 10 minutes. If something looks out of date right after a deploy, do a hard refresh (Ctrl+Shift+R, or Cmd+Shift+R on Mac).

## Good to know

- **The host's browser is the referee.** It keeps the answers, runs the timers and does the scoring. If the host refreshes, the game picks up where it left off. If the host's screen closes, the game pauses until it comes back.
- **Hidden answers stay hidden.** Correct answers and the board's hidden cards live in a host-only document, and players can't see each other's answers. However, `questions.js` is public on GitHub Pages, so a determined player could look up the answers. That's fine for a party game, but don't use it for prizes.
- **QR code:** generated by the free api.qrserver.com service. If it doesn't load, players can type the address and code instead.
- **Copyright:** keep it free and non-commercial, and keep the "not affiliated" footer.
