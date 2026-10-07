import type { ConnectResult, OnFailure, OnProgress } from '../types.ts';
import { loadChannels } from './loadChannels.ts';
import { watchVoiceActivity } from './watchVoiceActivity.ts';
import type { AdapterState, ClientLike } from './types.ts';

/** A login that never completes must not hang the request forever. */
const LOGIN_TIMEOUT_MS = 20000;

/**
 * Logs the bot in and lists the channels it can reach. Joins nothing.
 *
 * The SDK is imported here rather than at module load, so a missing install
 * surfaces at Connect instead of stopping the server from starting at all.
 * `loginEpoch` invalidates a login that was superseded while it was in flight.
 */
export async function connect(
  adapter: AdapterState, token: string, onFailure: OnFailure, onProgress?: OnProgress
): Promise<ConnectResult> {
  const epoch = ++adapter.loginEpoch;
  const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, Events } = await import('discord.js');
  adapter.lib = (await import('@discordjs/voice')) as unknown as AdapterState['lib'];
  if (epoch !== adapter.loginEpoch) throw new Error('Connect cancelled.');

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] }) as unknown as ClientLike;
  adapter.client = client;
  client.on('error', () => { if (adapter.client === client) onFailure('Discord gateway error; reconnect explicitly.'); });
  client.on(Events.ShardDisconnect, () => { if (adapter.client === client) onFailure('Discord gateway disconnected; reconnect explicitly.'); });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        client.once(Events.ClientReady, resolve as (...args: never[]) => void);
        client.login(token).catch(reject);
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), LOGIN_TIMEOUT_MS); })
    ]);
    if (adapter.client !== client || !client.user?.bot) throw new Error('Bot connection cancelled or invalid.');

    onProgress?.('logged in — reading channels…');
    const channels = await loadChannels(client, ChannelType.GuildVoice,
      [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect], onProgress);
    // Started once the channel list exists, so the seed pass has guilds to read.
    adapter.stopVoiceActivity?.();
    adapter.stopVoiceActivity = watchVoiceActivity(adapter);
    return { bot: { id: client.user.id, name: client.user.tag, isBot: true }, channels };
  } catch (error) {
    client.destroy();
    if (adapter.client === client) adapter.client = null;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
