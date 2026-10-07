import type { VadConfig, VadVerdict } from './types.ts';
import { traceOf } from './traceOf.ts';

/**
 * Turns per-frame probabilities into a decision, carrying the counts that
 * produced it.
 *
 * Counting confident frames rather than averaging is deliberate: a mean is
 * dragged down by the silence around a short utterance, so a real half-second
 * of Thai inside four seconds of room tone averages below any useful threshold
 * while its frames are individually near 1.0.
 */
export function speechVerdict(probabilities: readonly number[], config: VadConfig): VadVerdict {
  let speechFrames = 0;
  let peakProbability = 0;
  for (const probability of probabilities) {
    if (probability >= config.speechProbability) speechFrames++;
    if (probability > peakProbability) peakProbability = probability;
  }
  return {
    speech: speechFrames >= config.minSpeechFrames,
    frames: probabilities.length,
    speechFrames,
    peakProbability,
    trace: traceOf(probabilities)
  };
}
