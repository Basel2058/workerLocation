// Sends browser errors to the server so they show up in the developer console's system log.

let sent = 0;
const seen = new Set<string>();

export function reportError(message: string, stack?: string, context?: Record<string, unknown>): void {
  const key = `${message}|${stack?.split('\n')[1] ?? ''}`;
  if (seen.has(key) || sent >= 10) return;
  seen.add(key);
  sent++;
  void fetch('/api/client-log', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'onsite' },
    credentials: 'same-origin',
    body: JSON.stringify({
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 8000),
      url: location.pathname.slice(0, 500),
      context,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

export function initErrorReporting(): void {
  window.addEventListener('error', (e) => {
    // Ignore errors from browser extensions and cross-origin scripts.
    if (!e.error && e.message === 'Script error.') return;
    reportError(e.message || String(e.error), e.error instanceof Error ? e.error.stack : undefined);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as unknown;
    if (reason instanceof Error && (reason.name === 'AbortError' || reason.name === 'ApiError')) return;
    reportError(reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined);
  });
}
