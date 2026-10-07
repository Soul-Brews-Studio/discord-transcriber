import type { AudioCounters } from '../types.ts';

/** A fresh counter set. Every join starts from zero so old numbers never carry over. */
export function emptyCounters(enabled = false): AudioCounters {
  return { enabled, packets: 0, decodedBytes: 0, audioSeconds: 0, rms: 0, peak: 0,
    lastAudioAt: null, speaker: null, decodeErrors: 0 };
}
