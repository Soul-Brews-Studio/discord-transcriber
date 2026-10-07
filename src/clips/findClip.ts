import type { ClipStore, StoredClip } from './types.ts';

export function findClip(store: ClipStore, id: string): StoredClip | undefined {
  return store.clips.find(clip => clip.id === id);
}
