import type { ClientLike } from './types.ts';

/** A display name for the transcript, falling back to the raw ID. */
export function speakerName(client: ClientLike, userId: string): string {
  const user = client.users.cache.get(userId);
  return user?.displayName ?? user?.username ?? userId;
}
