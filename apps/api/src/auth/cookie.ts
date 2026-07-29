import type { CookieOptions, Request } from 'express';
import { SESSION_TTL_MS } from './auth.service';

export const SESSION_COOKIE_NAME = 'kindred_session';

/**
 * `@types/cookie-parser` tipa `req.cookies` como `Record<string, any>` — não
 * tem como saber o formato de um cookie sem parsear o valor. Um lugar só para
 * o cast em vez de repeti-lo em cada rota/guard que lê o cookie de sessão.
 */
export function sessionToken(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[SESSION_COOKIE_NAME];
}

/**
 * `secure` só em produção: em dev, o web fala com a API por HTTP simples
 * (proxy do Vite), e `Secure` bloquearia o cookie de sair. `path: '/api'`
 * porque é o prefixo global de toda rota (ADR-002) — o cookie não tem o que
 * fazer fora dele.
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
    maxAge: SESSION_TTL_MS,
  };
}
