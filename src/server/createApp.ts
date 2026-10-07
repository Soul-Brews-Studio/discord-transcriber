import { FOLLOW_USER_ID } from '../controller/followTarget.ts';
import { Elysia } from 'elysia';
import type { ControllerApi, HandlerOptions } from '../types.ts';
import type { Hub } from '../push/createHub.ts';
import { isAuthorized } from './isAuthorized.ts';
import { isUpgradeAuthorized } from '../push/isUpgradeAuthorized.ts';
import { runAction } from './runAction.ts';
import { securityHeaders } from './securityHeaders.ts';

/**
 * The control surface as an Elysia app.
 *
 * Elysia replaces the hand-rolled router, not the rules: the loopback origin
 * check, the control-token guard and the security headers all still run on
 * every request, and the action allow-list is unchanged. What it buys is one
 * declared route per concern instead of a ladder of `if (url.pathname ===)`.
 */
export function createApp(controller: ControllerApi, hub: Hub, { port, controlToken, origins }: HandlerOptions) {
  const publicDir = new URL('../../public/', import.meta.url);
  const headers = securityHeaders(origins);

  // Both the request origin and Host are pinned to literal addresses this
  // server answers on: a DNS name that resolves here would otherwise let
  // another site reach this server through the browser.
  const isLocal = (request: Request): boolean => {
    const host = request.headers.get('host');
    if (host === null) return false;
    return origins.has(`http://${host}`) && new URL(request.url).origin === `http://${host}`;
  };

  const file = (name: string, type?: string): Response =>
    new Response(Bun.file(new URL(name, publicDir)),
      { headers: type ? { ...headers, 'Content-Type': type } : headers });

  return new Elysia()
    .onAfterHandle(({ set }) => { Object.assign(set.headers, headers); })

    // Elysia owns the upgrade. The token rides as a query parameter because a
    // browser cannot set headers on a WebSocket handshake.
    .ws('/ws', {
      beforeHandle({ request, set }) {
        const url = new URL(request.url);
        if (!isUpgradeAuthorized(url, origins, controlToken, request.headers.get('origin'))) {
          set.status = 403;
          return 'Local control authorization required.';
        }
      },
      open(socket) {
        hub.add(socket);
        socket.send(JSON.stringify({ type: 'state', state: controller.state() }));
      },
      close(socket) { hub.remove(socket); },
      message() { /* the browser sends nothing; control stays on POST */ }
    })

    .guard({ beforeHandle: ({ request, set }) => {
      if (!isLocal(request)) { set.status = 403; return { error: 'Invalid local host.' }; }
    } }, app => app

      .get('/', async ({ request, set }) => {
        // This page carries the control token, so serving it *is* handing over
        // control. On loopback that costs nothing: anything that can reach the
        // port is already running on this machine. Off it, the token has to be
        // presented to get the page that contains it — otherwise widening the
        // bind would publish the key to every device on the network.
        const url = new URL(request.url);
        const fromLoopback = request.headers.get('host') === `127.0.0.1:${port}`;
        if (!fromLoopback && url.searchParams.get('t') !== controlToken) {
          set.status = 403;
          return 'Control token required. Open the address this server printed at startup.';
        }
        // The token is injected here and nowhere else — never logged, never stored.
        const html = await Bun.file(new URL('index.html', publicDir)).text();
        return new Response(html.replace('__CONTROL_TOKEN__', controlToken).replace('__FOLLOW_USER_ID__', FOLLOW_USER_ID),
          { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
      })
      .get('/app.js', () => file('app.js', 'text/javascript; charset=utf-8'))
      .get('/style.css', () => file('style.css', 'text/css; charset=utf-8'))
      .get('/tokens.css', () => file('tokens.css', 'text/css; charset=utf-8'))
      // Public Discord CDN images, cached on disk. Not behind the control
      // token: an <img> cannot send headers, and a token that breaks the only
      // consumer of a route is protecting nothing. The loopback Host and
      // origin guard above still applies.
      .get('/api/avatar/:id', async ({ params, set }) => {
        const png = await controller.avatar?.(params.id);
        if (!png) { set.status = 404; return { error: 'No avatar.' }; }
        return new Response(png, { headers: { ...headers, 'Content-Type': 'image/png',
          'Cache-Control': 'private, max-age=86400' } });
      })

      .get('/favicon.svg', () => file('favicon.svg', 'image/svg+xml'))
      .get('/favicon-32.png', () => file('favicon-32.png', 'image/png'))
      .get('/favicon-180.png', () => file('favicon-180.png', 'image/png'))
      .get('/vendor/react.js', () => file('vendor/react.js', 'text/javascript; charset=utf-8'))
      .get('/vendor/tailwind.js', () => file('vendor/tailwind.js', 'text/javascript; charset=utf-8'))

      .guard({ beforeHandle: ({ request, set }) => {
        if (!isAuthorized(request, origins, controlToken)) {
          set.status = 403;
          return { error: 'Local control authorization required.' };
        }
      } }, api => api

        .get('/api/state', () => controller.state())

        // The VAD trace, fetched when a curve is actually being drawn. Same
        // rule as the audio below it: out of the state frame, on request only.
        .get('/api/clip/:id/trace', ({ params, set }) => {
          const trace = controller.clipTrace?.(params.id);
          if (!trace) { set.status = 404; return { error: 'No trace for that clip.' }; }
          return trace;
        })

        // Audio goes one clip at a time, never bundled into the state frame.
        .get('/api/clip/:id', ({ params, set }) => {
          const wav = controller.clipWav?.(params.id);
          if (!wav) { set.status = 404; return { error: 'No such clip.' }; }
          return new Response(wav, { headers: { ...headers, 'Content-Type': 'audio/wav' } });
        })

        .post('/api/*', async ({ request, set }) => {
          const path = new URL(request.url).pathname;
          try {
            const handled = await runAction(controller, path, request);
            if (!handled) { set.status = 404; return { error: 'Not found.' }; }
            hub.publish(controller.state());
            return controller.state();
          } catch (error) {
            if (error instanceof RangeError) { set.status = 413; return { error: 'Request too large.' }; }
            set.status = 400;
            return { error: error instanceof SyntaxError ? 'Invalid JSON.' : (error as Error).message };
          }
        })))

    .onError(({ code, set }) => {
      if (code === 'NOT_FOUND') { set.status = 404; return 'Not found'; }
      set.status = 500;
      return 'Internal error';
    });
}
