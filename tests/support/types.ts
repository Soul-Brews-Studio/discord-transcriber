import type { Adapter, AdapterJoinOptions, OnFailure, OnLocation, VoiceChannel } from '../../src/types.ts';

/**
 * Types for the test doubles.
 *
 * The doubles implement only the part of each interface the code under test
 * touches, which is the point of a double — so where a fake is deliberately
 * partial it is widened through `unknown` at exactly one place, with the
 * incompleteness stated rather than hidden behind `any`.
 */

/** What a fake adapter recorded: a bare call name, or a join with its channel. */
export type CallRecord = string | readonly [string, VoiceChannel];

export interface RecordingAdapter extends Adapter {
  onFailure?: OnFailure;
  options?: AdapterJoinOptions;
}

export interface FollowAdapter extends Adapter {
  watchUser(userId: string, onLocation: OnLocation): () => void;
}

/** A partial Discord SDK object, deliberately narrower than the real one. */
export type Fake<T> = T;
