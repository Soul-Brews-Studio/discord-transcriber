/**
 * The channel type and permission pair that define a reachable voice channel.
 *
 * Lifted out of connect() because the guild view has to filter by exactly the
 * same rule — a channel that shows an occupant list but cannot be joined would
 * be worse than not listing it.
 *
 * Values mirror discord.js: ChannelType.GuildVoice, ViewChannel, Connect.
 */
export const VOICE_CHANNEL_TYPE = 2;
export const VOICE_PERMISSIONS: readonly bigint[] = [1n << 10n, 1n << 20n];
