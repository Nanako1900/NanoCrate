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

/**
 * Auth is mode-aware. Live: keycloak-js with OIDC + PKCE, access token kept in
 * memory only (never localStorage). Mock: an in-memory dev session so protected
 * routes (cart → checkout → orders) are exercisable with zero backend.
 */
export interface AuthUser {
  name: string;
  email: string;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  mode: 'mock' | 'live';
}

const AuthContext = createContext<AuthContextValue | null>(null);

const MOCK_USER: AuthUser = { name: 'Demo Customer', email: 'demo@nanocrate.dev' };
const MOCK_TOKEN = 'mock-dev-token';

function MockAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: user ? 'authenticated' : 'unauthenticated',
      user,
      isAuthenticated: Boolean(user),
      login: () => {
        setAuthToken(MOCK_TOKEN);
        setUser(MOCK_USER);
      },
      logout: () => {
        clearAuthToken();
        setUser(null);
      },
      mode: 'mock',
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
          const claims = keycloak.tokenParsed as
            | { name?: string; preferred_username?: string; email?: string }
            | undefined;
          setUser({
            name: claims?.name ?? claims?.preferred_username ?? 'Account',
            email: claims?.email ?? '',
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
              // Refresh failed → drop the session and guide the user to re-login.
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

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAuthenticated: status === 'authenticated',
      login: () => void keycloakRef.current?.login({ redirectUri: window.location.href }),
      logout: () => {
        clearAuthToken();
        void keycloakRef.current?.logout({ redirectUri: window.location.origin });
      },
      mode: 'live',
    }),
    [status, user],
  );

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
