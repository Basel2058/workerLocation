import { createContext, useContext, useMemo } from 'react';
import type { Company, Site } from '../../../../shared/types';
import { del, get, patch, post } from '../../lib/api';

export interface ManagerApi {
  base: string;
  /** Set when the developer opened this company's dashboard. */
  companyId: number | null;
  company: Company | undefined;
  sites: Site[];
  tz: string;
  pendingReviews: number;
  get<T>(path: string): Promise<T>; // i18n-ignore (generic, not text)
  post<T>(path: string, body?: unknown): Promise<T>; // i18n-ignore
  patch<T>(path: string, body: unknown): Promise<T>; // i18n-ignore
  del<T>(path: string, body?: unknown): Promise<T>; // i18n-ignore
  /** Query key scoped to the company being managed. */
  key(...parts: unknown[]): unknown[];
}

const Ctx = createContext<ManagerApi | null>(null);

export function useManager(): ManagerApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useManager outside ManagerApp');
  return ctx;
}

export function useManagerValue(
  base: string,
  companyId: number | null,
  company: Company | undefined,
  sites: Site[],
  pendingReviews: number,
  fallbackTz: string,
): ManagerApi {
  return useMemo(() => {
    const opts = { companyId };
    return {
      base,
      companyId,
      company,
      sites,
      tz: company?.timezone ?? fallbackTz,
      pendingReviews,
      get: <T,>(path: string) => get<T>(path, opts),
      post: <T,>(path: string, body: unknown = {}) => post<T>(path, body, opts),
      patch: <T,>(path: string, body: unknown) => patch<T>(path, body, opts),
      del: <T,>(path: string, body: unknown = {}) => del<T>(path, body, opts),
      key: (...parts: unknown[]) => ['m', companyId ?? 0, ...parts],
    };
  }, [base, companyId, company, sites, pendingReviews, fallbackTz]);
}

export const ManagerProvider = Ctx.Provider;
