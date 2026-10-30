/**
 * One CSV cell. A value starting with = + - @ or a tab is prefixed with an
 * apostrophe so Excel and Google Sheets treat it as text, never as a formula.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** Excel opens UTF-8 correctly only when the file starts with a byte order mark. */
export const toCsvFile = (rows: unknown[][]) => "﻿" + toCsv(rows);
