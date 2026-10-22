import { Camera, Check, Clock, LocateFixed, MapPin, RotateCcw, Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LocationSample, PresenceOutcome, PunchChallenge, PunchOutcome, PunchPayload } from '../../../../shared/types';
import { Button, cx, Textarea } from '../../components/ui';
import { ApiError, errorMessage, post } from '../../lib/api';
import { CameraError, cameraFailureText, captureFrame, startCamera, stopCamera, type Capture } from '../../lib/camera';
import { clientEnvironment, getDeviceKey, signPayload } from '../../lib/device';
import { fmtDistance, fmtDuration, fmtTime } from '../../lib/format';
import { collectSamples, GeoError, geoFailureText } from '../../lib/geo';

export type PunchKind = 'in' | 'out' | 'presence';

interface Props {
  kind: PunchKind;
  presenceId?: number;
  timezone: string;
  /** When checked in, used to show the time worked on check-out. */
  clockInAt?: string | null;
  onClose: (changed: boolean) => void;
}

type Phase = 'locating' | 'camera' | 'sending' | 'result' | 'error' | 'request';

interface Failure {
  title: string;
  body: string;
}

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported (iOS) — fine.
  }
};

/**
 * Full-screen check-in / check-out / "I'm here" flow.
 * GPS readings and (when required) a live selfie are collected in parallel, signed with the phone's key
 * and sent once. The worker only has to tap the shutter button.
 */
export function PunchFlow({ kind, presenceId, timezone, clockInAt, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('locating');
  const [best, setBest] = useState<LocationSample | null>(null);
  const [samples, setSamples] = useState<LocationSample[] | null>(null);
  const [challenge, setChallenge] = useState<PunchChallenge | null>(null);
  const [photo, setPhoto] = useState<Capture | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [punchResult, setPunchResult] = useState<PunchOutcome | null>(null);
  const [presenceResult, setPresenceResult] = useState<PresenceOutcome | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [note, setNote] = useState('');
  const [requestNote, setRequestNote] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [changed, setChanged] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sentRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const type = kind === 'presence' ? 'check' : kind;
  const verb = kind === 'in' ? 'Check in' : kind === 'out' ? 'Check out' : 'Confirm you’re at work';

  const fail = useCallback((f: Failure) => {
    stopCamera(streamRef.current);
    streamRef.current = null;
    abortRef.current?.abort();
    setFailure(f);
    setPhase('error');
    vibrate([60, 40, 60]);
  }, []);

  const newChallenge = useCallback(async (): Promise<PunchChallenge> => {
    const key = await getDeviceKey();
    if (!key) throw new ApiError(403, 'DEVICE_UNKNOWN', 'This phone is not set up yet.');
    return kind === 'presence'
      ? post<PunchChallenge>(`/api/presence/${presenceId}/challenge`, { keyId: key.keyId })
      : post<PunchChallenge>('/api/punch/challenge', { type: kind, keyId: key.keyId });
  }, [kind, presenceId]);

  // Start (and restart on "Try again"): GPS and challenge in parallel.
  useEffect(() => {
    sentRef.current = false;
    setPhase('locating');
    setBest(null);
    setSamples(null);
    setChallenge(null);
    setPhoto(null);
    setHint(null);
    setFailure(null);
    setPunchResult(null);
    setPresenceResult(null);
    setRequestNote(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    collectSamples({ signal: ctrl.signal, onProgress: (b) => setBest(b) })
      .then((s) => !ctrl.signal.aborted && setSamples(s))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        fail(err instanceof GeoError ? geoFailureText[err.kind] : { title: 'Location problem', body: errorMessage(err) });
      });
    newChallenge()
      .then((c) => {
        if (ctrl.signal.aborted) return;
        setChallenge(c);
        if (c.requireSelfie) setPhase('camera');
      })
      .catch((err) => !ctrl.signal.aborted && fail({ title: `Could not ${verb.toLowerCase()}`, body: errorMessage(err) }));
    return () => ctrl.abort();
  }, [attempt, newChallenge, fail, verb]);

  // Camera runs only while the worker is framing the photo.
  useEffect(() => {
    if (phase !== 'camera' || photo) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    setCameraReady(false);
    const markReady = () => !cancelled && video.videoWidth > 0 && setCameraReady(true);
    video.addEventListener('loadeddata', markReady);
    video.addEventListener('playing', markReady);
    startCamera(video)
      .then((stream) => {
        if (cancelled) stopCamera(stream);
        else {
          streamRef.current = stream;
          markReady();
        }
      })
      .catch((err) => !cancelled && fail(err instanceof CameraError ? cameraFailureText[err.kind] : { title: 'Camera problem', body: errorMessage(err) }));
    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', markReady);
      video.removeEventListener('playing', markReady);
      stopCamera(streamRef.current);
      streamRef.current = null;
    };
  }, [phase, photo, fail]);

  const send = useCallback(async () => {
    if (!samples || !challenge) return;
    setPhase('sending');
    try {
      const payload: PunchPayload = {
        v: 1,
        nonce: challenge.nonce,
        type,
        ...(kind === 'presence' ? { checkId: presenceId } : {}),
        samples,
        clientTime: Date.now(),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
        env: clientEnvironment(),
        ...(photo ? { selfie: photo.dataUrl } : {}),
        ...(requestNote !== null ? { request: { note: requestNote } } : {}),
      };
      const envelope = await signPayload(payload);
      if (kind === 'presence') {
        const res = await post<PresenceOutcome>(`/api/presence/${presenceId}`, envelope);
        setPresenceResult(res);
        setChanged(true);
        vibrate(res.status === 'passed' ? 30 : [60, 40, 60]);
      } else {
        const res = await post<PunchOutcome>('/api/punch', envelope);
        setPunchResult(res);
        if (res.result !== 'rejected') setChanged(true);
        vibrate(res.result === 'rejected' ? [60, 40, 60] : 30);
      }
      setPhase('result');
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'ALREADY_IN' || err.code === 'NOT_IN')) {
        setChanged(true);
        fail({ title: 'Your status changed', body: err.message });
      } else if (err instanceof ApiError && err.code === 'CHALLENGE_INVALID') {
        fail({ title: 'That took too long', body: 'Please try again — it only takes a few seconds.' });
      } else {
        fail({ title: `Could not ${verb.toLowerCase()}`, body: errorMessage(err) });
      }
    }
  }, [samples, challenge, photo, requestNote, kind, presenceId, type, fail, verb]);

  // Send automatically as soon as everything needed is ready.
  useEffect(() => {
    if (sentRef.current || !samples || !challenge) return;
    if (challenge.requireSelfie && !photo) return;
    sentRef.current = true;
    void send();
  }, [samples, challenge, photo, send]);

  /** After a rejection: send the same punch again as a request for the manager. */
  const startRequest = async (text: string) => {
    setPhase('sending');
    try {
      const ch = await newChallenge();
      let fresh = samples ?? [];
      const newest = fresh.length ? Math.max(...fresh.map((s) => s.ts)) : 0;
      if (Date.now() - newest > 45_000) fresh = await collectSamples({ minMs: 2000, maxMs: 10_000 });
      sentRef.current = false;
      setRequestNote(text);
      setSamples(fresh);
      setChallenge(ch);
      if (ch.requireSelfie && !photo) setPhase('camera');
    } catch (err) {
      fail({ title: 'Could not send the request', body: errorMessage(err) });
    }
  };

  const takePhoto = () => {
    const video = videoRef.current;
    // Ignore taps until the camera shows a picture.
    if (!video || !cameraReady || !video.videoWidth) return;
    try {
      const shot = captureFrame(video);
      if (shot.brightness < 28) {
        setHint('The photo is too dark. Face a light and make sure nothing covers the camera.');
        return;
      }
      setHint(null);
      setPhoto(shot);
      stopCamera(streamRef.current);
      streamRef.current = null;
    } catch (err) {
      fail(err instanceof CameraError ? cameraFailureText[err.kind] : { title: 'Camera problem', body: errorMessage(err) });
    }
  };

  const close = () => {
    abortRef.current?.abort();
    stopCamera(streamRef.current);
    onClose(changed);
  };

  // Close by itself a few seconds after a clean result.
  useEffect(() => {
    const ok = punchResult?.result === 'accepted' || presenceResult?.status === 'passed';
    if (phase !== 'result' || !ok) return;
    const t = setTimeout(() => onClose(true), 4500);
    return () => clearTimeout(t);
  }, [phase, punchResult, presenceResult, onClose]);

  const showCamera = phase === 'camera' || (phase === 'sending' && !!photo);

  // Portal to <body>: animated (transformed) ancestors would otherwise trap a fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label={verb}>
      <div className="safe-top flex items-center justify-between px-4 pt-3">
        <span className="text-sm font-medium text-muted">{verb}</span>
        {phase !== 'sending' && (
          <button onClick={close} className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label="Close">
            <X className="size-5" />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-10 text-center">
        {phase === 'locating' && <Locating best={best} />}

        {showCamera && (
          <div className="flex w-full flex-col items-center">
            <div className="relative size-64 overflow-hidden rounded-full bg-surface-3 shadow-pop ring-4 ring-surface sm:size-72">
              {photo ? (
                <img src={photo.dataUrl} alt="Your photo" className="size-full -scale-x-100 object-cover" />
              ) : (
                <video ref={videoRef} className="size-full -scale-x-100 object-cover" playsInline muted autoPlay />
              )}
              {photo && (
                <div className="absolute inset-0 grid place-items-center bg-black/25">
                  <span className="size-10 animate-spin rounded-full border-4 border-white/40 border-t-white" />
                </div>
              )}
            </div>
            <p className="mt-6 text-lg font-semibold text-ink">
              {!photo ? 'Take a quick photo' : samples ? 'Sending…' : 'Almost done…'}
            </p>
            <p className="mt-1 text-sm text-muted">
              {!photo ? 'Make sure your face is clearly visible.' : samples ? 'Checking your location and photo' : 'Waiting for your location'}
            </p>
            {hint && <p className="mt-3 max-w-xs text-sm font-medium text-amber-700 dark:text-amber-300">{hint}</p>}
            <LocationLine best={best} ready={!!samples} />
            {!photo && (
              <button
                onClick={takePhoto}
                disabled={!cameraReady}
                className="mt-8 grid size-20 place-items-center rounded-full bg-white text-slate-900 shadow-pop ring-4 ring-brand/40 transition-transform active:scale-95 disabled:opacity-50"
                aria-label={cameraReady ? 'Take photo' : 'Starting camera'}
              >
                {cameraReady ? <Camera className="size-8" /> : <span className="size-7 animate-spin rounded-full border-[3px] border-slate-300 border-t-slate-700" />}
              </button>
            )}
          </div>
        )}

        {phase === 'sending' && !photo && (
          <div className="flex flex-col items-center">
            <span className="size-12 animate-spin rounded-full border-4 border-surface-3 border-t-brand" />
            <p className="mt-6 text-lg font-semibold">Verifying…</p>
          </div>
        )}

        {phase === 'result' && punchResult && (
          <PunchResultView
            result={punchResult}
            timezone={timezone}
            clockInAt={clockInAt}
            onRetry={() => setAttempt((a) => a + 1)}
            onRequest={() => setPhase('request')}
            onDone={() => onClose(changed)}
          />
        )}

        {phase === 'result' && presenceResult && (
          <ResultCard
            tone={presenceResult.status === 'passed' ? 'ok' : 'bad'}
            title={presenceResult.status === 'passed' ? 'You’re confirmed at work' : 'Not confirmed'}
            body={presenceResult.message}
            actions={
              <Button variant="ink" size="lg" block onClick={() => onClose(true)}>
                Done
              </Button>
            }
          />
        )}

        {phase === 'request' && (
          <div className="w-full max-w-sm text-left">
            <h2 className="text-xl font-semibold text-ink">Ask your manager</h2>
            <p className="mt-1 text-sm text-muted">
              Your manager will see where you are and decide. Explain why you are {kind === 'in' ? 'checking in' : 'checking out'} from here.
            </p>
            <Textarea
              className="mt-4"
              rows={3}
              maxLength={300}
              placeholder="For example: working at the customer’s house today"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
            <Button
              variant="brand"
              size="lg"
              block
              className="mt-4"
              icon={Send}
              disabled={note.trim().length < 3}
              onClick={() => void startRequest(note.trim())}
            >
              Send to manager
            </Button>
            <Button variant="ghost" block className="mt-2" onClick={() => setPhase('result')}>
              Back
            </Button>
          </div>
        )}

        {phase === 'error' && failure && (
          <ResultCard
            tone="bad"
            title={failure.title}
            body={failure.body}
            actions={
              <>
                <Button variant="ink" size="lg" block icon={RotateCcw} onClick={() => setAttempt((a) => a + 1)}>
                  Try again
                </Button>
                <Button variant="ghost" block onClick={close}>
                  Close
                </Button>
              </>
            }
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

function Locating({ best }: { best: LocationSample | null }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative grid size-40 place-items-center">
        <span className="animate-pulse-ring absolute inset-0 rounded-full bg-brand/25" />
        <span className="animate-pulse-ring absolute inset-0 rounded-full bg-brand/20 [animation-delay:0.7s]" />
        <span className="relative grid size-24 place-items-center rounded-full bg-brand text-on-brand shadow-pop">
          <LocateFixed className="size-10" />
        </span>
      </div>
      <p className="mt-8 text-lg font-semibold text-ink">Finding your location…</p>
      <p className="tabular mt-1 h-5 text-sm text-muted">{best ? `Accurate to ${Math.round(best.acc)} m` : 'Keep the app open'}</p>
    </div>
  );
}

function LocationLine({ best, ready }: { best: LocationSample | null; ready: boolean }) {
  return (
    <p
      className={cx(
        'mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        ready ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : 'bg-surface-2 text-muted',
      )}
    >
      <MapPin className="size-3.5" />
      {ready ? `Location found${best ? ` · ±${Math.round(best.acc)} m` : ''}` : best ? `Locating · ±${Math.round(best.acc)} m` : 'Finding location…'}
    </p>
  );
}

function ResultCard({
  tone,
  title,
  big,
  body,
  extra,
  actions,
}: {
  tone: 'ok' | 'wait' | 'bad';
  title: string;
  big?: string;
  body?: string;
  extra?: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = tone === 'ok' ? Check : tone === 'wait' ? Clock : X;
  return (
    <div className="flex w-full max-w-sm flex-col items-center" role="status">
      <div
        className={cx(
          'animate-pop-in grid size-24 place-items-center rounded-full text-white shadow-pop',
          tone === 'ok' && 'bg-emerald-500',
          tone === 'wait' && 'bg-amber-500',
          tone === 'bad' && 'bg-rose-500',
        )}
      >
        <Icon className="size-12" strokeWidth={2.5} />
      </div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      {big && <p className="tabular mt-1 text-5xl font-semibold tracking-tight text-ink">{big}</p>}
      {body && <p className="mt-3 text-[15px] text-muted">{body}</p>}
      {extra}
      {actions && <div className="mt-8 w-full space-y-2">{actions}</div>}
    </div>
  );
}

function PunchResultView({
  result,
  timezone,
  clockInAt,
  onRetry,
  onRequest,
  onDone,
}: {
  result: PunchOutcome;
  timezone: string;
  clockInAt?: string | null;
  onRetry: () => void;
  onRequest: () => void;
  onDone: () => void;
}) {
  const isIn = result.type === 'in';
  if (result.result === 'rejected') {
    return (
      <ResultCard
        tone="bad"
        title={isIn ? 'Not checked in' : 'Not checked out'}
        body={result.message}
        extra={
          result.distanceM !== null && result.reason === 'OUTSIDE_GEOFENCE' ? (
            <p className="mt-4 rounded-full bg-surface-2 px-3 py-1 text-sm text-ink-2">
              {fmtDistance(result.distanceM)} away{result.siteName ? ` from ${result.siteName}` : ''}
            </p>
          ) : null
        }
        actions={
          <>
            <Button variant="ink" size="lg" block icon={RotateCcw} onClick={onRetry}>
              Try again
            </Button>
            {result.canRequest && (
              <Button variant="secondary" size="lg" block icon={Send} onClick={onRequest}>
                Ask manager to accept
              </Button>
            )}
            <Button variant="ghost" block onClick={onDone}>
              Close
            </Button>
          </>
        }
      />
    );
  }
  const worked = !isIn && clockInAt ? Math.round((Date.parse(result.at) - Date.parse(clockInAt)) / 60_000) : null;
  return (
    <ResultCard
      tone={result.result === 'review' ? 'wait' : 'ok'}
      title={isIn ? 'Checked in' : 'Checked out'}
      big={fmtTime(result.at, timezone)}
      body={result.result === 'review' ? result.message : (result.siteName ?? undefined)}
      extra={
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {result.lateMinutes !== null && (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-300">
              {fmtDuration(result.lateMinutes)} late
            </span>
          )}
          {worked !== null && worked > 0 && (
            <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-medium text-ink-2">Worked {fmtDuration(worked)}</span>
          )}
        </div>
      }
      actions={
        <Button variant="ink" size="lg" block onClick={onDone}>
          Done
        </Button>
      }
    />
  );
}
