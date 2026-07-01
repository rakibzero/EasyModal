import type { Milestone } from '@easymodal/shared';

/**
 * Map a raw `modal deploy` log line to a human-readable milestone.
 * Returns null if the line isn't a milestone marker.
 */
export function classifyLine(line: string): { milestone?: Milestone; message: string } {
  const l = line.toLowerCase();

  // Image build / layers
  if (/(building image|image build|step \d+\/|apt install|pip install|git clone|uv_pip)/i.test(l)) {
    return { milestone: 'image-building', message: line.trim() };
  }
  // Model downloads
  if (/(hard:|exists:|copy:|fail:|downloading|hf_hub_download|models)/i.test(l) && /(hard|exists|copy|fail|download)/i.test(l)) {
    return { milestone: 'models-downloading', message: line.trim() };
  }
  // ComfyUI starting
  if (/(comfyui|web server|listening on|0\.0\.0\.0:8188|symlink)/i.test(l)) {
    return { milestone: 'comfyui-starting', message: line.trim() };
  }
  // Ready / URL
  if (/(created app|deployed|endpoint|https?:\/\/|url ready|\.modal\.run)/i.test(l)) {
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
  { id: 'comfyui-starting', label: 'Starting ComfyUI' },
  { id: 'url-ready', label: 'Deployment ready' },
];
