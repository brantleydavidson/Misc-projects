import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { AppContext } from './context.js';
import { handleMcp } from './mcp.js';
import { executeOptimize, saveDocument } from './service.js';
import { capturePage } from './ui.js';

const MAX_BODY = 5_000_000;

export function bearerMatches(header: string | null, token: string): boolean {
  if (!token || !header) return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) return false;
  const got = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, accept, mcp-session-id',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(),
    },
  });
}

function html(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(),
    },
  });
}

async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY) {
    throw Object.assign(new Error('body too large'), { status: 413 });
  }
  const text = await request.text();
  if (text.length > MAX_BODY) {
    throw Object.assign(new Error('body too large'), { status: 413 });
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 });
  }
}

export async function handle(request: Request, ctx: AppContext): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  try {
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return html(capturePage());
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(200, { ok: true });
    }
    if (url.pathname === '/save' && request.method === 'POST') {
      if (!bearerMatches(request.headers.get('authorization'), ctx.config.saveToken)) {
        return json(401, { error: 'unauthorized' });
      }
      const body = await readJson(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return json(400, { error: 'expected a JSON object' });
      }
      const saved = await saveDocument(ctx, body as Record<string, unknown>);
      if (!saved.ok) return json(saved.status, { error: saved.error });
      return json(201, {
        id: saved.id,
        title: saved.title,
        status: saved.status,
        summary: saved.summary,
        node_count: saved.nodeCount,
        pdf_uri: saved.pdfUri,
        original_uri: saved.originalUri,
        drive: {
          uploaded: saved.drive.uploaded,
          file_id: saved.drive.fileId,
          skipped_reason: saved.drive.skippedReason,
        },
        error: saved.error,
      });
    }
    if (url.pathname === '/internal/optimize' && request.method === 'POST') {
      if (!bearerMatches(request.headers.get('authorization'), ctx.config.optimizeToken)) {
        return json(401, { error: 'unauthorized' });
      }
      const run = await executeOptimize(ctx);
      return json(200, {
        id: run.id,
        considered: run.considered,
        changed: run.changed,
        skipped: run.skipped,
        notes: run.notes,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
      });
    }
    if (url.pathname === '/mcp' && request.method === 'GET') {
      if (!bearerMatches(request.headers.get('authorization'), ctx.config.mcpToken)) {
        return json(401, { error: 'unauthorized' });
      }
      return json(405, { error: 'this server accepts stateless JSON-RPC POST requests' });
    }
    if (url.pathname === '/mcp' && request.method === 'POST') {
      if (!bearerMatches(request.headers.get('authorization'), ctx.config.mcpToken)) {
        return json(401, { error: 'unauthorized' });
      }
      const payload = await readJson(request);
      if (Array.isArray(payload)) {
        const results = [];
        for (const item of payload) {
          const one = await handleMcp(ctx.repo, item as { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> });
          if (one.body) results.push(one.body);
        }
        if (results.length === 0) return new Response(null, { status: 202, headers: corsHeaders() });
        return json(200, results);
      }
      const result = await handleMcp(ctx.repo, payload as { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> });
      if (!result.body) return new Response(null, { status: result.status, headers: corsHeaders() });
      return json(result.status, result.body);
    }
    return json(404, { error: 'not found' });
  } catch (error) {
    const status = typeof (error as { status?: number }).status === 'number'
      ? (error as { status: number }).status
      : 500;
    const message = status === 500 ? 'internal error' : (error instanceof Error ? error.message : 'error');
    if (status === 500) console.error(error);
    return json(status, { error: message });
  }
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? 'localhost';
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  const method = req.method ?? 'GET';
  return new Request(`http://${host}${req.url ?? '/'}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
}

export function createApp(ctx: AppContext) {
  return {
    handle: (request: Request) => handle(request, ctx),
    listen(port = ctx.config.port) {
      const server = createServer((req, res) => {
        void serve(req, res, ctx);
      });
      return new Promise<ReturnType<typeof createServer>>((resolve) => {
        server.listen(port, '0.0.0.0', () => resolve(server));
      });
    },
  };
}

async function serve(req: IncomingMessage, res: ServerResponse, ctx: AppContext): Promise<void> {
  try {
    const response = await handle(await toRequest(req), ctx);
    const headers = Object.fromEntries(response.headers.entries());
    const buf = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, headers);
    res.end(buf);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'internal error' }));
  }
}
