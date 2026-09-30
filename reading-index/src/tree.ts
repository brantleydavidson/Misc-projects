import { randomUUID } from 'node:crypto';
import { PAGE_CHARS } from './limits.js';
import { initialSummary } from './summary.js';
import type { NodeRecord, SourceKind } from './types.js';

interface Draft {
  title: string;
  body: string;
  level: number;
  parent: number | null;
  position: number;
}

type Block =
  | { kind: 'heading'; level: number; title: string }
  | { kind: 'para'; text: string };

const HEADING = /^(#{1,6})\s+(\S.*)$/;

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const paragraph = buffer.join(' ').replace(/\s+/g, ' ').trim();
    buffer = [];
    if (paragraph) blocks.push({ kind: 'para', text: paragraph });
  };
  for (const line of lines) {
    const match = line.match(HEADING);
    if (match) {
      flush();
      blocks.push({ kind: 'heading', level: match[1].length, title: match[2].trim() });
    } else if (line.trim() === '') {
      flush();
    } else {
      buffer.push(line.trim());
    }
  }
  flush();
  return blocks;
}

function draftsFor(title: string, text: string, sourceKind: SourceKind): Draft[] {
  const trimmed = text.trim();
  if (sourceKind === 'selection' || trimmed.length === 0) {
    return [
      {
        title: title.trim() || 'Selection',
        body: trimmed,
        level: 0,
        parent: null,
        position: 0,
      },
    ];
  }

  const blocks = parseBlocks(trimmed);
  const headings = blocks.filter((block) => block.kind === 'heading');
  if (headings.length === 0) {
    return [
      {
        title: title.trim() || 'Untitled',
        body: trimmed,
        level: 0,
        parent: null,
        position: 0,
      },
    ];
  }

  let docTitle = title.trim();
  if (!docTitle) {
    const first = headings[0];
    docTitle = first && first.kind === 'heading' ? first.title : 'Untitled';
  }

  const drafts: Draft[] = [
    { title: docTitle, body: '', level: 0, parent: null, position: 0 },
  ];
  const stack = [0];
  let current = 0;

  for (const block of blocks) {
    if (block.kind === 'para') {
      drafts[current].body = drafts[current].body
        ? `${drafts[current].body}\n\n${block.text}`
        : block.text;
      continue;
    }
    while (stack.length > 1 && drafts[stack[stack.length - 1]].level >= block.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    const position = drafts.filter((draft) => draft.parent === parent).length;
    drafts.push({
      title: block.title,
      body: '',
      level: block.level,
      parent,
      position,
    });
    const index = drafts.length - 1;
    stack.push(index);
    current = index;
  }
  return drafts;
}

export function assignPages(nodes: NodeRecord[]): void {
  const byDocument = new Map<string, NodeRecord[]>();
  for (const node of nodes) {
    const list = byDocument.get(node.documentId) ?? [];
    list.push(node);
    byDocument.set(node.documentId, list);
  }
  for (const group of byDocument.values()) {
    let offset = 0;
    for (const node of preorder(group)) {
      const length = node.body.length;
      if (length === 0) {
        const page = Math.floor(offset / PAGE_CHARS) + 1;
        node.pageStart = page;
        node.pageEnd = page;
        continue;
      }
      node.pageStart = Math.floor(offset / PAGE_CHARS) + 1;
      node.pageEnd = Math.floor((offset + length - 1) / PAGE_CHARS) + 1;
      offset += length + 2;
    }
  }
}

export function preorder(nodes: NodeRecord[]): NodeRecord[] {
  const byParent = new Map<string | null, NodeRecord[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }
  const ordered: NodeRecord[] = [];
  const walk = (parentId: string | null) => {
    for (const node of byParent.get(parentId) ?? []) {
      ordered.push(node);
      walk(node.id);
    }
  };
  walk(null);
  return ordered;
}

export function buildNodes(input: {
  documentId: string;
  title: string;
  text: string;
  sourceKind: SourceKind;
  newId?: () => string;
}): NodeRecord[] {
  const newId = input.newId ?? randomUUID;
  const drafts = draftsFor(input.title, input.text, input.sourceKind);
  const ids = drafts.map(() => newId());
  const nodes: NodeRecord[] = drafts.map((draft, index) => ({
    id: ids[index],
    documentId: input.documentId,
    parentId: draft.parent === null ? null : ids[draft.parent],
    title: draft.title,
    summary: initialSummary(draft.title, draft.body),
    body: draft.body,
    position: draft.position,
    pageStart: null,
    pageEnd: null,
  }));
  assignPages(nodes);
  return nodes;
}
