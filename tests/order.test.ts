import { test, expect } from 'bun:test';
import { byName } from '../src/discord/byName.ts';

const names = (items: { name: string; id: string }[]): string[] => [...items].sort(byName).map(i => i.name);

test('a stable order that does not depend on cache insertion', () => {
  const channels = [
    { name: 'voice', id: '3' }, { name: 'General', id: '1' },
    { name: 'afk', id: '4' }, { name: '😻-team-avengers', id: '2' }
  ];
  const once = names(channels);
  // Same input in a different arrival order must produce the same output, or
  // the grid moves when Discord happens to refetch a channel.
  const shuffled = [channels[2]!, channels[0]!, channels[3]!, channels[1]!];
  expect(names(shuffled)).toEqual(once);
});

test('two channels sharing a name cannot swap between frames', () => {
  const a = { name: 'General', id: '111' };
  const b = { name: 'General', id: '222' };
  expect(names([a, b])).toEqual(names([b, a]));
  expect([a, b].sort(byName)[0]?.id).toBe('111');
  expect([b, a].sort(byName)[0]?.id).toBe('111');
});

test('case does not split the list', () => {
  expect(names([{ name: 'zebra', id: '1' }, { name: 'Apple', id: '2' }]))
    .toEqual(['Apple', 'zebra']);
});

test('numbers in names read as numbers', () => {
  expect(names([{ name: 'room-10', id: '1' }, { name: 'room-2', id: '2' }]))
    .toEqual(['room-2', 'room-10']);
});
