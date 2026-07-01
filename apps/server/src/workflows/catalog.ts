import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_ROOT = join(__dirname, '..', '..', 'workflows');

export interface WorkflowFile {
  /** Relative path from the workflows root, e.g. "wan22/SCAIL2_simple.json". */
  path: string;
  /** Display name derived from the filename. */
  name: string;
  /** Size in bytes (for display). */
  size: number;
}

export interface WorkflowCategory {
  /** Pack id this category belongs to. */
  pack: string;
  /** Display label for the category. */
  label: string;
  files: WorkflowFile[];
}

/** Map of pack id -> human category label. Must match WORKFLOW_PACKS ids. */
const PACK_LABELS: Record<string, string> = {
  wan22: 'Wan2.2 Animation',
  'image-edit': 'Image Editing',
  upscaling: 'Image & Video Upscaling',
};

/** Folders inside apps/server/workflows/, in pack order. */
const PACK_DIRS: { pack: string; dir: string }[] = [
  { pack: 'wan22', dir: 'wan22' },
  { pack: 'image-edit', dir: 'image-edit' },
  { pack: 'upscaling', dir: 'upscaling' },
];

function prettyName(filename: string): string {
  return filename
    .replace(/\.json$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function scanDir(dir: string): WorkflowFile[] {
  if (!existsSync(dir)) return [];
  const out: WorkflowFile[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.toLowerCase().endsWith('.json')) continue;
    const full = join(dir, entry);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
    } catch {
      continue;
    }
    out.push({ path: entry, name: prettyName(entry), size: statSync(full).size });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function listWorkflowCatalog(): WorkflowCategory[] {
  const cats: WorkflowCategory[] = [];
  for (const { pack, dir } of PACK_DIRS) {
    const files = scanDir(join(WORKFLOWS_ROOT, dir));
    cats.push({ pack, label: PACK_LABELS[pack] ?? pack, files });
  }
  return cats;
}

/** Read a single workflow JSON file for download/preview. Returns null if missing. */
export function readWorkflowFile(pack: string, filename: string): string | null {
  const dir = PACK_DIRS.find((p) => p.pack === pack)?.dir;
  if (!dir) return null;
  const full = join(WORKFLOWS_ROOT, dir, filename);
  if (!full.startsWith(WORKFLOWS_ROOT) || !existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}
