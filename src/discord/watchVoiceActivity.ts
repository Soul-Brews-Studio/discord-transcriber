import type { Unwatch } from '../types.ts';
import type { AdapterState, VoiceStateUpdate } from './types.ts';

/**
 * Records when a person was last seen arriving in voice, per server.
 *
 * Discord reports where everyone is but never when they got there, so this is
 * the only way to know which server someone walked into most recently. Nothing
 * is stored but a timestamp per guild: no names, no channel, no history.
 *
 * Bots are ignored. A room holding three bots and nobody else has had no human
 * activity in it, and sorting a server to the top because its own assistant
 * reconnected would put noise where the signal should be.
 */
export function watchVoiceActivity(adapter: AdapterState): Unwatch {
  const client = adapter.client;
  if (!client?.isReady()) throw new Error('Bot not connected.');

  const seen = (guildId: string): void => { adapter.humanActivity.set(guildId, Date.now()); };

  // Anyone already sitting in voice counts as seen now. It is not when they
  // arrived — nobody can know that — but "first observed at connect" is true,
  // and it beats ranking an occupied server below an empty one.
  for (const guild of client.guilds.cache.values()) {
    for (const [userId, voice] of voiceEntries(guild)) {
      if (!voice.channelId) continue;
      if (client.users.cache.get(userId)?.bot) continue;
      seen(guild.id);
      break;
    }
  }

  const listener = (oldState: VoiceStateUpdate, newState: VoiceStateUpdate): void => {
    // Arrivals only. Someone leaving does not make a server recent, and a mute
    // or a deafen is not an arrival at all — both fire this event with the
    // channel unchanged.
    if (!newState.channelId || oldState.channelId === newState.channelId) return;
    if (client.users.cache.get(newState.id)?.bot) return;
    seen(newState.guild.id);
  };

  client.on('voiceStateUpdate', listener as (...args: never[]) => void);
  return () => client.off('voiceStateUpdate', listener);
}

function voiceEntries(guild: { voiceStates: { cache: unknown } }): Iterable<[string, { channelId: string | null }]> {
  const cache = guild.voiceStates.cache as { entries?(): IterableIterator<[string, { channelId: string | null }]> };
  return cache.entries?.() ?? [];
}
