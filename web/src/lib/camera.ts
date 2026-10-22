// Live selfie capture. Photos come straight from the camera stream (not the gallery), so an old picture
// cannot be uploaded instead.

export type CameraFailure = 'unsupported' | 'denied' | 'unavailable';

export class CameraError extends Error {
  constructor(readonly kind: CameraFailure) {
    super(kind);
  }
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    const name = (err as DOMException).name;
    throw new CameraError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(() => undefined);
  if (!video.videoWidth) {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      video.addEventListener('loadedmetadata', done, { once: true });
      setTimeout(done, 3000);
    });
  }
  return stream;
}

export function stopCamera(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export interface Capture {
  dataUrl: string;
  /** Average brightness 0–255, to catch a covered camera. */
  brightness: number;
}

/** Grabs a centered square frame as a compact JPEG. */
export function captureFrame(video: HTMLVideoElement, size = 480): Capture {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new CameraError('unavailable');
  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);

  const probe = document.createElement('canvas');
  probe.width = 24;
  probe.height = 24;
  const pctx = probe.getContext('2d', { willReadFrequently: true })!;
  pctx.drawImage(canvas, 0, 0, 24, 24);
  const px = pctx.getImageData(0, 0, 24, 24).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!;
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.72), brightness: sum / (px.length / 4) };
}

export const cameraFailureText: Record<CameraFailure, { title: string; body: string }> = {
  unsupported: {
    title: 'Camera not available',
    body: 'This browser cannot use the camera. Open the app in Chrome or Safari on your phone.',
  },
  denied: {
    title: 'Camera is blocked',
    body: 'A quick photo is needed to check in. Allow the camera for this app in your phone Settings, then try again.',
  },
  unavailable: {
    title: 'Camera did not start',
    body: 'Close other apps that use the camera and try again.',
  },
};
