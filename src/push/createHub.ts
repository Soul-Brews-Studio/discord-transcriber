import type { PublicState } from '../types.ts';
import type { Socket } from './types.ts';

/**
 * Holds the open sockets and pushes state to them.
 *
 * Push replaces polling for freshness, not for correctness: the page still
 * renders whatever the last frame said, so a dropped socket degrades to a
 * stale view rather than a wrong one, and the poll stays as the fallback.
 */
export interface Hub {
  add(socket: Socket): void;
  remove(socket: Socket): void;
  publish(state: PublicState): void;
  readonly size: number;
}

export function createHub(): Hub {
  const sockets = new Set<Socket>();
  let lastSent = '';

  return {
    add(socket) { sockets.add(socket); },
    remove(socket) { sockets.delete(socket); },
    get size() { return sockets.size; },
    publish(state) {
      // Identical frames are dropped. State is published on every change, and
      // most changes touch nothing a viewer can see.
      const frame = JSON.stringify({ type: 'state', state });
      if (frame === lastSent) return;
      lastSent = frame;
      for (const socket of sockets) {
        // readyState 1 is OPEN. A socket that closed between the event loop
        // turns would otherwise throw and take the whole publish with it.
        if ((socket.raw?.readyState ?? 1) === 1) socket.send(frame);
      }
    }
  };
}
