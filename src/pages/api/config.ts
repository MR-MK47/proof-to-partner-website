import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

interface PublicBindings {
  PUBLIC_TURNSTILE_SITE_KEY?: string;
}

export const prerender = false;

export const GET: APIRoute = () => {
  const bindings = env as unknown as PublicBindings;
  return new Response(JSON.stringify({
    turnstileSiteKey: bindings.PUBLIC_TURNSTILE_SITE_KEY || null,
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

export const POST: APIRoute = () => new Response(JSON.stringify({ ok: false, error: 'Method not allowed.' }), {
  status: 405,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    Allow: 'GET',
    'X-Robots-Tag': 'noindex, nofollow',
  },
});