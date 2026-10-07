import type { PublicState } from '../types.ts';

/** The only frame this server pushes. One shape, no protocol to negotiate. */
export interface StateFrame {
  type: 'state';
  state: PublicState;
}

/**
 * A connected browser, narrowed to what the hub touches. No per-socket payload:
 * authorization happens before the upgrade, so an open socket is by definition
 * an allowed one and carrying a flag on it would only invite re-checking.
 */
export interface Socket {
  send(data: string): unknown;
  readonly raw?: { readyState: number };
}
