import { clipKind } from './clipKind.ts';
import type { Clip, ClipGroup } from './types.ts';

/**
 * Folds runs of consecutive rejections into one group.
 *
 * A quiet channel produces long strings of half-second drops — breaths, chair
 * creaks, a fan — and listing each one buries the utterances that were actually
 * sent. Grouping keeps them reachable without letting them set the rhythm of
 * the page.
 *
 * Only `dropped` groups: a sent utterance is the signal, and two of them in a
 * row are two separate things worth seeing separately.
 */
export function groupClips(clips: readonly Clip[]): ClipGroup[] {
  const groups: ClipGroup[] = [];
  for (const clip of clips) {
    const kind = clipKind(clip);
    const last = groups[groups.length - 1];
    if (kind === 'dropped' && last?.kind === 'dropped') last.clips.push(clip);
    else groups.push({ kind, clips: [clip] });
  }
  return groups;
}
