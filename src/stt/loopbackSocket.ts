/**
 * Accepts a streaming URL only if it points back at this machine.
 *
 * The service names its own socket, which is the right shape — where streaming
 * lives is its business — but a URL that arrives in a reply is not a URL to
 * trust. `localSTT` refuses a non-loopback endpoint on the way in; without the
 * same check here, a service could redirect captured audio simply by answering
 * with somewhere else.
 */
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];

export function loopbackSocket(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'ws:') return null;
  if (!LOOPBACK.includes(url.hostname)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return url.toString();
}
