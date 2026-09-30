import type { Repository } from './repo.js';
import type { DocumentRecord, NodeRecord } from './types.js';

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05'];

export async function handleMcp(repo: Repository, message: JsonRpcRequest): Promise<{
  status: number;
  body: unknown | null;
}> {
  if (!message || message.jsonrpc !== '2.0' || !message.method) {
    return { status: 400, body: rpcError(message?.id ?? null, -32600, 'invalid request') };
  }
  if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) {
    return { status: 202, body: null };
  }
  if (message.id === undefined || message.id === null) {
    return { status: 202, body: null };
  }
  try {
    if (message.method === 'initialize') {
      const requested = typeof message.params?.protocolVersion === 'string'
        ? message.params.protocolVersion
        : '';
      const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
      return {
        status: 200,
        body: rpcResult(message.id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'reading-index', version: '0.1.0' },
        }),
      };
    }
    if (message.method === 'ping') {
      return { status: 200, body: rpcResult(message.id, {}) };
    }
    if (message.method === 'tools/list') {
      return { status: 200, body: rpcResult(message.id, { tools: toolDefinitions() }) };
    }
    if (message.method === 'tools/call') {
      const name = typeof message.params?.name === 'string' ? message.params.name : '';
      const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await callTool(repo, name, args);
      return { status: 200, body: rpcResult(message.id, result) };
    }
    return { status: 200, body: rpcError(message.id, -32601, `method not found: ${message.method}`) };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return { status: 200, body: rpcError(message.id, -32603, text) };
  }
}

function toolDefinitions() {
  return [
    {
      name: 'browse',
      description: 'List the reading library, or one document section tree. Titles and summaries only. Body text is never returned.',
      inputSchema: {
        type: 'object',
        properties: {
          document_id: {
            type: 'string',
            description: 'Omit to list the library. Set to return that document tree.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'read_nodes',
      description: 'Read body text for specific node ids chosen from browse.',
      inputSchema: {
        type: 'object',
        properties: {
          node_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Node ids to read.',
          },
        },
        required: ['node_ids'],
        additionalProperties: false,
      },
    },
  ];
}

async function callTool(repo: Repository, name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  if (name === 'browse') {
    const documentId = typeof args.document_id === 'string' ? args.document_id : '';
    const payload = documentId ? await browseDocument(repo, documentId) : await browseLibrary(repo);
    return textResult(payload, Boolean((payload as { error?: string }).error));
  }
  if (name === 'read_nodes') {
    const nodeIds = Array.isArray(args.node_ids)
      ? args.node_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (nodeIds.length === 0) {
      return textResult({ error: 'node_ids is required' }, true);
    }
    const nodes = await repo.getNodesByIds(nodeIds);
    const found = new Set(nodes.map((node) => node.id));
    return textResult({
      nodes: nodes.map((node) => ({
        id: node.id,
        document_id: node.documentId,
        title: node.title,
        body: node.body,
      })),
      missing: nodeIds.filter((id) => !found.has(id)),
    });
  }
  return textResult({ error: `unknown tool: ${name}` }, true);
}

async function browseLibrary(repo: Repository) {
  const documents = await repo.listDocuments();
  return {
    library: [...documents]
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id))
      .map(publicDocument),
  };
}

async function browseDocument(repo: Repository, documentId: string) {
  const document = await repo.getDocument(documentId);
  if (!document) return { error: 'document not found' };
  const nodes = await repo.listNodes(documentId);
  return {
    document: publicDocument(document),
    tree: nest(nodes, null),
  };
}

function publicDocument(document: DocumentRecord) {
  return {
    id: document.id,
    title: document.title,
    summary: document.summary,
    source_url: document.sourceUrl,
    source_kind: document.sourceKind,
    status: document.status,
    saved_at: document.savedAt,
  };
}

function nest(nodes: NodeRecord[], parentId: string | null): Array<Record<string, unknown>> {
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((node) => ({
      id: node.id,
      title: node.title,
      summary: node.summary,
      position: node.position,
      page_start: node.pageStart,
      page_end: node.pageEnd,
      children: nest(nodes, node.id),
    }));
}

function textResult(payload: unknown, isError = false): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

function rpcResult(id: string | number, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
