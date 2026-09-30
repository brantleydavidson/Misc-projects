import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handle } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import type { AppContext } from '../src/context.ts';
import { createDriveClient } from '../src/drive.ts';
import { MemoryRepository } from '../src/repo.ts';
import { LocalObjectStore } from '../src/storage.ts';

const TOKEN = 'super-secret-token-xyz';
const PDF = Buffer.from('%PDF-1.4 reading-index');

const AUTHORIZED_USER = {
  type: 'authorized_user',
  client_id: 'client-id',
  client_secret: 'client-secret',
  refresh_token: 'refresh-token',
  quota_project_id: 'resonant-apex-447322-t6',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function header(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers || Array.isArray(headers)) return undefined;
  const record = headers as Record<string, string>;
  return record[name] ?? record[name.toLowerCase()];
}

function bodyText(body: BodyInit | null | undefined): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return String(body);
}

test('missing Drive credentials skip upload', async () => {
  const client = createDriveClient({});
  const result = await client.uploadPdf('fern.pdf', PDF);
  assert.equal(result.uploaded, false);
  assert.equal(result.fileId, undefined);
  assert.equal(result.skippedReason, 'Drive credentials are not configured');
});

test('a service account JSON is not used for upload', async (t) => {
  let called = false;
  t.mock.method(globalThis, 'fetch', async () => {
    called = true;
    return jsonResponse({});
  });
  const client = createDriveClient({
    driveCredentialsJson: JSON.stringify({
      type: 'service_account',
      client_email: 'reading@project.iam.gserviceaccount.com',
      private_key: 'not-a-user',
    }),
  });
  const result = await client.uploadPdf('fern.pdf', PDF);
  assert.equal(result.uploaded, false);
  assert.match(result.skippedReason ?? '', /authorized_user/);
  assert.equal(called, false);
});

test('token refresh and files.create send the PDF to the Reading folder', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const params = new URLSearchParams(bodyText(init?.body));
      assert.equal(params.get('grant_type'), 'refresh_token');
      assert.equal(params.get('client_id'), AUTHORIZED_USER.client_id);
      assert.equal(params.get('client_secret'), AUTHORIZED_USER.client_secret);
      assert.equal(params.get('refresh_token'), AUTHORIZED_USER.refresh_token);
      return jsonResponse({ access_token: 'ya29.test', expires_in: 3600 });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files') && (!init?.method || init.method === 'GET')) {
      const query = new URL(url).searchParams.get('q') ?? '';
      assert.match(query, /name = 'Reading'/);
      assert.match(query, /application\/vnd\.google-apps\.folder/);
      assert.equal(header(init, 'authorization'), 'Bearer ya29.test');
      assert.equal(header(init, 'x-goog-user-project'), AUTHORIZED_USER.quota_project_id);
      return jsonResponse({ files: [] });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files') && init?.method === 'POST') {
      const created = JSON.parse(bodyText(init.body)) as { name?: string; mimeType?: string };
      assert.equal(created.name, 'Reading');
      assert.equal(created.mimeType, 'application/vnd.google-apps.folder');
      return jsonResponse({ id: 'folder-reading' });
    }
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      assert.match(url, /uploadType=multipart/);
      assert.equal(init?.method, 'POST');
      assert.equal(header(init, 'authorization'), 'Bearer ya29.test');
      const raw = init?.body;
      assert.ok(Buffer.isBuffer(raw));
      const metadata = raw.toString('utf8').match(/\{[\s\S]*?\}/);
      assert.ok(metadata);
      const parsed = JSON.parse(metadata[0]) as { parents?: string[]; mimeType?: string; name?: string };
      assert.deepEqual(parsed.parents, ['folder-reading']);
      assert.equal(parsed.mimeType, 'application/pdf');
      assert.equal(parsed.name, 'fern.pdf');
      assert.ok(raw.includes(PDF));
      return jsonResponse({ id: 'file-pdf' });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const client = createDriveClient({
    driveCredentialsJson: JSON.stringify(AUTHORIZED_USER),
  });
  const result = await client.uploadPdf('fern.pdf', PDF);
  assert.equal(result.uploaded, true);
  assert.equal(result.fileId, 'file-pdf');
  assert.equal(result.skippedReason, undefined);
  assert.equal(calls.length, 4);
});

test('DRIVE_FOLDER_ID uploads into that folder without creating Reading', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'ya29.test', expires_in: 3600 });
    }
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      const raw = init?.body;
      assert.ok(Buffer.isBuffer(raw));
      const metadata = raw.toString('utf8').match(/\{[\s\S]*?\}/);
      assert.ok(metadata);
      const parsed = JSON.parse(metadata[0]) as { parents?: string[] };
      assert.deepEqual(parsed.parents, ['preset-folder']);
      return jsonResponse({ id: 'file-preset' });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const client = createDriveClient({
    driveFolderId: 'preset-folder',
    driveCredentialsJson: JSON.stringify(AUTHORIZED_USER),
  });
  const result = await client.uploadPdf('fern.pdf', PDF);
  assert.equal(result.uploaded, true);
  assert.equal(result.fileId, 'file-preset');
});

test('a 403 from Drive does not fail the save', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'ya29.test', expires_in: 3600 });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files') && (!init?.method || init.method === 'GET')) {
      return jsonResponse({ files: [{ id: 'folder-reading', parents: ['root'] }] });
    }
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      return jsonResponse({
        error: { code: 403, message: 'The user does not have sufficient permissions' },
      }, 403);
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const dir = await mkdtemp(join(tmpdir(), 'reading-index-drive-'));
  try {
    const config = loadConfig({
      SAVE_TOKEN: TOKEN,
      MCP_TOKEN: 'mcp-token',
      OPTIMIZE_TOKEN: 'optimize-token',
      DATA_DIR: dir,
      DRIVE_CREDENTIALS_JSON: JSON.stringify(AUTHORIZED_USER),
    });
    const ctx: AppContext = {
      config,
      repo: new MemoryRepository(),
      store: new LocalObjectStore(dir),
      drive: createDriveClient(config),
      fetchReadable: async () => {
        throw new Error('save provided text');
      },
      now: () => new Date('2026-04-01T00:00:00.000Z'),
    };
    const saved = await handle(new Request('http://localhost/save', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Fern note',
        text: 'A short highlight about ferns.',
        source_kind: 'selection',
      }),
    }), ctx);
    assert.equal(saved.status, 201);
    const body = await saved.json() as {
      id: string;
      status: string;
      drive: { uploaded: boolean; file_id: string | null; skipped_reason: string | null };
      pdf_uri: string;
    };
    assert.equal(body.status, 'ready');
    assert.equal(body.drive.uploaded, false);
    assert.equal(body.drive.file_id, null);
    assert.match(body.drive.skipped_reason ?? '', /Drive upload failed \(403\)/);
    const doc = await ctx.repo.getDocument(body.id);
    assert.equal(doc?.status, 'ready');
    assert.equal(doc?.driveFileId, null);
    assert.match(doc?.driveStatus ?? '', /skipped: Drive upload failed \(403\)/);
    const pdf = await readFile(body.pdf_uri.replace('file://', ''));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('DRIVE_CREDENTIALS_FILE loads authorized-user JSON and env JSON wins', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reading-index-adc-'));
  try {
    const file = join(dir, 'application_default_credentials.json');
    await writeFile(file, JSON.stringify({
      type: 'authorized_user',
      client_id: 'from-file',
      client_secret: 'file-secret',
      refresh_token: 'file-refresh',
    }));
    const fromFile = loadConfig({
      SAVE_TOKEN: 'save',
      MCP_TOKEN: 'mcp',
      DRIVE_CREDENTIALS_FILE: file,
    });
    assert.match(fromFile.driveCredentialsJson ?? '', /from-file/);

    const fromEnv = loadConfig({
      SAVE_TOKEN: 'save',
      MCP_TOKEN: 'mcp',
      DRIVE_CREDENTIALS_FILE: file,
      DRIVE_CREDENTIALS_JSON: JSON.stringify(AUTHORIZED_USER),
    });
    assert.match(fromEnv.driveCredentialsJson ?? '', /client-id/);
    assert.equal((fromEnv.driveCredentialsJson ?? '').includes('from-file'), false);

    const missing = loadConfig({
      SAVE_TOKEN: 'save',
      MCP_TOKEN: 'mcp',
      DRIVE_CREDENTIALS_FILE: join(dir, 'missing.json'),
    });
    assert.equal(missing.driveCredentialsJson, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
