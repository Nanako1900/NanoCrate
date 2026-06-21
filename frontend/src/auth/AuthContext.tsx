import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type KeycloakInstance from 'keycloak-js';
import { isMockMode, keycloakConfig } from '@/lib/env';
import { clearAuthToken, setAuthToken } from '@/services/auth-token';
import { MOCK_ADMIN, MOCK_CUSTOMER, type MockSession } from './mock-session';

/**
 * Auth is mode-aware. Live: keycloak-js with OIDC + PKCE, access token kept in
 * memory only (never localStorage). Mock: in-memory demo sessions so both the
 * storefront (customer) and the admin RBAC path (admin role) are exercisable
 * with zero backend.
 */
export interface AuthUser {
  name: string;
  email: string;
  roles: string[];
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface LoginOptions {
  /** Mock mode: sign in as the admin demo session (live ignores this — roles
   *  come from the verified Keycloak token). */
  admin?: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  isAuthenticated: boolean;
  roles: string[];
  isAdmin: boolean;
  hasRole: (role: string) => boolean;
  login: (options?: LoginOptions) => void;
  logout: () => void;
  mode: 'mock' | 'live';
}

const AuthContext = createContext<AuthContextValue | null>(null);

function MockAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MockSession | null>(null);

  const value = useMemo<AuthContextValue>(() => {
    const roles = session?.roles ?? [];
    return {
      status: session ? 'authenticated' : 'unauthenticated',
      user: session ? { name: session.name, email: session.email, roles } : null,
      isAuthenticated: Boolean(session),
      roles,
      isAdmin: roles.includes('admin'),
      hasRole: (role) => roles.includes(role),
      login: (options) => {
        const next = options?.admin ? MOCK_ADMIN : MOCK_CUSTOMER;
        setAuthToken(next.token);
        setSession(next);
      },
      logout: () => {
        clearAuthToken();
        setSession(null);
      },
      mode: 'mock',
    };
  }, [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

interface KeycloakClaims {
  name?: string;
  preferred_username?: string;
  email?: string;
  realm_access?: { roles?: string[] };
}

function LiveAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const keycloakRef = useRef<KeycloakInstance | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { default: Keycloak } = await import('keycloak-js');
        const keycloak = new Keycloak({
          url: keycloakConfig.url,
          realm: keycloakConfig.realm,
          clientId: keycloakConfig.clientId,
        });
        keycloakRef.current = keycloak;

        const authenticated = await keycloak.init({
          onLoad: 'check-sso',
          pkceMethod: 'S256',
          silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
        });
        if (cancelled) return;

        if (authenticated && keycloak.token) {
          setAuthToken(keycloak.token);
          const claims = keycloak.tokenParsed as KeycloakClaims | undefined;
          setUser({
            name: claims?.name ?? claims?.preferred_username ?? 'Account',
            email: claims?.email ?? '',
            roles: claims?.realm_access?.roles ?? [],
          });
          setStatus('authenticated');
        } else {
          setStatus('unauthenticated');
        }

        keycloak.onTokenExpired = () => {
          void keycloak
            .updateToken(30)
            .then((refreshed) => {
              if (refreshed && keycloak.token) setAuthToken(keycloak.token);
            })
            .catch(() => {
              clearAuthToken();
              setUser(null);
              setStatus('unauthenticated');
            });
        };
      } catch {
        if (!cancelled) setStatus('unauthenticated');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const roles = user?.roles ?? [];
    return {
      status,
      user,
      isAuthenticated: status === 'authenticated',
      roles,
      isAdmin: roles.includes('admin'),
      hasRole: (role) => roles.includes(role),
      login: () => void keycloakRef.current?.login({ redirectUri: window.location.href }),
      logout: () => {
        clearAuthToken();
        void keycloakRef.current?.logout({ redirectUri: window.location.origin });
      },
      mode: 'live',
    };
  }, [status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return isMockMode ? (
    <MockAuthProvider>{children}</MockAuthProvider>
  ) : (
    <LiveAuthProvider>{children}</LiveAuthProvider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
