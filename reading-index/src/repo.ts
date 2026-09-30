import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { AppConfig } from './config.js';
import type { DocumentRecord, DocumentStatus, LoopRunRecord, NodeRecord } from './types.js';

const { Pool } = pg;

export interface Repository {
  insertDocument(doc: DocumentRecord): Promise<void>;
  updateDocument(id: string, patch: Partial<DocumentRecord>): Promise<void>;
  getDocument(id: string): Promise<DocumentRecord | null>;
  listDocuments(): Promise<DocumentRecord[]>;
  replaceNodes(documentId: string, nodes: NodeRecord[]): Promise<void>;
  listNodes(documentId?: string): Promise<NodeRecord[]>;
  getNodesByIds(ids: string[]): Promise<NodeRecord[]>;
  latestLoopRun(): Promise<LoopRunRecord | null>;
  insertLoopRun(run: LoopRunRecord): Promise<void>;
}

function sortDocuments(docs: DocumentRecord[]): DocumentRecord[] {
  return [...docs].sort((a, b) => a.savedAt.localeCompare(b.savedAt) || a.id.localeCompare(b.id));
}

export class MemoryRepository implements Repository {
  private readonly documents = new Map<string, DocumentRecord>();
  private readonly nodes = new Map<string, NodeRecord>();
  private readonly runs: LoopRunRecord[] = [];

  async insertDocument(doc: DocumentRecord): Promise<void> {
    this.documents.set(doc.id, { ...doc });
  }

  async updateDocument(id: string, patch: Partial<DocumentRecord>): Promise<void> {
    const current = this.documents.get(id);
    if (!current) throw new Error(`document ${id} not found`);
    this.documents.set(id, { ...current, ...patch, id });
  }

  async getDocument(id: string): Promise<DocumentRecord | null> {
    const doc = this.documents.get(id);
    return doc ? { ...doc } : null;
  }

  async listDocuments(): Promise<DocumentRecord[]> {
    return sortDocuments([...this.documents.values()].map((doc) => ({ ...doc })));
  }

  async replaceNodes(documentId: string, nodes: NodeRecord[]): Promise<void> {
    for (const [id, node] of this.nodes) {
      if (node.documentId === documentId) this.nodes.delete(id);
    }
    for (const node of nodes) this.nodes.set(node.id, { ...node, documentId });
  }

  async listNodes(documentId?: string): Promise<NodeRecord[]> {
    const nodes = [...this.nodes.values()]
      .filter((node) => (documentId ? node.documentId === documentId : true))
      .map((node) => ({ ...node }));
    return nodes.sort((a, b) => a.documentId.localeCompare(b.documentId) || a.position - b.position || a.id.localeCompare(b.id));
  }

  async getNodesByIds(ids: string[]): Promise<NodeRecord[]> {
    const found: NodeRecord[] = [];
    for (const id of ids) {
      const node = this.nodes.get(id);
      if (node) found.push({ ...node });
    }
    return found;
  }

  async latestLoopRun(): Promise<LoopRunRecord | null> {
    if (this.runs.length === 0) return null;
    return { ...this.runs[this.runs.length - 1] };
  }

  async insertLoopRun(run: LoopRunRecord): Promise<void> {
    this.runs.push({ ...run });
  }
}

const DOCUMENT_COLUMNS = [
  'title',
  'summary',
  'source_url',
  'source_kind',
  'status',
  'saved_at',
  'error',
  'original_uri',
  'pdf_uri',
  'drive_file_id',
  'drive_status',
] as const;

type DocumentColumn = (typeof DOCUMENT_COLUMNS)[number];

const DOCUMENT_FIELD: Record<DocumentColumn, keyof DocumentRecord> = {
  title: 'title',
  summary: 'summary',
  source_url: 'sourceUrl',
  source_kind: 'sourceKind',
  status: 'status',
  saved_at: 'savedAt',
  error: 'error',
  original_uri: 'originalUri',
  pdf_uri: 'pdfUri',
  drive_file_id: 'driveFileId',
  drive_status: 'driveStatus',
};

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapDocument(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    summary: row.summary == null ? '' : String(row.summary),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    sourceKind: row.source_kind as DocumentRecord['sourceKind'],
    status: row.status as DocumentStatus,
    savedAt: asIso(row.saved_at as Date | string),
    error: row.error == null ? null : String(row.error),
    originalUri: row.original_uri == null ? null : String(row.original_uri),
    pdfUri: row.pdf_uri == null ? null : String(row.pdf_uri),
    driveFileId: row.drive_file_id == null ? null : String(row.drive_file_id),
    driveStatus: row.drive_status == null ? null : String(row.drive_status),
  };
}

function mapNode(row: Record<string, unknown>): NodeRecord {
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    parentId: row.parent_id == null ? null : String(row.parent_id),
    title: String(row.title),
    summary: String(row.summary ?? ''),
    body: String(row.body ?? ''),
    position: Number(row.position),
    pageStart: row.page_start == null ? null : Number(row.page_start),
    pageEnd: row.page_end == null ? null : Number(row.page_end),
  };
}

function mapRun(row: Record<string, unknown>): LoopRunRecord {
  return {
    id: String(row.id),
    startedAt: asIso(row.started_at as Date | string),
    finishedAt: row.finished_at == null ? null : asIso(row.finished_at as Date | string),
    considered: Number(row.considered),
    changed: Number(row.changed),
    skipped: Number(row.skipped),
    notes: String(row.notes ?? ''),
  };
}

export class PostgresRepository implements Repository {
  constructor(private readonly pool: pg.Pool) {}

  async insertDocument(doc: DocumentRecord): Promise<void> {
    await this.pool.query(
      `insert into documents (
        id, title, summary, source_url, source_kind, status, saved_at, error,
        original_uri, pdf_uri, drive_file_id, drive_status
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        doc.id, doc.title, doc.summary, doc.sourceUrl, doc.sourceKind, doc.status, doc.savedAt,
        doc.error, doc.originalUri, doc.pdfUri, doc.driveFileId, doc.driveStatus,
      ],
    );
  }

  async updateDocument(id: string, patch: Partial<DocumentRecord>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const column of DOCUMENT_COLUMNS) {
      const field = DOCUMENT_FIELD[column];
      if (patch[field] !== undefined) {
        values.push(patch[field]);
        sets.push(`${column} = $${values.length}`);
      }
    }
    if (sets.length === 0) return;
    values.push(id);
    const result = await this.pool.query(
      `update documents set ${sets.join(', ')} where id = $${values.length}`,
      values,
    );
    if (result.rowCount === 0) throw new Error(`document ${id} not found`);
  }

  async getDocument(id: string): Promise<DocumentRecord | null> {
    const result = await this.pool.query('select * from documents where id = $1', [id]);
    return result.rows[0] ? mapDocument(result.rows[0]) : null;
  }

  async listDocuments(): Promise<DocumentRecord[]> {
    const result = await this.pool.query('select * from documents order by saved_at asc, id asc');
    return result.rows.map((row) => mapDocument(row));
  }

  async replaceNodes(documentId: string, nodes: NodeRecord[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('update nodes set parent_id = null where document_id = $1', [documentId]);
      await client.query('delete from nodes where document_id = $1', [documentId]);
      for (const node of parentsFirst(nodes)) {
        await client.query(
          `insert into nodes (
            id, document_id, parent_id, title, summary, body, position, page_start, page_end
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            node.id, documentId, node.parentId, node.title, node.summary, node.body,
            node.position, node.pageStart, node.pageEnd,
          ],
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listNodes(documentId?: string): Promise<NodeRecord[]> {
    const result = documentId
      ? await this.pool.query(
        'select * from nodes where document_id = $1 order by position asc, id asc',
        [documentId],
      )
      : await this.pool.query('select * from nodes order by document_id asc, position asc, id asc');
    return result.rows.map((row) => mapNode(row));
  }

  async getNodesByIds(ids: string[]): Promise<NodeRecord[]> {
    const valid = ids.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    if (valid.length === 0) return [];
    const result = await this.pool.query('select * from nodes where id = any($1::uuid[])', [valid]);
    const byId = new Map(result.rows.map((row) => [String(row.id), mapNode(row)]));
    return ids.flatMap((id) => {
      const node = byId.get(id);
      return node ? [node] : [];
    });
  }

  async latestLoopRun(): Promise<LoopRunRecord | null> {
    const result = await this.pool.query(
      'select * from loop_runs order by started_at desc limit 1',
    );
    return result.rows[0] ? mapRun(result.rows[0]) : null;
  }

  async insertLoopRun(run: LoopRunRecord): Promise<void> {
    await this.pool.query(
      `insert into loop_runs (id, started_at, finished_at, considered, changed, skipped, notes)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [run.id, run.startedAt, run.finishedAt, run.considered, run.changed, run.skipped, run.notes],
    );
  }
}

function parentsFirst(nodes: NodeRecord[]): NodeRecord[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered: NodeRecord[] = [];
  const seen = new Set<string>();
  const visit = (node: NodeRecord) => {
    if (seen.has(node.id)) return;
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      if (parent) visit(parent);
    }
    seen.add(node.id);
    ordered.push(node);
  };
  for (const node of nodes) visit(node);
  return ordered;
}

export async function createPostgresRepository(config: AppConfig): Promise<PostgresRepository> {
  const pool = config.instanceConnectionName && config.dbUser && config.dbPassword && config.dbName
    ? new Pool({
      user: config.dbUser,
      password: config.dbPassword,
      database: config.dbName,
      host: `/cloudsql/${config.instanceConnectionName}`,
    })
    : new Pool({ connectionString: config.databaseUrl });
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'schema.sql');
  const schema = await readFile(schemaPath, 'utf8');
  await pool.query(schema);
  return new PostgresRepository(pool);
}
