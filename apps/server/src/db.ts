import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = Database.Database;

/** Each entry upgrades the schema by one version; never edit one that has shipped. */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE players (
    id          TEXT PRIMARY KEY,
    nickname    TEXT NOT NULL UNIQUE COLLATE NOCASE,
    token_hash  TEXT NOT NULL UNIQUE,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE attempts (
    id            TEXT PRIMARY KEY,
    player_id     TEXT NOT NULL REFERENCES players(id),
    mode          TEXT NOT NULL CHECK (mode IN ('quick', 'daily')),
    seed          TEXT NOT NULL,
    ranked        INTEGER NOT NULL,
    created_at    INTEGER NOT NULL,
    submitted_at  INTEGER
  );
  CREATE INDEX attempts_by_player_seed ON attempts (player_id, seed);

  CREATE TABLE solves (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id  TEXT NOT NULL UNIQUE REFERENCES attempts(id),
    player_id   TEXT NOT NULL REFERENCES players(id),
    mode        TEXT NOT NULL,
    seed        TEXT NOT NULL,
    ranked      INTEGER NOT NULL,
    moves       TEXT NOT NULL,        -- JSON [{ m, t }], kept for replays and ghosts
    time_ms     INTEGER NOT NULL,
    move_count  INTEGER NOT NULL,
    used_undo   INTEGER NOT NULL,
    points      INTEGER NOT NULL,
    day         TEXT NOT NULL,        -- UTC date the solve was submitted, for streaks
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX solves_by_seed ON solves (seed, ranked, time_ms);
  CREATE INDEX solves_by_player ON solves (player_id, ranked, day);
  `,
  // Part 4: more modes, challenge links, and per-mode details on solves.
  `
  CREATE TABLE attempts_v2 (
    id              TEXT PRIMARY KEY,
    player_id       TEXT NOT NULL REFERENCES players(id),
    mode            TEXT NOT NULL
                    CHECK (mode IN ('quick', 'daily', 'challenge', 'blindfold', 'survival')),
    seed            TEXT NOT NULL,
    ranked          INTEGER NOT NULL,
    challenge_code  TEXT,
    created_at      INTEGER NOT NULL,
    submitted_at    INTEGER
  );
  INSERT INTO attempts_v2 (id, player_id, mode, seed, ranked, created_at, submitted_at)
    SELECT id, player_id, mode, seed, ranked, created_at, submitted_at FROM attempts;
  DROP TABLE attempts;
  ALTER TABLE attempts_v2 RENAME TO attempts;
  CREATE INDEX attempts_by_player_seed ON attempts (player_id, seed);
  CREATE INDEX attempts_by_challenge ON attempts (challenge_code);

  ALTER TABLE solves ADD COLUMN extra TEXT;  -- JSON: { cleared } for survival, { peeked } for blindfold

  CREATE TABLE challenges (
    code        TEXT PRIMARY KEY,
    solve_id    INTEGER NOT NULL UNIQUE REFERENCES solves(id),
    player_id   TEXT NOT NULL REFERENCES players(id),
    created_at  INTEGER NOT NULL
  );
  `,
  // Part 5: skins bought with points.
  `
  CREATE TABLE unlocks (
    player_id   TEXT NOT NULL REFERENCES players(id),
    skin        TEXT NOT NULL,
    cost        INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (player_id, skin)
  );
  `,
];

/** Opens (creating if needed) the database at `file`, or an in-memory one for `:memory:`. */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');

  // Rebuilding a table means dropping one that others reference, so foreign keys are off while
  // migrating (SQLite ignores the pragma inside a transaction) and checked afterwards.
  db.pragma('foreign_keys = OFF');
  const version = db.pragma('user_version', { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  const broken = db.pragma('foreign_key_check') as unknown[];
  if (broken.length > 0) throw new Error(`Migration broke ${broken.length} foreign keys`);
  db.pragma('foreign_keys = ON');
  return db;
}
