import type {
  Adapter, AutoFollowMode, BotIdentity, BringOptions, ClipTrace, SttCapabilities, ControllerOptions, ControllerState, FollowTarget,
  JoinedChannel, JoinOptions, Phase, PublicState, StartFollowOptions, TranscriptRow, Unwatch, VoiceChannel,
  VoiceLocation
} from './types.ts';
import { bring } from './controller/bring.ts';
import { clear } from './controller/clear.ts';
import { connect } from './controller/connect.ts';
import { createState } from './controller/createState.ts';
import { disconnect } from './controller/disconnect.ts';
import { join } from './controller/join.ts';
import { leave } from './controller/leave.ts';
import { startFollow } from './controller/startFollow.ts';
import { setAutoFollow } from './controller/setAutoFollow.ts';
import { state } from './controller/state.ts';
import { stopFollow } from './controller/stopFollow.ts';

/**
 * The controller's state, with one method per operation. Each method is a single
 * call into its own file — the logic lives there, the state lives here, and
 * `this` is passed straight through because the class *is* `ControllerState`.
 */
export class Controller implements ControllerState {
  adapter: Adapter;
  token: string;
  sttURL: string;
  speechGate: string;
  autoFollow: AutoFollowMode;
  progress: string | null;
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
  followLocation: VoiceLocation | null;
  unwatch: Unwatch | null;
  followWork: Promise<void>;

  constructor(adapter: Adapter, options: ControllerOptions = {}) {
    const initial = createState(adapter, options);
    this.adapter = initial.adapter;
    this.token = initial.token;
    this.sttURL = initial.sttURL;
    this.speechGate = initial.speechGate;
    this.autoFollow = initial.autoFollow;
    this.progress = initial.progress;
    this.stt = initial.stt;
    this.phase = initial.phase;
    this.channels = initial.channels;
    this.rows = initial.rows;
    this.channel = initial.channel;
    this.bot = initial.bot;
    this.error = initial.error;
    this.generation = initial.generation;
    this.loginGeneration = initial.loginGeneration;
    this.follow = initial.follow;
    this.followLocation = initial.followLocation;
    this.unwatch = initial.unwatch;
    this.followWork = initial.followWork;
  }

  state(): PublicState { return state(this); }
  clipWav(id: string): Uint8Array | undefined { return this.adapter.clipWav?.(id); }
  clipTrace(id: string): ClipTrace | undefined { return this.adapter.clipTrace?.(id); }
  avatar(userId: string): Promise<Uint8Array | null> { return this.adapter.avatar?.(userId) ?? Promise.resolve(null); }
  async leaveGuild(guildId: string): Promise<void> {
    // Leaving the server the bot is currently speaking in would strand the
    // voice connection, so it comes out of the channel first.
    if (this.channel?.guildId === guildId) leave(this);
    await this.adapter.leaveGuild?.(guildId);
    this.channels = this.channels.filter(c => c.guildId !== guildId);
  }
  setAutoFollow(mode: AutoFollowMode): Promise<void> { return setAutoFollow(this, mode); }
  connect(): Promise<void> { return connect(this); }
  join(options: JoinOptions): Promise<void> { return join(this, options); }
  startFollow(options?: StartFollowOptions): Promise<void> { return startFollow(this, options); }
  bring(options?: BringOptions): Promise<void> { return bring(this, options); }
  stopFollow(): void { stopFollow(this); }
  leave(stopFollowing = true): void { leave(this, stopFollowing); }
  disconnect(): void { disconnect(this); }
  clear(): void { clear(this); }
}
