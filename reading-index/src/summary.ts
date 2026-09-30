import { OPENING_SUMMARY_CHARS } from './limits.js';

export function flatten(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

export function openingSummary(body: string): string {
  const flat = flatten(body);
  if (!flat) return '';
  if (flat.length <= OPENING_SUMMARY_CHARS) return flat;
  return `${flat.slice(0, OPENING_SUMMARY_CHARS).trimEnd()}…`;
}

export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [];
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** Extractive summary used when no model key is configured. */
export function deriveSummary(title: string, body: string): string {
  const flat = flatten(body);
  if (!flat) return title.trim() || 'Untitled';
  const sentences = splitSentences(flat);
  let summary = sentences[0] ?? flat;
  if (summary.length < 80 && sentences[1]) {
    summary = `${summary} ${sentences[1]}`;
  }
  if (summary.length > 240) {
    summary = summary.slice(0, 240).trimEnd();
    const cut = summary.lastIndexOf(' ');
    if (cut > 120) summary = summary.slice(0, cut);
  }
  return summary.trim();
}

export function initialSummary(title: string, body: string): string {
  return openingSummary(body) || title.trim() || 'Untitled';
}

/**
 * A summary is still a placeholder when it is empty or it is the raw opening
 * truncation. A summary that already equals the extractive summary is kept.
 */
export function isPlaceholderSummary(summary: string, body: string): boolean {
  const flat = flatten(body);
  if (!flat) return false;
  const current = summary.trim();
  if (!current) return true;
  if (current === deriveSummary('', body)) return false;
  const opening = openingSummary(body);
  if (current === opening) return true;
  const prefix = flat.slice(0, OPENING_SUMMARY_CHARS).trimEnd();
  return current === prefix || current === `${prefix}…` || current === `${prefix}...`;
}
