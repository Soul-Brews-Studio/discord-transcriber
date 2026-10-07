import { clearClips } from '../clips/clearClips.ts';
import type { AdapterState } from './types.ts';

/**
 * Leaves the voice channel and tears down everything the join created.
 *
 * The generation bump comes first so that any packet, queued item or in-flight
 * request still belonging to this join is discarded rather than landing in the
 * next one.
 */
export function leave(adapter: AdapterState): void {
  ++adapter.generation;
  adapter.stopReceiving?.();
  adapter.stopReceiving = null;
  adapter.audio.enabled = false;
  adapter.audio.rms = 0;
  adapter.queue = [];
  clearClips(adapter.clipStore);   // held voice does not outlive the channel
  adapter.activeRequest?.abort();
  for (const close of [...adapter.captures.values()]) close();
  adapter.captures.clear();

  const connection = adapter.connection;
  adapter.connection = null;
  if (connection && connection.state.status !== adapter.lib?.VoiceConnectionStatus.Destroyed) connection.destroy();
}
