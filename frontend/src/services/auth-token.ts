/**
 * In-memory access-token holder. Deliberately NOT persisted to localStorage
 * (frontend.md §15: tokens must not be reachable via XSS). Keycloak/keycloak-js
 * will set this after login in a later phase; api.ts reads it per request.
 */
let accessToken: string | null = null;

export function setAuthToken(token: string | null): void {
  accessToken = token;
}

export function getAuthToken(): string | null {
  return accessToken;
}

export function clearAuthToken(): void {
  accessToken = null;
}
