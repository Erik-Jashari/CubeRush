# CubeRush

A 3D Rubik's cube game: solve seeded scrambles against the clock, earn points and climb the leaderboard.

## Layout

| Path                  | What it is                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `packages/cube-core/` | Pure TypeScript cube engine: state, moves, notation, seeded scrambles, verification, scoring |
| `packages/api/`       | Request/response types and shared rules for the HTTP API                                     |
| `apps/web/`           | React + react-three-fiber client: 3D cube, drag-to-turn, timer, leaderboard                  |
| `apps/server/`        | Fastify + SQLite API: nicknames, attempts, verified solves, leaderboards                     |

## Commands

```sh
npm install
npm run dev        # API on :3000 + web on http://localhost:5173 (proxies /api)
npm run build      # production build of the web app
npm start          # one process: API + built web app on http://localhost:3000
npm test           # run all tests
npm run typecheck  # TypeScript project build
npm run lint
npm run format
npm run backup     # copy the database to apps/server/data/backups (keeps the newest 14)
```

Hosting it is covered step by step in [docs/DEPLOY.md](docs/DEPLOY.md) (Docker, a host with a volume, HTTPS,
backups). CI runs every check on each push to `main`. Notes for working on the code with Claude are in
[CLAUDE.md](CLAUDE.md).

### Server settings

| Variable        | Default                         | Purpose                                              |
| --------------- | ------------------------------- | ---------------------------------------------------- |
| `PORT`          | `3000`                          | HTTP port                                            |
| `HOST`          | `127.0.0.1`                     | Bind address (`0.0.0.0` to expose it)                |
| `DATABASE_PATH` | `apps/server/data/cuberush.db`  | SQLite file, created on first run                    |
| `TRUST_PROXY`   | unset                           | Set to `1` behind a reverse proxy so rate limits see real IPs |

To run a second local stack next to `npm run dev`, give it its own API port and database, and point Vite at it:

```sh
PORT=3200 DATABASE_PATH=/tmp/test.db npm start               # API
API_PORT=3200 npm run dev -w @cuberush/web -- --port 5180     # web
```

## Game modes

| Mode           | How it works                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Quick play     | Fresh random scramble. Finished solves can be shared as a challenge link.                      |
| Daily scramble | Same scramble for everyone each UTC day. First try is ranked; retries race today's best ghost. |
| Challenge      | Opened from a `/c/<code>` link: same scramble as a friend, racing their ghost. Never ranked.   |
| Blindfold      | 10 s to memorize, then the stickers go blank. ×2 points unless you peek (honor system).        |
| Survival       | A short scramble wave every 20 s; solve it in time or lose a life. 150 points per wave solved. |

Retrying any scramble races a ghost of your last run on it. Camera: drag the background, or right-drag
anywhere (even on the cube), to look around.

**Keyboard:** the csTimer layout cubers know (I/K = R/R′, J/F = U/U′, H/G = F/F′, D/E = L/L′, S/L = D/D′,
W/O = B/B′, ;/A = y/y′ …). Press **?** in a game for the full sheet; turn it off under Settings.

The app installs to a phone or desktop home screen and works offline (guest play and lessons; solves made
offline aren't saved).

## Learn to solve

The **Learn** screen has two courses:

- **Moves 101** teaches notation with an arrow on the cube showing each turn, then drills R U R′ U′ and Sune. Wrong
  turns are caught and undone; half turns can be done as two quarter turns.
- **Solve the cube** is the 7-step beginner method (white cross → corners → middle edges → yellow cross → yellow
  edges → place corners → twist corners). Each step deals a practice cube with only that step left, explains the
  algorithm (with a guided walk-through), and celebrates when the step is done.

Step detection and practice cubes live in `packages/cube-core` (`stages.ts`, `practice.ts`, `algorithms.ts`). The
lesson tests in `apps/web/src/ui/lessons.test.ts` follow each lesson's written instructions on 50 practice cubes and
check they really finish the step, so the advice can't silently go wrong.

Lesson 8, **Solve a whole cube**, deals a full scramble with a **Hint** button. `nextHint`
(`packages/cube-core/src/hint.ts`) works out which step the cube is on and searches for the shortest run of
that step's algorithms finishing one more piece, done from whichever side needs it so nobody has to rotate
the cube. Its tests follow the hints from 40 scrambles (and odd orientations) to solved.

Finished lessons are kept on the player's account when signed in, so they follow them to other devices.

## Progression

- **Points** from ranked solves count toward the all-time leaderboard and can be spent in the **shop** on cube skins
  (Pastel, Neon, Wood) and page themes (Sunset, Forest, Royal; Midnight and Ocean are free). Spending never lowers
  the leaderboard total. Ownership lives on the server, so editing local settings can pick an item but not unlock
  one.
- **Profile**: personal best, Ao5/Ao12 (best and worst dropped), a progress chart, achievements, and skins.
- **Leaderboards:** Today (the daily scramble), This week (points since Monday, UTC), Fastest (best ranked
  single from Quick play and Daily, with the latest Ao5) and All time (total points).
- **Accounts and devices:** the profile's Account tab makes a **login code** (`XXXX-XXXX-XXXX-XXXX`) to
  sign in on another device or after clearing the browser; making a new one retires the old. It also shows
  other signed-in devices and can sign them out. Only hashes of codes and session tokens are stored.
- **Achievements** are worked out on the server from verified solves; a result card shows any a solve unlocked.
- **Replay** any finished solve at 0.25×–2×. Turns click (or play notes in melody mode); solves end with a fanfare,
  confetti and a small shake. Sound, melody, ghost and inspection are under Settings on the home screen.

## How a solve is trusted

1. The client asks for an attempt (`POST /api/attempts`); the server picks the scramble seed and notes the time.
2. The client sends the full move list with timestamps (`POST /api/solves`).
3. The server replays the moves on that seed's scramble, rejects anything unsolved, too fast (over 12 turns/s),
   longer than the attempt has existed, or shorter than 20 moves, then computes the points itself.

Only a player's first look at each daily scramble is ranked; retries are practice. Times come from the browser, so
this stops forged results and impossible timings, but not a carefully faked timeline.

## Cube engine at a glance

```ts
import { createScrambledCube, parseMoves, applyMoves, isSolved, verifySolve } from '@cuberush/cube-core';

const { scramble, state } = createScrambledCube('daily-2026-10-02'); // same seed → same scramble
const after = applyMoves(state, parseMoves("R U R' U'"));
isSolved(after);
verifySolve('daily-2026-10-02', playerMoves); // { solved, moveCount }
```

Turn conventions follow WCA notation. Internally a `Move` is `{ axis, from, to, turns }`: a block of layers along one axis,
turned by quarter turns counterclockwise about the positive axis.
