import type { Request } from 'express';

/** Normaliza IPv4 mapeado em IPv6 (::ffff:a.b.c.d → a.b.c.d). */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

/** Extrai IP real atrás de proxy (Fly, Cloudflare, nginx). */
export function clientIpFromRequest(req: Request): string | null {
  const headers = req.headers;
  const candidates = [
    headers['fly-client-ip'],
    headers['cf-connecting-ip'],
    headers['true-client-ip'],
    headers['x-real-ip'],
    headers['x-forwarded-for'],
  ];

  for (const raw of candidates) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string' || !value.trim()) continue;
    // X-Forwarded-For: client, proxy1, proxy2
    const first = value.split(',')[0]?.trim();
    const normalized = normalizeIp(first);
    if (normalized) return normalized.slice(0, 128);
  }

  return normalizeIp(req.ip || req.socket?.remoteAddress || null)?.slice(0, 128) ?? null;
}
