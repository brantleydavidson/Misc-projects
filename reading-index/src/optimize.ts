import { createHash, randomUUID } from 'node:crypto';
import { assignPages, buildNodes, preorder } from './tree.js';
import { isPlaceholderSummary, openingSummary } from './summary.js';
import {
  DEFAULT_MAX_BODY,
  DEFAULT_OPTIMIZE_CAP,
  DEFAULT_TINY_BODY,
} from './limits.js';
import type { DocumentRecord, NodeRecord } from './types.js';

const MISSING_ORIGINAL = 'original text missing';

export interface LibraryState {
  documents: DocumentRecord[];
  nodes: NodeRecord[];
  originals: Record<string, string>;
}

export interface OptimizeOptions {
  lastNotes: string | null;
  summarize: (title: string, body: string) => string;
  cap?: number;
  maxBody?: number;
  tinyBody?: number;
  newId?: () => string;
}

export interface OptimizeOutcome {
  documents: DocumentRecord[];
  nodes: NodeRecord[];
  considered: number;
  changed: number;
  skipped: number;
  notes: string;
}

export function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function summarizeSignature(nodeId: string, summary: string): string {
  return `summarize:${nodeId}:${shortHash(summary)}`;
}

export function signaturesFromNotes(notes: string | null): Set<string> {
  if (!notes) return new Set();
  const line = notes.split('\n').find((entry) => entry.startsWith('signatures:'));
  if (!line) return new Set();
  return new Set(line.replace(/^signatures:\s*/, '').split(/\s+/).filter(Boolean));
}

export function splitBody(body: string, maxBody: number): string[] {
  const trimmed = body.trim();
  if (trimmed.length <= maxBody) return [trimmed];
  const paragraphs = trimmed.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  const units = paragraphs.length > 1 ? paragraphs : splitLongUnit(trimmed, maxBody);
  return packUnits(units, maxBody);
}

function splitLongUnit(text: string, maxBody: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) ?? [text];
  if (sentences.length > 1) return sentences.flatMap((sentence) => (
    sentence.length <= maxBody ? [sentence] : hardWrap(sentence, maxBody)
  ));
  return hardWrap(text, maxBody);
}

function hardWrap(text: string, maxBody: number): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > maxBody) {
    let cut = rest.lastIndexOf(' ', maxBody);
    if (cut < Math.floor(maxBody * 0.5)) cut = maxBody;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function packUnits(units: string[], maxBody: number): string[] {
  const chunks: string[] = [];
  let current = '';
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const unit of units) {
    const pieces = unit.length > maxBody ? hardWrap(unit, maxBody) : [unit];
    for (const piece of pieces) {
      if (!current) {
        current = piece;
        continue;
      }
      if (current.length + 2 + piece.length <= maxBody) {
        current = `${current}\n\n${piece}`;
      } else {
        push();
        current = piece;
      }
    }
  }
  push();
  return chunks.length > 0 ? chunks : [units.join('\n\n').slice(0, maxBody)];
}

type Action =
  | { key: string; signature: string; kind: 'build'; docId: string }
  | { key: string; signature: string; kind: 'split'; nodeId: string; signatureBody: string }
  | { key: string; signature: string; kind: 'merge'; keepId: string; dropId: string }
  | { key: string; signature: string; kind: 'summarize'; nodeId: string; summary: string };

function documentOrder(documents: DocumentRecord[], nodes: NodeRecord[]): NodeRecord[] {
  const docs = [...documents].sort((a, b) => a.savedAt.localeCompare(b.savedAt) || a.id.localeCompare(b.id));
  const ordered: NodeRecord[] = [];
  for (const doc of docs) {
    ordered.push(...preorder(nodes.filter((node) => node.documentId === doc.id)));
  }
  return ordered;
}

function findMergePair(nodes: NodeRecord[], tinyBody: number, maxBody: number): { keep: NodeRecord; drop: NodeRecord } | null {
  const parentsWithChildren = new Set(nodes.map((node) => node.parentId).filter((id): id is string => Boolean(id)));
  const groups = new Map<string, NodeRecord[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    if (parentsWithChildren.has(node.id)) continue;
    const key = `${node.documentId}:${node.parentId}`;
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const keep = sorted[index];
      const drop = sorted[index + 1];
      if (!keep.body.trim() || !drop.body.trim()) continue;
      if (keep.body.length >= tinyBody || drop.body.length >= tinyBody) continue;
      if (keep.body.length + drop.body.length + 2 > maxBody) continue;
      return { keep, drop };
    }
  }
  return null;
}

function pickAction(
  documents: DocumentRecord[],
  nodes: NodeRecord[],
  seen: Set<string>,
  options: Required<Pick<OptimizeOptions, 'summarize' | 'maxBody' | 'tinyBody'>>,
): Action | null {
  const docs = [...documents].sort((a, b) => a.savedAt.localeCompare(b.savedAt) || a.id.localeCompare(b.id));
  for (const doc of docs) {
    if (doc.status !== 'pending' && doc.status !== 'failed') continue;
    const key = `build:${doc.id}`;
    if (seen.has(key)) continue;
    return { key, signature: key, kind: 'build', docId: doc.id };
  }

  const ordered = documentOrder(documents, nodes);
  for (const node of ordered) {
    if (node.body.length <= options.maxBody) continue;
    const chunks = splitBody(node.body, options.maxBody);
    if (chunks.length < 2) continue;
    const key = `split:${node.id}`;
    if (seen.has(key)) continue;
    const signatureBody = chunks.join('\n---\n');
    return {
      key,
      signature: `split:${node.id}:${shortHash(signatureBody)}`,
      kind: 'split',
      nodeId: node.id,
      signatureBody,
    };
  }

  const pair = findMergePair(nodes, options.tinyBody, options.maxBody);
  if (pair) {
    const key = `merge:${pair.keep.id}:${pair.drop.id}`;
    if (!seen.has(key)) {
      return { key, signature: key, kind: 'merge', keepId: pair.keep.id, dropId: pair.drop.id };
    }
  }

  for (const node of ordered) {
    if (!isPlaceholderSummary(node.summary, node.body)) continue;
    const key = `summarize:${node.id}`;
    if (seen.has(key)) continue;
    const summary = options.summarize(node.title, node.body);
    return {
      key,
      signature: summarizeSignature(node.id, summary),
      kind: 'summarize',
      nodeId: node.id,
      summary,
    };
  }
  return null;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000);
}

export function optimizeLibrary(state: LibraryState, options: OptimizeOptions): OptimizeOutcome {
  const cap = options.cap ?? DEFAULT_OPTIMIZE_CAP;
  const maxBody = options.maxBody ?? DEFAULT_MAX_BODY;
  const tinyBody = options.tinyBody ?? DEFAULT_TINY_BODY;
  const newId = options.newId ?? randomUUID;
  const lastSignatures = signaturesFromNotes(options.lastNotes);
  const documents = state.documents.map((doc) => ({ ...doc }));
  const nodes = state.nodes.map((node) => ({ ...node }));
  const seen = new Set<string>();
  const signatures = new Set<string>();
  const lines: string[] = [];
  let considered = 0;
  let changed = 0;
  let skipped = 0;

  const settings = { summarize: options.summarize, maxBody, tinyBody };

  while (considered < cap) {
    const action = pickAction(documents, nodes, seen, settings);
    if (!action) break;
    seen.add(action.key);
    considered += 1;

    if (action.kind !== 'build' && lastSignatures.has(action.signature)) {
      skipped += 1;
      signatures.add(action.signature);
      lines.push(`skipped identical edit ${action.signature}`);
      continue;
    }

    if (action.kind === 'build') {
      const doc = documents.find((item) => item.id === action.docId);
      if (!doc) continue;
      const original = state.originals[doc.id];
      if (original == null) {
        if (doc.status === 'failed' && doc.error === MISSING_ORIGINAL) {
          skipped += 1;
          lines.push(`skipped ${doc.id}: original text still missing`);
        } else {
          doc.status = 'failed';
          doc.error = MISSING_ORIGINAL;
          changed += 1;
          lines.push(`failed ${doc.id}: ${MISSING_ORIGINAL}`);
        }
        continue;
      }
      try {
        const built = buildNodes({
          documentId: doc.id,
          title: doc.title,
          text: original,
          sourceKind: doc.sourceKind,
          newId,
        });
        for (let index = nodes.length - 1; index >= 0; index -= 1) {
          if (nodes[index].documentId === doc.id) nodes.splice(index, 1);
        }
        nodes.push(...built);
        const root = built.find((node) => node.parentId === null);
        doc.status = 'ready';
        doc.error = null;
        doc.summary = root?.summary ?? doc.title;
        changed += 1;
        lines.push(`built tree for ${doc.id} (${built.length} nodes, ${doc.sourceKind})`);
      } catch (error) {
        const message = errorMessage(error);
        const signature = `build-error:${doc.id}:${shortHash(message)}`;
        if (lastSignatures.has(signature) && doc.status === 'failed' && doc.error === message) {
          skipped += 1;
          signatures.add(signature);
          lines.push(`skipped identical failure for ${doc.id}`);
        } else {
          doc.status = 'failed';
          doc.error = message;
          changed += 1;
          signatures.add(signature);
          lines.push(`failed ${doc.id}: ${message}`);
        }
      }
      continue;
    }

    if (action.kind === 'split') {
      const node = nodes.find((item) => item.id === action.nodeId);
      if (!node) continue;
      const chunks = splitBody(node.body, maxBody);
      if (chunks.length < 2) {
        skipped += 1;
        lines.push(`skipped split ${node.id}: no break that reduces the body`);
        continue;
      }
      const previousBody = node.body;
      const existingChildren = nodes.filter((item) => item.parentId === node.id);
      for (const child of existingChildren) child.position += chunks.length;
      const children: NodeRecord[] = chunks.map((chunk, index) => ({
        id: newId(),
        documentId: node.documentId,
        parentId: node.id,
        title: `${node.title} (${index + 1}/${chunks.length})`,
        summary: openingSummary(chunk) || node.title,
        body: chunk,
        position: index,
        pageStart: null,
        pageEnd: null,
      }));
      node.body = '';
      if (isPlaceholderSummary(node.summary, previousBody)) {
        node.summary = options.summarize(node.title, previousBody);
      }
      nodes.push(...children);
      assignPages(nodes.filter((item) => item.documentId === node.documentId));
      changed += 1;
      signatures.add(action.signature);
      lines.push(`split ${node.id} into ${chunks.length} children because body length ${previousBody.length} > ${maxBody}`);
      continue;
    }

    if (action.kind === 'merge') {
      const keep = nodes.find((item) => item.id === action.keepId);
      const drop = nodes.find((item) => item.id === action.dropId);
      if (!keep || !drop) continue;
      const mergedBody = `${keep.body.trim()}\n\n${drop.body.trim()}`;
      keep.body = mergedBody;
      keep.summary = options.summarize(keep.title, mergedBody);
      if (drop.title && drop.title !== keep.title && `${keep.title} / ${drop.title}`.length <= 180) {
        keep.title = `${keep.title} / ${drop.title}`;
      }
      const dropIndex = nodes.findIndex((item) => item.id === drop.id);
      if (dropIndex >= 0) nodes.splice(dropIndex, 1);
      const siblings = nodes
        .filter((item) => item.documentId === keep.documentId && item.parentId === keep.parentId)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      siblings.forEach((item, index) => {
        item.position = index;
      });
      assignPages(nodes.filter((item) => item.documentId === keep.documentId));
      changed += 1;
      signatures.add(action.signature);
      lines.push(`merged ${drop.id} into ${keep.id} because both siblings were under ${tinyBody} characters`);
      continue;
    }

    const node = nodes.find((item) => item.id === action.nodeId);
    if (!node) continue;
    if (node.summary.trim() === action.summary.trim()) {
      skipped += 1;
      signatures.add(action.signature);
      lines.push(`skipped ${node.id}: summary already matched the extractive summary`);
      continue;
    }
    node.summary = action.summary;
    changed += 1;
    signatures.add(action.signature);
    lines.push(`filled summary for ${node.id}`);
  }

  for (const doc of documents) {
    if (doc.status !== 'ready') continue;
    const roots = nodes
      .filter((node) => node.documentId === doc.id && node.parentId === null)
      .sort((a, b) => a.position - b.position);
    if (roots[0]) doc.summary = roots[0].summary;
  }

  for (const signature of lastSignatures) signatures.add(signature);
  const signatureLine = [...signatures].slice(0, 200).join(' ');
  if (lines.length === 0) lines.push('nothing to do');
  lines.push(`signatures: ${signatureLine}`.trimEnd());

  return {
    documents,
    nodes,
    considered,
    changed,
    skipped,
    notes: lines.join('\n'),
  };
}
