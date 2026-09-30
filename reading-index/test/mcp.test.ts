import assert from 'node:assert/strict';
import test from 'node:test';
import { handle } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import type { AppContext } from '../src/context.ts';
import { handleMcp } from '../src/mcp.ts';
import { MemoryRepository } from '../src/repo.ts';
import type { DocumentRecord, NodeRecord } from '../src/types.ts';

const BODY = 'UNIQUE_BODY_SENTENCE_XYZ lives only in the node body.';

function context(repo: MemoryRepository): AppContext {
  return {
    config: loadConfig({
      SAVE_TOKEN: 'save-token',
      MCP_TOKEN: 'mcp-token',
      OPTIMIZE_TOKEN: 'optimize-token',
    }),
    repo,
    store: { async put() { return 'file://unused'; }, async get() { return null; } },
    drive: { async uploadPdf() { return { uploaded: false, skippedReason: 'test' }; } },
    fetchReadable: async () => { throw new Error('not used'); },
    now: () => new Date('2026-04-01T00:00:00.000Z'),
  };
}

async function seed(): Promise<MemoryRepository> {
  const repo = new MemoryRepository();
  const doc: DocumentRecord = {
    id: 'doc-1',
    title: 'Moss',
    summary: 'Safe summary',
    sourceUrl: 'https://example.com/moss',
    sourceKind: 'page',
    status: 'ready',
    savedAt: '2026-04-01T00:00:00.000Z',
    error: null,
    originalUri: null,
    pdfUri: null,
    driveFileId: null,
    driveStatus: null,
  };
  const root: NodeRecord = {
    id: 'root',
    documentId: 'doc-1',
    parentId: null,
    title: 'Moss',
    summary: 'Safe summary',
    body: '',
    position: 0,
    pageStart: 1,
    pageEnd: 1,
  };
  const section: NodeRecord = {
    id: 'section',
    documentId: 'doc-1',
    parentId: 'root',
    title: 'Care',
    summary: 'Safe summary',
    body: BODY,
    position: 0,
    pageStart: 1,
    pageEnd: 1,
  };
  await repo.insertDocument(doc);
  await repo.replaceNodes(doc.id, [root, section]);
  return repo;
}

function keysOf(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      keysOf(child, keys);
    }
  }
  return keys;
}

test('browse returns titles and summaries and omits bodies', async () => {
  const repo = await seed();
  const library = await handleMcp(repo, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'browse', arguments: {} },
  });
  const libraryText = JSON.stringify(library.body);
  assert.equal(libraryText.includes(BODY), false);
  assert.equal(libraryText.includes('"body"'), false);
  assert.match(libraryText, /Moss/);

  const tree = await handleMcp(repo, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'browse', arguments: { document_id: 'doc-1' } },
  });
  const result = (tree.body as { result: { content: Array<{ text: string }> } }).result;
  const payload = JSON.parse(result.content[0].text) as unknown;
  assert.equal(keysOf(payload).has('body'), false);
  assert.equal(JSON.stringify(payload).includes(BODY), false);
  assert.match(JSON.stringify(payload), /Care/);
  assert.match(JSON.stringify(payload), /Safe summary/);
});

test('read_nodes returns bodies for the requested ids', async () => {
  const repo = await seed();
  const response = await handleMcp(repo, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'read_nodes', arguments: { node_ids: ['section', 'missing'] } },
  });
  const result = (response.body as { result: { content: Array<{ text: string }> } }).result;
  const payload = JSON.parse(result.content[0].text) as { nodes: Array<{ body: string }>; missing: string[] };
  assert.equal(payload.nodes[0].body, BODY);
  assert.deepEqual(payload.missing, ['missing']);
});

test('MCP HTTP requires the MCP bearer token', async () => {
  const repo = await seed();
  const ctx = context(repo);
  const denied = await handle(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }), ctx);
  assert.equal(denied.status, 401);

  const allowed = await handle(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      authorization: 'Bearer mcp-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'initialize', params: { protocolVersion: '2025-03-26' } }),
  }), ctx);
  assert.equal(allowed.status, 200);
  const body = await allowed.json() as { result: { serverInfo: { name: string } } };
  assert.equal(body.result.serverInfo.name, 'reading-index');
});
