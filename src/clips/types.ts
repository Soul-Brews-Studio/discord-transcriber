import type { VadVerdict } from '../vad/types.ts';
import type { ClipKind } from './clipKind.ts';

/**
 * One utterance the VAD ruled on, kept so the decision can be replayed and
 * argued with. The rejected ones are the point: they are the only way to see
 * what the gate threw away.
 */
export interface Clip {
  id: string;
  at: string;
  speaker: string;
  /** Seconds of 48 kHz stereo audio. */
  seconds: number;
  bytes: number;
  verdict: VadVerdict;
  /** Which gate ruled — 'silero (torch)' or 'energy only'. */
  gate: string;
  /** Whether a per-frame trace exists to fetch. The trace itself never rides
   *  in the state frame; see listClips. */
  hasTrace?: boolean;
}

/** A clip plus its audio. The audio never leaves the server in `state`. */
export interface StoredClip extends Clip {
  wav: Uint8Array;
}

/**
 * How many utterances to keep, and whether to keep them at all.
 *
 * Zero is the default and means the app stores nothing, which is what it says
 * on the page. Recording someone's voice is not a thing to switch on by
 * leaving a variable unset.
 */
export interface ClipStore {
  limit: number;
  clips: StoredClip[];
}

/**
 * A run of clips shown as one block. `dropped` groups hold the whole run;
 * `sent` and `unknown` always hold exactly one, because each is worth seeing
 * on its own.
 */
export interface ClipGroup {
  kind: ClipKind;
  clips: Clip[];
}
