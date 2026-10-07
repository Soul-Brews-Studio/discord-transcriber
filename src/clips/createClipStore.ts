import type { ClipStore } from './types.ts';

/** Off unless a limit was named. */
export function createClipStore(limit = 0): ClipStore {
  return { limit: Math.max(0, Math.floor(limit)), clips: [] };
}
