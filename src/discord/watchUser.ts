import type { OnLocation, Unwatch, VoiceLocation } from '../types.ts';
import { findUserLocation } from './findUserLocation.ts';
import type { AdapterState, VoiceStateUpdate } from './types.ts';

/**
 * Reports where one member is, now and on every move, across every guild this
 * bot shares with them.
 *
 * Not scoped to a guild: the followed account moves between servers, and a
 * guild filter here would silently drop those events — the bot would sit in the
 * room they left with nothing to say why.
 */
export function watchUser(adapter: AdapterState, userId: string, onLocation: OnLocation): Unwatch {
  const client = adapter.client;
  if (!client?.isReady()) throw new Error('Bot not connected.');

  const listener = (oldState: VoiceStateUpdate, newState: VoiceStateUpdate): void => {
    if (newState.id !== userId) return;
    if (oldState.channelId === newState.channelId) return;
    const location: VoiceLocation | null = newState.channelId
      ? { guildId: newState.guild.id, channelId: newState.channelId }
      : null;
    onLocation(location);
  };

  client.on('voiceStateUpdate', listener as (...args: never[]) => void);
  onLocation(findUserLocation(client, userId));
  return () => client.off('voiceStateUpdate', listener);
}
