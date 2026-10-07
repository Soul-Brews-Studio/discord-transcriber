import type { ControllerState } from '../types.ts';

/** Empties the in-memory transcript. There is no persistent store to clear. */
export function clear(controller: ControllerState): void {
  controller.rows = [];
  controller.adapter.clearClips?.();   // Clear means the audio too, not just the text
}
