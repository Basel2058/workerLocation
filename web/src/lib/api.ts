import type { ApiErrorBody } from '../../../shared/types';
import { getLocale, t } from './i18n';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  /** Developer acting on a company dashboard. */
  companyId?: number | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

type Listener = (err: ApiError) => void;
const authListeners = new Set<Listener>();

/** Called when the server says the session ended (so the app can show the sign-in screen). */
export function onAuthError(listener: Listener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

export async function api<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  // x-lang: the server answers (errors, check-in results) in the app's language.
  const headers: Record<string, string> = {
    'x-requested-with': 'onsite',
    'x-lang': getLocale(),
    accept: 'application/json',
    ...opts.headers,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (opts.companyId) headers['x-company-id'] = String(opts.companyId);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', t('ui.errors.network'));
  }
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const e = (data as ApiErrorBody | undefined)?.error;
    const err = new ApiError(
      res.status,
      e?.code ?? `HTTP_${res.status}`,
      e?.message ?? (res.status >= 500 ? t('ui.errors.server') : t('ui.errors.failed')),
      e?.details,
    );
    if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/totp') {
      for (const l of authListeners) l(err);
    }
    throw err;
  }
  return data as T;
}

export const get = <T>(path: string, opts?: RequestOptions) => api<T>('GET', path, undefined, opts);
export const post = <T>(path: string, body: unknown = {}, opts?: RequestOptions) => api<T>('POST', path, body, opts);
export const patch = <T>(path: string, body: unknown, opts?: RequestOptions) => api<T>('PATCH', path, body, opts);
export const del = <T>(path: string, body: unknown = {}, opts?: RequestOptions) => api<T>('DELETE', path, body, opts);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return t('common.somethingWrong');
}

/** Builds a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    sp.set(k, v === true ? '1' : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Downloads a file from the API (works with the developer's company header, unlike a plain link). */
export async function downloadFile(path: string, opts: RequestOptions = {}): Promise<void> {
  const headers: Record<string, string> = { 'x-lang': getLocale(), ...opts.headers };
  if (opts.companyId) headers['x-company-id'] = String(opts.companyId);
  const res = await fetch(path, { headers, credentials: 'same-origin' });
  if (!res.ok) {
    let message = t('ui.errors.download');
    try {
      message = ((await res.json()) as ApiErrorBody).error.message;
    } catch {
      // Not JSON.
    }
    throw new ApiError(res.status, 'DOWNLOAD_FAILED', message);
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'download';
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
