import type { SttCapabilities } from '../types.ts';
import { loopbackSocket } from './loopbackSocket.ts';

/** A probe must not hold up Connect; a service that is slow to describe itself
 *  is treated as one that does not describe itself. */
const PROBE_TIMEOUT_MS = 1500;

/**
 * Asks an STT service what it can do.
 *
 * A 404 is a valid answer and means batch-only — every service written before
 * the contract existed answers that way, so discovery must never be something
 * transcription depends on. Anything unreachable or malformed is reported as
 * unknown rather than assumed one way or the other.
 */
export async function probeCapabilities(sttURL: string): Promise<SttCapabilities> {
  if (!sttURL) return { url: '', reachable: false, streaming: false, streamURL: null, onDevice: null };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${sttURL}/capabilities`, { signal: abort.signal, redirect: 'error' });
    if (!response.ok) {
      // Reachable, just older than the contract.
      return { url: sttURL, reachable: true, streaming: false, streamURL: null, onDevice: null };
    }
    const data = await response.json() as Record<string, unknown>;
    const streamURL = loopbackSocket(data.streamURL);
    return {
      url: sttURL,
      reachable: true,
      // Streaming is only claimed when there is a usable socket to claim it
      // with; `streaming: true` with a URL pointing elsewhere is not an offer.
      streaming: data.streaming === true && streamURL !== null,
      streamURL,
      onDevice: typeof data.onDevice === 'boolean' ? data.onDevice : null
    };
  } catch {
    return { url: sttURL, reachable: false, streaming: false, streamURL: null, onDevice: null };
  } finally {
    clearTimeout(timer);
  }
}
