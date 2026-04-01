import path from "path";
import fs from "fs";

/**
 * Resolves the root data directory.
 * - On Vercel: process.cwd() is the dashboard root, data/ is bundled inside it.
 * - Locally with sync: same (dashboard/data/).
 * - Locally without sync: falls back to ../data/ (monorepo root).
 */
export function dataDir(): string {
  const local = path.join(process.cwd(), "data");
  if (fs.existsSync(path.join(local, "reports"))) return local;
  return path.join(process.cwd(), "..", "data");
}

export function reportsDir(): string {
  return path.join(dataDir(), "reports");
}

export function memoryDir(): string {
  return path.join(dataDir(), "memory");
}

export function configDir(): string {
  return path.join(dataDir(), "config");
}
