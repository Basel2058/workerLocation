import { buildApp } from './app';
import { ensureDeveloper } from './bootstrap';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { systemLog } from './services/logs';

const config = loadConfig();
const db = openDatabase(config.dbFile);
const app = await buildApp(config, { db });

await ensureDeveloper(db, config, (msg) => console.log(msg));

process.on('unhandledRejection', (reason) => {
  app.log.error({ reason }, 'unhandled rejection');
  systemLog(db, 'error', 'process', `Unhandled rejection: ${String(reason)}`, {
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

let closing = false;
const shutdown = async (signal: string) => {
  if (closing) return;
  closing = true;
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
if (config.runJobs) app.ctx.jobs.start();
systemLog(db, 'info', 'process', `Server started (v${config.version}, ${config.env})`);
