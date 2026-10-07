import { FOLLOW_USER_ID } from '../controller/followTarget.ts';
import type { ControllerApi, HandlerOptions } from '../types.ts';
import { isAuthorized } from './isAuthorized.ts';
import { runAction } from './runAction.ts';
import { securityHeaders } from './securityHeaders.ts';

/**
 * The hand-rolled control surface, superseded by createApp.
 *
 * Nothing in the running app reaches this: main.ts serves through Elysia. It is
 * kept because the original boundary tests drive it, and it is deliberately the
 * *narrower* of the two — loopback only, no token-gated index — so that a wider
 * bind can never be reached through this path by accident.
 *
 * Both the request origin and the `Host` header are pinned to 127.0.0.1: a DNS
 * name that resolves here would otherwise let another site reach this server
 * through the browser.
 */
export function handler(controller: ControllerApi, { port, controlToken }: HandlerOptions) {
  const origin = `http://127.0.0.1:${port}`;
  const origins: ReadonlySet<string> = new Set([origin]);
  const publicDir = new URL('../../public/', import.meta.url);
  const headers = securityHeaders(origins);
  const json = (data: unknown, status = 200): Response => Response.json(data, { status, headers });

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.origin !== origin || request.headers.get('host') !== `127.0.0.1:${port}`) {
      return json({ error: 'Invalid local host.' }, 403);
    }

    if (url.pathname.startsWith('/api/')) {
      if (!isAuthorized(request, origins, controlToken)) {
        return json({ error: 'Local control authorization required.' }, 403);
      }
      if (request.method === 'GET' && url.pathname === '/api/state') return json(controller.state());
      // Audio is fetched one clip at a time, never bundled into the 1 Hz state
      // poll. A UUID path means a clip cannot be guessed at by index either.
      if (request.method === 'GET' && url.pathname.startsWith('/api/clip/')) {
        const wav = controller.clipWav?.(url.pathname.slice('/api/clip/'.length));
        if (!wav) return json({ error: 'No such clip.' }, 404);
        return new Response(wav, { headers: { ...headers, 'Content-Type': 'audio/wav' } });
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      try {
        const handled = await runAction(controller, url.pathname, request);
        if (!handled) return json({ error: 'Not found.' }, 404);
        return json(controller.state());
      } catch (error) {
        if (error instanceof RangeError) return json({ error: 'Request too large.' }, 413);
        const message = error instanceof SyntaxError ? 'Invalid JSON.' : (error as Error).message;
        return json({ error: message }, 400);
      }
    }

    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });

    // The token is injected here and nowhere else — never logged, never stored.
    if (url.pathname === '/') {
      const html = await Bun.file(new URL('index.html', publicDir)).text();
      return new Response(html.replace('__CONTROL_TOKEN__', controlToken).replace('__FOLLOW_USER_ID__', FOLLOW_USER_ID),
        { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (url.pathname === '/app.js' || url.pathname === '/style.css' || url.pathname === '/tokens.css') {
      return new Response(Bun.file(new URL(url.pathname.slice(1), publicDir)), { headers });
    }
    return new Response('Not found', { status: 404, headers });
  };
}
