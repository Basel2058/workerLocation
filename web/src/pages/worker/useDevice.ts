import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeviceKeyState } from '../../../../shared/types';
import { ApiError, errorMessage, get } from '../../lib/api';
import { cryptoSupported, getDeviceKey, registerThisDevice } from '../../lib/device';

export type DeviceState =
  | 'checking'
  | 'unsupported'
  | 'registering'
  | 'active'
  | 'pending'
  | 'revoked'
  | 'rejected'
  | 'conflict'
  | 'error';

interface DeviceInfo {
  state: DeviceState;
  keyId: string | null;
  error: string | null;
  /** Ask the manager to approve this phone again (after a rejection or removal). */
  requestAgain(note: string): Promise<void>;
  /** Run the first registration (used after the iOS install hint). */
  register(): Promise<void>;
}

async function fetchState(): Promise<{ keyId: string | null; state: DeviceKeyState | 'none' }> {
  const key = await getDeviceKey();
  if (!key) return { keyId: null, state: 'none' };
  const res = await get<{ state: DeviceKeyState }>('/api/device/status', { headers: { 'x-device-key': key.keyId } });
  return { keyId: key.keyId, state: res.state };
}

/**
 * Tracks whether this phone may be used for check-ins and registers it when needed.
 * `autoRegister` is false while the iOS "add to Home Screen" hint is showing.
 */
export function useDevice(autoRegister: boolean): DeviceInfo {
  const qc = useQueryClient();
  const supported = cryptoSupported();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ state: DeviceState; message: string } | null>(null);
  const attempted = useRef(false);

  const status = useQuery({
    queryKey: ['device-status'],
    queryFn: fetchState,
    enabled: supported,
    refetchInterval: (q) => (q.state.data?.state === 'pending' ? 15_000 : false),
    refetchOnWindowFocus: true,
  });

  const runRegistration = useCallback(
    async (note: string, fresh: boolean) => {
      setBusy(true);
      setFailure(null);
      try {
        try {
          await registerThisDevice(note, fresh);
        } catch (err) {
          // A key retired from another account cannot be reused; make a new one once.
          if (err instanceof ApiError && err.code === 'KEY_RETIRED') await registerThisDevice(note, true);
          else throw err;
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'DEVICE_OF_OTHER_WORKER') setFailure({ state: 'conflict', message: err.message });
        else setFailure({ state: 'error', message: errorMessage(err) });
      } finally {
        setBusy(false);
        await qc.invalidateQueries({ queryKey: ['device-status'] });
        await qc.invalidateQueries({ queryKey: ['worker-home'] });
      }
    },
    [qc],
  );

  const serverState = status.data?.state;
  const needsRegistration = serverState === 'none' || serverState === 'unknown' || serverState === 'other_user';

  useEffect(() => {
    if (!autoRegister || !needsRegistration || attempted.current || busy) return;
    attempted.current = true;
    void runRegistration('', false);
  }, [autoRegister, needsRegistration, busy, runRegistration]);

  let state: DeviceState;
  if (!supported) state = 'unsupported';
  else if (failure) state = failure.state;
  else if (busy) state = 'registering';
  else if (status.isPending) state = 'checking';
  else if (status.isError) state = 'error';
  else if (serverState === 'other_user') state = 'conflict';
  else if (needsRegistration) state = autoRegister ? 'registering' : 'checking';
  else state = serverState as DeviceState;

  return {
    state,
    keyId: status.data?.keyId ?? null,
    error: failure?.message ?? (status.isError ? errorMessage(status.error) : null),
    requestAgain: (note) => runRegistration(note, true),
    register: () => runRegistration('', false),
  };
}
