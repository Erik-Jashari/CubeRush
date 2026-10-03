import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { databasePath, openDatabase } from './db.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
// Serve the built web app when there is one, so production is a single process.
const webRoot = fileURLToPath(new URL('../../web/dist', import.meta.url));

const db = openDatabase(databasePath());
const app = await buildApp({
  db,
  logger: true,
  webRoot: existsSync(webRoot) ? webRoot : undefined,
  trustProxy: process.env.TRUST_PROXY === '1',
});

// Hosts (and Docker) stop a server with SIGTERM: finish open requests, then close the database.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app.close().then(() => {
      db.close();
      process.exit(0);
    });
  });
}

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
