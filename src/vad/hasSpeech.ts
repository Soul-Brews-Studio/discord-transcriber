import { defaultVadConfig } from './defaultConfig.ts';
import { downsampleTo16k } from './downsampleTo16k.ts';
import { speechVerdict } from './speechVerdict.ts';
import { stereoToMono } from './stereoToMono.ts';
import { toFrames } from './toFrames.ts';
import type { VadConfig, VadProcess, VadVerdict } from './types.ts';

/**
 * Whether an utterance contains speech, according to Silero rather than to its
 * loudness.
 *
 * This is the whole point of the stage. An RMS gate cuts on energy, and energy
 * is not speech: a fan, a chair, a door all clear it, and every one of them was
 * previously spent as a transcription request that came back empty.
 *
 * A sidecar failure returns `unavailable` rather than throwing. Losing VAD
 * should degrade the filter, never drop the audio.
 */
export async function hasSpeech(
  pcm: Buffer,
  vad: VadProcess,
  config: VadConfig = defaultVadConfig
): Promise<VadVerdict> {
  const frames = toFrames(downsampleTo16k(stereoToMono(pcm)));
  if (!frames.length) {
    return { speech: false, frames: 0, speechFrames: 0, peakProbability: 0 };
  }
  const probabilities: number[] = [];
  try {
    await vad.reset();                       // Silero is stateful between frames
    for (const frame of frames) probabilities.push(await vad.predict(frame));
  } catch (error) {
    return {
      speech: false, frames: frames.length, speechFrames: 0, peakProbability: 0,
      unavailable: (error as Error).message
    };
  }
  return speechVerdict(probabilities, config);
}
