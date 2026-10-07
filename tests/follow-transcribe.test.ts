import { test, expect } from 'bun:test';
import { Controller } from '../src/controller.ts';
import { autoFollowMode } from '../src/controller/autoFollowMode.ts';
import { autoFollow } from '../src/controller/autoFollow.ts';
import type {
  AdapterJoinOptions, ConnectResult, OnLocation, VoiceChannel
} from '../src/types.ts';
import type { FollowAdapter } from './support/types.ts';

const guildId = '200000000000000002';
const channelId = '2000000000000000268';

function setup(sttURL = 'http://127.0.0.1:4655') {
  const joins: AdapterJoinOptions[] = [];
  const adapter: FollowAdapter = {
    watchUser(_user: string, changed: OnLocation): () => void {
      changed({ guildId, channelId });
      return () => {};
    },
    async join(_channel: VoiceChannel, options: AdapterJoinOptions): Promise<void> { joins.push(options); },
    async connect(): Promise<ConnectResult> {
      return { bot: { id: '7', name: 'Test Bot', isBot: true },
               channels: [{ id: channelId, guildId, name: 'general', guildName: 'the home server' }] };
    },
    leave(): void {},
    disconnect(): void {}
  };
  const controller = new Controller(adapter, { sttURL });
  controller.phase = 'ready';
  controller.channels = [{ id: channelId, guildId, name: 'general', guildName: 'the home server' }];
  return { controller, joins };
}

test('transcribe is a mode you have to spell out', () => {
  expect(autoFollowMode('transcribe')).toBe('transcribe');
  expect(autoFollowMode('listen')).toBe('listen');
  // No truthy spelling reaches listening or transcribing: both are consent
  // decisions, and neither may be arrived at by setting a variable to "true".
  for (const value of ['1', 'true', 'join']) expect(autoFollowMode(value)).toBe('join');
  for (const value of [undefined, '', 'yes', 'TRANSCRIBE', 'transcribe '])
    expect(autoFollowMode(value)).toBe('off');
});

test('following transcribes when asked, and decodes to do it', async () => {
  const { controller, joins } = setup();
  await controller.startFollow({ transcribe: true, consent: true });
  await controller.followWork;
  expect(joins).toHaveLength(1);
  expect(joins[0]?.transcribe).toBe(true);
  // Nothing can be transcribed that was not decoded, so listen is widened
  // rather than left to the caller to remember.
  expect(joins[0]?.listen).toBe(true);
  expect(controller.state().channel?.transcribe).toBe(true);
});

test('following still transcribes nothing unless asked', async () => {
  const { controller, joins } = setup();
  await controller.startFollow({ listen: true, consent: true });
  await controller.followWork;
  expect(joins[0]?.transcribe).toBe(false);
  expect(joins[0]?.listen).toBe(true);
});

test('transcribing without consent never reaches the network', async () => {
  const { controller, joins } = setup();
  await expect(controller.startFollow({ transcribe: true })).rejects.toThrow(/consent/);
  expect(joins).toEqual([]);
  expect(controller.follow).toBeNull();
});

test('transcribing without an endpoint is refused rather than silently dropped', async () => {
  const { controller, joins } = setup('');
  await expect(controller.startFollow({ transcribe: true, consent: true })).rejects.toThrow(/STT endpoint/);
  expect(joins).toEqual([]);
});

test('AUTO_FOLLOW=transcribe carries its own consent', async () => {
  const { controller, joins } = setup();
  controller.autoFollow = 'transcribe';
  await autoFollow(controller);
  await controller.followWork;
  expect(joins[0]?.transcribe).toBe(true);
  expect(controller.state().autoFollow).toBe('transcribe');
});

test('AUTO_FOLLOW=listen still produces no text', async () => {
  const { controller, joins } = setup();
  controller.autoFollow = 'listen';
  await autoFollow(controller);
  await controller.followWork;
  expect(joins[0]?.listen).toBe(true);
  expect(joins[0]?.transcribe).toBe(false);
});
