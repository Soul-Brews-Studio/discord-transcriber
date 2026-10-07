/** Unprivileged ports only; this server must never need root to bind. */
const MIN_PORT = 1024;
const MAX_PORT = 65535;

export function parsePort(value: string | undefined): number {
  const port = Number(value ?? 4666);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) throw new Error('Invalid PORT.');
  return port;
}
