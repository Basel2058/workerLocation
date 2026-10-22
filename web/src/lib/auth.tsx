import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginResponse, MeResponse, PublicConfig, SessionUser } from '../../../shared/types';
import { ApiError, get, onAuthError, post } from './api';

type Status = 'loading' | 'signed-out' | 'needs-code' | 'signed-in';

interface AuthValue {
  status: Status;
  user: SessionUser | null;
  login(username: string, password: string): Promise<void>;
  verifyCode(code: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    try {
      const me = await get<MeResponse>('/api/auth/me');
      setUser(me.user);
      setStatus('signed-in');
    } catch (err) {
      setUser(null);
      setStatus(err instanceof ApiError && err.code === 'MFA_REQUIRED' ? 'needs-code' : 'signed-out');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      onAuthError((err) => {
        setUser(null);
        setStatus(err.code === 'MFA_REQUIRED' ? 'needs-code' : 'signed-out');
        queryClient.clear();
      }),
    [queryClient],
  );

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      async login(username, password) {
        const res = await post<LoginResponse>('/api/auth/login', { username, password });
        queryClient.clear();
        if (res.needsTotp) {
          setStatus('needs-code');
          return;
        }
        setUser(res.user!);
        setStatus('signed-in');
      },
      async verifyCode(code) {
        const res = await post<LoginResponse>('/api/auth/totp', { code });
        setUser(res.user!);
        setStatus('signed-in');
      },
      async logout() {
        await post('/api/auth/logout').catch(() => undefined);
        queryClient.clear();
        setUser(null);
        setStatus('signed-out');
      },
      refresh,
    }),
    [status, user, refresh, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** The signed-in user (only use below the sign-in gate). */
export function useUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('No user');
  return user;
}

export function usePublicConfig(): PublicConfig | undefined {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => get<PublicConfig>('/api/config'),
    staleTime: Infinity,
  }).data;
}
