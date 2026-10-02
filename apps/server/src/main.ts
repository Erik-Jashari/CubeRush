import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { openDatabase } from './db.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const databasePath =
  process.env.DATABASE_PATH ?? fileURLToPath(new URL('../data/cuberush.db', import.meta.url));
// Serve the built web app when there is one, so production is a single process.
const webRoot = fileURLToPath(new URL('../../web/dist', import.meta.url));

const app = await buildApp({
  db: openDatabase(databasePath),
  logger: true,
  webRoot: existsSync(webRoot) ? webRoot : undefined,
  trustProxy: process.env.TRUST_PROXY === '1',
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
