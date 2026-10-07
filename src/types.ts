import type { Clip, ClipGroup } from './clips/types.ts';
/** Shared shapes. Types only — no runtime code lives here. */

/** A voice channel this bot can both see and connect to. */
export interface VoiceChannel {
  id: string;
  guildId: string;
  name: string;
  guildName: string;
}

/** A joined channel, carrying how it was joined. */
export interface JoinedChannel extends VoiceChannel {
  listen: boolean;
  listenUserId: string | null;
  transcribe: boolean;
}

/** Someone sitting in a voice channel right now. */
export interface Occupant {
  id: string;
  name: string;
  bot: boolean;
  /**
   * Served from this origin, not from Discord's CDN. The page ships
   * `default-src 'self'`, and a loopback console should not have the browser
   * announce who is in the room to a third party on every render.
   */
  avatar: string;
  /** This app's own bot, so the UI can say "me" rather than list it as a stranger. */
  self: boolean;
  speaking: boolean;
}

/** A voice channel with who is in it. */
export interface ChannelView extends VoiceChannel {
  occupants: Occupant[];
}

/** One server and the voice channels this bot can reach in it. */
export interface GuildView {
  id: string;
  name: string;
  channels: ChannelView[];
  /**
   * When a person was last seen arriving in voice here, or null if never while
   * this process has been connected. Discord reports where people are but not
   * when they got there, so this is observed rather than looked up.
   */
  lastHumanAt: number | null;
}

export interface BotIdentity {
  id: string;
  name: string;
  isBot: boolean;
}

export type Phase = 'offline' | 'connecting' | 'ready' | 'joining' | 'joined';

export interface TranscriptRow {
  id: string;
  at: string;
  speaker: string;
  status: 'final' | 'error';
  text: string;
}

/**
 * Counters describing what actually arrived. Deliberately separate from the
 * connection's own flags: being Ready and undeafened is not evidence that any
 * speech was received.
 */
export interface AudioCounters {
  enabled: boolean;
  packets: number;
  decodedBytes: number;
  audioSeconds: number;
  rms: number;
  peak: number;
  lastAudioAt: string | null;
  speaker: string | null;
  decodeErrors: number;
}

/** `null` means "could not be read", which is never the same as `false`. */
export interface AudioState extends AudioCounters {
  activeStreams: number;
  /** Display names Discord currently reports as speaking. Empty when quiet. */
  speakingNow: string[];
  connectionStatus: string;
  requestedSelfDeaf: boolean | null;
  selfDeaf: boolean | null;
  serverDeaf: boolean | null;
  selfMute: boolean | null;
}

/** One packet's loudness, in the -1…1 sample range. */
export interface Measurement {
  rms: number;
  peak: number;
}

export type OnFailure = (message: string) => void;
/** Coarse progress for slow work. One short clause, shown verbatim. */
export type OnProgress = (step: string) => void;
export type OnRow = (row: TranscriptRow) => void;

/** What a capture reports; id, timestamp and speaker are filled in around it. */
export interface RowBody {
  status: 'final' | 'error';
  text: string;
}

/** Emits a row already bound to one speaker's capture. */
export type EmitRow = (body: RowBody) => void;
export type OnDisconnect = () => void;
/** Where a member is sitting. Carries the guild, because following crosses guilds. */
export interface VoiceLocation {
  guildId: string;
  channelId: string;
}

export type OnLocation = (location: VoiceLocation | null) => void;
export type Unwatch = () => void;
export type CloseCapture = (save?: boolean) => void;

/**
 * Who is being followed. No guild: the follow spans every guild this bot and
 * the followed account are both in, so the guild is whatever the latest voice
 * event reports rather than something fixed up front.
 */
export interface FollowTarget {
  userId: string;
  listen: boolean;
  revision?: number;
}

export interface JoinOptions {
  guildId: string;
  channelId: string;
  listen?: boolean;
  listenUserId?: string | null;
  transcribe?: boolean;
  consent?: boolean;
}

export interface AdapterJoinOptions {
  listen?: boolean;
  listenUserId?: string | null;
  transcribe?: boolean;
  sttURL?: string;
  onRow: OnRow;
  onDisconnect: OnDisconnect;
}

/** What `startReceiving` needs; the same fields minus the disconnect hook. */
export interface ReceiveOptions {
  listenUserId?: string | null;
  transcribe?: boolean;
  sttURL?: string;
  onRow: OnRow;
}

/**
 * `join` follows deafened and receives nothing. `listen` also decodes the
 * followed account's audio, and `transcribe` additionally sends it to the local
 * STT service — which is why neither can be reached except by naming it.
 */
export type AutoFollowMode = 'off' | 'join' | 'listen' | 'transcribe';

export interface ControllerOptions {
  token?: string;
  sttURL?: string;
  speechGate?: string;
  autoFollow?: AutoFollowMode;
}

export interface StartFollowOptions {
  listen?: boolean;
  /** Implies `listen`: nothing can be transcribed that was not decoded first. */
  transcribe?: boolean;
  consent?: boolean;
}

/**
 * Where to move the followed account. Both fields default to the channel the
 * bot is in, which is what "bring me to the bot" means. Who is moved is never
 * an option — see controller/bring.ts.
 */
export interface BringOptions {
  guildId?: string;
  channelId?: string;
}

export interface HandlerOptions {
  port: number;
  controlToken: string;
  /**
   * Every origin this server answers on. Loopback alone unless BIND widened
   * it; the set is the allow-list for Host, Origin and the CSP alike, so those
   * three cannot drift apart.
   */
  origins: ReadonlySet<string>;
}

export interface SttQueueItem {
  wav: Uint8Array;
  generation: number;
  sttURL: string;
  row: EmitRow;
}

export interface ConnectResult {
  bot: BotIdentity;
  channels: VoiceChannel[];
}

/** What the controller needs of a transport. The Discord SDK is one impl; the tests supply another. */
export interface Adapter {
  connect(token: string, onFailure: OnFailure, onProgress?: OnProgress): Promise<ConnectResult>;
  join(channel: VoiceChannel, options: AdapterJoinOptions): Promise<void>;
  leave(): void;
  disconnect(): void;
  audioState?(): AudioState;
  guilds?(): GuildView[];
  avatar?(userId: string): Promise<Uint8Array | null>;
  leaveGuild?(guildId: string): Promise<void>;
  clips?(): Clip[];
  clipLimit?(): number;
  clipWav?(id: string): Uint8Array | undefined;
  clipTrace?(id: string): ClipTrace | undefined;
  clearClips?(): void;
  watchUser?(userId: string, onLocation: OnLocation): Unwatch;
  /** Moves a member already in voice. Optional: a transport may not support it. */
  moveMember?(guildId: string, userId: string, channelId: string): Promise<void>;
}

/**
 * Links that add this bot to a guild. `minimal` is what the app needs;
 * `administrator` grants everything and is shown so the difference is explicit.
 */
export interface Invites {
  minimal: string;
  administrator: string;
}

/** `guildId` is where the followed account currently is, null when nowhere. */
export interface FollowState {
  userId: string;
  listen: boolean;
  guildId: string | null;
}

export interface PublicState {
  following: FollowState | null;
  audio: AudioState | null;
  phase: Phase;
  channels: VoiceChannel[];
  /**
   * The same channels grouped by server, each carrying who is in it right now.
   * Occupancy comes from the live voice-state cache, so it moves by the second
   * while `channels` stays as it was built at Connect.
   */
  guilds: GuildView[];
  rows: TranscriptRow[];
  channel: JoinedChannel | null;
  bot: BotIdentity | null;
  error: string | null;
  configured: boolean;
  transcriptionConfigured: boolean;
  /** Null until the bot connects — the application ID comes from the live session. */
  invites: Invites | null;
  /**
   * Which gate decides what reaches the transcription service. Named rather
   * than implied: "silero (torch)" and "energy only" reject very different
   * audio, and the operator should not have to infer which is running.
   */
  speechGate: string;
  autoFollow: AutoFollowMode;
  /** What a slow step is doing right now, or null when nothing is pending. */
  progress: string | null;
  /** What the STT service offers, and which of it this app is using. Null until
   *  the service has been asked. */
  stt: SttCapabilities | null;
  sttTransport: SttTransport;
  /**
   * Utterances the gate ruled on, newest first, with runs of rejections folded
   * into one group. Empty unless KEEP_CLIPS is set.
   */
  clipGroups: ClipGroup[];
  /** How many are kept; 0 means the app holds no audio at all. */
  clipLimit: number;
}

/**
 * The controller's mutable state. Every controller function takes this as its
 * first argument, so the logic lives one function per file while the state
 * stays in one place.
 *
 * `generation` invalidates in-flight joins; `loginGeneration` invalidates
 * in-flight logins. A late callback compares its captured number and returns
 * rather than writing into a state that has since moved on.
 */
export interface ControllerState {
  adapter: Adapter;
  token: string;
  sttURL: string;
  speechGate: string;
  autoFollow: AutoFollowMode;
  /** What the current slow step is doing, or null when nothing is pending. */
  progress: string | null;
  /** What the STT service answered when last asked, or null if never. */
  stt: SttCapabilities | null;
  phase: Phase;
  channels: VoiceChannel[];
  rows: TranscriptRow[];
  channel: JoinedChannel | null;
  bot: BotIdentity | null;
  error: string | null;
  generation: number;
  loginGeneration: number;
  follow: FollowTarget | null;
  /** Where the followed account was last seen; null when they are in no voice channel. */
  followLocation: VoiceLocation | null;
  unwatch: Unwatch | null;
  followWork: Promise<void>;
}

/**
 * What the transcription service says it can do, and what is actually in use.
 *
 * Reported rather than assumed: `onDevice` is something only the service knows,
 * and `transport` is what this app is really doing — not what it could do.
 */
export interface SttCapabilities {
  url: string;
  reachable: boolean;
  streaming: boolean;
  streamURL: string | null;
  onDevice: boolean | null;
}

export type SttTransport = 'none' | 'batch' | 'stream';

/** One utterance's VAD curve, with the line it had to clear. */
export interface ClipTrace {
  id: string;
  trace: number[];
  threshold: number;
  minSpeechFrames: number;
  speechFrames: number;
  frames: number;
  speech: boolean;
}

/**
 * What the HTTP layer needs of a controller. Depending on this rather than on
 * the class keeps the server testable with a stand-in.
 */
export interface ControllerApi {
  state(): PublicState;
  avatar?(userId: string): Promise<Uint8Array | null>;
  leaveGuild?(guildId: string): Promise<void>;
  clipWav?(id: string): Uint8Array | undefined;
  clipTrace?(id: string): ClipTrace | undefined;
  setAutoFollow?(mode: AutoFollowMode): Promise<void>;
  connect(): Promise<void>;
  join(options: JoinOptions): Promise<void>;
  startFollow(options?: StartFollowOptions): Promise<void>;
  bring?(options?: BringOptions): Promise<void>;
  stopFollow(): void;
  leave(stopFollowing?: boolean): void;
  disconnect(): void;
  clear(): void;
}
