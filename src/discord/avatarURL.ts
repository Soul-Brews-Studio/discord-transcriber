import type { ClientLike } from './types.ts';

/** Small enough for a chip, large enough for a retina one. */
const AVATAR_SIZE = 64;

/**
 * The Discord CDN URL for a user's avatar, or null when the SDK cannot build
 * one. Resolved on the server so the browser never contacts Discord directly.
 */
export function avatarURL(client: ClientLike, userId: string): string | null {
  const user = client.users.cache.get(userId);
  return user?.displayAvatarURL?.({ extension: 'png', size: AVATAR_SIZE }) ?? null;
}
