import { emptyCounters } from '../audio/emptyCounters.ts';
import type { AdapterJoinOptions, VoiceChannel } from '../types.ts';
import { startReceiving } from './startReceiving.ts';
import type { AdapterState, ClientLike, OpusScriptConstructor } from './types.ts';

/** How long to wait for the voice connection to reach Ready. */
const READY_TIMEOUT_MS = 15000;

/**
 * Joins a voice channel. `selfMute` is always true — this bot never sends audio,
 * in any mode — and `selfDeaf` is the inverse of listening.
 *
 * Permissions are re-checked against the live channel rather than trusted from
 * the cached list, which may be minutes old.
 */
export async function join(adapter: AdapterState, channel: VoiceChannel, options: AdapterJoinOptions): Promise<void> {
  const transcribe = options.transcribe ?? false;
  const listen = (options.listen ?? false) || transcribe;
  const generation = ++adapter.generation;
  const client: ClientLike | null = adapter.client;
  if (!client?.isReady()) throw new Error('Bot not ready.');

  const guild = await client.guilds.fetch(channel.guildId);
  const target = await guild.channels.fetch(channel.id);
  const { ChannelType, PermissionFlagsBits } = await import('discord.js');
  const me = await guild.members.fetchMe();
  if (generation !== adapter.generation || client !== adapter.client) throw new Error('Join cancelled.');
  if (target?.type !== ChannelType.GuildVoice
      || !target.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
    throw new Error('Channel unavailable.');
  }

  const lib = adapter.lib;
  if (!lib) throw new Error('Voice library unavailable.');
  const connection = lib.joinVoiceChannel({
    channelId: target.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: !listen, selfMute: true
  });
  adapter.connection = connection;
  connection.on('error', () => { if (adapter.connection === connection) options.onDisconnect(); });
  connection.on(lib.VoiceConnectionStatus.Disconnected, () => { if (adapter.connection === connection) options.onDisconnect(); });
  connection.on(lib.VoiceConnectionStatus.Destroyed, () => { if (adapter.connection === connection) options.onDisconnect(); });

  await lib.entersState(connection, lib.VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
  if (generation !== adapter.generation || adapter.connection !== connection) throw new Error('Join cancelled.');

  adapter.audio = emptyCounters(listen);
  if (!listen) return;

  const { default: OpusScript } = await import('opusscript') as unknown as { default: OpusScriptConstructor };
  if (generation !== adapter.generation) throw new Error('Join cancelled.');
  startReceiving(adapter, connection, {
    listenUserId: options.listenUserId ?? null, transcribe, sttURL: options.sttURL ?? '', onRow: options.onRow
  }, OpusScript);
}
