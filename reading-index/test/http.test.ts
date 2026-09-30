import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handle } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import type { AppContext } from '../src/context.ts';
import { createDriveClient } from '../src/drive.ts';
import { htmlToArticle, extractSimplePdfText } from '../src/extract.ts';
import { renderTextPdf } from '../src/pdf.ts';
import { MemoryRepository } from '../src/repo.ts';
import { assertPublicHttpUrl } from '../src/ssrf.ts';
import { LocalObjectStore } from '../src/storage.ts';

const TOKEN = 'super-secret-token-xyz';

async function context(): Promise<{ ctx: AppContext; dir: string; fetched: string[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'reading-index-http-'));
  const fetched: string[] = [];
  const ctx: AppContext = {
    config: loadConfig({
      SAVE_TOKEN: TOKEN,
      MCP_TOKEN: 'mcp-token',
      OPTIMIZE_TOKEN: 'optimize-token',
      DATA_DIR: dir,
      MAX_BODY_CHARS: '500',
    }),
    repo: new MemoryRepository(),
    store: new LocalObjectStore(dir),
    drive: createDriveClient({}),
    fetchReadable: async (url: string) => {
      fetched.push(url);
      return {
        title: 'Fetched title',
        text: '# Brought back\n\nServer extracted this paragraph.',
        contentType: 'text/html',
        pdfBytes: null,
      };
    },
    now: () => new Date('2026-04-01T00:00:00.000Z'),
  };
  return { ctx, dir, fetched };
}

test('capture page does not embed the save token and save stores a selection', async () => {
  const { ctx, dir } = await context();
  try {
    const page = await handle(new Request('http://localhost/'), ctx);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.equal(html.includes(TOKEN), false);
    assert.match(html, /bookmarklet/i);
    assert.match(html, /\/save/);

    const denied = await handle(new Request('http://localhost/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'no token', source_kind: 'selection' }),
    }), ctx);
    assert.equal(denied.status, 401);

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
      status: string;
      node_count: number;
      drive: { uploaded: boolean; skipped_reason: string };
      pdf_uri: string;
      id: string;
    };
    assert.equal(body.status, 'ready');
    assert.equal(body.node_count, 1);
    assert.equal(body.drive.uploaded, false);
    assert.match(body.drive.skipped_reason, /not configured/);
    const nodes = await ctx.repo.listNodes(body.id);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].body, 'A short highlight about ferns.');
    const pdf = await readFile(body.pdf_uri.replace('file://', ''));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an empty text save fetches a public url and refuses a metadata address', async () => {
  const { ctx, dir, fetched } = await context();
  try {
    const blocked = await handle(new Request('http://localhost/save', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        url: 'http://169.254.169.254/computeMetadata/v1/',
        source_kind: 'page',
      }),
    }), ctx);
    assert.equal(blocked.status, 400);
    assert.equal(fetched.length, 0);

    const saved = await handle(new Request('http://localhost/save', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://1.1.1.1/article',
        source_kind: 'page',
      }),
    }), ctx);
    assert.equal(saved.status, 201);
    assert.deepEqual(fetched, ['https://1.1.1.1/article']);
    const body = await saved.json() as { node_count: number; title: string };
    assert.equal(body.title, 'Fetched title');
    assert.equal(body.node_count, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('optimize route splits a long saved page and records the loop', async () => {
  const { ctx, dir } = await context();
  try {
    const text = Array.from({ length: 16 }, (_, index) => `Paragraph ${index}. ${'cedar '.repeat(18)}`.trim()).join('\n\n');
    const saved = await handle(new Request('http://localhost/save', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Cedar', text, source_kind: 'page' }),
    }), ctx);
    assert.equal(saved.status, 201);
    const created = await saved.json() as { id: string; node_count: number };
    assert.equal(created.node_count, 1);

    const optimized = await handle(new Request('http://localhost/internal/optimize', {
      method: 'POST',
      headers: { authorization: 'Bearer optimize-token', 'content-type': 'application/json' },
      body: '{}',
    }), ctx);
    assert.equal(optimized.status, 200);
    const run = await optimized.json() as { changed: number; considered: number; notes: string };
    assert.ok(run.changed >= 1);
    assert.match(run.notes, /split/);
    const nodes = await ctx.repo.listNodes(created.id);
    assert.ok(nodes.length > 1);
    const latest = await ctx.repo.latestLoopRun();
    assert.equal(latest?.changed, run.changed);
    assert.equal(latest?.considered, run.considered);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('html extraction keeps headings and pdf text round-trips', () => {
  const article = htmlToArticle(`
    <html><head><title>Site name</title><script>secret()</script></head>
    <body><article><h1>Moss</h1><p>Moss is small.</p><h2>Care</h2><p>Keep it damp.</p></article></body>
    </html>`);
  assert.equal(article.title, 'Moss');
  assert.match(article.text, /# Moss/);
  assert.match(article.text, /## Care/);
  assert.match(article.text, /Keep it damp/);
  assert.equal(article.text.includes('secret'), false);

  const pdf = renderTextPdf('Ferns', 'Ferns like shade.\n\nWater weekly.');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const text = extractSimplePdfText(pdf);
  assert.match(text, /Ferns/);
  assert.match(text, /Ferns like shade/);
  assert.match(text, /Water weekly/);
});

test('private and non-http urls are rejected before dns', async () => {
  await assert.rejects(() => assertPublicHttpUrl('http://127.0.0.1/secret'), /not allowed/);
  await assert.rejects(() => assertPublicHttpUrl('http://169.254.169.254/'), /not allowed/);
  await assert.rejects(() => assertPublicHttpUrl('http://metadata.google.internal/'), /not allowed/);
  await assert.rejects(() => assertPublicHttpUrl('file:///etc/passwd'), /only http/);
});
