import { test, expect } from 'bun:test';
import { clearClips } from '../src/clips/clearClips.ts';
import { clipLimit } from '../src/clips/clipLimit.ts';
import { createClipStore } from '../src/clips/createClipStore.ts';
import { findClip } from '../src/clips/findClip.ts';
import { listClips } from '../src/clips/listClips.ts';
import { rememberClip } from '../src/clips/rememberClip.ts';
import { groupClips } from '../src/clips/groupClips.ts';
import type { Clip } from '../src/clips/types.ts';
import type { VadVerdict } from '../src/vad/types.ts';

const sent: VadVerdict = { speech: true, frames: 60, speechFrames: 40, peakProbability: 0.98 };
const dropped: VadVerdict = { speech: false, frames: 60, speechFrames: 1, peakProbability: 0.31 };
const oneSecond = (): Buffer => Buffer.alloc(48000 * 2 * 2);

/** Recording someone's voice is not a thing to switch on by leaving a variable unset. */
test('the store holds nothing unless a limit is named', () => {
  expect(clipLimit(undefined)).toBe(0);
  expect(clipLimit('')).toBe(0);
  expect(clipLimit('0')).toBe(0);
  expect(clipLimit('-5')).toBe(0);
  expect(clipLimit('not a number')).toBe(0);
  expect(clipLimit('20')).toBe(20);
});

test('the limit is capped — the buffer is held voice, in memory', () => {
  // 48 kHz stereo PCM16 is 192 KB/s; the cap is a memory bound as well.
  expect(clipLimit('100000')).toBe(200);
});

test('a store with no limit records nothing at all', () => {
  const store = createClipStore();
  expect(rememberClip(store, oneSecond(), 'alice', sent, 'silero (torch)')).toBeNull();
  expect(store.clips).toEqual([]);
});

/** The rejected ones are the point — an accepted clip only proves the gate ran. */
test('rejected utterances are kept, not just the sent ones', () => {
  const store = createClipStore(5);
  rememberClip(store, oneSecond(), 'alice', dropped, 'silero (torch)');
  const [clip] = listClips(store);

  expect(clip?.verdict.speech).toBe(false);
  expect(clip?.verdict.speechFrames).toBe(1);
  expect(clip?.seconds).toBeCloseTo(1, 5);
});

test('newest first, and the oldest falls off at the limit', () => {
  const store = createClipStore(2);
  for (const speaker of ['first', 'second', 'third']) {
    rememberClip(store, oneSecond(), speaker, sent, 'silero (torch)');
  }
  expect(listClips(store).map(c => c.speaker)).toEqual(['third', 'second']);
});

/**
 * The state payload polls once a second. Shipping held voice on every tick
 * would be both wasteful and a wider exposure than anyone asked for.
 */
test('the listed timeline carries no audio', () => {
  const store = createClipStore(3);
  rememberClip(store, oneSecond(), 'alice', sent, 'silero (torch)');
  const [clip] = listClips(store);

  expect(clip).toBeDefined();
  expect('wav' in (clip as object)).toBe(false);
  expect(JSON.stringify(listClips(store))).not.toContain('RIFF');
});

test('audio is reachable only by its own id, and the WAV is real', () => {
  const store = createClipStore(3);
  const stored = rememberClip(store, oneSecond(), 'alice', sent, 'silero (torch)');

  expect(findClip(store, stored!.id)?.wav.byteLength).toBe(48000 * 2 * 2 + 44);
  expect(Buffer.from(findClip(store, stored!.id)!.wav.slice(0, 4)).toString()).toBe('RIFF');
  expect(findClip(store, 'not-a-real-id')).toBeUndefined();
});

test('clearing drops every held clip', () => {
  const store = createClipStore(3);
  rememberClip(store, oneSecond(), 'alice', sent, 'silero (torch)');
  clearClips(store);
  expect(listClips(store)).toEqual([]);
});

// ── Grouping ──────────────────────────────────────────────────────────────

const clip = (id: string, verdict: VadVerdict): Clip => ({
  id, at: '2026-09-27T09:00:00.000Z', speaker: 'alice',
  seconds: 0.5, bytes: 96000, verdict, gate: 'silero (torch)'
});
const unknown: VadVerdict = { speech: false, frames: 0, speechFrames: 0, peakProbability: 0, unavailable: 'sidecar exited' };

test('a run of rejections folds into one group', () => {
  const groups = groupClips([
    clip('a', dropped), clip('b', dropped), clip('c', dropped)
  ]);
  expect(groups.length).toBe(1);
  expect(groups[0]?.kind).toBe('dropped');
  expect(groups[0]?.clips.map(c => c.id)).toEqual(['a', 'b', 'c']);
});

/** Two sent utterances in a row are two things worth seeing separately. */
test('sent clips are never folded together', () => {
  const groups = groupClips([clip('a', sent), clip('b', sent)]);
  expect(groups.length).toBe(2);
  expect(groups.every(g => g.clips.length === 1)).toBe(true);
});

test('a sent clip breaks a run in two', () => {
  const groups = groupClips([
    clip('a', dropped), clip('b', dropped),
    clip('c', sent),
    clip('d', dropped)
  ]);
  expect(groups.map(g => [g.kind, g.clips.length])).toEqual([
    ['dropped', 2], ['sent', 1], ['dropped', 1]
  ]);
});

/** "The gate could not answer" is not "the gate said no" — it stays visible. */
test('unknown verdicts stand alone and do not join a dropped run', () => {
  const groups = groupClips([clip('a', dropped), clip('b', unknown), clip('c', dropped)]);
  expect(groups.map(g => g.kind)).toEqual(['dropped', 'unknown', 'dropped']);
});

test('order is preserved and no clip is lost', () => {
  const input = [clip('a', dropped), clip('b', sent), clip('c', dropped), clip('d', dropped)];
  const flat = groupClips(input).flatMap(g => g.clips.map(c => c.id));
  expect(flat).toEqual(['a', 'b', 'c', 'd']);
});

test('an empty timeline groups to nothing', () => {
  expect(groupClips([])).toEqual([]);
});
