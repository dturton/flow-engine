import { loadConfig } from './config.js';
import { createDeps, closeDeps } from './deps.js';
import { buildApp } from './app.js';

async function main() {
  const config = loadConfig();
  const deps = createDeps(config);
  const app = await buildApp(config, deps);

  const shutdown = async () => {
    app.log.info('Shutting down...');
    await app.close();
    await closeDeps(deps);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`API server listening on ${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
