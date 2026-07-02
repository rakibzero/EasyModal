import type { Milestone } from '@easymodal/shared';

/**
 * Map a raw `modal deploy` log line to a human-readable milestone.
 * Returns null if the line isn't a milestone marker.
 *
 * Patterns cover both deploy targets:
 *  - ComfyUI (comfyapp.py): HARD:/EXISTS:/FAIL:, "ComfyUI is ready", port 8188
 *  - AI Toolkit (aitoolkit_app.py): DOWNLOADED:/EXISTS:/FAIL:, [UI]/[DB]/[MODEL],
 *    "[UI] Starting Next.js", port 8675
 */
export function classifyLine(line: string): { milestone?: Milestone; message: string } {
  const l = line.toLowerCase();

  // Image build / layers
  if (/(building image|image build|step \d+\/|apt install|pip install|git clone|uv_pip|npm install|prisma generate|next build)/i.test(l)) {
    return { milestone: 'image-building', message: line.trim() };
  }
  // Model downloads (ComfyUI: HARD:/EXISTS: ; AI Toolkit: DOWNLOADED:/SNAPSHOT:)
  if (/(hard:|exists:|copy:|fail:|downloading|hf_hub_download|downloaded:|snapshot:|pre-download|model cache|\[model\])/i.test(l)) {
    return { milestone: 'models-downloading', message: line.trim() };
  }
  // App server starting (ComfyUI or AI Toolkit Next.js UI)
  if (/(comfyui|web server|listening on|0\.0\.0\.0:8188|symlink|ai-toolkit modal gpu server|starting next\.?js|\[ui\] starting|prisma db push|gpu available|vram:)/i.test(l)) {
    return { milestone: 'comfyui-starting', message: line.trim() };
  }
  // Ready / URL
  if (/(created app|deployed|endpoint|https?:\/\/|url ready|\.modal\.run|created web function|ready and serving)/i.test(l)) {
    return { milestone: 'url-ready', message: line.trim() };
  }
  // Failure
  if (/(error|failed|exception|traceback|abort|required model)/i.test(l)) {
    return { milestone: 'failed', message: line.trim() };
  }
  return { message: line.trim() };
}

/** The ordered milestone checklist shown in the UI. */
export const MILESTONE_CHECKLIST: { id: Milestone; label: string }[] = [
  { id: 'image-building', label: 'Building container image' },
  { id: 'models-downloading', label: 'Downloading models' },
  { id: 'comfyui-starting', label: 'Starting app server' },
  { id: 'url-ready', label: 'Deployment ready' },
];
