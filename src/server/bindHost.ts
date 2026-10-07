/**
 * Which address the control server listens on. Loopback unless BIND says
 * otherwise, and widening it is a deliberate act rather than a default.
 *
 * This server can connect a Discord bot, decode what people say in a voice
 * channel and move a member between channels. Every address it answers on is a
 * place those things can be done from, so the bind is named explicitly and the
 * page that carries the control token stops being handed out freely the moment
 * it stops being loopback-only.
 */
const LOOPBACK = '127.0.0.1';
const SHAPE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|::1?)$/;

export function bindHost(value: string | undefined): string {
  const host = (value ?? '').trim();
  if (!host) return LOOPBACK;
  if (host === 'localhost') return LOOPBACK;
  if (!SHAPE.test(host)) throw new Error('Invalid BIND — use an IP address, not a name.');
  return host;
}

export function isLoopbackBind(host: string): boolean {
  return host === LOOPBACK || host === '::1';
}
