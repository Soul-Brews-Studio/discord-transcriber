import { createVadProcess } from './createVadProcess.ts';
import { scriptPath } from './scriptPath.ts';
import type { VadProcess } from './types.ts';

/**
 * Starts Silero if it can be started, and returns null if it cannot.
 *
 * Best-effort on purpose: a missing Python environment should cost the filter,
 * not the bot. The reason is returned to the caller so the page can say which
 * gate is actually running rather than leaving the operator to guess.
 */
export async function startVad(): Promise<{ vad: VadProcess | null; reason: string }> {
  const path = scriptPath();
  if (!path) return { vad: null, reason: 'sidecar script not found' };
  try {
    const vad = await createVadProcess(path);
    return { vad, reason: `silero (${vad.backend})` };
  } catch (error) {
    return { vad: null, reason: (error as Error).message };
  }
}
