# Trainer Trivia

A live Pokémon party-trivia game: a Jeopardy-style board on a shared screen, Kahoot-style answering from everyone's phones, and Mario Party-style wildcards. It runs as a static site on GitHub Pages, with Firebase for sign-in and real-time sync.

## How a game works

1. **The host** opens the site on a laptop or TV and clicks **Create a room**. The screen shows a 4-letter code and a QR code.
2. **Players** open the site on their phones (or scan the QR code), enter the code and a name.
3. The host picks **Everyone for themselves** or **Teams** (2 to 4 teams), the time per question, **how many of the 36 cards also carry a wildcard** (0 to 36), and **which wildcard types** can appear, then starts.
4. **Players take turns picking** a face-down card from the board. Columns are categories, and questions get harder further down each column, but **point values are random** (100–500) and hidden until the card flips.
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
8. When the board is cleared, the **final round** starts. Everyone sees the category, secretly wagers, then answers. Right wins the wager; wrong loses it. Everyone can wager up to 500 even with a low score, and a wrong answer never takes a score below 0.
9. If first place is tied, the host can run a **tiebreaker**: the closest number guess wins.

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

- **Questions:** edit `js/questions.js`. Each question needs a `prompt`, the right `answer`, and exactly three `wrong` answers. Answer order is shuffled every game. The board has one card per question: 6 categories of 6 questions makes 36 cards, which fits a TV best. Categories can have any number of questions.
- **Scoring:** change `SPEED_BONUS`, `PICKER_BONUS`, `POINT_VALUES`, `STEAL_AMOUNT` and the timer lengths at the top of `js/game.js`.
- **Default settings:** `DEFAULT_SETTINGS` at the top of `js/game.js` (the host can change them in the lobby).
- **Final-round minimum wager:** `FINAL_MIN_WAGER` in `js/game.js`.
- **Wildcards and the wheel:** edit `WILDCARDS` and `WHEEL` in `js/game.js`. A new wildcard type also needs a `case` in `resolveWild()`.
- **Teams:** names and colors are in `TEAMS` in `js/game.js`.

## Look and feel

- The host screen always uses the dark navy "stage" so it reads well on a TV. Phones follow the device's light or dark setting.
- Fonts are Bricolage Grotesque (headings, numbers, room codes) and Figtree (everything else), loaded from Google Fonts.
- Brand colors, answer-tile colors and corner sizes are tokens at the top of `css/styles.css`.

## Leaving and coming back

- **Players:** if a phone closes the page, locks, or loses signal, opening the site again shows a **Rejoin game** card on the start page, and the same `play.html?code=...` link drops them straight back in. Their score and any answer they already locked in are kept.
- **Host:** opening `host.html` again returns to the room you were running, unless that game already finished. The start page also shows **Back to my room**. **Create a room** always starts a fresh one.
- **No more manual refreshes:** when a phone or the host tab comes back on screen or regains signal, the page reconnects and catches up on its own. A page that hasn't loaded after 15 seconds reloads itself (at most twice in two minutes). Screens are kept awake during a game where the browser allows it.
- **Keep the host tab on screen.** It runs the timers. If it's hidden, browsers slow it down; when it comes back, any question whose time ran out closes right away.
- **After you publish an update,** GitHub Pages can serve the old files for up to about 10 minutes. If something looks out of date right after a deploy, do a hard refresh (Ctrl+Shift+R, or Cmd+Shift+R on Mac).

## Good to know

- **The host's browser is the referee.** It keeps the answers, runs the timers and does the scoring. If the host refreshes, the game picks up where it left off. If the host's screen closes, the game pauses until it comes back.
- **Hidden answers stay hidden.** Correct answers and the board's hidden cards live in a host-only document, and players can't see each other's answers. However, `questions.js` is public on GitHub Pages, so a determined player could look up the answers. That's fine for a party game, but don't use it for prizes.
- **QR code:** generated by the free api.qrserver.com service. If it doesn't load, players can type the address and code instead.
- **Copyright:** keep it free and non-commercial, and keep the "not affiliated" footer.
