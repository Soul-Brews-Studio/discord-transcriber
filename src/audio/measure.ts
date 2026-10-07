import type { Measurement } from '../types.ts';

/** RMS and peak of one decoded packet. */
export function measure(pcm: Buffer): Measurement {
  let energy = 0, peak = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const sample = pcm.readInt16LE(i) / 32768;
    energy += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return { rms: Math.sqrt(energy / (pcm.length / 2)), peak };
}
