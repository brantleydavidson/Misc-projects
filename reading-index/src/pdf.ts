const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const FONT_SIZE = 11;
const TITLE_SIZE = 16;
const LEADING = 14;
const CHAR_WIDTH = FONT_SIZE * 0.6;
const COLS = Math.floor((PAGE_WIDTH - MARGIN * 2) / CHAR_WIDTH);

function pdfEscape(text: string): string {
  const mapped = text
    .replaceAll('“', '"')
    .replaceAll('”', '"')
    .replaceAll('‘', "'")
    .replaceAll('’', "'")
    .replaceAll('—', '-')
    .replaceAll('–', '-')
    .replaceAll('…', '...')
    .replaceAll('\u00a0', ' ');
  let out = '';
  for (const char of mapped) {
    const code = char.codePointAt(0) ?? 63;
    if (char === '\\' || char === '(' || char === ')') out += `\\${char}`;
    else if (code >= 32 && code <= 126) out += char;
    else if (code === 10 || code === 13 || code === 9) out += ' ';
    else out += '?';
  }
  return out;
}

function wrapParagraph(paragraph: string): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (word.length > COLS) {
      if (current) lines.push(current);
      for (let index = 0; index < word.length; index += COLS) {
        lines.push(word.slice(index, index + COLS));
      }
      current = '';
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > COLS) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapText(text: string): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n/g, '\n').split('\n')) {
    lines.push(...wrapParagraph(paragraph));
  }
  return lines;
}

interface PdfPage {
  commands: string;
}

function paginate(title: string, text: string): PdfPage[] {
  const lines = wrapText(text);
  const pages: string[][] = [];
  let index = 0;
  const firstCapacity = 44;
  const laterCapacity = 48;
  while (index < lines.length || pages.length === 0) {
    const capacity = pages.length === 0 ? firstCapacity : laterCapacity;
    pages.push(lines.slice(index, index + capacity));
    index += capacity;
    if (index >= lines.length) break;
    if (pages.length >= 500) {
      pages[pages.length - 1].push('(truncated for PDF export)');
      break;
    }
  }

  return pages.map((pageLines, pageIndex) => {
    const commands: string[] = ['BT'];
    let y = PAGE_HEIGHT - MARGIN - (pageIndex === 0 ? TITLE_SIZE : FONT_SIZE);
    if (pageIndex === 0) {
      commands.push(`/F1 ${TITLE_SIZE} Tf`);
      commands.push(`1 0 0 1 ${MARGIN} ${y} Tm`);
      commands.push(`(${pdfEscape(title || 'Untitled')}) Tj`);
      y -= 28;
    }
    commands.push(`/F1 ${FONT_SIZE} Tf`);
    for (const line of pageLines) {
      if (y < MARGIN) break;
      commands.push(`1 0 0 1 ${MARGIN} ${y} Tm`);
      commands.push(`(${pdfEscape(line)}) Tj`);
      y -= LEADING;
    }
    commands.push('ET');
    return { commands: commands.join('\n') };
  });
}

function buildPdf(objects: string[], infoId: number): Buffer {
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output, 'latin1'));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, 'latin1');
  output += `xref\n0 ${objects.length + 1}\n`;
  output += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'latin1');
}

export function renderTextPdf(title: string, text: string): Buffer {
  const pages = paginate(title, text);
  const pageCount = pages.length;
  const fontId = 3;
  const infoId = 4 + pageCount * 2;
  const pageIds = pages.map((_, index) => 4 + index);
  const contentIds = pages.map((_, index) => 4 + pageCount + index);
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  for (let index = 0; index < pageCount; index += 1) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentIds[index]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
  }
  for (const page of pages) {
    const length = Buffer.byteLength(page.commands, 'latin1');
    objects.push(`<< /Length ${length} >>\nstream\n${page.commands}\nendstream`);
  }
  objects.push(`<< /Title (${pdfEscape(title || 'Untitled')}) /Producer (reading-index) >>`);
  if (objects.length !== infoId) {
    throw new Error('pdf object map mismatch');
  }
  return buildPdf(objects, infoId);
}

export function pdfFilename(title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'article';
  return `${slug}-${id.slice(0, 8)}.pdf`;
}
