/**
 * Whether a WebSocket upgrade may proceed.
 *
 * The browser cannot set headers on a WebSocket handshake, so the control token
 * arrives as a query parameter — the one place this app allows that. The origin
 * is checked against the addresses this server answers on, and the token is
 * already in the page that opened the socket, so the exposure is a URL in a
 * process that already had it rather than a new secret path.
 */
export function isUpgradeAuthorized(url: URL, origins: ReadonlySet<string>, controlToken: string,
                                    originHeader: string | null): boolean {
  if (url.searchParams.get('token') !== controlToken) return false;
  return originHeader === null || origins.has(originHeader);
}
