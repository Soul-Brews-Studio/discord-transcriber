/** Types for the Silero VAD stage. */

/** Silero's fixed contract: 16 kHz mono, 512 float32 samples per frame. */
export const VAD_SAMPLE_RATE = 16_000;
export const VAD_FRAME_SAMPLES = 512;

/** What the sidecar announces once it has loaded the model. */
export interface VadReady {
  type: 'ready';
  sample_rate: number;
  frame_samples: number;
  backend: string;
}

export interface VadProbability {
  type: 'probability';
  id: number;
  probability: number;
}

export interface VadError {
  type: 'error';
  id: number | null;
  error: string;
}

export type VadMessage = VadReady | VadProbability | VadError | { type: 'reset'; id: number | null };

/**
 * The decision thresholds.
 *
 * `speechProbability` is Silero's per-frame confidence; `minSpeechFrames` is how
 * many frames must clear it before an utterance counts as speech. One loud
 * consonant should not buy a transcription request.
 */
export interface VadConfig {
  speechProbability: number;
  minSpeechFrames: number;
}

/**
 * The verdict, carrying its own evidence. `frames` and `speechFrames` are
 * reported so a rejection can be read rather than guessed at.
 */
export interface VadVerdict {
  speech: boolean;
  frames: number;
  speechFrames: number;
  peakProbability: number;
  /**
   * Per-frame probabilities, max-pooled to a drawable length. Kept with the
   * clip and served on request, never in the state frame: 120 numbers per
   * utterance across twenty clips would ride along in every one of the ten
   * frames a second, for a picture nobody has asked to see yet.
   */
  trace?: number[];
  /** Set when the sidecar could not answer; the caller decides what to do. */
  unavailable?: string;
}

/** The sidecar process, as much of it as this code touches. */
export interface VadProcess {
  predict(frame: Float32Array): Promise<number>;
  reset(): Promise<void>;
  stop(): void;
  readonly backend: string;
}
