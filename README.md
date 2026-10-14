# Trainer Trivia

A mobile-friendly Pokémon TCG trivia game. Card data and images come from the free [TCGdex API](https://tcgdex.dev) (no key needed), sign-in and the leaderboard run on Firebase, and the site is hosted on GitHub Pages.

Each game is 10 rounds of 15 seconds. The player sees only the cropped artwork (no name, HP, set symbol or artist credit) and answers one of five question types: which Pokémon, which set, how much HP, what type, or who illustrated it. A correct answer earns 100 points plus up to 50 for speed, so the maximum is 1,500.

## Files

```
trainer-trivia/
├── index.html             page structure: login, home, game, results
├── css/
│   └── styles.css         all styling, light/dark mode, mobile layout
├── js/
│   ├── app.js             UI and game flow (rounds, timer, scoring)
│   ├── questions.js       turns random cards into questions
│   ├── tcgdex.js          TCGdex API calls + caching
│   ├── firebase.js        sign-in, saving scores, leaderboard
│   └── firebase-config.js YOUR Firebase keys go here
├── firestore.rules        database security rules (paste into Firebase)
└── README.md
```

## 1. Set up Firebase

1. Go to the [Firebase console](https://console.firebase.google.com) and create a project (Google Analytics is optional).
2. **Add a web app:** Project settings → General → *Your apps* → the `</>` icon. Copy the `firebaseConfig` object into `js/firebase-config.js`.
3. **Turn on sign-in:** Build → Authentication → Get started → Sign-in method. Enable **Google** and **Anonymous** (Anonymous powers "Play as guest").
4. **Authorized domains:** Authentication → Settings → Authorized domains. `localhost` is there by default. Add `127.0.0.1` for local testing and `YOUR-USERNAME.github.io` for the live site.
5. **Create the database:** Build → Firestore Database → Create database (production mode, any nearby region).
6. **Security rules:** Firestore → Rules tab, replace everything with the contents of `firestore.rules`, and click Publish.

The leaderboard sorts on one field, so no extra index is needed.

## 2. Run it locally in VS Code

The JS files are ES modules, which browsers won't load from `file://`. Serve the folder instead:

1. Install the **Live Server** extension.
2. Right-click `index.html` → *Open with Live Server*.

To test on your phone, open the same address using your computer's local IP (e.g. `http://192.168.1.20:5500`) on the same Wi-Fi, and add that IP to Firebase's authorized domains.

## 3. Deploy to GitHub Pages

1. Create a repo and push this folder's contents (so `index.html` is at the repo root).
2. Repo → Settings → Pages → *Deploy from a branch* → `main` / `(root)` → Save.
3. After a minute the site is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
4. Make sure `YOUR-USERNAME.github.io` is in Firebase's authorized domains.

## Customizing

- **Rounds, time, points:** constants at the top of `js/app.js`. If you raise the max score, also raise the `bestScore <= 1500` limit in `firestore.rules`.
- **Question types:** add an entry to `GENERATORS` in `js/questions.js`. Each one gets the full card and returns `{ prompt, answer, options }`, or `null` to skip.
- **Artwork crop:** the `--art-*` variables at the top of `css/styles.css` set which part of the card is shown. They're tuned for modern cards; older sets and full-art cards will crop less neatly.
- **Including TCG Pocket cards:** remove the `POCKET_SET` filter in `js/questions.js` (their layout differs, so the crop may need adjusting).

## Good to know

- **Cheating:** scoring happens in the browser, so a determined player could submit a fake score. The rules cap scores at 1,500 and only let them go up one game at a time, which stops casual tampering. Fully preventing it would need server-side scoring with Cloud Functions.
- **The Firebase config is public on purpose.** Security comes from the Auth setup and `firestore.rules`, not from hiding the keys.
- **Copyright:** the card images belong to Nintendo, The Pokémon Company and the artists. Keep it free and non-commercial, keep the footer disclaimer, and avoid official logos.
