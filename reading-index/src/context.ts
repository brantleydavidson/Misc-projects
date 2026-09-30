import type { AppConfig } from './config.js';
import type { DriveUploader } from './drive.js';
import type { FetchedDocument } from './fetchPage.js';
import type { Repository } from './repo.js';
import type { ObjectStore } from './storage.js';

export interface AppContext {
  config: AppConfig;
  repo: Repository;
  store: ObjectStore;
  drive: DriveUploader;
  fetchReadable: (url: string) => Promise<FetchedDocument>;
  now: () => Date;
}
