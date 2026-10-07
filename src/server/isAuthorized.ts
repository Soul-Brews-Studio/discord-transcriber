/**
 * Whether a control request may proceed.
 *
 * The token alone is not enough: an `Origin` from anywhere outside the set this
 * server answers on is refused, so another page in the browser cannot drive
 * this bot with a token it guessed or scraped.
 */
export function isAuthorized(request: Request, origins: ReadonlySet<string>, controlToken: string): boolean {
  if (request.headers.get('x-control-token') !== controlToken) return false;
  const sent = request.headers.get('origin');
  return sent === null || origins.has(sent);
}
