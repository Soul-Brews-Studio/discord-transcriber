import { test, expect } from 'bun:test';
import { traceOf, TRACE_POINTS } from '../src/vad/traceOf.ts';
import { speechVerdict } from '../src/vad/speechVerdict.ts';
import { clipTrace } from '../src/clips/clipTrace.ts';
import { listClips } from '../src/clips/listClips.ts';
import { defaultVadConfig } from '../src/vad/defaultConfig.ts';
import type { ClipStore, StoredClip } from '../src/clips/types.ts';

test('a short utterance keeps every frame', () => {
  const probabilities = [0, 0.4, 0.91, 1];
  expect(traceOf(probabilities)).toEqual([0, 0.4, 0.91, 1]);
});

test('a long one is max-pooled, never averaged', () => {
  // One confident frame inside a long quiet run. Averaging buries it; the
  // whole point of the view is that the spike is visible, because the spike is
  // what the gate counted.
  const probabilities = new Array(1000).fill(0.01);
  probabilities[500] = 0.97;
  const trace = traceOf(probabilities);
  expect(trace).toHaveLength(TRACE_POINTS);
  expect(Math.max(...trace)).toBe(0.97);
});

test('probabilities are rounded to two places, not to nothing', () => {
  expect(traceOf([0.912345, 0.004])).toEqual([0.91, 0]);
});

test('the verdict carries its own curve', () => {
  const verdict = speechVerdict([0.9, 0.9, 0.1], { speechProbability: 0.5, minSpeechFrames: 2 });
  expect(verdict.speech).toBe(true);
  expect(verdict.trace).toEqual([0.9, 0.9, 0.1]);
});

function store(trace: number[] | undefined): ClipStore {
  const clip: StoredClip = {
    id: 'clip-1', at: new Date().toISOString(), speaker: 'alice', seconds: 1, bytes: 10,
    verdict: { speech: true, frames: 3, speechFrames: 2, peakProbability: 0.9, trace },
    gate: 'silero (torch)', wav: new Uint8Array([1, 2, 3])
  };
  return { limit: 20, clips: [clip] };
}

test('the trace never rides in the state frame', () => {
  const [clip] = listClips(store([0.9, 0.9, 0.1]));
  expect(clip?.verdict.trace).toBeUndefined();
  // …but the page still needs to know a curve exists before offering to draw it.
  expect(clip?.hasTrace).toBe(true);
  expect(listClips(store(undefined))[0]?.hasTrace).toBe(false);
});

test('the trace is fetched with the threshold that actually judged it', () => {
  const found = clipTrace(store([0.9, 0.9, 0.1]), 'clip-1');
  expect(found?.trace).toEqual([0.9, 0.9, 0.1]);
  expect(found?.threshold).toBe(defaultVadConfig.speechProbability);
  expect(found?.minSpeechFrames).toBe(defaultVadConfig.minSpeechFrames);
  expect(found?.speechFrames).toBe(2);
});

test('a clip with no curve is a 404, not an empty one', () => {
  expect(clipTrace(store(undefined), 'clip-1')).toBeUndefined();
  expect(clipTrace(store([0.9]), 'nope')).toBeUndefined();
});

test('the WAV never leaves in the list either', () => {
  const [clip] = listClips(store([0.9]));
  expect((clip as unknown as { wav?: unknown }).wav).toBeUndefined();
});
