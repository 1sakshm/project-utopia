# Utopia Versus — match server

Realtime multiplayer for Utopia: ranked 1v1 quick match, friend duels, parties of up to 8, live spectating, a
leaderboard and "ghost" races. Runs on **Cloudflare Workers + Durable Objects** (the same account as the Pages site).

## How a match works

Every player in a room gets **the same game with the same seed**, started at the same moment. The games already
generate their levels from a seed, so nobody's game needs netcode: the server only agrees on *when* a round starts
and *what everyone scored*. Live scores are relayed to opponents and spectators (~6 updates/s).

```
quick match:  lobby queue → paired by rating → room (auto-ready) → 4s countdown → play → results + Elo
friend duel:  POST /rooms → share link/code → both ready → play → rematch
party:        POST /rooms → host picks the game → host starts (≥2) → live board → results
ghost:        nobody around? race a recorded run from another player (or your own best), entirely on-device
```

- `src/lobby.ts`: one global Durable Object. Presence, the "Live now" list, matchmaking, Elo ratings, leaderboard,
  recorded ghost runs.
- `src/match.ts`: one Durable Object per room code. Room state machine `lobby → countdown → playing → done`,
  30 s reconnect grace (then forfeit), 6 min round cap, rematches, emotes.
- `../src/platform/versus/protocol.ts`: the wire protocol, shared with the app.

Both objects use the WebSocket Hibernation API, so idle sockets cost nothing.

## Run locally

```bash
cd server
npm install
npm run dev            # ws://localhost:8787  (no Cloudflare account needed)
```

The app's dev build connects to `ws://<your-host>:8787` automatically, so `npm run dev` in the repo root plus this
is all you need. Open two browser profiles (or a normal + private window) to play yourself.

## Deploy

```bash
cd server
npx wrangler login     # once
npm run deploy         # prints https://utopia-versus.<your-subdomain>.workers.dev
```

Then build the app with the server's address and deploy it as usual:

```bash
# .env.local in the repo root
VITE_VERSUS_URL=wss://utopia-versus.<your-subdomain>.workers.dev
```

Lock the server to your site in `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://playutopia.pages.dev,https://project-utopia-zeta.vercel.app"
```

Durable Objects with SQLite storage are available on the Workers **free plan**.

## Known limits (v1)

- **Scores are trusted from the client.** Same-seed play makes cheating harder to hide (everyone has the same
  board) but doesn't prevent it. Next step: send each trial (answer + timestamp) and re-score on the server for
  the games where that's cheap.
- **Identity is a random device id**, no account. Clearing site data starts a new rating.
- **Display names are not filtered** beyond length and control characters. Add a word list before a public launch.
