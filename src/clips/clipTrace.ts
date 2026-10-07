import type { ClipStore } from './types.ts';
import type { ClipTrace } from '../types.ts';
import { findClip } from './findClip.ts';
import { defaultVadConfig } from '../vad/defaultConfig.ts';

/**
 * One clip's VAD curve, with the two numbers that decided it.
 *
 * The threshold travels with the trace rather than being a constant the page
 * repeats: a line drawn at a value the gate did not actually use would make
 * every verdict look wrong in exactly the cases worth reading.
 */
export function clipTrace(store: ClipStore, id: string): ClipTrace | undefined {
  const clip = findClip(store, id);
  const trace = clip?.verdict.trace;
  if (!clip || !trace?.length) return undefined;
  return {
    id: clip.id,
    trace,
    threshold: defaultVadConfig.speechProbability,
    minSpeechFrames: defaultVadConfig.minSpeechFrames,
    speechFrames: clip.verdict.speechFrames,
    frames: clip.verdict.frames,
    speech: clip.verdict.speech
  };
}
