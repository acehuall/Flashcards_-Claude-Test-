import Papa from 'papaparse';
import type { CsvImportResult } from './types';

const MAX_IMPORT_ROWS = 500;

export interface ParsedCsvRow {
  question: string;
  answer: string;
}

export interface CsvParseError {
  type: 'missing-headers' | 'no-valid-rows' | 'limit-exceeded';
  message: string;
}

export type CsvParseResult =
  | { ok: true; rows: ParsedCsvRow[]; skipped: number }
  | { ok: false; error: CsvParseError };

export function parseCsvFile(file: File): Promise<CsvParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const fields = results.meta.fields ?? [];
        const hasQuestion = fields.includes('question');
        const hasAnswer = fields.includes('answer');

        if (!hasQuestion || !hasAnswer) {
          resolve({
            ok: false,
            error: {
              type: 'missing-headers',
              message: `Required columns not found. Expected "question" and "answer". Found: ${fields.join(', ') || '(none)'}`,
            },
          });
          return;
        }

        const rows: ParsedCsvRow[] = [];
        let skipped = 0;

        for (const row of results.data) {
          const q = row['question']?.trim() ?? '';
          const a = row['answer']?.trim() ?? '';
          if (!q || !a) {
            skipped++;
            continue;
          }
          rows.push({ question: q, answer: a });
        }

        if (rows.length === 0) {
          resolve({
            ok: false,
            error: {
              type: 'no-valid-rows',
              message: 'No valid rows found. Check that column headers are "question" and "answer".',
            },
          });
          return;
        }

        if (rows.length > MAX_IMPORT_ROWS) {
          resolve({
            ok: false,
            error: {
              type: 'limit-exceeded',
              message: `Import limit is ${MAX_IMPORT_ROWS} cards. Your file contains ${rows.length} valid rows.`,
            },
          });
          return;
        }

        resolve({ ok: true, rows, skipped });
      },
      error(err) {
        resolve({
          ok: false,
          error: {
            type: 'no-valid-rows',
            message: `CSV parsing error: ${err.message}`,
          },
        });
      },
    });
  });
}

export function buildImportSummary(result: CsvImportResult): string {
  const parts: string[] = [`Imported ${result.imported} card${result.imported !== 1 ? 's' : ''}.`];
  if (result.skipped > 0) {
    parts.push(`${result.skipped} row${result.skipped !== 1 ? 's' : ''} skipped (missing question or answer).`);
  }
  return parts.join(' ');
}

export function exportSetToCsv(
  setTitle: string,
  cards: Array<{ question: string; answer: string }>,
): void {
  const csv = Papa.unparse(
    cards.map((c) => ({ question: c.question, answer: c.answer })),
    { header: true },
  );

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const filename = `${setTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_cards.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
