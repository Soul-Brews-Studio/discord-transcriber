import type { VadConfig } from './types.ts';

/**
 * Silero's own documented operating point is 0.5. `minSpeechFrames` of 8 is
 * 8 × 32 ms ≈ 0.26 s of confident speech — short enough for one Thai word,
 * long enough that a door slam or a keyboard clack cannot buy a request.
 */
export const defaultVadConfig: VadConfig = {
  speechProbability: 0.5,
  minSpeechFrames: 8
};
