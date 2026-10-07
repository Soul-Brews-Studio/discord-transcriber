import type { AudioCounters, CloseCapture, SttQueueItem, Unwatch } from '../types.ts';
import type { VadProcess } from '../vad/types.ts';
import type { ClipStore } from '../clips/types.ts';

/**
 * Structural types for exactly the Discord surface this app touches.
 *
 * Written out rather than imported from the SDK for two reasons: the SDK is
 * loaded with a dynamic `import()` so a missing install fails at Connect rather
 * than at startup, and the test fakes have to satisfy these shapes — which they
 * can only do if the shape is the small part actually used.
 */

export interface PermissionSet {
  has(permissions: readonly bigint[]): boolean;
}

export interface GuildChannelLike {
  id: string;
  name: string;
  type: number;
  permissionsFor(member: GuildMemberLike): PermissionSet | null;
}

export interface GuildMemberLike {
  id: string;
  /**
   * Present on a member fetched by id. The cached `me` used for permission
   * checks never needs it, so it stays optional rather than forcing every
   * double that only answers permission questions to grow a voice state.
   */
  voice?: VoiceControlLike;
}

/** A member's own voice state, and the one write this app makes to it. */
export interface VoiceControlLike {
  channelId: string | null;
  /** `null` disconnects. Discord moves a connected member and refuses others. */
  setChannel(channelId: string | null): Promise<unknown>;
}

export interface VoiceStateLike {
  channelId: string | null;
  selfDeaf?: boolean;
  serverDeaf?: boolean;
  selfMute?: boolean;
}

export interface CacheLike<T> {
  get(key: string): T | undefined;
  values(): IterableIterator<T>;
}

/** `fetch()` with no id refreshes the cache; with an id it resolves one channel. */
export interface GuildChannelManagerLike {
  fetch(): Promise<unknown>;
  fetch(id: string): Promise<GuildChannelLike | null>;
  cache: CacheLike<GuildChannelLike | undefined>;
}

export interface GuildLike {
  id: string;
  name: string;
  voiceAdapterCreator: unknown;
  channels: GuildChannelManagerLike;
  /** `me` is the cached member fetchMe() populated; permissionsFor needs the
   *  member, not a bare user id. */
  members: {
    fetchMe(): Promise<GuildMemberLike>;
    /** Optional: only the move path needs a member other than `me`. */
    fetch?(id: string): Promise<GuildMemberLike>;
    me?: GuildMemberLike | null;
  };
  voiceStates: { cache: CacheLike<VoiceStateLike> };
}

export interface UserLike {
  bot?: boolean;
  displayName?: string;
  username?: string;
  /** discord.js builds the CDN URL, including the default avatar fallback. */
  displayAvatarURL?(options: { extension: string; size: number }): string;
}

export interface ClientUserLike {
  id: string;
  tag: string;
  bot: boolean;
}

export interface VoiceStateUpdate {
  id: string;
  guild: { id: string };
  channelId: string | null;
}

export type VoiceStateListener = (oldState: VoiceStateUpdate, newState: VoiceStateUpdate) => void;

export interface ClientLike {
  user: ClientUserLike | null;
  guilds: { cache: CacheLike<GuildLike>; fetch(id: string): Promise<GuildLike> };
  users: { cache: CacheLike<UserLike> };
  isReady(): boolean;
  login(token: string): Promise<string>;
  destroy(): void;
  on(event: string, listener: (...args: never[]) => void): void;
  once(event: string, listener: (...args: never[]) => void): void;
  off(event: string, listener: VoiceStateListener): void;
}

export interface AudioStreamLike {
  on(event: 'data', listener: (packet: Buffer) => void): void;
  once(event: 'end' | 'error' | 'close', listener: () => void): void;
  destroy(): void;
}

export interface SpeakingMapLike {
  on(event: 'start' | 'end', listener: (userId: string) => void): void;
  off(event: 'start' | 'end', listener: (userId: string) => void): void;
  users?: Map<string, unknown>;
}

export interface ReceiverLike {
  subscribe(userId: string, options: SubscribeOptions): AudioStreamLike;
  speaking: SpeakingMapLike;
}

export interface SubscribeOptions {
  end: { behavior: unknown; duration: number };
}

export interface ConnectionStateLike {
  status: string;
}

export interface JoinConfigLike {
  guildId: string;
  selfDeaf: boolean;
}

export interface VoiceConnectionLike {
  state: ConnectionStateLike;
  joinConfig: JoinConfigLike;
  receiver: ReceiverLike;
  on(event: string, listener: () => void): void;
  destroy(): void;
}

/** The two calls this app makes into `@discordjs/voice`, plus its two enums. */
export interface VoiceLib {
  joinVoiceChannel(options: JoinVoiceOptions): VoiceConnectionLike;
  entersState(connection: VoiceConnectionLike, status: string, timeout: number): Promise<unknown>;
  VoiceConnectionStatus: VoiceConnectionStatuses;
  EndBehaviorType: EndBehaviorTypes;
}

/** Only the states this app reacts to. */
export interface VoiceConnectionStatuses {
  Ready: string;
  Disconnected: string;
  Destroyed: string;
}

export interface EndBehaviorTypes {
  AfterSilence: unknown;
}

export interface JoinVoiceOptions {
  channelId: string;
  guildId: string;
  adapterCreator: unknown;
  selfDeaf: boolean;
  selfMute: boolean;
}

export interface OpusDecoder {
  decode(packet: Buffer): Uint8Array;
  delete(): void;
}

export interface OpusScriptConstructor {
  new (rate: number, channels: number, application: unknown): OpusDecoder;
  Application: { AUDIO: unknown };
}

/** The adapter's mutable state, passed to every adapter function. */
export interface AdapterState {
  client: ClientLike | null;
  connection: VoiceConnectionLike | null;
  lib: VoiceLib | null;
  generation: number;
  loginEpoch: number;
  captures: Map<string, CloseCapture>;
  queue: SttQueueItem[];
  activeRequest: AbortController | null;
  stopReceiving: Unwatch | null;
  audio: AudioCounters;
  /**
   * Draining the STT queue reached through the state, not imported directly by
   * its callers. The queue is the seam a test replaces to hold work in place
   * and inspect it, and a direct module import would route around that.
   */
  drain(): Promise<void>;
  /** Silero, when the sidecar started. Null falls back to the energy gate. */
  vad: VadProcess | null;
  /**
   * Verdicts run one at a time and in order. A per-utterance race would let a
   * later, shorter utterance reach the queue before an earlier one.
   */
  vadWork: Promise<void>;
  /** Held utterances. Empty and inert unless KEEP_CLIPS names a limit. */
  clipStore: ClipStore;
  /** Which gate ruled, recorded alongside each clip. */
  gate: string;
  /** User IDs Discord currently reports as speaking. */
  speaking: Set<string>;
  /** Guild id to the last time a person was seen arriving in voice there. */
  humanActivity: Map<string, number>;
  /** Detaches the voice-activity listener; null when not connected. */
  stopVoiceActivity: Unwatch | null;
}
