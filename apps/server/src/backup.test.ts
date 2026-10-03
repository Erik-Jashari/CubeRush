import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupDatabase } from './backup';
import { openDatabase } from './db';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cuberush-backup-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('backups', () => {
  it('copies the data while the database is open, keeping the newest copies', async () => {
    const file = join(dir, 'live.db');
    const live = openDatabase(file);
    live
      .prepare('INSERT INTO players (id, nickname, created_at) VALUES (?, ?, ?)')
      .run('p1', 'Kept', 1);

    const backups = join(dir, 'backups');
    for (const hour of [1, 2, 3]) {
      await backupDatabase(file, backups, 2, new Date(Date.UTC(2026, 9, 3, hour)));
    }
    live.close();

    const copies = readdirSync(backups).sort();
    expect(copies).toEqual(['cuberush-2026-10-03T02-00-00.db', 'cuberush-2026-10-03T03-00-00.db']);
    const copy = new Database(join(backups, copies[1]!), { readonly: true });
    expect(copy.prepare('SELECT nickname FROM players').get()).toEqual({ nickname: 'Kept' });
    copy.close();
  });
});
