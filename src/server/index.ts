import { body, HttpError, sameOrigin } from './auth';
export { BattleshipsRoom } from './room';
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const api = url.pathname.startsWith('/api/');
    if (
      ((request.method !== 'GET' && request.method !== 'HEAD') || request.headers.get('Upgrade')) &&
      !sameOrigin(request)
    )
      return Response.json({ error: 'Same-origin requests required.' }, { status: 403 });
    let response: Response;
    try {
      // Fully buffer bounded JSON before forwarding. An authorization rejection from
      // the DO must not leave the caller's request stream in use after its response.
      if (api && request.method === 'POST') {
        const json = JSON.stringify(await body(request));
        const headers = new Headers(request.headers);
        headers.delete('Content-Length');
        request = new Request(request, { headers, body: json });
      }
      response = api
        ? await env.ROOM.getByName('private-community-v1').fetch(request)
        : await env.ASSETS.fetch(request);
    } catch (error) {
      response = Response.json(
        {
          error:
            error instanceof HttpError ? error.message : 'Command service temporarily unavailable.',
        },
        { status: error instanceof HttpError ? error.status : 503 },
      );
    }
    if (response.status === 101) return response;
    const result = new Response(response.body, response);
    result.headers.set('Cache-Control', api ? 'no-store' : 'no-cache');
    result.headers.set('X-Content-Type-Options', 'nosniff');
    result.headers.set('Referrer-Policy', 'no-referrer');
    result.headers.set('X-Frame-Options', 'DENY');
    result.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    result.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (url.protocol === 'https:')
      result.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return result;
  },
} satisfies ExportedHandler<Env>;
