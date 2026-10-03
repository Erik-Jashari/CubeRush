# CubeRush: notes for Claude

A 3D Rubik's cube game: timed solves verified by the server, points, leaderboards, modes, shop, tutorial.
`README.md` is the user-facing overview; this file is what you need to work on the code safely.

## Layout (npm workspaces)

| Path                  | Owns                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `packages/cube-core/` | Pure TS engine, no DOM: state, moves, notation, scrambles, verify, scoring, stages, hints  |
| `packages/api/`       | Request/response types and shared constants (modes, skins, themes, nickname rules)         |
| `apps/web/`           | Vite + React 19 + react-three-fiber + zustand client                                       |
| `apps/server/`        | Fastify 5 + better-sqlite3 API; also serves `apps/web/dist` in production                  |

Install into a workspace with `npm install <pkg> -w @cuberush/web` (check `package.json` after: the first
install into a workspace has silently not saved before).

## Commands: all must pass before calling work done

`npm test` · `npm run typecheck` (`tsc -b`) · `npm run lint` · `npm run format:check` · `npm run build`

CI (`.github/workflows/ci.yml`) runs the same on every push to `main`. `.prettierignore` skips `*.md`.

## Cube model traps

- Cubie positions are **doubled integers**: `2*layer-(n-1)`, so a 3x3 uses -2, 0, 2.
- `Move = { axis, from, to, turns }`: `turns` is quarter turns **counterclockwise about +axis**. WCA
  "clockwise" R is `turns: -1` on x, but L is `+1`. Never hand-build moves; use `parseMove`/`formatMove`.
- Whole-cube rotations (x, y, z) are free: they don't count as moves or toward turns-per-second.
- Tutorial stages (`stages.ts`) are judged **relative to center colors**, so they work in any orientation.
  White is the home `U` color but the method holds the cube with white on the bottom (`z2`).

## Trust rules (never weaken without asking)

- The server picks the seed, replays every submitted move list, and computes points itself.
- Anti-cheat limits live in `apps/server/src/anticheat.ts` (`RULES`). Only the first attempt at a seed is
  ranked; retries, challenges and the tutorial never are.
- Ownership of skins/themes comes from the `unlocks` table; local settings may only *pick* owned items.

## Database

- Every SQL statement lives in `apps/server/src/repo.ts`; routes in `app.ts` never touch SQL.
- Schema changes are a **new entry at the end of `MIGRATIONS`** in `db.ts`. Never edit a shipped one.
  To change a column, build `<table>_v2`, copy rows, drop, rename, and add a migration test that starts
  from the old version (see the migration tests in `modes.test.ts`).
- Totals, wallet, streaks and best times are computed from `solves`, not stored.
- Use named params (`@code`) when a value repeats; numbered `?1` params errored with better-sqlite3.

## Testing

- Server tests use `useTestServer()` from `apps/server/src/test-support.ts` (in-memory DB, fake clock).
  `solution(seed)` gives a genuine solve.
- `apps/web/src/ui/lessons.test.ts` simulates each lesson's written instructions: tutorial advice must
  stay proven by it. `themes.test.ts` enforces 4.5:1 contrast for every theme.
- Web tests run in Node (no DOM): don't use `HTMLElement` etc. at module or test level.

## Running it in a browser (important)

- The user keeps `npm run dev` running in VS Code on ports **3000/5173 with their real DB**. Don't use,
  restart or kill those (never kill processes whose parent is Code.exe).
- Use an isolated stack with a scratch DB:
  - API: in `apps/server`, `PORT=3200 DATABASE_PATH=<scratchpad>/test.db npx tsx src/main.ts`
  - Web: in `apps/web`, `API_PORT=3200 npx vite --port 5180 --strictPort`
- Drive it with puppeteer-core and the installed Chrome
  (`C:/Program Files/Google/Chrome/Application/chrome.exe`, args `--use-angle=swiftshader
  --enable-unsafe-swiftshader`). Dev builds expose the game store as `window.cuberush`.
- Stop your servers afterwards.

## Windows shell

This is Windows with Git Bash. Bash mangles backticks, `$` and nested quotes in `node -e` and heredocs:
write a script file to the scratchpad and run it, or use the Edit tool.

## Working with this user

- They commit themselves. Don't commit unless asked.
- Plan larger work in parts before building; ask about real product choices.
- They are learning deployment: explain Docker/hosting concepts, don't deploy for them.
- Match the existing code style: small focused modules, a short doc comment on each export, comments that
  say *why*.
