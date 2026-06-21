/**
 * Mock-mode demo sessions. The token is an opaque bearer string the MSW admin
 * handlers map back to roles (mirroring how the real backend reads roles from a
 * verified Keycloak JWT). Two sessions let us exercise both the storefront and
 * the admin RBAC paths (customer → 403 on /admin, admin → allowed).
 */
export interface MockSession {
  name: string;
  email: string;
  roles: string[];
  token: string;
}

export const MOCK_CUSTOMER: MockSession = {
  name: 'Demo Customer',
  email: 'demo@nanocrate.dev',
  roles: ['customer'],
  token: 'mock-token-customer',
};

export const MOCK_ADMIN: MockSession = {
  name: 'Avery Admin',
  email: 'admin@nanocrate.dev',
  roles: ['customer', 'admin'],
  token: 'mock-token-admin',
};

/** Resolve the roles a mock bearer token carries (empty when unknown/absent). */
export function rolesForToken(token: string | null | undefined): string[] {
  if (token === MOCK_ADMIN.token) return MOCK_ADMIN.roles;
  if (token === MOCK_CUSTOMER.token) return MOCK_CUSTOMER.roles;
  return [];
}
