import path from "path";
import fs from "fs";

/**
 * Adhoc research report files. Two filename conventions exist in the repo:
 *   TICKER_YYYY-MM-DD.json          (pipeline, one per day)
 *   TICKER_YYYYMMDD_HHMMSS.json     (manual / older runs)
 * Plain string sorting puts "TICKER_2026…" (digit after "_") before or after
 * "TICKER_2026-…" depending on the character, not the date — which served a June
 * report as "latest" for AAPL. Always order by the timestamp parsed from the name.
 */

const NAME_RE = /^([A-Z0-9.\-]+)_(\d{4}-\d{2}-\d{2}|\d{8}_\d{6})\.json$/;

export function adhocDir(): string {
  const inDashboard = path.join(process.cwd(), "data", "adhoc_reports");
  if (fs.existsSync(inDashboard)) return inDashboard;
  return path.join(process.cwd(), "..", "data", "adhoc_reports");
}

/** Validates an adhoc report filename (also blocks path traversal). */
export function isAdhocFilename(name: string): boolean {
  return NAME_RE.test(name);
}

/** ISO-ish sortable timestamp from a filename, or "" if it doesn't match. */
export function adhocTimestamp(name: string): string {
  const m = NAME_RE.exec(name);
  if (!m) return "";
  const t = m[2];
  if (t.includes("-")) return `${t}T00:00:00`;
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}`;
}

export function adhocTicker(name: string): string | null {
  return NAME_RE.exec(name)?.[1] ?? null;
}

/** Newest first. */
export function sortAdhocNames(names: string[]): string[] {
  return names
    .filter(isAdhocFilename)
    .sort((a, b) => adhocTimestamp(b).localeCompare(adhocTimestamp(a)) || b.localeCompare(a));
}

export function listAdhocFiles(ticker: string): string[] {
  const dir = adhocDir();
  if (!fs.existsSync(dir)) return [];
  return sortAdhocNames(fs.readdirSync(dir).filter((f) => adhocTicker(f) === ticker));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readAdhocFile(name: string): Record<string, any> | null {
  if (!isAdhocFilename(name)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(adhocDir(), name), "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Newest report for a ticker that actually parses (a few files on disk contain NaN
 * or are truncated — skip those rather than returning nothing).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readLatestAdhoc(ticker: string): { file: string; report: Record<string, any> } | null {
  for (const file of listAdhocFiles(ticker)) {
    const report = readAdhocFile(file);
    if (report) return { file, report };
  }
  return null;
}
