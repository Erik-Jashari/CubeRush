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
```

### Server settings

| Variable        | Default                         | Purpose                                              |
| --------------- | ------------------------------- | ---------------------------------------------------- |
| `PORT`          | `3000`                          | HTTP port                                            |
| `HOST`          | `127.0.0.1`                     | Bind address (`0.0.0.0` to expose it)                |
| `DATABASE_PATH` | `apps/server/data/cuberush.db`  | SQLite file, created on first run                    |
| `TRUST_PROXY`   | unset                           | Set to `1` behind a reverse proxy so rate limits see real IPs |

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
