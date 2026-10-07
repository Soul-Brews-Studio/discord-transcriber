# The STT contract

What DiscordTranscriber requires of a speech-to-text service, written down once
so that a service in any language can satisfy it without reading the client.

Two transports. **Batch** is what exists today and is not going away — it is
simpler, and it is the only shape that suits reviewing a recorded utterance.
**Streaming** is additive, and exists for one reason: with batch, no text can
appear until the speaker has stopped for 800 ms *and* a round trip has
completed. Streaming puts words on screen while they are still being said.

Everything here is loopback-only. The client refuses any STT origin that is not
`http://127.0.0.1`, `http://localhost` or `http://[::1]`, with no credentials,
path, query or fragment — see `src/server/localSTT.ts`. A service that listened
wider would undo that check from the far side.

---

## Discovery

```
GET /capabilities
```

```json
{
  "streaming": true,
  "streamURL": "ws://127.0.0.1:4656/stream",
  "locales": ["th-TH", "en-US"],
  "onDevice": true
}
```

| Field | Meaning |
| --- | --- |
| `streaming` | `true` if streaming is implemented. Absent or `false` means batch only |
| `streamURL` | Where the socket is. Required when `streaming` is true |
| `locales` | BCP-47 tags the service will accept. Informational; the client does not gate on it |
| `onDevice` | `true` if audio never leaves this machine. Reported, never assumed |

`streamURL` must be loopback, and the client re-checks that rather than trusting
it — a service that answered with somewhere else would otherwise redirect the
audio by reply.

The socket does not have to share the HTTP port, and in AppleSpeechSTT it does
not: Network.framework applies `NWProtocolWebSocket` per listener, so one port
is either HTTP or WebSocket and cannot inspect the request first to decide.
Advertising the location is a better contract anyway — where streaming lives is
the service's business, not a constant the client hard-codes.

**404 is a valid answer.** A service that does not implement `/capabilities` is
treated as batch-only, which is what every service built before this document
is. The client must never require discovery to succeed in order to transcribe.

---

## Batch — `POST /transcribe`

```
POST /transcribe
Content-Type: audio/wav

<WAV bytes>
```

```json
{ "text": "สวัสดีครับ วันนี้อากาศดีมาก" }
```

- 200 with a JSON body containing a string `text`. Anything else is a failure.
- `text` may be empty: silence correctly recognised as silence is a success.
- The client gives up after 20 s and shows one error row. It never retries — a
  retried utterance would appear twice in a transcript that is a record of what
  was said.
- One request at a time per client. The client serialises; the service may
  still receive concurrent requests from elsewhere and is not required to.

---

## Streaming — `WS /stream`

One connection per speaker, opened when that speaker starts talking and kept
while they hold the floor. Sessions within it are delimited by `start` / `end`,
so a pause does not cost a handshake.

At the URL `/capabilities` advertised, not a fixed one.

### Audio frames — binary

Raw PCM. **16 kHz, mono, signed 16-bit little-endian**, no header, no container.
At most 100 ms per frame (3200 bytes); 20 ms (640 bytes) is what the client
sends.

Discord delivers 48 kHz stereo. The client downsamples once, at the source,
rather than making every service do it — the same conversion the VAD gate
already performs.

Binary frames outside a `start`…`end` pair are discarded, not an error: a frame
in flight when `end` was sent is normal and means nothing is wrong.

### Control frames — text, JSON

Client to server:

```json
{ "type": "start", "id": "<uuid>", "speaker": "alice", "locale": "th-TH" }
{ "type": "end",   "id": "<uuid>" }
```

Server to client:

```json
{ "type": "ready",   "id": "<uuid>" }
{ "type": "partial", "id": "<uuid>", "text": "สวัสดีครับ วัน" }
{ "type": "final",   "id": "<uuid>", "text": "สวัสดีครับ วันนี้อากาศดีมาก" }
{ "type": "error",   "id": "<uuid>|null", "message": "…" }
```

### Rules

1. **Exactly one `final` per `id`, and it is the last message for that id.** A
   `partial` after a `final` is a protocol violation, not a late update.
2. **`partial` replaces, never appends.** Recognisers revise: the text may
   shrink or change entirely between partials. A client that concatenates will
   produce nonsense the first time a recogniser changes its mind.
3. `end` means *the speaker stopped*, not *close the connection*. The server
   finishes recognition and emits `final`. The client may `start` a new id
   immediately.
4. A session with no audio still gets a `final`, with empty text.
5. **A server that falls behind emits `error` and ends that session.** It must
   not silently drop audio — a transcript missing a sentence with no error is
   worse than a visible failure, because nothing marks the hole.
6. If no audio arrives for 30 s inside an open session, the server ends it with
   a `final`.
7. An unknown `id` produces `error` and leaves the connection open.
8. On internal failure the server closes with 1011. The client falls back to
   batch for that utterance rather than losing it.

### What the client guarantees

- No audio before `start` or after `end`.
- `id` is a UUID, unique per session, never reused.
- It reads continuously; it will not stop reading while sending.
- It tolerates `ready` never arriving.

---

## Where the speech gate fits

Under batch, Silero is an **admission** decision: a whole utterance is ruled on
before anything is sent, and the verdict is what the clip timeline displays.

Under streaming that role does not survive intact — audio is already on the wire
before there is enough of it to judge. The gate becomes **endpointing**: it
decides where an utterance ends, not whether it deserved to be sent.

This is a real loss and is deliberately not papered over. The batch path stays,
which is where the accept/reject timeline keeps its meaning.

---

## Implementations

| Service | Batch | Streaming | Notes |
| --- | --- | --- | --- |
| [AppleSpeechSTT](../../AppleSpeechSTT) | yes | planned | On-device, refuses to start otherwise |
| MLX (external) | yes | no | The original endpoint this contract was extracted from |
