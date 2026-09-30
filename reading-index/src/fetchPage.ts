import { extractSimplePdfText, htmlToArticle } from './extract.js';
import { assertPublicHttpUrl, UnsafeUrlError } from './ssrf.js';

const MAX_BYTES = 2_000_000;
const MAX_HOPS = 3;

export interface FetchedDocument {
  title: string;
  text: string;
  contentType: string;
  pdfBytes: Buffer | null;
}

export async function fetchReadable(rawUrl: string): Promise<FetchedDocument> {
  let current = rawUrl;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    await assertPublicHttpUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'reading-index/0.1 (+https://github.com/reading-index)',
          accept: 'text/html, application/xhtml+xml, text/plain, application/pdf;q=0.9',
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new UnsafeUrlError('redirect missing location');
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) {
        throw new Error(`fetch failed with status ${response.status}`);
      }
      const bytes = await readLimited(response);
      const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
      const isPdf = contentType.includes('application/pdf') || bytes.subarray(0, 5).toString('latin1') === '%PDF-';
      if (isPdf) {
        const text = extractSimplePdfText(bytes);
        return {
          title: titleFromUrl(current),
          text,
          contentType: contentType || 'application/pdf',
          pdfBytes: bytes,
        };
      }
      const decoded = bytes.toString('utf8');
      if (contentType.includes('text/plain')) {
        return {
          title: titleFromUrl(current),
          text: decoded.trim(),
          contentType,
          pdfBytes: null,
        };
      }
      const article = htmlToArticle(decoded);
      return {
        title: article.title,
        text: article.text,
        contentType: contentType || 'text/html',
        pdfBytes: null,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new UnsafeUrlError('too many redirects');
}

async function readLimited(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error('response too large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function titleFromUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const last = url.pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(last ?? url.hostname);
  } catch {
    return 'Untitled';
  }
}
