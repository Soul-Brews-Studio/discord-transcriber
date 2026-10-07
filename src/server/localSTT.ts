/** Loopback only. A remote origin could silently export captured audio. */
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];

/**
 * Validates the STT endpoint. Anything but a bare HTTP origin on an allowed
 * host is rejected — credentials, a query, a fragment or a path would all be
 * ways to point captured audio somewhere else.
 *
 * `allowHost` exists for one deployment: inside a container, the recogniser is
 * a sibling service on the same private network and loopback is the container
 * itself. It names exactly one host and is never a wildcard or a pattern —
 * widening this to "any host" would delete the guarantee rather than move it.
 * Unset, which is the default everywhere else, the rule is loopback or nothing.
 */
export function localSTT(value: string | undefined, allowHost?: string): string {
  if (!value) return '';
  const url = new URL(value);
  const allowed = [...LOOPBACK, ...(allowHost ? [allowHost] : [])];
  if (url.protocol !== 'http:' || !allowed.includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(allowHost
      ? `MLX_STT_URL must be an HTTP origin on 127.0.0.1 or ${allowHost}.`
      : 'MLX_STT_URL must be a loopback HTTP origin, such as http://127.0.0.1:4655.');
  }
  return url.origin;
}
