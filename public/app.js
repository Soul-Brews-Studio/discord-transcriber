import { createElement, createRoot, Fragment, htm, useCallback, useEffect, useRef, useState } from '/vendor/react.js';

/**
 * Discord Transcriber — local control.
 *
 * React as a library: no bundler in the edit loop, no JSX transform. `htm`
 * gives tagged-template markup that the browser parses directly, and the two
 * vendor files are served from this origin so the page keeps working offline
 * and inside the `default-src 'self'` CSP.
 */
// htm compiles `<>…</>` to a call whose type is an empty string, not null, so
// `??` slides straight past it and React ends up calling
// document.createElement('') — which throws and blanks the page. `||` is the
// correct test here. Without the Fragment a component with several roots
// returns a bare array, and React asks for keys on markup that has no list.
const NAT_ID = document.querySelector('meta[name="follow-user-id"]')?.content ?? '';

const html = htm.bind((type, props, ...children) =>
  createElement(type || Fragment, props, ...children));

/**
 * The page ground — four surfaces, one accent.
 *
 * The stored value is checked against this list rather than written through. A
 * `data-*` attribute taken verbatim out of storage is a hole for anything else
 * on this origin, and an unrecognised name would leave the page with no ground
 * at all rather than an obviously wrong one.
 */
// Where this page actually is. The server may be bound past loopback, and a
// footer that still says "loopback only" on a LAN address is worse than no
// footer at all — it is a security claim the page cannot back up.
const ON_LOOPBACK = location.hostname === '127.0.0.1';

/**
 * How many lines the live window keeps. Enough to catch up on a sentence you
 * half-heard, few enough that the newest is never pushed out of sight in a
 * window this size — it scrolls rather than grows.
 */
const LIVE_LINES = 8;

const GROUNDS = ['cobalt', 'slate', 'plum', 'umber'];
const GROUND_KEY = 'transcriber:ground';

function readGround() {
  // Reading localStorage throws outright when storage is blocked, which is a
  // reason to fall back to the default, not to fail loading the page.
  try {
    const saved = localStorage.getItem(GROUND_KEY);
    return GROUNDS.includes(saved) ? saved : GROUNDS[0];
  } catch { return GROUNDS[0]; }
}

/**
 * The live window, when one is open, so a ground change reaches both documents
 * at once. A module-level handle rather than a poll: the alternative is copying
 * the attribute on every state frame, which would leave the two disagreeing for
 * as long as it took the next frame to arrive.
 */
let liveDocument = null;

function applyGround(name) {
  for (const doc of [document, liveDocument]) {
    if (doc) doc.documentElement.dataset.bg = name;
  }
  try { localStorage.setItem(GROUND_KEY, name); } catch { /* the ground still changed */ }
}

// Before the first render, not inside it: this module is deferred, so setting
// the attribute here still lands ahead of paint and the chosen ground never
// flashes cobalt on its way in.
document.documentElement.dataset.bg = readGround();

const token = document.querySelector('meta[name="control-token"]').content;

async function api(path, body) {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-control-token': token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/**
 * State arrives over a WebSocket and falls back to polling.
 *
 * Push is for freshness, not correctness: a dropped socket leaves the last
 * frame on screen and the poll keeps it moving, so losing the socket costs
 * latency and never accuracy.
 */
function useServerState() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const socketRef = useRef(null);

  useEffect(() => {
    let alive = true;
    let timer;

    // The poll is a fallback, not a second source. While the socket is open it
    // re-arms without fetching: every frame has already arrived over the wire,
    // so a request on top of it is pure duplicate traffic.
    // Fallback only. The socket sends a complete state frame the moment it
    // opens, so while it is up this re-arms without fetching — no duplicate
    // traffic, and nothing to reconcile between two sources.
    const poll = async () => {
      if (!alive) return;
      if (socketRef.current) { timer = setTimeout(poll, 2000); return; }
      try { setState(await api('state')); }
      catch (e) { if (alive) setError(e.message); }
      finally { if (alive) timer = setTimeout(poll, 1000); }
    };

    const connect = () => {
      const ws = new WebSocket(`ws://${location.host}/ws?token=${encodeURIComponent(token)}`);
      ws.onmessage = (event) => {
        const frame = JSON.parse(event.data);
        if (frame.type === 'state' && alive) { setState(frame.state); setError(''); }
      };
      ws.onopen = () => { socketRef.current = ws; };
      ws.onclose = () => {
        socketRef.current = null;
        if (alive) setTimeout(connect, 1000);   // the poll covers the gap
      };
      ws.onerror = () => ws.close();
    };

    connect();
    // Give the socket a moment to open before the fallback fires. Without this
    // the first paint costs a REST round trip the socket was about to make
    // redundant a few milliseconds later.
    timer = setTimeout(poll, 600);
    return () => { alive = false; clearTimeout(timer); socketRef.current?.close(); };
  }, []);

  const act = useCallback(async (name, body = {}) => {
    setError('');
    try { setState(await api(name, body)); }
    catch (e) { setError(e.message); }
  }, []);

  return { state, error, setError, act, live: Boolean(socketRef.current) };
}

export { html, api, token, useServerState };

// ── Presentation ──────────────────────────────────────────────────────────

/** State runs on three channels — a word, a bar, a surface — never colour alone. */
// State reads on three channels that do not depend on each other: a dot, a
// word, and the surface. No coloured rule down the edge — a 4px bar is
// decoration standing in for hierarchy, and it was doing the work alone.
const NODE_TONE = {
  live: 'border-[var(--color-accent)]/40 bg-[color-mix(in_oklab,var(--color-accent)_10%,var(--color-paper-2))]',
  idle: 'border-[var(--color-rule-2)] bg-[var(--color-paper-2)]',
  warn: 'border-[var(--color-warn)]/50 bg-[color-mix(in_oklab,var(--color-warn)_10%,var(--color-paper-2))]',
  off:  'border-[var(--color-rule)] bg-[var(--color-paper-2)]'
};
const DOT_TONE = {
  live: 'bg-[var(--color-accent)]',
  warn: 'bg-[var(--color-warn)]',
  idle: 'bg-[var(--color-ink-2)]',
  off:  'bg-[var(--color-rule-2)]'
};
const VALUE_TONE = {
  live: 'text-[var(--color-accent)]',
  warn: 'text-[var(--color-warn)]',
  idle: 'text-[var(--color-ink)]',
  off:  'text-[var(--color-muted)]'
};
const STATE_WORD = { live: 'live', idle: 'idle', warn: 'check', off: 'off' };

/**
 * One stage of the signal path.
 *
 * The step number is kept because the sequence *is* the information here —
 * audio moves through these four in order, and "where did it stop" is the
 * question the row exists to answer.
 */
const STAT_TONE = {
  on:   'text-[var(--color-accent)]',
  warn: 'text-[var(--color-warn)]',
  dim:  'text-[var(--color-muted)]'
};

/**
 * One stage of the pipeline.
 *
 * Four numbers were never the point — what the eye wants is "is it moving, and
 * how much". The headline stays one fact, the note stays one sentence, and the
 * measurements sit underneath in a strip that is the same shape on every card,
 * so a glance reads down a column instead of parsing four different layouts.
 */
function Node({ step, label, state, value, note, stats, meter, last }) {
  return html`
    <li className="relative flex-1 md:flex">
      <div className="flex w-full flex-col rounded-lg border ${NODE_TONE[state]} p-4 transition-colors">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 flex-none rounded-full ${DOT_TONE[state]}"></span>
          <span className="text-[0.8125rem] font-medium text-[var(--color-ink-2)]">${step}. ${label}</span>
          <span className="ml-auto text-[0.8125rem] uppercase tracking-wide text-[var(--color-muted)]"
            >${STATE_WORD[state]}</span>
        </div>
        <p className="mt-2 break-words font-mono text-[1.0625rem] tabular-nums tracking-tight ${VALUE_TONE[state]}"
          >${value}</p>
        <p className="mt-1 break-words text-[0.8125rem] leading-snug
                  ${state === 'live' || state === 'warn' ? 'text-[var(--color-ink-2)]' : 'text-[var(--color-muted)]'}"
          >${note}</p>

        ${typeof meter === 'number' && html`
          <meter className="mt-3 block h-1 w-full" min="0" max="1" value=${meter}
            aria-label="Incoming level" />`}

        ${stats?.length > 0 && html`
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-[var(--color-rule)]
                     pt-3 font-mono text-[0.8125rem] tabular-nums">
            ${stats.map(stat => html`<${Fragment} key=${stat.label}>
              <dt className="uppercase tracking-[0.14em] text-[var(--color-muted)]">${stat.label}</dt>
              <dd className="m-0 truncate text-right ${STAT_TONE[stat.tone] ?? 'text-[var(--color-ink-2)]'}"
                title=${String(stat.value)}>${stat.value}</dd>
            <//>`)}
          </dl>`}
      </div>
      ${!last && html`<span aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-full flex h-3 w-px items-center justify-center
               bg-[var(--color-rule-2)] md:left-full md:top-1/2 md:h-px md:w-3 md:translate-x-0 md:-translate-y-1/2"
      />`}
    </li>`;
}

function chainNodes(s) {
  const connected = s.phase !== 'offline' && s.phase !== 'connecting';
  const audio = s.audio;
  const listening = Boolean(audio?.enabled);
  const talking = audio?.speakingNow ?? [];
  const channel = s.channel;
  const transcribing = Boolean(channel?.transcribe);
  const rooms = s.guilds.reduce((n, g) => n + g.channels.length, 0);
  const here = channel
    ? (s.guilds.flatMap(g => g.channels).find(c => c.id === channel.id)?.occupants ?? [])
    : [];
  // The gate's own tally, which is the one number that says what the pipeline
  // actually threw away. Rejected runs are grouped, so count clips not groups.
  const ruled = s.clipGroups.reduce((acc, g) => {
    acc[g.kind] = (acc[g.kind] ?? 0) + g.clips.length;
    return acc;
  }, {});
  const mode = channel?.transcribe ? 'transcribing'
    : channel?.listen ? 'listening' : channel ? 'join only' : null;

  return [
    { step: 1, label: 'Gateway',
      state: connected ? 'live' : s.phase === 'connecting' ? 'idle' : 'off',
      value: connected ? 'connected' : s.phase === 'connecting' ? 'connecting…' : 'offline',
      // Progress wins while it runs: the bot name is not known yet, and nobody
      // wants to read "Token configured, not authenticated" for five seconds.
      note: s.progress ?? (s.bot ? s.bot.name
        : s.configured ? 'Token configured, not authenticated' : 'No bot token set'),
      stats: connected
        ? [{ label: 'servers', value: String(s.guilds.length) },
           { label: 'rooms', value: String(rooms) },
           { label: 'follow', value: s.autoFollow, tone: s.autoFollow === 'off' ? 'dim' : 'on' }]
        : [{ label: 'token', value: s.configured ? 'set' : 'missing',
             tone: s.configured ? 'on' : 'warn' }] },

    { step: 2, label: 'Voice',
      state: channel ? 'live' : connected ? 'idle' : 'off',
      value: channel ? `#${channel.name}` : s.phase === 'joining' ? 'joining…' : 'no channel',
      note: channel ? channel.guildName : connected ? 'Connected, not in a channel' : 'Not in a voice channel',
      stats: channel
        ? [{ label: 'in room', value: String(here.length) },
           { label: 'mode', value: mode, tone: transcribing ? 'on' : 'dim' },
           { label: 'speaking', value: talking.length ? talking.join(' · ') : '—',
             tone: talking.length ? 'on' : 'dim' }]
        : [{ label: 'reachable', value: `${rooms} room${rooms === 1 ? '' : 's'}`, tone: 'dim' }] },

    { step: 3, label: 'Decode',
      state: audio?.serverDeaf ? 'warn' : !listening ? 'off'
        : audio.packets ? (talking.length ? 'live' : 'idle') : 'idle',
      value: listening ? `${audio.packets} pkt` : '—',
      note: audio?.serverDeaf ? 'Server-deafened by a moderator'
        : !listening ? 'Deafened; no audio received'
        : audio.packets ? `${audio.audioSeconds.toFixed(1)} s decoded · ${s.speechGate}`
        : `Undeafened; nothing yet · ${s.speechGate}`,
      // The level belongs here and only here: this is the stage where audio
      // either arrives or does not, and a number alone never showed that.
      meter: listening ? Math.min(1, (audio.rms ?? 0) * 4) : null,
      stats: listening
        ? [{ label: 'peak', value: audio.peak.toFixed(3) },
           { label: 'sent', value: String(ruled.sent ?? 0), tone: ruled.sent ? 'on' : 'dim' },
           { label: 'dropped', value: String(ruled.dropped ?? 0), tone: 'dim' }]
        : [{ label: 'gate', value: s.speechGate,
             tone: s.speechGate.startsWith('silero') ? 'on' : 'warn' }] },

    { step: 4, label: 'Text',
      state: transcribing ? (s.rows.length ? 'live' : 'idle') : 'off',
      value: transcribing ? `${s.rows.length} row${s.rows.length === 1 ? '' : 's'}` : 'off',
      note: transcribing ? (s.stt?.url ?? 'Local endpoint')
        : s.transcriptionConfigured ? 'Endpoint set; transcription not enabled'
        : 'No transcription endpoint',
      stats: s.transcriptionConfigured
        ? [{ label: 'transport', value: s.sttTransport,
             tone: s.sttTransport === 'stream' ? 'on' : 'dim' },
           { label: 'streaming', value: s.stt ? (s.stt.streaming ? 'offered' : 'no') : '—',
             tone: s.stt?.streaming ? 'on' : 'dim' },
           { label: 'on-device', value: s.stt?.onDevice === null || s.stt === null ? '—'
               : s.stt.onDevice ? 'yes' : 'no',
             tone: s.stt?.onDevice === false ? 'warn' : s.stt?.onDevice ? 'on' : 'dim' }]
        : [{ label: 'endpoint', value: 'unset', tone: 'warn' }] }
  ];
}

const BTN = 'rounded-[3px] border border-[var(--color-rule-2)] bg-transparent px-4 py-2 text-[0.8125rem] font-medium '
  + 'whitespace-nowrap text-[var(--color-ink)] transition-colors hover:border-[var(--color-ink-2)] '
  + 'hover:bg-[var(--color-paper-3)] active:bg-[var(--color-rule)] disabled:cursor-not-allowed '
  + 'disabled:border-[var(--color-rule)] disabled:text-[var(--color-muted)] disabled:bg-transparent '
  + 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 '
  + 'focus-visible:outline-[var(--color-focus)] min-h-[44px] sm:min-h-0';
const BTN_PRIMARY = BTN + ' border-[var(--color-accent)] bg-[var(--color-accent)] text-[oklch(18%_0.04_250)] font-semibold '
  + 'hover:bg-[var(--color-focus)] hover:border-[var(--color-focus)]';
const BTN_DANGER = BTN + ' hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]';

function Button({ kind = 'plain', ...rest }) {
  const cls = kind === 'primary' ? BTN_PRIMARY : kind === 'danger' ? BTN_DANGER : BTN;
  return html`<button type="button" className=${cls} ...${rest} />`;
}

/**
 * What the live window shows: the room, who is in it, whether audio is actually
 * arriving, and the last thing anyone said.
 *
 * Deliberately read-only. Its React tree lives in another document, and DOM
 * events do not cross documents — a button placed here would render perfectly
 * and never fire. A monitor is what the surface is good at anyway.
 */
function LivePanel({ state }) {
  const audio = state.audio;
  const here = state.channel;
  const occupants = here
    ? (state.guilds.flatMap(g => g.channels).find(c => c.id === here.id)?.occupants ?? [])
    : [];
  // Newest last — controller/join.ts appends and slices the tail. Rows with no
  // text are skipped rather than shown as a speaker and a time with nothing
  // under them. Newest first, matching the page, so the line that just arrived
  // is the one at the top rather than the one you scroll to.
  const said = [...state.rows].reverse()
    .filter(row => row.status === 'final' && row.text.trim())
    .slice(0, LIVE_LINES);

  return html`<div className="live-panel">
    <p className="live-room" data-idle=${here ? undefined : ''}
      >${here ? `#${here.name}` : 'not in a channel'}</p>

    ${occupants.length === 0
      ? html`<p className="live-quiet">${here ? 'nobody here' : 'nothing to watch yet'}</p>`
      : html`<ul className="live-people">
          ${occupants.map(person => html`<li key=${person.id} className="live-person"
            data-speaking=${person.speaking ? '' : undefined}>
            <span className="live-dot"></span>${person.name}
            ${person.self ? html`<span className="live-tag">bot</span>` : null}
          </li>`)}
        </ul>`}

    <meter className="live-meter" min="0" max="1"
      value=${audio?.enabled ? Math.min(1, (audio.rms ?? 0) * 4) : 0}></meter>

    <p className="live-facts">${state.speechGate}${audio
      ? ` · ${audio.packets} packets · ${audio.audioSeconds.toFixed(1)} s`
      : ' · no audio'}</p>

    ${said.length === 0
      ? html`<p className="live-quiet">no transcript</p>`
      : html`<ol className="live-log">
          ${said.map(row => html`<li key=${row.id} className="live-entry">
            <p className="live-meta">${row.speaker} · ${new Date(row.at).toLocaleTimeString()}</p>
            <p className="live-line">${row.text}</p>
          </li>`)}
        </ol>`}
  </div>`;
}

/**
 * The live monitor in a window that floats over everything else.
 *
 * Document Picture-in-Picture rather than a dialog: the whole point of a live
 * view is watching it *while* you are in the call, and an in-page overlay is
 * gone the moment you switch to Discord. This window stays on top and survives
 * the tab switch.
 *
 * Its own React root, not a portal. A portal into another document renders
 * correctly but never receives events — React's listeners sit on the main root
 * and DOM events do not cross documents — so anything interactive would look
 * alive and do nothing. A second root leaves that door open.
 *
 * Tailwind does not reach it either: the browser build watches this document,
 * so a utility class used only there is never compiled. The panel's styles are
 * plain rules in style.css, and the window links the same two sheets.
 */
function useLiveWindow(state) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const winRef = useRef(null);

  // Document Picture-in-Picture needs a secure context. 127.0.0.1 counts as
  // one; a LAN or mesh address over plain http does not, so the API is simply
  // absent there. That is a property of the URL, not of the browser — the same
  // Chrome has it on loopback and lacks it two lines down. Hence a fallback
  // rather than a hidden button: a plain popup is a real window you can park
  // beside Discord, it just will not float on top.
  const floats = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  const openWindow = useCallback(async () => {
    if (winRef.current) return;
    const live = floats
      ? await window.documentPictureInPicture.requestWindow({ width: 340, height: 300 })
      : window.open('', 'transcriber-live', 'popup=yes,width=340,height=320');
    if (!live) return;                       // a blocked popup is not an error worth throwing
    winRef.current = live;
    const doc = live.document;
    doc.title = 'Transcriber — live';
    // Same ground as the page it was opened from, so the two do not disagree.
    doc.documentElement.dataset.bg = document.documentElement.dataset.bg;
    // Absolute, not root-relative: a popup starts on about:blank, which has no
    // base URL to resolve a path against.
    for (const path of ['/tokens.css', '/style.css']) {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL(path, location.href).href;
      doc.head.append(link);
    }
    doc.body.className = 'live-body';
    doc.body.replaceChildren();              // a reused popup still holds the last tree
    liveDocument = doc;
    rootRef.current = createRoot(doc.body);
    setOpen(true);
    // Closing is the window's own affordance; this is how we hear about it.
    live.addEventListener('pagehide', () => {
      rootRef.current?.unmount();
      rootRef.current = null;
      winRef.current = null;
      liveDocument = null;
      setOpen(false);
    });
  }, [floats]);

  // Every state frame is pushed straight into the other root. The panel is
  // small, and rendering it is cheaper than keeping a second copy in sync.
  useEffect(() => {
    // `state` is null until the first frame lands; the window can already be open.
    if (state) rootRef.current?.render(html`<${LivePanel} state=${state} />`);
  }, [state, open]);

  // A window left behind after a reload would keep a dead root alive.
  useEffect(() => () => winRef.current?.close(), []);

  return { open, openWindow, floats };
}

/**
 * Background picker. Swatch *and* name: four unlabelled dots make the reader
 * click to find out what they are, and the names are short enough to print.
 *
 * `aria-pressed` rather than a radio group — nothing is being submitted, and
 * each button takes effect the moment it is pressed.
 */
function GroundPicker() {
  const [ground, setGround] = useState(readGround);
  const choose = useCallback(name => { applyGround(name); setGround(name); }, []);
  return html`<div role="group" aria-label="Page background" className="flex items-center gap-px">
    ${GROUNDS.map(name => html`<button key=${name} type="button" aria-pressed=${ground === name}
      onClick=${() => choose(name)} title=${`${name} background`}
      className="flex items-center gap-1.5 rounded-[3px] border px-2 py-1 font-mono text-[0.8125rem] uppercase
                 tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-2
                 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] ${ground === name
        ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
        : 'border-transparent text-[var(--color-muted)] hover:border-[var(--color-rule-2)] hover:text-[var(--color-ink-2)]'}">
      <span aria-hidden="true" data-bg=${name}
        className="h-2.5 w-2.5 flex-none rounded-full border border-[var(--color-rule-2)] bg-[var(--swatch)]"></span>
      ${name}
    </button>`)}
  </div>`;
}

function Stage({ id, title, lede, zebra, children }) {
  return html`
    <section aria-labelledby=${id}
      className="-mx-6 border-t border-[var(--color-rule)] px-6 py-6 ${zebra ? 'bg-[var(--color-paper-2)]' : ''}">
      <div className="mb-4 flex flex-col gap-1">
        <h2 id=${id} className="m-0 text-[1.0625rem] font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
          >${title}</h2>
        <p className="m-0 max-w-[68ch] text-[0.8125rem] leading-relaxed text-[var(--color-muted)]">${lede}</p>
      </div>
      ${children}
    </section>`;
}

/**
 * What the transcription service offers, and what is actually being used.
 *
 * Two facts, kept apart on purpose. A service can advertise streaming while
 * this app still posts whole utterances, and collapsing those into one line
 * would read as a capability the transcript cannot demonstrate.
 */
function SttLine({ stt, transport }) {
  if (transport === 'none') {
    return html`<p className="mb-3 font-mono text-[0.8125rem] text-[var(--color-muted)]"
      >Transcription: <span className="text-[var(--color-muted-2)]">no endpoint — set MLX_STT_URL</span></p>`;
  }
  if (!stt) {
    return html`<p className="mb-3 font-mono text-[0.8125rem] text-[var(--color-muted)]"
      >Transcription: <span className="text-[var(--color-muted-2)]">not asked yet — connect to probe</span></p>`;
  }
  const streaming = stt.streaming
    ? html`<span className="text-[var(--color-accent)]">available</span>`
    : html`<span className="text-[var(--color-muted-2)]">not offered</span>`;
  return html`<>
    <p className="mb-1 font-mono text-[0.8125rem] text-[var(--color-muted)]">Transcription:
      <span className=${stt.reachable ? 'text-[var(--color-ink-2)]' : 'text-[var(--color-warn)]'}
        >${stt.reachable ? stt.url : `${stt.url} — not answering`}</span>
      ${stt.onDevice === true && html`<span className="text-[var(--color-accent)]"> · on-device</span>`}
      ${stt.onDevice === false && html`<span className="text-[var(--color-warn)]"> · leaves this machine</span>`}
    </p>
    <p className="mb-3 font-mono text-[0.8125rem] text-[var(--color-muted)]">Streaming: ${streaming}
      ${stt.streamURL && html`<span className="text-[var(--color-muted-2)]"> · ${stt.streamURL}</span>`}
      <span> · in use: </span>
      <span className=${transport === 'stream' ? 'text-[var(--color-accent)]' : 'text-[var(--color-warn)]'}
        >${transport}</span>
      ${stt.streaming && transport !== 'stream' && html`<span className="text-[var(--color-muted-2)]">
        — offered, not wired up yet</span>`}
    </p>
  </>`;
}

function Check({ id, label, checked, disabled, onChange }) {
  return html`
    <label className="flex items-start gap-2 py-1 text-[0.8125rem]
                  ${disabled ? 'text-[var(--color-muted)]' : 'text-[var(--color-ink-2)]'}">
      <input type="checkbox" id=${id} checked=${checked} disabled=${disabled} onChange=${onChange}
        className="mt-[3px] h-[1.05rem] w-[1.05rem] flex-none accent-[var(--color-accent)]" />
      <span>${label}</span>
    </label>`;
}

/**
 * One clip. The audio is fetched with the control token and played from a blob:
 * an `<audio src>` sends no headers, so a direct URL arrives unauthorised — and
 * the blob also keeps the token out of the URL, history and any Referer.
 */
function Clip({ clip, onError, playable = true }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);
  const verdict = clip.verdict.unavailable ? 'unknown' : clip.verdict.speech ? 'sent' : 'dropped';

  const play = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/clip/${clip.id}`, { headers: { 'x-control-token': token } });
      if (!response.ok) throw new Error(`clip unavailable (HTTP ${response.status})`);
      setSrc(URL.createObjectURL(await response.blob()));
    } catch (e) { onError(e.message); setLoading(false); }
  };

  // One click should play. `autoPlay` alone is not enough: the element mounts a
  // tick after the fetch resolves, and the attribute is evaluated before React
  // has attached it, so the clip sits there waiting for a second press on the
  // player's own control.
  useEffect(() => {
    if (src) audioRef.current?.play().catch(() => {});
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [src]);

  const badge = verdict === 'sent' ? 'bg-[var(--color-accent)] text-[oklch(18%_0.04_250)]'
    : verdict === 'unknown' ? 'bg-[var(--color-warn)] text-[oklch(18%_0.03_75)]'
    : 'bg-[var(--color-rule)] text-[var(--color-ink)]';

  return html`
    <li className="break-words border-t border-[var(--color-rule)] p-3 odd:bg-[var(--color-paper-3)]">
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="rounded-full px-2 py-px font-mono text-[0.8125rem] uppercase tracking-[0.06em] ${badge}"
          >${verdict}</b>
        <span className="font-mono text-[0.8125rem] tabular-nums text-[var(--color-ink-2)]">
          ${new Date(clip.at).toLocaleTimeString()} · ${clip.speaker || 'unknown'} · ${clip.seconds.toFixed(1)}s
        </span>
      </div>
      <p className="mb-2 mt-1 break-words font-mono text-[0.8125rem] tabular-nums text-[var(--color-muted-2)]">
        ${clip.verdict.unavailable
          ? `gate unavailable — ${clip.verdict.unavailable}`
          : `${clip.verdict.speechFrames}/${clip.verdict.frames} speech frames · peak ${clip.verdict.peakProbability.toFixed(3)} · ${clip.gate}`}
      </p>
      ${!playable
        ? null
        : src
          ? html`<audio ref=${audioRef} controls autoPlay preload="auto" src=${src} className="mt-1 w-full" />`
          : html`<${Button} onClick=${play} disabled=${loading}>${loading ? 'Loading…' : 'Play'}<//>`}
    </li>`;
}

/**
 * A run of rejections, shut by default. A quiet channel produces long strings
 * of half-second drops — breaths, a chair, a fan — and listing each one buries
 * the utterances that were actually sent.
 */
function DroppedRun({ clips, onError }) {
  const seconds = clips.map(c => c.seconds);
  const peak = Math.max(...clips.map(c => c.verdict.peakProbability));
  return html`
    <li className="border-t border-[var(--color-rule)] border-l-4 border-l-[var(--color-rule-2)] odd:bg-[var(--color-paper-3)]">
      <details className="p-3">
        <summary className="flex cursor-pointer flex-wrap items-baseline gap-2">
          <b className="rounded-full bg-[var(--color-rule-2)] px-2 py-px font-mono text-[0.8125rem]
                    uppercase tracking-[0.06em] text-[var(--color-ink)]">${clips.length} dropped</b>
          <span className="font-mono text-[0.8125rem] tabular-nums text-[var(--color-ink-2)]">
            ${`${new Date(clips[clips.length - 1].at).toLocaleTimeString()}–${new Date(clips[0].at).toLocaleTimeString()}`}
            ${` · ${Math.min(...seconds).toFixed(1)}–${Math.max(...seconds).toFixed(1)}s · peak up to ${peak.toFixed(3)}`}
          </span>
        </summary>
        <ol className="mt-2 list-none border-l border-[var(--color-rule)] p-0">
          ${clips.map(clip => html`<${Clip} key=${clip.id} clip=${clip} onError=${onError} playable=${false} />`)}
        </ol>
      </details>
    </li>`;
}

/**
 * A face. Proxied through this origin, so the browser never asks Discord who
 * is in the room. The ring is the speaking indicator — it sits outside the
 * image so it reads at 28px without covering the face.
 */
function Avatar({ person, size = 28 }) {
  const [broken, setBroken] = useState(false);
  const ring = person.speaking
    ? 'ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-paper-2)]'
    : 'ring-1 ring-[var(--color-rule-2)]';
  const style = { width: `${size}px`, height: `${size}px` };
  // No id, no request. Rendering <img src="/api/avatar/"> to reach the same
  // initial-letter fallback costs a 404 on every offline load and teaches the
  // reader of the console nothing.
  return broken || !person.avatar
    ? html`<span style=${style} title=${person.name}
        className="flex flex-none items-center justify-center rounded-full bg-[var(--color-paper-3)]
                   text-[0.8125rem] text-[var(--color-ink-2)] ${ring}"
        >${(person.name[0] ?? '?').toUpperCase()}</span>`
    : html`<img src=${person.avatar} alt="" aria-hidden="true" style=${style} onError=${() => setBroken(true)}
        className="flex-none rounded-full object-cover ${ring}" />`;
}

/** One person or bot in a channel: face, name, and what they are. */
function Occupant({ person }) {
  return html`
    <li className="flex items-center gap-2">
      <${Avatar} person=${person} size=${24} />
      <span className="truncate text-[0.8125rem]
        ${person.speaking ? 'text-[var(--color-accent)]'
          : person.self ? 'text-[var(--color-ink-2)]' : 'text-[var(--color-muted)]'}">${person.name}</span>
      ${person.self
        ? html`<span className="flex-none text-[0.8125rem] uppercase text-[var(--color-muted)]">this bot</span>`
        : person.bot
          ? html`<span className="flex-none text-[0.8125rem] uppercase text-[var(--color-muted)]">bot</span>`
          : null}
    </li>`;
}

/**
 * A channel as a drop zone.
 *
 * The list of every channel on every server ran to a full screen of scrolling,
 * most of it empty rooms. A grid of zones fits the same information in a
 * glance, and dropping the bot on one is a shorter path to "join" than
 * select-then-press.
 */
function Zone({ channel, selected, joined, disabled, hasNat, onSelect, onDisconnect, onFollow }) {
  const border = joined ? 'border-[var(--color-accent)]'
    : selected ? 'border-[var(--color-accent)]'
    : 'border-[var(--color-rule)]';
  const empty = channel.occupants.length === 0 && !joined;
  const fill = joined
    ? 'bg-[color-mix(in_oklab,var(--color-accent)_12%,var(--color-paper-2))]'
    // An empty room is a place you can go, not a thing that failed. It recedes
    // by surface rather than by leaving, which is what keeps the grid still.
    : empty ? 'bg-[color-mix(in_oklab,var(--color-paper)_55%,var(--color-paper-2))]'
    : 'bg-[var(--color-paper-2)]';
  // data-zone is the hit target: the chip finds it with elementFromPoint, so a
  // zone needs no drag handlers and touch works the same as a mouse.
  //
  // The select target is an overlay covering the card, not a button wrapping
  // it. A <button> containing the Disconnect and Follow buttons is invalid
  // HTML — React logs it on every render — and a browser may flatten the
  // nesting, which is how a click meant for Disconnect lands on the card
  // behind it. The overlay keeps one hit area and one tab stop without owning
  // the controls, so the text layers opt out of pointer events and the
  // controls sit after it in source order, which paints them above.
  return html`
    <li data-zone data-guild=${channel.guildId} data-channel=${channel.id} data-name=${channel.name}
      className="relative flex cursor-pointer scroll-mt-24 [&[data-over]>div]:border-[var(--color-accent)]
                 [&[data-over]>div]:border-dashed
                 [&[data-over]>div]:bg-[color-mix(in_oklab,var(--color-accent)_16%,var(--color-paper-2))]">
      <div className=${'flex w-full flex-col rounded-lg border text-left px-3 py-2 '
          + 'transition-colors gap-0 ' + border + ' ' + fill}>
        <button type="button" disabled=${disabled} onClick=${() => onSelect(channel)}
          aria-label=${`Select #${channel.name}`}
          className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]
                     disabled:cursor-not-allowed"></button>
        <span className="pointer-events-none relative flex items-baseline gap-2">
          <span className="zone-name truncate font-mono text-[0.875rem]
            ${joined || selected ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink)]'}"
            >#${channel.name}</span>
          ${channel.occupants.length > 0 && !joined && html`
            <span className="ml-auto flex-none text-[0.8125rem] text-[var(--color-muted)]"
              >${channel.occupants.length}</span>`}
          ${joined && html`<span className="ml-auto flex-none text-[0.8125rem] uppercase
            text-[var(--color-accent)]">here</span>`}
        </span>
        ${channel.occupants.length > 0 && html`
          <ul className="pointer-events-none relative mt-2 flex list-none flex-col gap-1 p-0">
            ${channel.occupants.map(p => html`<${Occupant} key=${p.id} person=${p} />`)}
          </ul>`}
        ${(joined || hasNat) && html`<span className="relative mt-2 flex flex-wrap gap-2">
          ${joined && html`<button type="button" onClick=${(e) => { e.stopPropagation(); onDisconnect(); }}
            className="rounded border border-[var(--color-rule-2)] px-2 py-1 text-[0.8125rem]
                       text-[var(--color-ink-2)] hover:border-[var(--color-danger)]
                       hover:text-[var(--color-danger)]">Disconnect</button>`}
          ${/* Wherever the human is, not only where the bot already sits. Follow
                is how the bot gets to a room, so hiding the button until it is
                already there left the one case it exists for unreachable. */ ''}
          ${hasNat && html`<button type="button" onClick=${(e) => { e.stopPropagation(); onFollow(); }}
            className="rounded border border-[var(--color-rule-2)] px-2 py-1 text-[0.8125rem]
                       text-[var(--color-ink-2)] hover:border-[var(--color-accent)]
                       hover:text-[var(--color-accent)]"
            >${joined ? 'Follow here' : 'Send bot here'}</button>`}
        </span>`}
      </div>
    </li>`;
}

/**
 * Something you can pick up and carry to a room — the bot, or yourself.
 *
 * Dragging it onto a zone is the whole gesture: the thing being moved is the
 * chip, and the place it lands is the channel. Clicking a zone still works, so
 * this never becomes the only way in.
 *
 * Pointer events rather than HTML5 drag-and-drop. DnD does not fire for touch
 * at all, and it cannot be driven by synthetic events, so it was both unusable
 * on a phone and untestable here. Pointer capture works for mouse, pen and
 * finger alike, and hit-testing with elementFromPoint means a zone needs no
 * drop handler of its own.
 *
 * One component for both chips: the gesture, the ghost and the hit test are
 * identical, and only what happens on landing differs.
 */
/**
 * The edge band that scrolls while dragging, and its fastest speed.
 *
 * Kept narrow, and the speed ramps with how deep into the band the pointer is.
 * A wide band with one speed makes everything inside it undroppable: the page
 * slides out from under the cursor at full tilt right where the card you were
 * aiming at has just arrived. Thin and proportional means the edge still pulls
 * hard, and easing back a few pixels stops it dead so you can drop.
 */
const EDGE_PX = 72;
const EDGE_SPEED_MAX = 26;
const EDGE_SPEED_MIN = 3;

function Chip({ face, hint, onLand, canDrop, refuse, onDrag }) {
  const [drag, setDrag] = useState(null);   // { x, y } while carried
  const hoverRef = useRef(null);
  const pointRef = useRef(null);            // last pointer position, for the scroll loop
  const scrollRef = useRef(0);

  // elementFromPoint is viewport-only: a point below the fold returns null, so
  // a room that is not on screen cannot be dropped on at all. It silently did
  // nothing — no highlight, no request — which reads as "drag is broken".
  const zoneUnder = (x, y) => document.elementFromPoint(x, y)?.closest('[data-zone]') ?? null;

  const paint = (el) => {
    if (hoverRef.current === el) return;
    hoverRef.current?.removeAttribute('data-over');
    if (el) el.setAttribute('data-over', '');
    hoverRef.current = el;
  };

  // Marked on the DOM rather than through state: this is one attribute per card
  // at the start of a gesture, and re-rendering the whole grid to say "these
  // five are reachable" would be a lot of React for a fact that does not change
  // until the drag ends.
  const markZones = (dragging) => {
    for (const zone of document.querySelectorAll('[data-zone]')) {
      if (!dragging) { zone.removeAttribute('data-droppable'); continue; }
      zone.setAttribute('data-droppable', !canDrop || canDrop(zone) ? 'yes' : 'no');
    }
  };

  /** Re-reads what is under the pointer and repaints. Used by both the pointer
   *  and the scroll loop, because scrolling moves the page under a still hand. */
  const track = useCallback(() => {
    const point = pointRef.current;
    if (!point) return null;
    const zone = zoneUnder(point.x, point.y);
    // A zone this chip cannot land on is not highlighted and does not become a
    // target. Saying so on the way is better than a request that comes back
    // refused: the refusal is knowable before the drop.
    const allowed = zone && (!canDrop || canDrop(zone));
    paint(allowed ? zone : null);
    setDrag({
      x: point.x, y: point.y,
      over: allowed ? `→ #${zone.dataset.name}` : zone ? (refuse?.(zone) ?? null) : null,
      blocked: Boolean(zone && !allowed)
    });
    return allowed ? zone : null;
  }, [canDrop, refuse]);

  // Holding near an edge scrolls, on a frame loop rather than on pointermove:
  // a hand held still at the bottom of the screen emits no events, and a drag
  // that only scrolls while the pointer wiggles is worse than one that does not
  // scroll at all.
  const edgeScroll = useCallback(() => {
    const point = pointRef.current;
    if (!point) return;
    const below = point.y - (window.innerHeight - EDGE_PX);
    const above = EDGE_PX - point.y;
    const depth = Math.min(1, Math.max(below, above) / EDGE_PX);
    const speed = EDGE_SPEED_MIN + (EDGE_SPEED_MAX - EDGE_SPEED_MIN) * depth;
    const by = below > 0 ? speed : above > 0 ? -speed : 0;
    // scrollBy is a no-op at the document ends, so holding at the bottom of the
    // last screen simply stops rather than spinning.
    if (by) { window.scrollBy(0, by); track(); }
    scrollRef.current = requestAnimationFrame(edgeScroll);
  }, [track]);

  const stopScrolling = useCallback(() => {
    if (scrollRef.current) cancelAnimationFrame(scrollRef.current);
    scrollRef.current = 0;
  }, []);

  useEffect(() => stopScrolling, [stopScrolling]);

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.documentElement.classList.add('dragging-bot');
    markZones(true);
    onDrag?.(true);
    pointRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: e.clientX, y: e.clientY });
    scrollRef.current = requestAnimationFrame(edgeScroll);
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    pointRef.current = { x: e.clientX, y: e.clientY };
    // The ghost names the target, so a drop is never a guess about what is
    // under the cursor.
    track();
  };

  const onPointerUp = () => {
    if (!drag) return;
    stopScrolling();
    const point = pointRef.current;
    const under = point ? zoneUnder(point.x, point.y) : null;
    const zone = under && (!canDrop || canDrop(under)) ? under : null;
    paint(null);
    markZones(false);
    onDrag?.(false);
    document.documentElement.classList.remove('dragging-bot');
    pointRef.current = null;
    setDrag(null);
    if (zone) onLand(zone.dataset.guild, zone.dataset.channel);
  };

  return html`<>
    <div onPointerDown=${onPointerDown} onPointerMove=${onPointerMove}
      onPointerUp=${onPointerUp} onPointerCancel=${onPointerUp}
      className=${'inline-flex touch-none select-none items-center gap-2 rounded-full border px-3 py-1.5 '
        + 'transition-all ' + (drag
          ? 'cursor-grabbing border-dashed border-[var(--color-accent)] bg-[var(--color-paper)] opacity-50'
          : 'cursor-grab border-[var(--color-rule-2)] bg-[var(--color-paper-2)]')}>
      <${Avatar} person=${face} size=${24} />
      <span className="text-[0.875rem] text-[var(--color-ink-2)]">${face.name}</span>
      <span className="text-[0.8125rem] text-[var(--color-muted)]">${hint}</span>
    </div>
    ${drag && html`<div aria-hidden="true"
      style=${{ position: 'fixed', left: `${drag.x + 16}px`, top: `${drag.y + 16}px`,
                pointerEvents: 'none', zIndex: 50, rotate: '-3deg' }}
      className=${'flex items-center gap-2 rounded-full border-2 bg-[var(--color-paper-3)] '
        + 'py-1.5 pl-1.5 pr-3 shadow-2xl '
        + (drag.blocked ? 'border-[var(--color-warn)]' : 'border-[var(--color-accent)]')}>
      <${Avatar} person=${face} size=${28} />
      <span className=${'whitespace-nowrap text-[0.875rem] font-medium '
        + (drag.blocked ? 'text-[var(--color-warn)]' : 'text-[var(--color-accent)]')}
        >${drag.over ?? 'drop on a channel'}</span>
    </div>`}
  </>`;
}

/**
 * One server: its occupied channels, with the empty ones folded away.
 *
 * Most channels are empty most of the time, and listing them all made the
 * section a screen of scrolling to find the two rooms with anyone in them.
 * Empty ones are still reachable — and still droppable — one click away.
 */
function Server({ guild, joinedChannelId, selected, disabled, natId, onSelect, onDisconnect, onFollow, onLeaveServer }) {
  // Every channel, by default. Hiding the empty ones is opt-in, because
  // occupancy is the one thing that changes while you are aiming at a card:
  // walk into a room and that room's card appears, the one you left disappears,
  // and every card after either of them slides. Dragging yourself to another
  // channel would move the very grid you are dropping onto.
  //
  // Showing all of them makes the set fixed, so occupancy changes appearance
  // and never position. Collapsing a server is what keeps the section short —
  // that is the control that should shorten it, not one that moves cards.
  const [showEmpty, setShowEmpty] = useState(true);
  const [open, setOpen] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const isEmpty = (c) => c.occupants.length === 0 && c.id !== joinedChannelId;
  const empty = guild.channels.filter(isEmpty);
  // Filtered, never regrouped. The old code built `occupied` and `empty` lists
  // and concatenated them, so a channel someone walked into jumped from the
  // back of the grid to the front — the position moved for a reason that had
  // nothing to do with where it is. The server sends one stable order.
  const shown = showEmpty ? guild.channels : guild.channels.filter(c => !isEmpty(c));

  const zone = (c) => html`
    <${Zone} key=${c.id} channel=${c} disabled=${disabled}
      selected=${selected === `${c.guildId}:${c.id}`}
      joined=${joinedChannelId === c.id}
      hasNat=${c.occupants.some(p => p.id === natId)}
      onSelect=${onSelect} onDisconnect=${onDisconnect}
      onFollow=${onFollow} />`;

  return html`
    <!-- scroll-mt clears the sticky chip bar above. Without it, anything
         scrolled minimally into view lands at the top of the viewport, which is
         underneath that bar: the header is then covered and a click on it hits
         the bot chip instead. Measured — elementFromPoint at the header's
         centre returned the chip, not the header. -->
    <div className="scroll-mt-24">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <button type="button" onClick=${() => setOpen(v => !v)} aria-expanded=${open}
          className="flex scroll-mt-24 items-baseline gap-1.5 rounded-[3px] text-[0.875rem] font-semibold
                     text-[var(--color-ink-2)] hover:text-[var(--color-ink)] focus-visible:outline
                     focus-visible:outline-2 focus-visible:outline-offset-2
                     focus-visible:outline-[var(--color-focus)]">
          <span aria-hidden="true" className="inline-block w-3 font-mono text-[var(--color-muted)]"
            >${open ? '▾' : '▸'}</span>${guild.name}
          ${!open && html`<span className="font-normal text-[var(--color-muted)]">
            ${shown.length} channel${shown.length === 1 ? '' : 's'}</span>`}
        </button>
        ${open && empty.length > 0 && html`
          <button type="button" onClick=${() => setShowEmpty(v => !v)}
            title=${showEmpty
              ? 'Hide the empty rooms. Cards will then move as people come and go.'
              : 'Show every room, so cards keep their place as people come and go.'}
            className="text-[0.8125rem] text-[var(--color-muted)] underline-offset-2 hover:underline"
            >${showEmpty ? `hide ${empty.length} empty` : `show ${empty.length} empty`}</button>`}
        ${confirming
          ? html`<span className="ml-auto flex items-center gap-2 text-[0.8125rem]">
              <span className="text-[var(--color-warn)]">Leave ${guild.name}? The bot needs a new invite to return.</span>
              <button type="button" onClick=${() => { setConfirming(false); onLeaveServer(guild.id); }}
                className="rounded border border-[var(--color-danger)] px-2 py-0.5
                           text-[var(--color-danger)]">Leave</button>
              <button type="button" onClick=${() => setConfirming(false)}
                className="rounded border border-[var(--color-rule-2)] px-2 py-0.5
                           text-[var(--color-ink-2)]">Cancel</button>
            </span>`
          : html`<button type="button" onClick=${() => setConfirming(true)}
              className="ml-auto text-[0.8125rem] text-[var(--color-muted)] underline-offset-2
                         hover:text-[var(--color-danger)] hover:underline">Leave server</button>`}
      </div>
      ${open && html`<ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
        ${shown.map(zone)}
      </ul>`}
    </div>`;
}

function App() {
  const { state, error, setError, act, live } = useServerState();
  const [channel, setChannel] = useState('');
  const [listen, setListen] = useState(false);
  const [transcribe, setTranscribe] = useState(false);
  const [consent, setConsent] = useState(false);
  const liveWindow = useLiveWindow(state);
  const [dragging, setDragging] = useState(false);
  const serverRank = useRef([]);

  // Changing what would be captured withdraws the consent tick. Consent is for
  // a specific room in a specific mode, not a box that stays ticked.
  const reset = (setter) => (event) => { setter(event.target.checked ?? event.target.value); setConsent(false); };

  if (!state) {
    return html`<main className="mx-auto max-w-[1040px] px-6 py-12">
      <p className="font-mono text-[var(--color-muted)]">Reaching the local server…</p></main>`;
  }

  // Voice membership is per server, so the only rooms you can be moved between
  // are the ones in the server you are already connected to. Derived from the
  // occupancy the state frame already carries rather than asked for separately.
  const myGuild = state.guilds.find(g => g.channels.some(c => c.occupants.some(p => p.id === NAT_ID)));
  const joinable = state.phase === 'ready';

  // Servers, most recently walked into first. The rank is recomputed only while
  // nothing is being carried: re-ranking mid-drag would slide the grid out from
  // under a drop that was already aimed, which is the whole thing that was just
  // fixed. A server nobody has entered since Connect has no time and sorts
  // after the ones that do, by name, rather than pretending to be oldest.
  if (!dragging) {
    serverRank.current = [...state.guilds]
      .sort((a, b) => (b.lastHumanAt ?? 0) - (a.lastHumanAt ?? 0)
        || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
      .map(g => g.id);
  }
  const rankOf = (id) => {
    const at = serverRank.current.indexOf(id);
    // A server that appeared mid-drag goes last until the drag ends, rather
    // than inserting itself somewhere in the middle of what you are aiming at.
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  const servers = [...state.guilds].sort((a, b) => rankOf(a.id) - rankOf(b.id));
  const mode = state.channel?.transcribe ? 'transcribing'
    : state.channel?.listen ? 'listening, mic muted'
    : state.channel ? 'join only, deafened' : null;

  return html`<>
    <header className="flex flex-wrap items-center gap-3 border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]
                   px-6 py-2 font-mono text-[0.8125rem] uppercase tracking-[0.14em] text-[var(--color-muted)]">
      <span key="mark" className="text-[var(--color-ink)]">Discord Transcriber</span>
      <span key="what">local control</span>
      <${GroundPicker} key="ground" />
      <button key="live" type="button" onClick=${liveWindow.openWindow}
        disabled=${liveWindow.open}
        title=${liveWindow.floats
          ? 'A small window that floats over Discord'
          : 'A separate window. It will not float on top here — that needs a secure context, '
            + 'and this page is plain http off loopback. Open it on 127.0.0.1 for the floating one.'}
        className="flex items-center gap-1.5 rounded-[3px] border border-[var(--color-rule-2)] px-2 py-1
                   font-mono text-[0.8125rem] uppercase tracking-[0.14em] text-[var(--color-ink-2)]
                   transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]
                   disabled:cursor-not-allowed disabled:border-[var(--color-rule)]
                   disabled:text-[var(--color-muted)] focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
        ${liveWindow.open ? 'live window open' : 'live window'}</button>
      <span key="where" className="ml-auto normal-case tracking-normal ${live ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}">
        ${live ? 'live · ws' : 'polling'} · ${location.host}
      </span>
    </header>

    <main className="mx-auto max-w-[1040px] px-6 pb-16 pt-10">
      <div className="mb-8 max-w-[64ch]">
        <h1 className="m-0 mb-2 text-[1.5rem] font-semibold leading-tight tracking-[-0.015em]
                   text-[var(--color-ink)]">Where the audio is, and where it stops</h1>
        <p className="m-0 text-[0.9375rem] text-[var(--color-ink-2)]">Nothing connects on its own: every stage is
          entered deliberately, and the bot never sends audio in any mode.</p>
      </div>

      <ol className="mb-10 flex list-none flex-col gap-3 p-0 md:flex-row md:items-stretch md:gap-3">
        ${chainNodes(state).map((node, i, all) => html`<${Node} key=${node.label} ...${node} last=${i === all.length - 1} />`)}
      </ol>

      ${(() => {
        // Node 1 already says the phase; repeating it here taught nothing.
        // `progress` already says "following…" while it runs; printing the
        // steady-state label beside it said the same thing twice.
        const followLabel = state.progress?.startsWith('following') ? null
          : state.following ? 'following you' : null;
        const line = [state.progress, followLabel, mode].filter(Boolean).join(' · ');
        return line && html`<p role="status" aria-live="polite"
          className="m-0 mt-1 break-words text-[0.8125rem] text-[var(--color-muted)]">${line}</p>`;
      })()}
      ${error && html`<p role="alert" className="mt-2 border-l-2 border-[var(--color-danger)] pl-3
                                             text-[0.8125rem] text-[var(--color-danger)]">${error}</p>`}

      <${Stage} id="stage-gateway" title="Gateway"
        lede=${state.configured ? 'Bot token configured on server; never sent to this browser.'
          : 'Missing DISCORD_BOT_TOKEN. Configure it and restart this app.'}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <${Button} kind="primary" disabled=${!state.configured || state.phase !== 'offline'}
            onClick=${() => act('connect')}>${state.phase === 'connecting' ? 'Connecting…' : 'Connect bot'}<//>
          <${Button} kind="danger" disabled=${state.phase === 'offline'}
            onClick=${() => act('disconnect')}>Disconnect<//>
          <span className="break-words font-mono text-[0.8125rem] text-[var(--color-muted)]">
            ${state.bot ? `${state.bot.name} · ${state.bot.id}` : ''}</span>
        </div>
        <${Check} id="auto-follow" checked=${state.autoFollow !== 'off'}
          onChange=${(e) => act('auto-follow', { mode: e.target.checked ? 'listen' : 'off' })}
          label="Follow me automatically when the bot connects — joins whichever voice channel I am in,
                 across every server we share, and listens to me only." />
        ${state.autoFollow !== 'off' && html`<${Check} id="auto-transcribe"
          checked=${state.autoFollow === 'transcribe'}
          disabled=${!state.transcriptionConfigured}
          onChange=${(e) => act('auto-follow', { mode: e.target.checked ? 'transcribe' : 'listen' })}
          label=${state.transcriptionConfigured
            ? '…and transcribe it. Listening alone measures the audio and discards it; this is the only'
              + ' setting that produces text.'
            : 'Transcribing needs a local STT endpoint. Set MLX_STT_URL and restart.'} />`}
        ${state.invites && html`
          <details className="mt-4 text-[0.8125rem] text-[var(--color-muted)]">
            <summary className="cursor-pointer font-mono text-[0.8125rem] uppercase tracking-[0.14em]
                            text-[var(--color-ink-2)]">Invite this bot to another server</summary>
            <p className="mt-2">Only for a server the bot is not in yet. After inviting, press Connect again —
              the channel list is rebuilt only on connect.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a href=${state.invites.minimal} target="_blank" rel="noreferrer noopener"
                className="text-[var(--color-ink-2)] underline">View Channel + Connect</a>
              <a href=${state.invites.administrator} target="_blank" rel="noreferrer noopener"
                className="text-[var(--color-ink-2)] underline">Administrator</a>
            </div>
            <p className="mt-2 text-[var(--color-warn)]">View Channel + Connect is everything this bot uses: it sends
              no audio, reads no messages and posts nothing. Administrator grants every permission.</p>
          </details>`}
      <//>

      <${Stage} id="stage-voice" title="Voice" zebra
        lede="Join-only stays deafened. Listening removes deafen and keeps the microphone muted. Both are explicit.">
        <!-- Sticky: the zones scroll past a screen, and something you have
             scrolled away from cannot be dragged onto anything. -->
        <!-- Solid, not blurred: backdrop-filter creates a containing block for
             position:fixed descendants, which detaches the drag ghost from the
             viewport and parks it at an offset. -->
        <div className="sticky top-0 z-10 -mx-2 mb-4 flex flex-wrap items-center gap-3
                        bg-[var(--color-paper)] px-2 py-2">
          <${Chip} key="bot"
            face=${{ name: state.bot?.name ?? 'bot',
                     avatar: state.bot ? `/api/avatar/${state.bot.id}` : '', speaking: false, self: true }}
            hint=${state.channel ? 'drag to move' : 'drag to a channel'}
            onDrag=${setDragging}
            onLand=${(guildId, channelId) => {
              if (!['ready', 'joined'].includes(state.phase)) return;
              setChannel(`${guildId}:${channelId}`);
              setConsent(false);
              // Already in a room? Leave first, then land — Discord will not
              // move a connection sideways, and this is the "quick move".
              const land = () => act('join', { guildId, channelId, listen: false, transcribe: false, consent: false });
              if (state.channel) act('leave').then(land); else land();
            }} />
          ${state.phase !== 'offline' && html`<${Chip} key="you"
            face=${{ name: 'you', avatar: `/api/avatar/${NAT_ID}`, speaking: false, self: false }}
            hint=${myGuild ? `drag within ${myGuild.name}` : 'join a voice channel first'}
            onDrag=${setDragging}
            canDrop=${(zone) => Boolean(myGuild) && zone.dataset.guild === myGuild.id}
            refuse=${(zone) => myGuild
              ? `✕ ${myGuild.name} only`
              : '✕ join a voice channel first'}
            onLand=${(guildId, channelId) => act('bring', { guildId, channelId })} />`}
          ${state.channel && html`<span className="text-[0.875rem] text-[var(--color-muted)]">
            in <span className="font-mono text-[var(--color-accent)]">#${state.channel.name}</span></span>`}
        </div>

        ${state.guilds.length === 0
          ? html`<p className="mb-4 text-[0.875rem] text-[var(--color-muted)]">
              ${joinable ? 'No voice channel this bot can both see and enter.' : 'Connect to load servers.'}</p>`
          : html`<div className="mb-4 flex flex-col gap-5">
              ${servers.map(guild => html`
                <${Server} key=${guild.id} guild=${guild}
                  joinedChannelId=${state.channel?.id ?? null}
                  selected=${channel} disabled=${state.phase === 'offline'}
                  natId=${state.following?.userId ?? NAT_ID}
                  onSelect=${(ch) => { setChannel(`${ch.guildId}:${ch.id}`); setConsent(false); }}
                  onDisconnect=${() => act('leave')}
                  onFollow=${() => act('follow-me', { listen: true, consent: true })}
                  onLeaveServer=${(id) => act('leave-guild', { guildId: id })} />`)}
            </div>`}

        <div className="mb-4">
          <${Check} id="listen" checked=${listen} disabled=${!joinable} onChange=${reset(setListen)}
            label="Listen — decode incoming audio to a level meter, then discard it. No recording, no service request." />
          <${Check} id="transcribe" checked=${transcribe} disabled=${!state.transcriptionConfigured || !joinable}
            onChange=${reset(setTranscribe)} label="Transcribe — send utterances to the local MLX endpoint." />
          <${Check} id="consent" checked=${consent} disabled=${!(listen || transcribe) || !joinable}
            onChange=${(e) => setConsent(e.target.checked)}
            label="Everyone in the channel has agreed to being listened to." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <${Button} kind="primary" disabled=${!joinable || !channel} onClick=${() => {
            const [guildId, channelId] = channel.split(':');
            act('join', { guildId, channelId, listen, transcribe, consent });
          }}>Join channel<//>
          <${Button} disabled=${!['joining', 'joined'].includes(state.phase)}
            onClick=${() => act('leave')}>Kick bot<//>
          <${Button} disabled=${!['ready', 'joined'].includes(state.phase) || Boolean(state.following)}
            onClick=${() => act('follow-me')}>Follow me<//>
          <${Button} disabled=${!['ready', 'joined'].includes(state.phase) || Boolean(state.following?.listen)}
            onClick=${() => act('follow-me', { listen: true, consent: true })}>Follow + listen<//>
          <${Button} disabled=${!['ready', 'joined'].includes(state.phase) || !state.transcriptionConfigured
              || Boolean(state.channel?.transcribe)}
            onClick=${() => act('follow-me', { transcribe: true, consent: true })}>Follow + transcribe<//>
          <${Button} kind="danger" disabled=${!state.following}
            onClick=${() => act('stop-follow')}>Stop following<//>
        </div>
      <//>

      <${Stage} id="stage-decode" title="Decode"
        lede="Packets counted, not inferred. Undeafened and Ready is not evidence that anything arrived.">
        <p className="mb-3 font-mono text-[0.8125rem] text-[var(--color-muted)]">Speech gate:
          <span className=${state.speechGate.startsWith('silero') ? 'text-[var(--color-accent)]' : 'text-[var(--color-warn)]'}
            >${state.speechGate}</span></p>
        <${SttLine} stt=${state.stt} transport=${state.sttTransport} />
        <p className="mb-3 font-mono text-[0.8125rem] text-[var(--color-muted)]">Speaking now:
          <span className=${state.audio?.speakingNow?.length ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}
            >${state.audio?.speakingNow?.length ? state.audio.speakingNow.join(' · ') : '—'}</span></p>
        <meter min="0" max="1" className="mb-2 block h-1.5 w-full"
          value=${state.audio?.enabled ? Math.min(1, (state.audio.rms ?? 0) * 4) : 0} />
        <p className="m-0 break-words font-mono text-[0.8125rem] tabular-nums text-[var(--color-muted)]">
          ${state.audio ? `${state.audio.packets} packets · ${state.audio.audioSeconds.toFixed(2)} s decoded`
            + ` · peak ${state.audio.peak.toFixed(3)} · ${state.audio.decodeErrors} decode errors` : ''}
        </p>
      <//>

      <${Stage} id="stage-timeline" title="Timeline" zebra
        lede=${state.clipLimit
          ? `Last ${state.clipLimit} utterances the gate ruled on, audio in memory only. Rejected runs are folded — open one to hear what was dropped.`
          : 'Off — this app is holding no audio. Set KEEP_CLIPS to review what the gate accepted and rejected.'}>
        <ol className="m-0 list-none p-0">
          ${state.clipGroups.length === 0
            ? html`<p className="m-0 text-[0.8125rem] text-[var(--color-muted)]">Nothing yet.</p>`
            : state.clipGroups.map(group => group.kind === 'dropped' && group.clips.length > 1
                ? html`<${DroppedRun} key=${group.clips[0].id} clips=${group.clips} onError=${setError} />`
                : html`<${Clip} key=${group.clips[0].id} clip=${group.clips[0]} onError=${setError}
                    playable=${group.kind !== 'dropped'} />`)}
        </ol>
      <//>

      <${Stage} id="stage-text" title="Text"
        lede="Latest 100 rows, memory only. Copy before closing — this app stores no audio and no transcript.">
        <div className="mb-4 flex flex-wrap gap-2">
          <${Button} onClick=${async () => {
            try {
              await navigator.clipboard.writeText(state.rows.filter(r => r.status === 'final')
                .map(r => `${r.speaker}: ${r.text}`).join('\n'));
            } catch { setError('Clipboard unavailable. Select and copy the transcript manually.'); }
          }}>Copy text<//>
          <${Button} onClick=${() => act('clear')}>Clear<//>
        </div>
        <div>
          ${state.rows.length === 0
            ? html`<p className="m-0 text-[0.8125rem] text-[var(--color-muted)]">No transcript. Listening measures audio
                and discards it; only transcription produces text.</p>`
            : [...state.rows].reverse().map(row => html`
                <article key=${row.id} className="break-words border-t border-[var(--color-rule)] p-3 odd:bg-[var(--color-paper-3)]">
                  <strong className="block font-mono text-[0.8125rem] font-medium uppercase tracking-[0.14em]
                                 text-[var(--color-muted)]">
                    ${row.speaker} · ${new Date(row.at).toLocaleTimeString()} · ${row.status}</strong>
                  <p className="m-0 mt-1">${row.text}</p>
                </article>`)}
        </div>
      <//>
    </main>

    <footer className="mx-auto max-w-[1040px] break-words border-t border-[var(--color-rule)] px-6 pb-12 pt-4
                   font-mono text-[0.8125rem] text-[var(--color-muted)]">
      ${ON_LOOPBACK
        ? 'Loopback only · token stays server-side · the bot is muted in every mode'
        : html`<><span className="text-[var(--color-warn)]">Served on this network</span>${
            ' · anyone holding this URL controls the bot · the bot is muted in every mode'}</>`}
    </footer>
  </>`;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);

// Tailwind's browser build scans the DOM when it loads and then watches it.
// Loaded from <head> it runs before this module (classic script vs deferred
// module) and scans an empty #root, producing a sheet with none of the classes
// React is about to add. Importing it after the first render gives it a
// populated tree to compile, and its MutationObserver keeps up from there.
await import('/vendor/tailwind.js');
