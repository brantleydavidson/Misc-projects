import { createApp } from './app.js';
import { assertProductionConfig, loadConfig } from './config.js';
import type { AppContext } from './context.js';
import { createDriveClient } from './drive.js';
import { fetchReadable } from './fetchPage.js';
import { createPostgresRepository, MemoryRepository } from './repo.js';
import { GcsObjectStore, LocalObjectStore } from './storage.js';

const config = loadConfig();
assertProductionConfig(config);

const repo = await openRepository();
const store = config.gcsBucket
  ? new GcsObjectStore(config.gcsBucket)
  : new LocalObjectStore(config.dataDir);
const ctx: AppContext = {
  config,
  repo,
  store,
  drive: createDriveClient(config),
  fetchReadable,
  now: () => new Date(),
};

const app = createApp(ctx);
await app.listen(config.port);
console.log(JSON.stringify({
  msg: 'reading-index listening',
  port: config.port,
  database: config.databaseUrl || config.instanceConnectionName ? 'postgres' : 'memory',
  storage: config.gcsBucket ? 'gcs' : 'local',
  drive: Boolean(config.driveCredentialsJson),
}));

async function openRepository() {
  if (config.databaseUrl || config.instanceConnectionName) {
    return createPostgresRepository(config);
  }
  console.log(JSON.stringify({ msg: 'DATABASE_URL unset; using in-memory repository' }));
  return new MemoryRepository();
}
