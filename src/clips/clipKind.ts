import type { Clip } from './types.ts';

/** What happened to a clip, as one word. */
export type ClipKind = 'sent' | 'dropped' | 'unknown';

export function clipKind(clip: Clip): ClipKind {
  if (clip.verdict.unavailable) return 'unknown';
  return clip.verdict.speech ? 'sent' : 'dropped';
}
