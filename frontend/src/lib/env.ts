/** Runtime environment, derived from Vite env vars (see .env.example). */

export type ApiMode = 'mock' | 'live';

const rawMode = import.meta.env.VITE_API_MODE;
export const apiMode: ApiMode = rawMode === 'live' ? 'live' : 'mock';
export const isMockMode = apiMode === 'mock';

/**
 * In mock mode requests use a relative base so the MSW worker can intercept
 * `/api/v1/*` at the page origin. In live mode they hit the configured backend.
 */
export const apiBaseUrl: string = isMockMode
  ? '/api/v1'
  : (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1');

/** Keycloak OIDC config (live mode). Mock mode uses an in-memory dev session. */
export const keycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL ?? '',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'nanocrate',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'storefront',
};

/** Stripe publishable key (live mode). Empty in mock mode → MockPaymentPanel. */
export const stripePublishableKey: string = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';
