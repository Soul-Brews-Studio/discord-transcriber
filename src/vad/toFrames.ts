import { VAD_FRAME_SAMPLES } from './types.ts';

/**
 * Splits samples into exactly-sized frames. A trailing partial frame is
 * dropped rather than zero-padded: padding would hand the model silence it
 * never heard and drag the probability down.
 */
export function toFrames(samples: Float32Array): Float32Array[] {
  const frames: Float32Array[] = [];
  for (let i = 0; i + VAD_FRAME_SAMPLES <= samples.length; i += VAD_FRAME_SAMPLES) {
    frames.push(samples.subarray(i, i + VAD_FRAME_SAMPLES));
  }
  return frames;
}
