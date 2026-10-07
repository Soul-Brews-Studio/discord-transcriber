import { test, expect } from 'bun:test';
import { downsampleTo16k } from '../src/vad/downsampleTo16k.ts';
import { encodeFrame } from '../src/vad/encodeFrame.ts';
import { hasSpeech } from '../src/vad/hasSpeech.ts';
import { speechVerdict } from '../src/vad/speechVerdict.ts';
import { stereoToMono } from '../src/vad/stereoToMono.ts';
import { toFrames } from '../src/vad/toFrames.ts';
import { defaultVadConfig } from '../src/vad/defaultConfig.ts';
import { VAD_FRAME_SAMPLES } from '../src/vad/types.ts';
import type { VadProcess } from '../src/vad/types.ts';

const stereo = (samples: readonly [number, number][]): Buffer => {
  const b = Buffer.alloc(samples.length * 4);
  samples.forEach(([l, r], i) => { b.writeInt16LE(l, i * 4); b.writeInt16LE(r, i * 4 + 2); });
  return b;
};

test('stereo is averaged to mono, not half-discarded', () => {
  const mono = stereoToMono(stereo([[100, 200], [-1000, -2000], [0, 0]]));
  expect([...mono]).toEqual([150, -1500, 0]);
});

test('48k decimates to 16k at exactly 3:1 and normalises to -1..1', () => {
  const mono = Int16Array.from([32767, 32767, 32767, 0, 0, 0, -32768, -32768, -32768]);
  const out = downsampleTo16k(mono);
  expect(out.length).toBe(3);
  expect(out[0]).toBeCloseTo(0.99997, 4);
  expect(out[1]).toBe(0);
  expect(out[2]).toBeCloseTo(-1, 4);
});

test('a trailing partial frame is dropped, never zero-padded', () => {
  // Padding would feed the model silence nobody spoke and pull the score down.
  expect(toFrames(new Float32Array(VAD_FRAME_SAMPLES * 2 + 5)).length).toBe(2);
  expect(toFrames(new Float32Array(VAD_FRAME_SAMPLES - 1)).length).toBe(0);
});

test('frames encode as little-endian float32 base64 of the exact size', () => {
  const frame = new Float32Array(VAD_FRAME_SAMPLES);
  frame[0] = 1; frame[1] = -1;
  const bytes = Buffer.from(encodeFrame(frame), 'base64');
  expect(bytes.length).toBe(VAD_FRAME_SAMPLES * 4);
  expect(bytes.readFloatLE(0)).toBe(1);
  expect(bytes.readFloatLE(4)).toBe(-1);
  expect(() => encodeFrame(new Float32Array(10))).toThrow(RangeError);
});

/**
 * The reason the verdict counts confident frames instead of averaging: half a
 * second of real speech inside four seconds of room tone averages below any
 * usable threshold while its own frames sit near 1.0.
 */
test('a short burst of confident speech survives surrounding silence', () => {
  const probabilities = [...Array<number>(120).fill(0.01), ...Array<number>(16).fill(0.97)];
  const mean = probabilities.reduce((a, b) => a + b, 0) / probabilities.length;

  expect(mean).toBeLessThan(defaultVadConfig.speechProbability);
  expect(speechVerdict(probabilities, defaultVadConfig).speech).toBe(true);
});

test('one loud frame does not buy a transcription request', () => {
  const verdict = speechVerdict([...Array<number>(60).fill(0.02), 0.99], defaultVadConfig);
  expect(verdict.speech).toBe(false);
  expect(verdict.speechFrames).toBe(1);
  expect(verdict.peakProbability).toBe(0.99);
});

test('the verdict carries the counts and the curve that produced it', () => {
  const verdict = speechVerdict([0.9, 0.9, 0.1], { speechProbability: 0.5, minSpeechFrames: 2 });
  // Exact on purpose. The verdict is what a clip stores and what the trace
  // endpoint reads, so a field appearing or vanishing should fail here rather
  // than be discovered by a drawing that looks wrong.
  expect(verdict).toEqual({
    speech: true, frames: 3, speechFrames: 2, peakProbability: 0.9, trace: [0.9, 0.9, 0.1]
  });
});

const fakeVad = (probability: number): VadProcess => ({
  backend: 'fake',
  predict: async () => probability,
  reset: async () => {},
  stop: () => {}
});

test('hasSpeech resets between utterances — Silero is stateful across frames', async () => {
  let resets = 0;
  const vad: VadProcess = { ...fakeVad(0.9), reset: async () => { resets++; } };
  await hasSpeech(stereo(Array<[number, number]>(VAD_FRAME_SAMPLES * 3 * 2).fill([9000, 9000])), vad);
  expect(resets).toBe(1);
});

test('audio too short to fill one frame is not speech, and is not an error', async () => {
  const verdict = await hasSpeech(stereo([[1000, 1000]]), fakeVad(0.99));
  expect(verdict).toEqual({ speech: false, frames: 0, speechFrames: 0, peakProbability: 0 });
  expect(verdict.unavailable).toBeUndefined();
});

/** Losing the sidecar must degrade the filter, never drop the audio silently. */
test('a sidecar failure reports unavailable instead of a confident no', async () => {
  const broken: VadProcess = { ...fakeVad(0), predict: async () => { throw new Error('sidecar exited'); } };
  const verdict = await hasSpeech(
    stereo(Array<[number, number]>(VAD_FRAME_SAMPLES * 3 * 2).fill([9000, 9000])), broken);

  expect(verdict.speech).toBe(false);
  expect(verdict.unavailable).toBe('sidecar exited');
});
