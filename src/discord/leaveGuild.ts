import type { AdapterState } from './types.ts';

/**
 * Removes the bot from a server entirely.
 *
 * Not the same as leaving a voice channel, and not reversible from here: once
 * out, the bot needs a fresh invite to come back. The caller is expected to
 * have confirmed with a human first.
 */
export async function leaveGuild(adapter: AdapterState, guildId: string): Promise<void> {
  const guild = adapter.client?.guilds.cache.get(guildId);
  if (!guild) throw new Error('Not in that server.');
  const leave = (guild as unknown as { leave?: () => Promise<unknown> }).leave;
  if (typeof leave !== 'function') throw new Error('This server cannot be left from here.');
  await leave.call(guild);
}
