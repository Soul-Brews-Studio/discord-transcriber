import type { AudioState } from '../types.ts';
import { speakingNow } from './speakingNow.ts';
import type { AdapterState } from './types.ts';

/**
 * The counters plus Discord's own view of the voice state.
 *
 * The flags are `null` when they could not be read — never `false`. "Not
 * observed" and "observed as off" are different facts, and collapsing them
 * would assert something nobody measured.
 */
export function audioState(adapter: AdapterState): AudioState {
  const guildId = adapter.connection?.joinConfig.guildId;
  const selfId = adapter.client?.user?.id;
  const voice = guildId && selfId
    ? adapter.client?.guilds.cache.get(guildId)?.voiceStates.cache.get(selfId)
    : undefined;

  return {
    ...adapter.audio,
    activeStreams: adapter.captures.size,
    speakingNow: speakingNow(adapter),
    connectionStatus: adapter.connection?.state.status ?? 'disconnected',
    requestedSelfDeaf: adapter.connection?.joinConfig.selfDeaf ?? null,
    selfDeaf: voice?.selfDeaf ?? null,
    serverDeaf: voice?.serverDeaf ?? null,
    selfMute: voice?.selfMute ?? null
  };
}
