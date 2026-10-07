import { test, expect } from 'bun:test';
import { bindHost, isLoopbackBind } from '../src/server/bindHost.ts';
import { localOrigins } from '../src/server/localOrigins.ts';
import { securityHeaders } from '../src/server/securityHeaders.ts';
import { createApp } from '../src/server/createApp.ts';
import { controlToken as mintToken, MIN_TOKEN_LENGTH } from '../src/server/controlToken.ts';
import { createHub } from '../src/push/createHub.ts';
import type { ControllerApi, PublicState } from '../src/types.ts';
import { fake } from './support/fake.ts';

const port = 4666;
const lan = '192.168.1.50';
const origins: ReadonlySet<string> = new Set([`http://127.0.0.1:${port}`, `http://${lan}:${port}`]);
const controlToken = 'test-control';

function app() {
  const controller = fake<ControllerApi>({ state: (): PublicState => fake<PublicState>({ phase: 'offline' }) });
  return createApp(controller, createHub(), { port, controlToken, origins });
}

const get = (path: string, host: string, extra: Record<string, string> = {}): Request =>
  new Request(`http://${host}${path}`, { headers: { host, ...extra } });

test('BIND defaults to loopback and refuses a name', () => {
  expect(bindHost(undefined)).toBe('127.0.0.1');
  expect(bindHost('')).toBe('127.0.0.1');
  expect(bindHost('localhost')).toBe('127.0.0.1');
  expect(bindHost('0.0.0.0')).toBe('0.0.0.0');
  // A hostname would reintroduce exactly the DNS indirection the Host pinning
  // exists to prevent.
  expect(() => bindHost('my-mac.local')).toThrow(/Invalid BIND/);
  expect(() => bindHost('evil.example')).toThrow(/Invalid BIND/);
  expect(isLoopbackBind('127.0.0.1')).toBe(true);
  expect(isLoopbackBind('0.0.0.0')).toBe(false);
});

test('a loopback bind answers on loopback and nothing else', () => {
  expect([...localOrigins('127.0.0.1', port)]).toEqual([`http://127.0.0.1:${port}`]);
});

test('0.0.0.0 is where it listens, never a Host it accepts', () => {
  const set = localOrigins('0.0.0.0', port);
  expect(set.has(`http://127.0.0.1:${port}`)).toBe(true);
  expect(set.has(`http://0.0.0.0:${port}`)).toBe(false);
  // Every entry is a literal address on this port — no names, ever.
  for (const origin of set) expect(origin).toMatch(new RegExp(`^http://\\d{1,3}(\\.\\d{1,3}){3}:${port}$`));
});

test('the page is free on loopback and token-gated everywhere else', async () => {
  const server = app();
  expect((await server.handle(get('/', `127.0.0.1:${port}`))).status).toBe(200);

  // Same page, reached over the network: serving it *is* handing over control.
  const refused = await server.handle(get('/', `${lan}:${port}`));
  expect(refused.status).toBe(403);
  expect(await refused.text()).not.toContain(controlToken);

  const allowed = await server.handle(get(`/?t=${controlToken}`, `${lan}:${port}`));
  expect(allowed.status).toBe(200);
  expect(await allowed.text()).toContain(controlToken);

  expect((await server.handle(get(`/?t=wrong`, `${lan}:${port}`))).status).toBe(403);
});

test('a Host outside the set is refused even with the token', async () => {
  const server = app();
  expect((await server.handle(get(`/?t=${controlToken}`, 'evil.example'))).status).toBe(403);
  expect((await server.handle(get('/api/state', 'evil.example',
    { 'x-control-token': controlToken }))).status).toBe(403);
});

test('an Origin in the set drives the API; one outside it does not', async () => {
  const server = app();
  const api = (origin: string): Request => get('/api/state', `${lan}:${port}`,
    { 'x-control-token': controlToken, origin });
  expect((await server.handle(api(`http://${lan}:${port}`))).status).toBe(200);
  expect((await server.handle(api(`http://127.0.0.1:${port}`))).status).toBe(200);
  expect((await server.handle(api('http://evil.example'))).status).toBe(403);
});

test('the CSP names every socket origin the bind actually answers on', () => {
  const csp = securityHeaders(origins)['Content-Security-Policy'] ?? '';
  expect(csp).toContain(`ws://127.0.0.1:${port}`);
  expect(csp).toContain(`ws://${lan}:${port}`);
  expect(csp).not.toContain('ws://evil');
  // Loopback-only keeps the narrow policy it always had.
  expect(securityHeaders(new Set([`http://127.0.0.1:${port}`]))['Content-Security-Policy'])
    .not.toContain(lan);
});

test('named hosts are added as literals, never as a wildcard', () => {
  // A process behind NAT cannot discover the address a browser reaches it at.
  // Each of these is a name someone typed; none of them is a pattern.
  const set = localOrigins('0.0.0.0', port, 'homeassistant.local, 192.168.1.50:8123 ,,');
  expect(set.has('http://homeassistant.local:4666')).toBe(true);
  expect(set.has('http://192.168.1.50:8123')).toBe(true);
  expect(set.has(`http://127.0.0.1:${port}`)).toBe(true);
  // Nothing resembling a wildcard survives as one.
  expect([...set].some(o => o.includes('*'))).toBe(false);
});

test('an empty allow list changes nothing', () => {
  expect([...localOrigins('127.0.0.1', port, '')]).toEqual([`http://127.0.0.1:${port}`]);
  expect([...localOrigins('127.0.0.1', port, '  , ,')]).toEqual([`http://127.0.0.1:${port}`]);
});

test('the control token is fresh per process unless one is configured', () => {
  // The default is the safer one: a link dies with the server, so a URL left in
  // a chat log expires on its own.
  expect(mintToken({})).not.toBe(mintToken({}));
  expect(mintToken({}).length).toBe(36);
  const fixed = 'a'.repeat(MIN_TOKEN_LENGTH);
  expect(mintToken({ CONTROL_TOKEN: fixed })).toBe(fixed);
  expect(mintToken({ CONTROL_TOKEN: `  ${fixed}  ` })).toBe(fixed);
});

test('a short fixed token is refused, not accepted with a warning', () => {
  // A guessable token on an address reachable across a mesh is not a smaller
  // secret; it is an open door with a lock drawn on it.
  for (const weak of ['hunter2', 'a'.repeat(MIN_TOKEN_LENGTH - 1), 'x']) {
    expect(() => mintToken({ CONTROL_TOKEN: weak })).toThrow(/at least 32/);
  }
});
