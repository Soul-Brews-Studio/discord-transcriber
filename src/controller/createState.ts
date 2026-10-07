import type { Adapter, ControllerOptions, ControllerState } from '../types.ts';

/** A controller that has done nothing yet: offline, no channels, no error. */
export function createState(adapter: Adapter, options: ControllerOptions = {}): ControllerState {
  return {
    adapter,
    token: options.token ?? '',
    sttURL: options.sttURL ?? '',
    speechGate: options.speechGate ?? 'energy only',
    autoFollow: options.autoFollow ?? 'off',
    progress: null,
    stt: null,
    phase: 'offline',
    channels: [],
    rows: [],
    channel: null,
    bot: null,
    error: null,
    generation: 0,
    loginGeneration: 0,
    follow: null,
    followLocation: null,
    unwatch: null,
    followWork: Promise.resolve()
  };
}
