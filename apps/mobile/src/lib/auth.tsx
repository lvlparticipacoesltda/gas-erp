import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from './api';
import { clearSession, getStoredOrganization, getStoredUser, getToken, saveSession } from './storage';
import { clearPushTokenOnServer } from './notifications';
import { startPresenceTracking, stopAllTracking } from './location';
import type { AuthUser, LoginResponse, Organization } from '../types';

interface AuthState {
  user: AuthUser | null;
  organization: Organization | null;
  token: string | null;
  initializing: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    organization: null,
    token: null,
    initializing: true,
  });

  useEffect(() => {
    (async () => {
      const [token, user, organization] = await Promise.all([
        getToken(),
        getStoredUser(),
        getStoredOrganization(),
      ]);
      setState({ token, user, organization, initializing: false });
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: email.trim().toLowerCase(), password },
    });

    if (res.user.role !== 'DELIVERER') {
      throw new ApiError('Este aplicativo é exclusivo para entregadores.', 403);
    }

    await saveSession(res.accessToken, res.user, res.organization ?? null);
    setState({
      token: res.accessToken,
      user: res.user,
      organization: res.organization ?? null,
      initializing: false,
    });
    startPresenceTracking().catch(() => undefined);
  }, []);

  const logout = useCallback(async () => {
    await stopAllTracking().catch(() => undefined);
    await clearPushTokenOnServer();
    await clearSession();
    setState({ token: null, user: null, organization: null, initializing: false });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
