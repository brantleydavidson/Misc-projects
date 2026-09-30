import assert from 'node:assert/strict';
import test from 'node:test';
import { optimizeLibrary, summarizeSignature } from '../src/optimize.ts';
import { deriveSummary, openingSummary } from '../src/summary.ts';
import type { DocumentRecord, NodeRecord } from '../src/types.ts';
import { executeOptimize } from '../src/service.ts';
import { MemoryRepository } from '../src/repo.ts';
import { LocalObjectStore } from '../src/storage.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';

function document(patch: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'doc-1',
    title: 'Doc',
    summary: '',
    sourceUrl: null,
    sourceKind: 'page',
    status: 'ready',
    savedAt: '2026-01-01T00:00:00.000Z',
    error: null,
    originalUri: null,
    pdfUri: null,
    driveFileId: null,
    driveStatus: null,
    ...patch,
  };
}

function node(patch: Partial<NodeRecord> & Pick<NodeRecord, 'id' | 'body'>): NodeRecord {
  return {
    documentId: 'doc-1',
    parentId: 'root',
    title: patch.id,
    summary: openingSummary(patch.body),
    position: 0,
    pageStart: 1,
    pageEnd: 1,
    ...patch,
  };
}

function run(state: Parameters<typeof optimizeLibrary>[0], extra: Partial<Parameters<typeof optimizeLibrary>[1]> = {}) {
  return optimizeLibrary(state, {
    lastNotes: null,
    summarize: deriveSummary,
    ...extra,
  });
}

test('optimizer splits a section whose body is too long', () => {
  const body = Array.from({ length: 20 }, (_, index) => `Paragraph ${index + 1}. ${'word '.repeat(30)}`.trim()).join('\n\n');
  const root = node({ id: 'root', parentId: null, title: 'Doc', body: '', summary: 'Doc', position: 0 });
  const section = node({ id: 'section', parentId: 'root', title: 'Section', body, position: 0 });
  const outcome = run(
    { documents: [document()], nodes: [root, section], originals: {} },
    { maxBody: 600, tinyBody: 40, cap: 1 },
  );
  const parent = outcome.nodes.find((item) => item.id === 'section');
  const children = outcome.nodes
    .filter((item) => item.parentId === 'section')
    .sort((a, b) => a.position - b.position);
  assert.ok(parent);
  assert.equal(parent.body, '');
  assert.ok(children.length >= 2);
  assert.ok(children.every((child) => child.body.length <= 600));
  assert.equal(children.map((child) => child.body).join('\n\n'), body);
  assert.equal(outcome.changed, 1);
  assert.match(outcome.notes, /split section/);
});

test('optimizer merges tiny sibling leaves and leaves a long sibling', () => {
  const root = node({ id: 'root', parentId: null, title: 'Doc', body: '', summary: 'Doc', position: 0 });
  const a = node({ id: 'a', title: 'Cats', body: 'Cats nap.', summary: 'Cats nap.', position: 0 });
  const b = node({ id: 'b', title: 'Dogs', body: 'Dogs run.', summary: 'Dogs run.', position: 1 });
  const c = node({
    id: 'c',
    title: 'Horses',
    body: `Horses graze. ${'word '.repeat(80)}`,
    position: 2,
  });
  const outcome = run(
    { documents: [document()], nodes: [root, a, b, c], originals: {} },
    { maxBody: 2400, tinyBody: 40, cap: 20 },
  );
  assert.equal(outcome.nodes.some((item) => item.id === 'b'), false);
  const kept = outcome.nodes.find((item) => item.id === 'a');
  const horses = outcome.nodes.find((item) => item.id === 'c');
  assert.ok(kept && horses);
  assert.equal(kept.body, 'Cats nap.\n\nDogs run.');
  assert.equal(kept.title, 'Cats / Dogs');
  assert.equal(horses.body.startsWith('Horses graze.'), true);
  assert.match(outcome.notes, /merged b into a/);
});

test('optimizer does not merge tiny nodes from different documents', () => {
  const docs = [
    document({ id: 'd1' }),
    document({ id: 'd2', savedAt: '2026-01-02T00:00:00.000Z' }),
  ];
  const nodes = [
    node({ id: 'r1', documentId: 'd1', parentId: null, title: 'One', body: '', summary: 'One' }),
    node({ id: 'r2', documentId: 'd2', parentId: null, title: 'Two', body: '', summary: 'Two' }),
    node({ id: 'a', documentId: 'd1', parentId: 'r1', body: 'Hi.', summary: 'Hi.', title: 'A' }),
    node({ id: 'b', documentId: 'd2', parentId: 'r2', body: 'Yo.', summary: 'Yo.', title: 'B' }),
  ];
  const outcome = run({ documents: docs, nodes, originals: {} }, { tinyBody: 40, cap: 20 });
  assert.equal(outcome.changed, 0);
  assert.equal(outcome.nodes.length, 4);
});

test('optimizer replaces a placeholder summary and does not repeat it', () => {
  const body = `Ferns prefer indirect light. ${'They also like steady moisture. '.repeat(12)}`;
  const placeholder = openingSummary(body);
  const expected = deriveSummary('Ferns', body);
  assert.notEqual(placeholder, expected);
  const root = node({ id: 'root', parentId: null, title: 'Ferns', body, summary: placeholder, position: 0 });
  const first = run(
    { documents: [document({ title: 'Ferns' })], nodes: [root], originals: {} },
    { maxBody: 10000, cap: 20 },
  );
  const updated = first.nodes.find((item) => item.id === 'root');
  assert.ok(updated);
  assert.equal(updated.summary, expected);
  assert.equal(first.changed, 1);
  assert.match(first.notes, /filled summary/);

  const second = run(
    { documents: first.documents, nodes: first.nodes, originals: {} },
    { lastNotes: first.notes, maxBody: 10000, cap: 20 },
  );
  assert.equal(second.changed, 0);
  assert.equal(second.nodes.find((item) => item.id === 'root')?.summary, expected);
});

test('optimizer skips an identical summary edit recorded on the latest loop run', () => {
  const body = `Ferns prefer indirect light. ${'They also like steady moisture. '.repeat(12)}`;
  const root = node({
    id: 'root',
    parentId: null,
    title: 'Ferns',
    body,
    summary: openingSummary(body),
    position: 0,
  });
  const signature = summarizeSignature('root', deriveSummary('Ferns', body));
  const outcome = run(
    { documents: [document()], nodes: [root], originals: {} },
    { lastNotes: `notes from last pass\nsignatures: ${signature}`, maxBody: 10000, cap: 20 },
  );
  assert.equal(outcome.changed, 0);
  assert.equal(outcome.skipped, 1);
  assert.equal(outcome.considered, 1);
  assert.match(outcome.notes, /identical/);
  assert.equal(outcome.nodes[0].summary, openingSummary(body));
  assert.match(outcome.notes, new RegExp(signature));
});

test('optimizer builds pending documents before editing nodes and retries failures', () => {
  const original = '# One\n\nHello there.\n\n# Two\n\nGoodbye now.';
  const pending = document({ id: 'pending', status: 'pending', title: 'Pending' });
  const failed = document({
    id: 'failed',
    status: 'failed',
    title: 'Failed',
    error: 'boom',
    savedAt: '2026-01-02T00:00:00.000Z',
  });
  const outcome = run({
    documents: [pending, failed],
    nodes: [],
    originals: { pending: original, failed: original },
  }, { cap: 20, tinyBody: 5, maxBody: 2400 });
  assert.equal(outcome.changed, 2);
  for (const id of ['pending', 'failed']) {
    const doc = outcome.documents.find((item) => item.id === id);
    const nodes = outcome.nodes.filter((item) => item.documentId === id);
    assert.equal(doc?.status, 'ready');
    assert.equal(doc?.error, null);
    assert.equal(nodes.length, 3);
    assert.ok(nodes.some((item) => item.title === 'One' && item.body === 'Hello there.'));
  }
});

test('a pass stops at the node cap and prefers building pending docs', () => {
  const long = Array.from({ length: 12 }, (_, index) => `Paragraph ${index}. ${'alpha '.repeat(20)}`.trim()).join('\n\n');
  const root = node({ id: 'root', parentId: null, title: 'Ready', body: '', summary: 'Ready' });
  const leaves = Array.from({ length: 8 }, (_, index) => node({
    id: `n${index}`,
    parentId: 'root',
    title: `Part ${index}`,
    body: long,
    position: index,
  }));
  const pending = document({ id: 'pending', status: 'pending', savedAt: '2026-01-02T00:00:00.000Z' });
  const ready = document({ id: 'doc-1', title: 'Ready' });
  const capped = run({
    documents: [ready, pending],
    nodes: [root, ...leaves],
    originals: { pending: 'A short pending note.' },
  }, { cap: 1, maxBody: 400 });
  assert.equal(capped.considered, 1);
  assert.equal(capped.changed, 1);
  assert.equal(capped.documents.find((item) => item.id === 'pending')?.status, 'ready');
  assert.equal(capped.nodes.filter((item) => item.documentId === 'doc-1').length, 9);

  const splitPass = run({
    documents: [ready],
    nodes: [root, ...leaves],
    originals: {},
  }, { cap: 3, maxBody: 400 });
  assert.equal(splitPass.changed, 3);
  assert.equal(splitPass.considered, 3);
  const stillLong = splitPass.nodes.filter((item) => item.documentId === 'doc-1' && item.body.length > 400);
  assert.equal(stillLong.length, 5);
});

test('executeOptimize writes one loop_runs row and stores the pass', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reading-index-'));
  try {
    const repo = new MemoryRepository();
    const store = new LocalObjectStore(dir);
    const id = '11111111-1111-4111-8111-111111111111';
    await repo.insertDocument(document({ id, status: 'pending', title: 'Queued' }));
    await store.put(`originals/${id}.txt`, Buffer.from('# Moss\n\nKeep it damp.'), 'text/plain');
    const run = await executeOptimize({
      config: loadConfig({ SAVE_TOKEN: 's', MCP_TOKEN: 'm', OPTIMIZE_TOKEN: 'o', OPTIMIZE_CAP: '5' }),
      repo,
      store,
      drive: { async uploadPdf() { return { uploaded: false, skippedReason: 'test' }; } },
      fetchReadable: async () => { throw new Error('not used'); },
      now: () => new Date('2026-04-01T00:00:00.000Z'),
    });
    assert.equal(run.changed, 1);
    assert.match(run.notes, /built tree/);
    const saved = await repo.getDocument(id);
    assert.equal(saved?.status, 'ready');
    const latest = await repo.latestLoopRun();
    assert.equal(latest?.id, run.id);
    assert.equal(latest?.considered, run.considered);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
