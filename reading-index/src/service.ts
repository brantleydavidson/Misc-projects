import { randomUUID } from 'node:crypto';
import type { AppContext } from './context.js';
import { optimizeLibrary, shortHash } from './optimize.js';
import { pdfFilename, renderTextPdf } from './pdf.js';
import { deriveSummary, isPlaceholderSummary } from './summary.js';
import { buildNodes } from './tree.js';
import { isSourceKind, type DocumentRecord, type LoopRunRecord, type SourceKind } from './types.js';
import { UnsafeUrlError, assertPublicHttpUrl } from './ssrf.js';

const MAX_TEXT = 1_500_000;

export interface SaveInput {
  url?: unknown;
  title?: unknown;
  text?: unknown;
  source_kind?: unknown;
}

export type SaveResult =
  | {
    ok: true;
    id: string;
    title: string;
    status: DocumentRecord['status'];
    summary: string;
    nodeCount: number;
    pdfUri: string | null;
    originalUri: string | null;
    drive: { uploaded: boolean; fileId: string | null; skippedReason: string | null };
    error: string | null;
  }
  | { ok: false; status: number; error: string };

export async function saveDocument(ctx: AppContext, input: SaveInput): Promise<SaveResult> {
  if (!isSourceKind(input.source_kind)) {
    return { ok: false, status: 400, error: 'source_kind must be page, selection, or pdf' };
  }
  const sourceKind: SourceKind = input.source_kind;
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  let title = typeof input.title === 'string' ? input.title.trim() : '';
  let text = typeof input.text === 'string' ? input.text.trim() : '';
  if (url.length > 2000) return { ok: false, status: 400, error: 'url is too long' };
  if (title.length > 300) title = title.slice(0, 300);
  if (text.length > MAX_TEXT) return { ok: false, status: 400, error: 'text is too long' };

  let pdfBytes: Buffer | null = null;
  if (!text) {
    if (!url) return { ok: false, status: 400, error: 'provide a url or text' };
    try {
      await assertPublicHttpUrl(url);
      const fetched = await ctx.fetchReadable(url);
      text = fetched.text.trim();
      if (!title) title = fetched.title.trim();
      pdfBytes = fetched.pdfBytes;
      if (!text) {
        return { ok: false, status: 422, error: 'fetched the url but could not extract readable text' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof UnsafeUrlError ? 400 : 502;
      return { ok: false, status, error: message };
    }
  }
  if (!title) title = url || (sourceKind === 'selection' ? 'Selection' : 'Untitled');

  const id = randomUUID();
  const savedAt = ctx.now().toISOString();
  const doc: DocumentRecord = {
    id,
    title,
    summary: '',
    sourceUrl: url || null,
    sourceKind,
    status: 'pending',
    savedAt,
    error: null,
    originalUri: null,
    pdfUri: null,
    driveFileId: null,
    driveStatus: null,
  };
  await ctx.repo.insertDocument(doc);
  const originalUri = await ctx.store.put(
    `originals/${id}.txt`,
    Buffer.from(text, 'utf8'),
    'text/plain; charset=utf-8',
  );
  const pdf = pdfBytes ?? renderTextPdf(title, text);
  const pdfUri = await ctx.store.put(`pdfs/${id}.pdf`, pdf, 'application/pdf');
  const drive = await ctx.drive.uploadPdf(pdfFilename(title, id), pdf);
  const driveStatus = drive.uploaded
    ? 'uploaded'
    : `skipped: ${drive.skippedReason ?? 'not uploaded'}`;
  await ctx.repo.updateDocument(id, {
    originalUri,
    pdfUri,
    driveFileId: drive.fileId ?? null,
    driveStatus,
  });

  let nodeCount = 0;
  let summary = '';
  let status: DocumentRecord['status'] = 'pending';
  let error: string | null = null;
  try {
    const nodes = buildNodes({ documentId: id, title, text, sourceKind });
    await ctx.repo.replaceNodes(id, nodes);
    const root = nodes.find((node) => node.parentId === null);
    summary = root?.summary ?? '';
    nodeCount = nodes.length;
    status = 'ready';
    await ctx.repo.updateDocument(id, { status, summary, error: null });
  } catch (buildError) {
    error = (buildError instanceof Error ? buildError.message : String(buildError)).slice(0, 2000);
    status = 'failed';
    await ctx.repo.updateDocument(id, { status, error });
  }

  return {
    ok: true,
    id,
    title,
    status,
    summary,
    nodeCount,
    pdfUri,
    originalUri,
    drive: {
      uploaded: drive.uploaded,
      fileId: drive.fileId ?? null,
      skippedReason: drive.uploaded ? null : (drive.skippedReason ?? 'not uploaded'),
    },
    error,
  };
}

async function modelSummary(ctx: AppContext, title: string, body: string): Promise<string> {
  const fallback = deriveSummary(title, body);
  if (!ctx.config.modelApiKey || !ctx.config.modelBaseUrl) return fallback;
  try {
    const base = ctx.config.modelBaseUrl.replace(/\/$/, '');
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ctx.config.modelApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ctx.config.modelName,
        temperature: 0.2,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content: 'Write a one or two sentence summary of this section. Do not add a preamble.',
          },
          {
            role: 'user',
            content: `Title: ${title}\n\n${body.slice(0, 8000)}`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    return text ? text.slice(0, 500) : fallback;
  } catch {
    return fallback;
  }
}

export async function executeOptimize(ctx: AppContext): Promise<LoopRunRecord> {
  const started = ctx.now();
  const documents = await ctx.repo.listDocuments();
  const nodes = await ctx.repo.listNodes();
  const last = await ctx.repo.latestLoopRun();
  const originals: Record<string, string> = {};
  for (const doc of documents) {
    if (doc.status !== 'pending' && doc.status !== 'failed') continue;
    const stored = await ctx.store.get(`originals/${doc.id}.txt`);
    if (stored) originals[doc.id] = stored.toString('utf8');
  }
  const overrides = new Map<string, string>();
  if (ctx.config.modelApiKey && ctx.config.modelBaseUrl) {
    const candidates = nodes
      .filter((node) => isPlaceholderSummary(node.summary, node.body))
      .slice(0, ctx.config.optimizeCap);
    for (const node of candidates) {
      overrides.set(shortHash(node.body), await modelSummary(ctx, node.title, node.body));
    }
  }
  const outcome = optimizeLibrary(
    { documents, nodes, originals },
    {
      lastNotes: last?.notes ?? null,
      cap: ctx.config.optimizeCap,
      maxBody: ctx.config.maxBodyChars,
      tinyBody: ctx.config.tinyBodyChars,
      summarize: (title, body) => overrides.get(shortHash(body)) ?? deriveSummary(title, body),
    },
  );
  await persistLibrary(ctx, documents, nodes, outcome.documents, outcome.nodes);
  const finished = new Date();
  const notes = overrides.size > 0
    ? `${outcome.notes}\nmodel summaries prepared for ${overrides.size} placeholder node(s)`
    : outcome.notes;
  const run: LoopRunRecord = {
    id: randomUUID(),
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    considered: outcome.considered,
    changed: outcome.changed,
    skipped: outcome.skipped,
    notes,
  };
  await ctx.repo.insertLoopRun(run);
  return run;
}

async function persistLibrary(
  ctx: AppContext,
  beforeDocs: DocumentRecord[],
  beforeNodes: import('./types.js').NodeRecord[],
  afterDocs: DocumentRecord[],
  afterNodes: import('./types.js').NodeRecord[],
): Promise<void> {
  const beforeByDoc = new Map<string, string>();
  for (const doc of beforeDocs) {
    const snapshot = beforeNodes
      .filter((node) => node.documentId === doc.id)
      .map(nodeSnapshot)
      .sort();
    beforeByDoc.set(doc.id, JSON.stringify(snapshot));
  }
  for (const doc of afterDocs) {
    const nextNodes = afterNodes.filter((node) => node.documentId === doc.id);
    const snapshot = JSON.stringify(nextNodes.map(nodeSnapshot).sort());
    if (snapshot !== beforeByDoc.get(doc.id)) {
      await ctx.repo.replaceNodes(doc.id, nextNodes);
    }
    const previous = beforeDocs.find((item) => item.id === doc.id);
    if (!previous) continue;
    const patch: Partial<DocumentRecord> = {};
    if (previous.status !== doc.status) patch.status = doc.status;
    if (previous.summary !== doc.summary) patch.summary = doc.summary;
    if (previous.error !== doc.error) patch.error = doc.error;
    if (previous.title !== doc.title) patch.title = doc.title;
    if (Object.keys(patch).length > 0) await ctx.repo.updateDocument(doc.id, patch);
  }
}

function nodeSnapshot(node: import('./types.js').NodeRecord): string {
  return JSON.stringify([
    node.id,
    node.parentId,
    node.title,
    node.summary,
    node.body,
    node.position,
    node.pageStart,
    node.pageEnd,
  ]);
}
