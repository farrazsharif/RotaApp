import * as z from 'zod/v4';
import { CHARACTER_LIMIT } from './api.js';

export const ResponseFormat = z
  .enum(['markdown', 'json'])
  .default('markdown')
  .describe("'markdown' for readable text, 'json' for structured data");

export type Format = 'markdown' | 'json';

/**
 * A tool result in the requested format. In JSON mode the spec wants the same
 * data both as structuredContent and serialised in the text block, so callers
 * that ignore one still get the other.
 */
export function result(format: Format, markdown: string, data: unknown) {
  if (format === 'json') {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      structuredContent: data as Record<string, unknown>,
    };
  }
  return { content: [{ type: 'text' as const, text: markdown }] };
}

/**
 * Keeps a response under the character limit by returning FEWER rows, never by
 * truncating text — a half-cut JSON blob is worse than an honest short page,
 * and the omitted-count line tells the model what it is missing.
 */
export function fitToLimit<T>(rows: T[], render: (rows: T[]) => string): { rows: T[]; text: string; omitted: number } {
  let kept = rows;
  let text = render(kept);
  while (kept.length > 1 && text.length > CHARACTER_LIMIT) {
    kept = kept.slice(0, Math.ceil(kept.length / 2));
    text = render(kept);
  }
  return { rows: kept, text, omitted: rows.length - kept.length };
}

/** 2026-03-14 → "14 Mar 2026". Dates out of Caremid are ISO. */
export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Whole days from today, compared date to date so something valid through the
 * whole of its last day is not reported as already gone.
 */
export function daysUntil(iso: string): number {
  const a = new Date(iso);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .describe('Date as YYYY-MM-DD');
