export type SourceKind = 'page' | 'selection' | 'pdf';

export type DocumentStatus = 'pending' | 'ready' | 'failed';

export interface DocumentRecord {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string | null;
  sourceKind: SourceKind;
  status: DocumentStatus;
  savedAt: string;
  error: string | null;
  originalUri: string | null;
  pdfUri: string | null;
  driveFileId: string | null;
  driveStatus: string | null;
}

export interface NodeRecord {
  id: string;
  documentId: string;
  parentId: string | null;
  title: string;
  summary: string;
  body: string;
  position: number;
  pageStart: number | null;
  pageEnd: number | null;
}

export interface LoopRunRecord {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  considered: number;
  changed: number;
  skipped: number;
  notes: string;
}

export const SOURCE_KINDS: readonly SourceKind[] = ['page', 'selection', 'pdf'];

export function isSourceKind(value: unknown): value is SourceKind {
  return value === 'page' || value === 'selection' || value === 'pdf';
}
