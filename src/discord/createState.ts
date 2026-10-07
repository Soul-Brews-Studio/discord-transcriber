import { emptyCounters } from '../audio/emptyCounters.ts';
import { createClipStore } from '../clips/createClipStore.ts';
import { drain } from './drain.ts';
import type { AdapterState } from './types.ts';

/** An adapter that has not logged in: no client, no connection, no counters. */
export function createState(): AdapterState {
  const state: AdapterState = {
    client: null,
    connection: null,
    lib: null,
    generation: 0,
    loginEpoch: 0,
    captures: new Map(),
    queue: [],
    activeRequest: null,
    stopReceiving: null,
    audio: emptyCounters(),
    drain: () => Promise.resolve(),
    vad: null,
    vadWork: Promise.resolve(),
    clipStore: createClipStore(),
    gate: 'energy only',
    speaking: new Set<string>(),
    humanActivity: new Map<string, number>(),
    stopVoiceActivity: null
  };
  state.drain = () => drain(state);
  return state;
}
