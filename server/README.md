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
  30 s reconnect grace (then forfeit), 60 s rounds, rematches, emotes.
- `../src/platform/versus/protocol.ts`: the wire protocol, shared with the app.

Both objects use the WebSocket Hibernation API, so idle sockets cost nothing.

## Players database (D1)

Players, @handles, friendships, friend challenges and match history live in **Cloudflare D1** (SQLite):

| Table | What |
|---|---|
| `players` | id, unique `@handle`, name, orb skin, rating, W/L/D, matches, created / last seen. Only a SHA-256 of each device's secret key is stored. |
| `friendships` | one row per pair, `pending` → `accepted` |
| `invites` | friend challenges (a private duel room code), expire after 10 min |
| `matches`, `match_players` | every finished versus round |
| `player_keys` | one row per signed-in device (hash of its key, how it signed in) |
| `saves` | each account's cloud save (JSON + version) |
| `login_failures` | brute-force guard for password logins |

Browse it in the Cloudflare dashboard (Workers & Pages → D1 → `utopia` → Console), or in the app at **`/admin`**
(enter the `ADMIN_TOKEN`). Schema: [`migrations/`](./migrations).

**How sign-in works**

- Every device starts as a **guest**: it creates a public id and a secret key; the first request registers them and
  picks a free `@handle`. Each request/socket presents the key (only its SHA-256 is stored, in `player_keys`).
- **Create account** (`/auth/register`): the guest player gets a password (PBKDF2-SHA256, 100k rounds, salted) and
  can change its @handle at the same time. Same player, so rating, friends and progress stay.
- **Log in** on another device (`/auth/login`, `@handle` + password): that device gets its *own* key for the
  account. 10 wrong tries locks the ID for 15 minutes.
- **Google** (optional): link it to an account; afterwards "Continue with Google" logs in without the ID/password.
  Forgot the password? Sign in with Google, then set a new one (allowed for 30 min without the old password).
- **Cloud save** (`/me/save`): progress, rewards and settings as one versioned JSON document. A device that didn't
  change anything takes the cloud copy; if both changed, they merge (bests/unlocks never go backwards, history is
  combined). Logging in on a device with guest progress merges it into the account.
- Changing the password signs out other password-logged-in devices; **Log out** forgets just that device.

**Turning on Google:** create an OAuth *Web application* client in Google Cloud Console → APIs & Services →
Credentials, add every site origin under *Authorized JavaScript origins* (e.g. `https://www.playutopia.tech`,
`https://playutopia.tech`, `https://playutopia.pages.dev`, `https://project-utopia-zeta.vercel.app`,
`http://localhost:5173`), then put the client id in `GOOGLE_CLIENT_ID` (wrangler.toml) and `VITE_GOOGLE_CLIENT_ID`
(the app's build env) and redeploy both.

## Rounds

Every versus round is **60 seconds** on the server's clock (`ROUND_MS`). Clients show the countdown and the
opponent's live score; when the clock runs out each client submits its score, and the server closes the round
1.5 s later with whatever it has.

## Run locally

```bash
cd server
npm install
npx wrangler d1 migrations apply utopia --local   # once, and after adding migrations
npm run dev            # ws://localhost:8787  (no Cloudflare account needed)
```

Put `ADMIN_TOKEN=<anything>` in `server/.dev.vars` to use `/admin` locally.

The app's dev build connects to `ws://<your-host>:8787` automatically, so `npm run dev` in the repo root plus this
is all you need. Open two browser profiles (or a normal + private window) to play yourself.

## Deploy

```bash
cd server
npx wrangler login                          # once
npx wrangler d1 create utopia               # once: paste the database_id into wrangler.toml
npx wrangler d1 migrations apply utopia --remote
npx wrangler secret put ADMIN_TOKEN         # once: the password for /admin
npm run deploy                              # prints https://utopia-versus.<your-subdomain>.workers.dev
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
- **Guests** who never create an account lose their progress if they clear site data. Accounts don't.
- **Names** are filtered only for length and control characters; **handles** block reserved words and a short
  obscenity list (`src/platform/versus/handles.ts`). Extend it before a big launch.
