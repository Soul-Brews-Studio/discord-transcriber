import { networkInterfaces } from 'node:os';
import { isLoopbackBind } from './bindHost.ts';

/**
 * Every origin this server will answer on, as literal addresses.
 *
 * Pinned rather than trusting whatever Host arrives. A DNS name that resolves
 * here would otherwise let a page on the open internet drive this server
 * through someone's browser — DNS rebinding — and the control token does not
 * help, because that page can read it out of this server's own HTML.
 *
 * Loopback is always in the set. A wider bind adds this machine's own IPv4
 * addresses and nothing else: `0.0.0.0` is where it listens, never a Host it
 * accepts.
 */
export function localOrigins(bind: string, port: number, allow?: string): ReadonlySet<string> {
  const origins = new Set([`http://127.0.0.1:${port}`]);
  // Behind NAT, this process cannot discover the address a browser reaches it
  // at: in a container it knows 172.17.x and nothing about the host publishing
  // the port. Each entry here is a literal `host` or `host:port` that someone
  // typed — there is no wildcard, because "accept any Host" is the DNS
  // rebinding hole this check exists to close, not a looser version of it.
  for (const entry of (allow ?? '').split(',')) {
    const name = entry.trim();
    if (!name) continue;
    origins.add(name.includes(':') ? `http://${name}` : `http://${name}:${port}`);
  }
  if (isLoopbackBind(bind)) return origins;
  for (const entries of Object.values(networkInterfaces())) {
    for (const net of entries ?? []) {
      if (net.family === 'IPv4' && !net.internal) origins.add(`http://${net.address}:${port}`);
    }
  }
  if (bind !== '0.0.0.0') origins.add(`http://${bind}:${port}`);
  return origins;
}
