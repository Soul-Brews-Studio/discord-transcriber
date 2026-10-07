# Discord Transcriber — explicit channel control

A local Bun web app that joins a Discord voice channel on request, gates each utterance with
Silero VAD, and sends accepted speech to a local speech-to-text endpoint. Nothing connects on its own.

## Run locally


```sh
bun test          # 90 tests
bun run check     # tsc --noEmit, strict
bun run start
# Open http://127.0.0.1:4666 (use this exact host, not localhost)
```

### Reaching it from another device

`BIND=0.0.0.0` listens on every interface. It changes one other thing, on
purpose: the index page carries the control token, so serving it *is* handing
over control. On loopback that costs nothing — anything that can reach the port
already runs on this machine. Off loopback the page is refused without the
token, and the server prints the URLs that carry it:

```
Bound to 0.0.0.0: reachable from this network. Anyone holding a URL below controls the bot.
  http://<lan-ip>:4666/?t=<token>
```

### A link that survives a restart

The control token is minted per process by default, which is the safer setting:
a URL stops working when the server does, so one left in a chat log expires on
its own. It is also why every restart hands out a different address.

`CONTROL_TOKEN` fixes it, and changes what the token is:

```sh
openssl rand -hex 24   # put the result in .env as CONTROL_TOKEN=
```

That value is now a **long-lived** credential, not a session one. Values shorter
than 32 characters are refused rather than accepted with a warning nobody reads
— a guessable token on an address reachable across a mesh is not a smaller
secret, it is an open door with a lock drawn on it.

Each of those URLs is full control of the bot: connect it, decode a voice
channel, move a member between rooms. Treat one like a password, and remember it
is a *new* token every restart. `BIND` takes an address, never a name — a
hostname would reintroduce the DNS indirection the Host pinning exists to stop.

The page says which it is. On loopback the footer reads "Loopback only"; on any
other address it says "Served on this network" in the warning colour.

## Layout

TypeScript throughout, **one exported function per file**. The two classes —
`Controller` and `DiscordAdapter` — hold state and nothing else: each of their
methods is a single call into the file that owns that operation.

```
src/
  types.ts              every shared shape; no runtime code
  audio/                pcmToWav · audible · measure · emptyCounters
  controller/           createState · state · connect · validateJoin · join
                        startFollow · isAlreadyThere · followTarget
                        stopFollow · leave · disconnect · clear
  discord/              types.ts (structural SDK shapes) · createState
                        audioState · connect · loadChannels · isJoinableVoice
                        watchUser · join · startReceiving · captureSpeaker
                        applyPacket · enqueueUtterance · speakerName
                        drain · leave · disconnect
  server/               securityHeaders · isAuthorized · readBody
                        runAction · handler · localSTT · parsePort · main
vad/torch_vad.py        Silero sidecar (uv single-file script)
```

The Discord SDK is typed by `src/discord/types.ts` rather than imported from
`discord.js`: the SDK is loaded with a dynamic `import()` so a missing install
fails at Connect instead of at startup, and the test doubles can only satisfy a
shape that is the part actually used. `tsc` runs with `strict`,
`noUncheckedIndexedAccess`, `noUnusedLocals` and `noImplicitAny`; there is no
`any` in the codebase. Deliberately partial test doubles are widened once each
through `tests/support/fake.ts`, which states the incompleteness at the boundary
instead of letting it spread.

The app launches **offline**, even with a token configured. Connect authenticates the dedicated
bot and lists its accessible server/voice channels; it does **not** join. Choose a channel and
click **Join selected channel**. Joined status is reported only after voice Ready. Leave cancels
capture and pending transcription; Disconnect also closes the Discord gateway. Closing the browser
alone does not disconnect the server process: use Leave/Disconnect or stop it with Ctrl-C.


## Inviting the bot

Once connected, the control page shows two invite links built from the live
application ID:

| Link | Permissions | |
| --- | --- | --- |
| View Channel + Connect | `1049600` | everything this bot uses |
| Administrator | `8` | every permission in the guild |

This bot sends no audio, reads no messages and posts nothing, so Administrator
buys nothing it needs — and would mask a per-channel override rather than show
it. Both are offered so the difference is visible at the moment of choosing.

**The channel list is built once, at Connect.** A voice channel created or
re-permissioned afterwards stays invisible until you press Connect again, and a
followed join into it fails with *"Cannot follow into this channel. Check
access"* — which reads like a permission problem even when the list is simply
stale. Verified 2026-09-27: `#2nd` was created at 06:48 and only appeared after
a reconnect.

## Configure a live bot

1. Supply a **dedicated Discord bot token**, not a normal user token, in this app's environment
   as `DISCORD_BOT_TOKEN`. The original used `DISCORD_TOKEN`; the new app intentionally does
   not fall back to that potentially shared credential. Never paste the token into chat,
   source code, a URL, or the browser. `.env.example` lists names; `.env` is ignored.
2. Ensure that bot is invited to the intended guild with **View Channel** and **Connect**.
   This app is listen-only/muted: no Administrator, message-content intent, TTS or text-post
   permission is required. Gateway intents are Guilds and GuildVoiceStates. Stage channels
   are deliberately excluded. A full channel or blocked UDP can prevent Ready.
3. Restart this app after setting configuration; press Connect and verify the displayed bot
   identity. Choose the specific user-authorized server/channel, then Join. Manual Join uses the selected channel. The separate Follow me action is limited to the account in `FOLLOW_USER_ID`.
4. Verify the bot appears in the selected channel and the app reports **joined**. Record bot ID,
   guild/channel ID and observed voice Ready before claiming live success. Then Leave.

## Follow me (explicit opt-in)

Set `FOLLOW_USER_ID` to your Discord user id. Use **Follow me (join-only)** on the local web page, or POST `/api/follow-me` with
its local control token. It watches only that account, across **every server this bot and
that account are both in**, joins his current accessible voice channel, moves
when he moves — including to another server — and leaves when he disconnects. It waits for him
to return. Other users and mute/deafen toggles are ignored; other servers are not. The
account is fixed at startup, so no request can aim the follow at anyone else.
A server the bot has not been invited to sends it no events at all — invite it
first, then press Connect.
**Stop following and leave**, Leave, Disconnect, or server restart disables it.
Following is never enabled on startup. Join-only follow remains deafened;
**Follow + listen** enables reception only for that account, including after moves.
It never carries all-participant transcription consent across rooms. Voice connection failure stops
following rather than retrying indefinitely. Refresh the page after upgrading.

## Listen without an MLX model (deafen fix)

The recovered bot used `selfDeaf: false` independently of its transcription backend.
Our initial app incorrectly coupled reception to `transcribe`; this app now has
three distinct modes:

| Mode | Discord self-deaf | Receiver | Speech service |
| --- | --- | --- | --- |
| Join-only | true | none | none |
| Listen-only | false | Opus → PCM → meter, then discard | none |
| Transcribe | false | Opus → PCM → WAV | configured local MLX |

All modes keep **selfMute=true**: the microphone icon stays crossed because the
bot sends no audio. The crossed-headphones icon should disappear in listening mode.
A server-deafen restriction is displayed separately; this app does not bypass it.


The running server must have its bot token configured. No MLX model, service,
new dependency, second bot process, or model download is needed for listening.
The **Incoming audio** panel displays successful decoded bytes/seconds, RMS,
peak, packet count, decode errors, and actual Discord voice-state flags in the
control API. Being undeafened/Ready alone is not evidence of received speech.
Listen-only does not save audio or emit pretend transcript rows. It decodes only
the followed account when following; direct channel listening requires the participant-consent
checkbox and can receive other speakers. Leave/disconnect removes subscriptions
and invalidates pending callbacks. Stop following and leave stops reception.

## Picking a channel

Channels are a grid of zones, one per voice channel, grouped by server. Each
shows who is in it — faces, names, and whether they are a person or a bot — so
the thing you choose on is visible in the control rather than three sections
away. Click a zone to select it, or **drag the bot chip onto one to join**. Dragging
while already in a channel moves the bot — it leaves and lands in one gesture,
across servers if you like, because Discord will not move a voice connection
sideways. A drop joins deafened; listening stays a separate, ticked decision,
since a gesture that starts recording people is the wrong thing to make easy.

Empty channels are folded behind a `+N empty` toggle per server — most channels
are empty most of the time, and listing them all made the section a screen of
scrolling to find the two rooms with anyone in them. They stay one click away
and remain droppable once shown.

The channel the bot is in carries its own **Disconnect**, and **Follow here**
when the followed account is in that room. Each server header carries **Leave
server**, which asks first: leaving is not reversible from this page, and the
bot needs a fresh invite to come back. Leaving the server the bot is speaking
in pulls it out of the channel first, so the voice connection is never
stranded.

The chip is sticky at the top of the section: the zones scroll past a screen,
and something you have scrolled away from cannot be dragged onto anything.

Dragging uses **pointer events, not HTML5 drag-and-drop**. DnD does not fire for
touch at all, so the feature would have been unusable on a phone, and it cannot
be driven by synthetic events, so it could not be tested. Zones carry a
`data-zone` attribute and the chip hit-tests with `elementFromPoint`, which
means a zone needs no drag handlers of its own and a finger behaves like a
mouse.

Avatars are downloaded by the server, cached in memory and on disk under
`~/.cache/discord-transcriber/avatars/`, and served from this origin. The
browser never contacts Discord's CDN: the page ships `default-src 'self'`, and a
local console should not announce who is in the room to a third party on every
render. The route is **not** behind the control token — an `<img>` cannot send
headers, and a guard that breaks the only consumer of a route protects nothing.
The loopback Host and origin check still applies to it.

## The speech gate

Captured audio passes a gate before it costs a transcription request. Two gates
exist and the page names which one is live, because they reject very different
audio.

**Silero VAD (`silero (torch)`)** — the newline-JSON sidecar shared with
TranscriberLive (`../TranscriberLive/Helpers/torch_vad.py`, override with
`VAD_SCRIPT`). It is started before the server binds, runs as one process for
the whole session because the model is stateful across frames and slow to load,
and is reset between utterances. Discord's 48 kHz stereo PCM16 is averaged to
mono, decimated 3:1 to 16 kHz and cut into 512-sample float32 frames. An
utterance counts as speech when **8 frames** (≈0.26 s) clear probability **0.5**
— counted, not averaged, because half a second of real speech inside four
seconds of room tone averages below any usable threshold while its own frames
sit near 1.0.

**Energy only** — the fallback when the sidecar cannot start (no `uv`, no cached
environment, no script). It is a poor stand-in, and the page says so rather than
implying the filter is intact.

Why the difference matters, measured on this machine through the production path:

| input | RMS | energy gate | Silero |
| --- | --- | --- | --- |
| real Thai speech, 6 s | 0.0554 | pass | **pass** (139/187 frames, peak 1.000) |
| digital silence | 0.0000 | reject | reject |
| 440 Hz tone | 0.1768 | **pass** | **reject** |
| white noise | 0.1443 | **pass** | **reject** |
| 60 Hz rumble | 0.1768 | **pass** | **reject** |

The speech is *quieter* than every noise case. No amplitude threshold separates
them, which is why each of those three used to be spent as a request that came
back empty.

A sidecar failure mid-session degrades to the energy gate rather than dropping
the audio; the verdict carries `unavailable` so the reason is reported.

## Clip timeline

`KEEP_CLIPS=<n>` keeps the last *n* utterances the gate ruled on, with audio, and
the page lists them newest-first with a Play button.

**It is off unless you set it, and this app stores nothing otherwise.** Recording
someone's voice is not a thing to switch on by leaving a variable unset. Clips
live in memory only, are discarded when the bot leaves the channel or you press
Clear, and never touch disk. 48 kHz stereo PCM16 is 192 KB/s, so the limit is
capped at 200 — a memory bound as well as a privacy one.

Consecutive rejections are folded into one collapsed group, because a quiet
channel produces long strings of half-second drops — breaths, a chair, a fan —
and listing each one buries the utterances that were actually sent. The summary
carries enough to judge the run without opening it: how many, the time span, the
duration range, and the highest probability the gate saw. Sent clips are never
folded; two in a row are two things worth seeing separately.

**Rejected utterances are kept too, and that is the point.** An accepted clip
only tells you the gate ran; a rejected one is the only way to find out it was
wrong. Each row shows the verdict that produced it:

```
SENT     9:03:17  alice 2.8s   69/86 speech frames · peak 0.999 · silero (torch)
DROPPED  9:03:39  alice 0.9s    0/26 speech frames · peak 0.451 · silero (torch)
```

Rejected clips show no Play button. A rejection is typically a fraction of a
second of room tone, so offering playback on every one promises audio that turns
out to be nothing; the verdict line carries the useful part. Sent clips and
"gate unavailable" clips keep theirs — those are the ones with something to hear.

Audio is fetched one clip at a time on click, never bundled into the 1 Hz state
poll. The browser cannot set headers on an `<audio src>`, so the page fetches
the clip with the control token and plays a blob — which also keeps the token
out of the URL, out of history and out of any `Referer`.

Listen-only normally discards PCM after measuring it. With `KEEP_CLIPS` set it
buffers, because otherwise the timeline would be empty in the one mode where
reviewing the gate matters most.

## While Connect is running

Connect logs in and then sweeps every guild for voice channels, which takes long
enough that silence reads as a hang. `state.progress` carries the current step —
`authenticating with Discord…`, then `reading channels — <guild> (3/7)`, then
`following…` when auto-follow is on — and the page shows it on the Gateway node
and in the status line. It is null whenever nothing slow is pending.

## Who is speaking

`audio.speakingNow` lists the display names Discord reports as speaking *this
instant*, from its `speaking` start/end events. It is distinct from
`audio.speaker`, which is whoever was decoded last and stays put once the room
goes quiet. The page shows it under **Decode**.

## Auto-follow

`AUTO_FOLLOW` starts following the moment Connect succeeds, removing the second
click. Connect is still the deliberate human action. The checkbox under
**Gateway** changes it live, so it no longer takes a restart — and turning it on
while already connected applies immediately rather than waiting for the next
reconnect.

Turning it **off** stops future connects from following; it does not pull the
bot out of a channel it is already in. That is **Stop following**, and the two
should not be the same control.

| value | behaviour |
| --- | --- |
| unset / anything else | `off` — nothing happens on Connect |
| `join`, `1`, `true` | follow **deafened**; receives nothing |
| `listen` | follow and decode the followed account's audio |

`listen` is reachable only by naming it exactly. Following join-only receives
nothing, but listening decodes audio, and that is a consent decision nobody
should make by leaving a variable unset. A follow that fails to start leaves the
bot connected and records why — it does not make Connect look broken.

```sh
AUTO_FOLLOW=listen bun run start
```

## Optional transcription

Join-only uses **selfDeaf=true, selfMute=true** and installs no audio receiver. To transcribe,
configure `MLX_STT_URL=http://127.0.0.1:4655`, check Transcribe and confirm participant consent
before Join. Changing the selected channel clears the consent checkbox.

The recovered server is `transcriber-oracle/scripts/mlx_stt_server.py` and requires its existing
MLX Thai model/runtime. It was not started or installed here. With its prerequisites already
available, the original documented command (run from that repository) is:

```sh
uv run --with mlx-whisper --with numpy --with soundfile python scripts/mlx_stt_server.py --port 4655
```

That command can install packages/download models; obtain approval before doing so. The new bot
sends raw `audio/wav` to `POST /transcribe` and reads `{ "text": "…", "inference": 0.2 }`.
Only loopback HTTP origins are allowed; no remote endpoint or redirect can silently export audio.

Receive path: Discord per-speaker Opus → 48k stereo PCM16 → WAV → local MLX → transcript rows.
For transcription, 800ms silence ends an utterance; sustained speech is chunked at 15s. Short/very quiet PCM is dropped.
Limits: 8 simultaneous capture streams, 8 queued chunks, serial STT with 20s timeout, 100 displayed
rows. Invalid Opus packets are reported and discarded instead of crashing the process. Leave
aborts pending STT and discards late rows. There is no persistent audio storage or database in
this app; the separately configured MLX service has its own data handling. Copy text before exit.

This is a bounded first implementation, not parity with the old bot's advanced VAD, anti-hallucination,
editing/history, federation, TTS, or full-room scaling. Audio receive is an SDK-supported but
Discord-undocumented feature; DAVE/UDP, real speech quality and Bun voice interoperability need
live validation. Do not treat mock tests or a dependency import as a successful Discord join.

## Local safety and validation

- Loopback binding by default; `BIND` widens it deliberately and never silently. Host and
  Origin are both checked against literal addresses this machine actually holds — never a
  name — so a DNS record pointing here cannot drive the server through someone's browser.
  Random per-process control token, and off loopback the page that carries it is itself
  token-gated.
- Token stays server-side. UI uses textContent for channel names and transcripts; no raw HTML.
- No startup Discord login/joins; automatic moves only after explicit Follow me. No greetings or text posts.
- Disconnect/gateway failure/voice failure invalidate pending operations.
- `bun test`: **121 tests**, including target/consent gates, failure cleanup,
  stale results, audio/WAV contract, STT cancellation/error redaction, Host/Origin/control-token checks.
- `bun run check`: `tsc --noEmit` clean under `strict`.
- `bun run tests/smoke.js` against the offline local server: UI/assets 200, unauthorized POST 403,
  Connect with missing config 400, offline state verified. This test must use an unconfigured instance.
- Dependency smoke: SDK 0.19.2, native AES-GCM, @snazzah/davey 0.1.11 available; Opus decoder
  initialized successfully; a synthetic Opus encode/decode test validates real decoder output.



## Licence

Apache-2.0. See [LICENSE](LICENSE).

Built by neo (AI) with Nat Weerawan in the Oracle fleet; published by transcriber (AI).
