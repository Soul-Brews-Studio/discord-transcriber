import type {
  AdapterJoinOptions, AudioCounters, AudioState, CloseCapture, ConnectResult, OnFailure, OnLocation, OnProgress, ReceiveOptions, SttQueueItem, Unwatch, VoiceChannel
} from './types.ts';
import { audioState } from './discord/audioState.ts';
import { connect } from './discord/connect.ts';
import { createState } from './discord/createState.ts';
import { disconnect } from './discord/disconnect.ts';
import { drain } from './discord/drain.ts';
import { join } from './discord/join.ts';
import { leave } from './discord/leave.ts';
import { startReceiving } from './discord/startReceiving.ts';
import { watchUser } from './discord/watchUser.ts';
import type {
  AdapterState, ClientLike, OpusScriptConstructor, VoiceConnectionLike, VoiceLib
} from './discord/types.ts';
import type { VadProcess } from './vad/types.ts';
import { clearClips } from './clips/clearClips.ts';
import { findClip } from './clips/findClip.ts';
import { clipTrace } from './clips/clipTrace.ts';
import { listClips } from './clips/listClips.ts';
import { fetchAvatar } from './discord/fetchAvatar.ts';
import { leaveGuild } from './discord/leaveGuild.ts';
import { moveMember } from './discord/moveMember.ts';
import { listGuilds } from './discord/listGuilds.ts';
import { VOICE_CHANNEL_TYPE, VOICE_PERMISSIONS } from './discord/voiceConstants.ts';
import type { Clip, ClipStore } from './clips/types.ts';
import type { ClipTrace } from './types.ts';
import type { GuildView } from './types.ts';

/**
 * The real Discord transport. Like `Controller`, this class *is* its state, and
 * every method is one call into its own file.
 */
export class DiscordAdapter implements AdapterState {
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
  drain: () => Promise<void>;
  vad: VadProcess | null;
  vadWork: Promise<void>;
  clipStore: ClipStore;
  gate: string;
  speaking: Set<string>;
  humanActivity: Map<string, number>;
  stopVoiceActivity: Unwatch | null;

  constructor() {
    const initial = createState();
    this.client = initial.client;
    this.connection = initial.connection;
    this.lib = initial.lib;
    this.generation = initial.generation;
    this.loginEpoch = initial.loginEpoch;
    this.captures = initial.captures;
    this.queue = initial.queue;
    this.activeRequest = initial.activeRequest;
    this.stopReceiving = initial.stopReceiving;
    this.audio = initial.audio;
    this.vad = initial.vad;
    this.vadWork = initial.vadWork;
    this.clipStore = initial.clipStore;
    this.gate = initial.gate;
    this.speaking = initial.speaking;
    this.humanActivity = initial.humanActivity;
    this.stopVoiceActivity = initial.stopVoiceActivity;
    // createState's own drain closes over the object it built, not over this one.
    this.drain = () => drain(this);
  }

  audioState(): AudioState { return audioState(this); }
  guilds(): GuildView[] {
    // The permission pair is the same one the channel list was built with.
    return listGuilds(this, VOICE_CHANNEL_TYPE, VOICE_PERMISSIONS);
  }
  avatar(userId: string): Promise<Uint8Array | null> { return fetchAvatar(this, userId); }
  leaveGuild(guildId: string): Promise<void> { return leaveGuild(this, guildId); }
  moveMember(guildId: string, userId: string, channelId: string): Promise<void> {
    return moveMember(this, guildId, userId, channelId);
  }
  clips(): Clip[] { return listClips(this.clipStore); }
  clipLimit(): number { return this.clipStore.limit; }
  clipWav(id: string): Uint8Array | undefined { return findClip(this.clipStore, id)?.wav; }
  clipTrace(id: string): ClipTrace | undefined { return clipTrace(this.clipStore, id); }
  clearClips(): void { clearClips(this.clipStore); }
  connect(token: string, onFailure: OnFailure, onProgress?: OnProgress): Promise<ConnectResult> {
    return connect(this, token, onFailure, onProgress);
  }
  watchUser(userId: string, onLocation: OnLocation): Unwatch { return watchUser(this, userId, onLocation); }
  join(channel: VoiceChannel, options: AdapterJoinOptions): Promise<void> { return join(this, channel, options); }
  startReceiving(connection: VoiceConnectionLike, options: ReceiveOptions, OpusScript: OpusScriptConstructor): void {
    startReceiving(this, connection, options, OpusScript);
  }
  leave(): void { leave(this); }
  disconnect(): void { disconnect(this); }
}
