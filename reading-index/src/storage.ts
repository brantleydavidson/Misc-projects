import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Storage } from '@google-cloud/storage';

export interface ObjectStore {
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer | null>;
}

export class LocalObjectStore implements ObjectStore {
  constructor(private readonly directory: string) {}

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    await writeFile(`${path}.content-type`, contentType);
    return `file://${path}`;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private pathFor(key: string): string {
    if (!key || key.includes('..') || key.startsWith('/')) {
      throw new Error('invalid object key');
    }
    const safe = key.split('/').map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '_')).join('/');
    const path = resolve(this.directory, safe);
    const root = resolve(this.directory);
    if (!path.startsWith(`${root}/`)) throw new Error('invalid object key');
    return path;
  }
}

export class GcsObjectStore implements ObjectStore {
  private readonly storage = new Storage();

  constructor(private readonly bucketName: string) {}

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    const file = this.storage.bucket(this.bucketName).file(key);
    await file.save(body, { contentType, resumable: false });
    return `gs://${this.bucketName}/${key}`;
  }

  async get(key: string): Promise<Buffer | null> {
    const file = this.storage.bucket(this.bucketName).file(key);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [body] = await file.download();
    return body;
  }
}
