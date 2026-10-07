import { audible } from '../audio/audible.ts';
import { pcmToWav } from '../audio/pcmToWav.ts';
import type { EmitRow } from '../types.ts';
import { hasSpeech } from '../vad/hasSpeech.ts';
import { rememberClip } from '../clips/rememberClip.ts';
import type { VadVerdict } from '../vad/types.ts';
import type { AdapterState } from './types.ts';

/** Bounds memory: a backed-up service must drop audio, not accumulate it. */
const QUEUE_LIMIT = 8;

/**
 * Queues one utterance for transcription, once something has agreed it is
 * speech.
 *
 * With the sidecar running, Silero decides. Without it, the energy gate stands
 * in — and it is a poor stand-in: measured on this machine, a 440 Hz tone, white
 * noise and a 60 Hz rumble all clear the energy gate at RMS 0.14–0.18, while
 * real Thai speech sits *below* them at 0.0554. Amplitude cannot separate the
 * two, which is why every one of those used to be spent as a request that came
 * back empty.
 *
 * Verdicts are chained through `vadWork` so utterances reach the queue in the
 * order they were spoken.
 */
export function enqueueUtterance(
  adapter: AdapterState,
  pcm: Buffer,
  generation: number,
  sttURL: string,
  row: EmitRow,
  speaker = '',
  transcribe = true
): void {
  adapter.vadWork = adapter.vadWork.catch(() => {}).then(async () => {
    if (generation !== adapter.generation) return;

    let verdict: VadVerdict;
    if (adapter.vad) {
      verdict = await hasSpeech(pcm, adapter.vad);
    } else {
      const loud = audible(pcm);
      verdict = { speech: loud, frames: 0, speechFrames: 0, peakProbability: 0, unavailable: 'no sidecar' };
    }

    // Recorded before the decision acts on it, so the timeline holds what was
    // rejected as well as what was sent. A gate you cannot review is a gate you
    // cannot tune.
    rememberClip(adapter.clipStore, pcm, speaker, verdict, adapter.gate);

    // Recording a clip and spending a transcription request are separate
    // decisions: listen-only reviews the gate without ever calling the service.
    if (!transcribe) return;

    if (verdict.unavailable) {
      // Losing the sidecar degrades the filter; it must not drop the audio.
      if (!audible(pcm)) return;
    } else if (!verdict.speech) {
      return;
    }

    if (generation !== adapter.generation) return;
    if (adapter.queue.length >= QUEUE_LIMIT) {
      row({ status: 'error', text: 'Transcription queue full; audio dropped.' });
      return;
    }
    adapter.queue.push({ wav: pcmToWav(pcm), generation, sttURL, row });
    void adapter.drain();
  });
}
