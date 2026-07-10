// ============================================================================
// CSV download helper — generates a UTF-8 BOM-prefixed CSV blob and triggers
// a browser download. Excel and Google Sheets read it as a regular spreadsheet.
// ============================================================================

type Cell = string | number | boolean | null | undefined;

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCSV(filename: string, rows: Cell[][]): void {
  const csv = rows.map(row => row.map(escapeCell).join(",")).join("\r\n");
  // BOM so Excel detects UTF-8 and renders accented characters correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
