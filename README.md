# Trainer Trivia

A live Pokémon party-trivia game: a Jeopardy-style board on a shared screen, Kahoot-style answering from everyone's phones, and Mario Party-style wildcards. It runs as a static site on GitHub Pages, with Firebase for sign-in and real-time sync.

## How a game works

1. **The host** opens the site on a laptop or TV and clicks **Create a room**. The screen shows a 4-letter code and a QR code.
2. **Players** open the site on their phones (or scan the QR code), enter the code and a name.
3. The host picks **Everyone for themselves** or **Teams** (2–4 teams), the time per question, and whether wildcards are on, then starts.
4. **Players take turns picking** a face-down card from the board. Columns are categories, and questions get harder further down each column, but **point values are random** (100–500) and hidden until the card flips.
5. **Everyone answers every question** on their phone. A correct answer earns:
   - the card's points,
   - plus up to **25% extra for speed**,
   - plus **25% extra for the player who picked the card**.

   Wrong answers cost nothing.
6. After each answer reveal, everyone sees the **leaderboard**, including who moved up or down.
7. **Wildcards** are hidden on the board (one per column):

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
8. When the board is cleared, the **final round** starts. Everyone sees the category, secretly wagers part of their score, then answers. Right wins the wager; wrong loses it.
9. If first place is tied, the host can run a **tiebreaker**: the closest number guess wins.

In team mode, every player still answers on their own phone and takes their own turns picking. The team score is the sum of its members' scores.

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
Open `index.html` with VS Code's **Live Server** extension. To test with phones on the same Wi-Fi, open `http://YOUR-COMPUTER-IP:5500` on the phone and add that IP to the authorized domains. You can also test alone: open the host in one browser window and a player in a private window (each window signs in separately).

### Deploy
Push the folder to a GitHub repo (with `index.html` at the root), then Settings → Pages → deploy from `main` / `(root)`.

## Customizing

- **Questions:** edit `js/questions.js`. Each question needs a `prompt`, the right `answer`, and exactly three `wrong` answers. Answer order is shuffled every game. Categories can have any number of questions; 6 categories × 5 questions fits a TV screen best.
- **Scoring:** change `SPEED_BONUS`, `PICKER_BONUS`, `POINT_VALUES`, `STEAL_AMOUNT` and the timer lengths at the top of `js/game.js`.
- **Wildcards and the wheel:** edit `WILDCARDS` and `WHEEL` in `js/game.js`. A new wildcard type also needs a `case` in `resolveWild()`.
- **Teams:** names and colors are in `TEAMS` in `js/game.js`.

## Look and feel

- The host screen always uses the dark navy "stage" so it reads well on a TV. Phones follow the device's light or dark setting.
- Fonts are Bricolage Grotesque (headings, numbers, room codes) and Figtree (everything else), loaded from Google Fonts.
- Brand colors, answer-tile colors and corner sizes are tokens at the top of `css/styles.css`.

## Good to know

- **The host's browser is the referee.** It keeps the answers, runs the timers and does the scoring. If the host refreshes, the game picks up where it left off. If the host's screen closes, the game pauses until it comes back.
- **Hidden answers stay hidden.** Correct answers and the board's hidden cards live in a host-only document, and players can't see each other's answers. However, `questions.js` is public on GitHub Pages, so a determined player could look up the answers. That's fine for a party game, but don't use it for prizes.
- **QR code:** generated by the free api.qrserver.com service. If it doesn't load, players can type the address and code instead.
- **Copyright:** keep it free and non-commercial, and keep the "not affiliated" footer.
