import { avatarURL } from './avatarURL.ts';
import type { AdapterState } from './types.ts';

/** In-process first, then disk. Avatars change rarely. */
const cache = new Map<string, Uint8Array>();

/** Outside the repo: these are other people's faces, not source. */
const CACHE_DIR = `${process.env.HOME ?? '/tmp'}/.cache/discord-transcriber/avatars`;

const diskPath = (userId: string): string | null =>
  /^\d{17,20}$/.test(userId) ? `${CACHE_DIR}/${userId}.png` : null;

/**
 * Fetches an avatar once and remembers it.
 *
 * The server makes this request, not the browser: with `img-src 'self'` the
 * page cannot reach Discord's CDN, and proxying means a local console does not
 * tell a third party who is in the room every time it re-renders.
 */
export async function fetchAvatar(adapter: AdapterState, userId: string): Promise<Uint8Array | null> {
  const cached = cache.get(userId);
  if (cached) return cached;

  // A snowflake, or nothing — the id lands in a filesystem path.
  const path = diskPath(userId);
  if (!path) return null;
  const onDisk = Bun.file(path);
  if (await onDisk.exists()) {
    const bytes = new Uint8Array(await onDisk.arrayBuffer());
    cache.set(userId, bytes);
    return bytes;
  }

  const client = adapter.client;
  if (!client) return null;
  const url = avatarURL(client, userId);
  if (!url) return null;

  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    cache.set(userId, bytes);
    await Bun.write(path, bytes);
    return bytes;
  } catch {
    return null;
  }
}
