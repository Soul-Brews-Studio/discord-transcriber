import { leave } from './leave.ts';
import type { AdapterState } from './types.ts';

/** Leaves any channel, then closes the gateway. */
export function disconnect(adapter: AdapterState): void {
  ++adapter.loginEpoch;
  leave(adapter);
  adapter.stopVoiceActivity?.();
  adapter.stopVoiceActivity = null;
  // What was observed is kept. Reconnecting should not pretend nobody has been
  // anywhere; the seed pass will refresh whichever guilds still hold someone.
  const client = adapter.client;
  adapter.client = null;
  client?.destroy();
}
