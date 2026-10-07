import { measure } from '../audio/measure.ts';
import type { AdapterState } from './types.ts';

/** 48 kHz, 2 channels, 2 bytes per sample. */
const BYTES_PER_SECOND = 48000 * 2 * 2;

/**
 * Folds one decoded packet into the running counters.
 *
 * `peak` is a high-water mark across the session while `rms` is the latest
 * packet only, so the meter follows the voice instead of freezing at the
 * loudest moment.
 */
export function applyPacket(adapter: AdapterState, pcm: Buffer, speaker: string): void {
  const { rms, peak } = measure(pcm);
  adapter.audio.decodedBytes += pcm.length;
  adapter.audio.audioSeconds = adapter.audio.decodedBytes / BYTES_PER_SECOND;
  adapter.audio.rms = rms;
  adapter.audio.peak = Math.max(adapter.audio.peak, peak);
  adapter.audio.lastAudioAt = new Date().toISOString();
  adapter.audio.speaker = speaker;
}
