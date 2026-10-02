# CubeRush

A 3D Rubik's cube game: solve seeded scrambles against the clock, earn points and climb the leaderboard.

## Layout

| Path                  | What it is                                                                           |
| --------------------- | ------------------------------------------------------------------------------------ |
| `packages/cube-core/` | Pure TypeScript cube engine: state, moves, notation, seeded scrambles, verification, scoring |
| `apps/web/`           | React + react-three-fiber client (coming next)                                        |
| `apps/server/`        | Fastify + SQLite API (coming later)                                                   |

## Commands

```sh
npm install
npm test           # run all tests
npm run typecheck  # TypeScript project build
npm run lint
npm run format
```

## Cube engine at a glance

```ts
import { createScrambledCube, parseMoves, applyMoves, isSolved, verifySolve } from '@cuberush/cube-core';

const { scramble, state } = createScrambledCube('daily-2026-10-02'); // same seed → same scramble
const after = applyMoves(state, parseMoves("R U R' U'"));
isSolved(after);
verifySolve('daily-2026-10-02', playerMoves); // { solved, moveCount }, used by the server for anti-cheat
```

Turn conventions follow WCA notation. Internally a `Move` is `{ axis, from, to, turns }`: a block of layers along one axis,
turned by quarter turns counterclockwise about the positive axis.
