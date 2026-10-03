import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { databasePath } from './db.js';

const PREFIX = 'cuberush-';

/**
 * Copies the database to `dir` as `cuberush-<UTC time>.db` and keeps only the newest `keep`
 * copies. SQLite's online backup makes a consistent copy even while the server is writing.
 */
export async function backupDatabase(
  source: string,
  dir: string,
  keep: number,
  now = new Date(),
): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().slice(0, 19).replaceAll(':', '-');
  const target = join(dir, `${PREFIX}${stamp}.db`);
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(target);
  } finally {
    db.close();
  }
  // Names sort by time, so everything before the newest `keep` goes.
  const copies = readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'))
    .sort();
  for (const old of copies.slice(0, Math.max(0, copies.length - keep))) rmSync(join(dir, old));
  return target;
}

// `npm run backup -w @cuberush/server`; BACKUP_DIR defaults to a `backups` folder next to the
// database, BACKUP_KEEP to 14 copies.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const source = databasePath();
  const dir = process.env.BACKUP_DIR ?? join(dirname(source), 'backups');
  const keep = Number(process.env.BACKUP_KEEP ?? 14);
  const target = await backupDatabase(source, dir, keep);
  console.log(`Backed up ${source} to ${target}`);
}
