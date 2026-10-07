import { test, expect } from 'bun:test';
import { probeCapabilities } from '../src/stt/probeCapabilities.ts';
import { loopbackSocket } from '../src/stt/loopbackSocket.ts';
import { fake } from './support/fake.ts';

const url = 'http://127.0.0.1:4655';

function answering(body: unknown, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = fake<typeof fetch>(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  return () => { globalThis.fetch = original; };
}

test('a service that advertises a loopback socket is offering streaming', async () => {
  const restore = answering({ streaming: true, streamURL: 'ws://127.0.0.1:4656/stream', onDevice: true });
  try {
    const stt = await probeCapabilities(url);
    expect(stt).toEqual({ url, reachable: true, streaming: true,
                          streamURL: 'ws://127.0.0.1:4656/stream', onDevice: true });
  } finally { restore(); }
});

test('streaming claimed with a socket somewhere else is not an offer', async () => {
  // The service names its own socket, which is right — but a URL that arrives
  // in a reply is not a URL to trust. Answering with a remote host would
  // otherwise redirect captured audio by reply.
  for (const streamURL of ['ws://evil.example/stream', 'wss://127.0.0.1:4656/stream',
                           'ws://127.0.0.1:4656/stream?token=x', 'ws://user:pw@127.0.0.1:4656/']) {
    const restore = answering({ streaming: true, streamURL, onDevice: true });
    try {
      const stt = await probeCapabilities(url);
      expect(stt.streaming).toBe(false);
      expect(stt.streamURL).toBeNull();
    } finally { restore(); }
  }
});

test('404 means batch-only, not broken', async () => {
  const restore = answering({}, 404);
  try {
    const stt = await probeCapabilities(url);
    expect(stt.reachable).toBe(true);
    expect(stt.streaming).toBe(false);
  } finally { restore(); }
});

test('a service that is not answering is unreachable, not batch-only', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = fake<typeof fetch>(async () => { throw new Error('ECONNREFUSED'); });
  try {
    const stt = await probeCapabilities(url);
    expect(stt.reachable).toBe(false);
    expect(stt.streaming).toBe(false);
  } finally { globalThis.fetch = original; }
});

test('no endpoint configured probes nothing', async () => {
  const stt = await probeCapabilities('');
  expect(stt).toEqual({ url: '', reachable: false, streaming: false, streamURL: null, onDevice: null });
});

test('onDevice is reported, never inferred', async () => {
  const restore = answering({ streaming: false });
  try { expect((await probeCapabilities(url)).onDevice).toBeNull(); } finally { restore(); }
  const restore2 = answering({ streaming: false, onDevice: false });
  try { expect((await probeCapabilities(url)).onDevice).toBe(false); } finally { restore2(); }
});

test('only a bare loopback ws URL passes', () => {
  expect(loopbackSocket('ws://127.0.0.1:4656/stream')).toBe('ws://127.0.0.1:4656/stream');
  expect(loopbackSocket('ws://localhost:4656/stream')).toBe('ws://localhost:4656/stream');
  for (const bad of ['', null, 42, 'http://127.0.0.1:4656/', 'ws://10.0.0.5:4656/',
                     'ws://127.0.0.1:4656/#x', 'not a url']) {
    expect(loopbackSocket(bad)).toBeNull();
  }
});
