import type { ClipStore } from './types.ts';

/** Drops every held clip. Called on leave, disconnect, and Clear. */
export function clearClips(store: ClipStore): void {
  store.clips = [];
}
