import type { Clip, ClipStore } from './types.ts';

/**
 * The timeline without the audio, and without the VAD trace.
 *
 * The WAV is deliberately not in the state payload: it polls once a second, and
 * shipping held voice on every tick would be both wasteful and a wider exposure
 * than anyone asked for. Audio is fetched one clip at a time, on a click.
 *
 * The trace goes the same way for the cheaper reason: 120 numbers times twenty
 * clips, in every one of the ten frames a second, to draw a curve nobody has
 * opened. `hasTrace` stays so the page knows whether the curve exists without
 * carrying it.
 */
export function listClips(store: ClipStore): Clip[] {
  return store.clips.map(({ wav: _wav, verdict, ...clip }) => {
    const { trace, ...rest } = verdict;
    return { ...clip, verdict: rest, hasTrace: Boolean(trace?.length) };
  });
}
