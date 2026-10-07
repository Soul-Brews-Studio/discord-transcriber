import { pcmToWav } from '../audio/pcmToWav.ts';
import type { VadVerdict } from '../vad/types.ts';
import type { ClipStore, StoredClip } from './types.ts';

/** 48 kHz, 2 channels, 2 bytes per sample. */
const BYTES_PER_SECOND = 48000 * 2 * 2;

/**
 * Keeps one utterance and its verdict, newest first.
 *
 * Stores the rejected ones too — an accepted clip tells you the gate worked, a
 * rejected one is the only way to find out it did not.
 */
export function rememberClip(
  store: ClipStore,
  pcm: Buffer,
  speaker: string,
  verdict: VadVerdict,
  gate: string
): StoredClip | null {
  if (store.limit <= 0) return null;
  const clip: StoredClip = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    speaker,
    seconds: pcm.length / BYTES_PER_SECOND,
    bytes: pcm.length,
    verdict,
    gate,
    wav: pcmToWav(pcm)
  };
  store.clips.unshift(clip);
  store.clips.length = Math.min(store.clips.length, store.limit);
  return clip;
}
