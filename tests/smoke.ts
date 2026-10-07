export {};

// A real local HTTP smoke test. No bot login or channel join is performed.
const origin = 'http://127.0.0.1:4666';
const response = await fetch(origin);
if (!response.ok) throw new Error(`UI HTTP ${response.status}`);
const html = await response.text();
const token = html.match(/name="control-token" content="([^"]+)"/)?.[1];
if (!token || token === '__CONTROL_TOKEN__') throw new Error('Missing local control token');
const state = await (await fetch(origin + '/api/state', { headers: { 'x-control-token': token } })).json() as { phase: string; configured: boolean };
if (state.phase !== 'offline' || state.configured) throw new Error('Smoke requires an unconfigured, offline test instance');
for (const path of ['/app.js', '/style.css']) {
  const r = await fetch(origin + path); if (!r.ok) throw new Error(`Asset missing: ${path}`);
}
const denied = await fetch(origin + '/api/connect', { method: 'POST' });
if (denied.status !== 403) throw new Error('Missing-token protection failed');
const missing = await fetch(origin + '/api/connect', { method: 'POST', headers: { 'x-control-token': token } });
if (missing.status !== 400) throw new Error('Missing-config protection failed');
console.log('HTTP smoke passed: UI/assets 200; offline/no bot config; unauthorized POST 403; missing-config Connect 400; no Discord login/join.');
