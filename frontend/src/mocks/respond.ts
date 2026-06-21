import { HttpResponse } from 'msw';
import type { PaginationMeta } from '@/services/types';
import { rolesForToken } from '@/auth/mock-session';

/** Shared MSW envelope helpers (§9.1) so storefront + admin handlers agree. */

export const BASE = '/api/v1';

// Visible latency in dev so skeletons render; instant under test for speed.
export const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 200;

export function ok<T>(data: T, meta?: PaginationMeta) {
  return HttpResponse.json({ success: true, data, error: null, ...(meta ? { meta } : {}) });
}

export function fail(code: string, message: string, status = 400) {
  return HttpResponse.json({ success: false, data: null, error: { code, message } }, { status });
}

export function parsePositiveInt(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function paginate<T>(items: T[], page: number, limit: number): { slice: T[]; meta: PaginationMeta } {
  const start = (page - 1) * limit;
  return { slice: items.slice(start, start + limit), meta: { total: items.length, page, limit } };
}

/** RBAC gate for /admin/* mock handlers: requires a bearer token carrying the
 *  admin role. Returns a failure response to short-circuit, or null to proceed. */
export function requireAdmin(request: Request) {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return fail('unauthorized', 'Authentication required.', 401);
  if (!rolesForToken(token).includes('admin')) return fail('forbidden', 'Admin role required.', 403);
  return null;
}
