// API contract shared by the server and the web app.
// Timestamps are ISO-8601 UTC strings unless noted. Local dates are 'YYYY-MM-DD' in the company time zone.

export type Role = 'developer' | 'manager' | 'worker';

export interface SessionUser {
  id: number;
  role: Role;
  username: string;
  fullName: string;
  phone: string;
  companyId: number | null;
  companyName: string | null;
  timezone: string;
  mustChangePassword: boolean;
  totpEnabled: boolean;
}

export interface MeResponse {
  user: SessionUser;
}

export interface LoginResponse {
  user?: SessionUser;
  /** Set when the account has two-factor sign-in enabled and a code is still required. */
  needsTotp?: boolean;
}

export interface PublicConfig {
  appName: string;
  version: string;
  mapTileUrl: string;
  mapAttribution: string;
  pushPublicKey: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ---------------------------------------------------------------------------------------------
// Companies, sites, settings

export type SelfieMode = 'always' | 'random' | 'off';

export interface CompanySettings {
  /** When a selfie is required on check-in/out. */
  selfieMode: SelfieMode;
  /** For 'random' mode: chance (0-100) that a punch requires a selfie. */
  selfieRandomPercent: number;
  /** Reject punches whose GPS accuracy is worse than this many meters. */
  maxAccuracyM: number;
  /** Minutes after shift start before a worker counts as late. */
  lateGraceMin: number;
  /** How many minutes before a shift starts a check-in still counts for that shift. */
  earlyCheckInMin: number;
  /** Allow check-ins when the worker has no shift at that time. */
  allowUnscheduled: boolean;
  /** Send unscheduled check-ins to the manager for review. */
  reviewUnscheduled: boolean;
  /** The very first phone a worker uses is approved without a manager. */
  autoApproveFirstDevice: boolean;
  /** Minutes after a shift ends before a missing check-out is flagged. */
  missingCheckoutAfterMin: number;
  /** For check-ins without a shift: hours before a missing check-out is flagged. */
  maxOpenHours: number;
  /** Selfies older than this are deleted automatically. */
  photoRetentionDays: number;
  /** What happens to suspicious punches. */
  highRiskAction: 'review' | 'reject';
}

export interface Company {
  id: number;
  name: string;
  timezone: string;
  active: boolean;
  notes: string;
  settings: CompanySettings;
  createdAt: string;
}

export interface CompanySummary extends Company {
  workers: number;
  managers: number;
  sites: number;
  shiftsToday: number;
  punchesToday: number;
  pendingReviews: number;
  lastActivityAt: string | null;
}

export interface Site {
  id: number;
  companyId: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** Public IP addresses / CIDR ranges of the workplace internet connection. */
  networks: string[];
  /** Only accept punches from one of `networks`. */
  requireNetwork: boolean;
  active: boolean;
}

// ---------------------------------------------------------------------------------------------
// People and devices

export type DeviceStatus = 'pending' | 'active' | 'revoked' | 'rejected';

export interface Device {
  id: number;
  userId: number;
  label: string;
  status: DeviceStatus;
  userAgent: string;
  createdAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  lastUsedAt: string | null;
  requestNote: string;
  /** Another worker whose phone looks identical (same model, OS, browser and settings). */
  similarTo: { id: number; name: string } | null;
}

export interface UserRecord {
  id: number;
  role: Role;
  companyId: number | null;
  companyName: string | null;
  username: string;
  fullName: string;
  phone: string;
  employeeCode: string;
  notes: string;
  active: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  activeDevice: { id: number; label: string; lastUsedAt: string | null } | null;
  pendingDevices: number;
}

export interface CreatedCredentials {
  user: UserRecord;
  /** Only returned once, right after creating the account or resetting the password. */
  password: string;
}

// ---------------------------------------------------------------------------------------------
// Shifts, punches, time entries

export interface Shift {
  id: number;
  companyId: number;
  siteId: number;
  siteName: string;
  workerId: number;
  workerName: string;
  startsAt: string;
  endsAt: string;
  /** Local date of the shift start in the company time zone. */
  date: string;
  note: string;
}

export type PunchType = 'in' | 'out';
export type PunchResult = 'accepted' | 'review' | 'rejected';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface LocationSample {
  lat: number;
  lng: number;
  /** Accuracy radius in meters as reported by the phone. */
  acc: number;
  alt?: number | null;
  altAcc?: number | null;
  heading?: number | null;
  speed?: number | null;
  /** Position timestamp from the phone (ms since epoch, phone clock). */
  ts: number;
}

export interface ClientEnvironment {
  webdriver: boolean;
  geoNative: boolean;
  touchPoints: number;
  platform: string;
  standalone: boolean;
  mobileHint: boolean | null;
  screen: string;
}

/** The payload a device signs for every check-in / check-out / presence confirmation. */
export interface PunchPayload {
  v: 1;
  nonce: string;
  type: PunchType | 'check';
  /** Presence check being answered (type 'check' only). */
  checkId?: number;
  samples: LocationSample[];
  clientTime: number;
  tz: string;
  env: ClientEnvironment;
  /** JPEG data URL captured live from the front camera. */
  selfie?: string;
  /** Present when the worker asks the manager to accept a punch outside the workplace. */
  request?: { note: string };
}

export interface SignedEnvelope {
  keyId: string;
  /** JSON string of the signed payload. */
  payload: string;
  /** base64url ECDSA P-256 / SHA-256 signature (IEEE P1363) over `payload`. */
  signature: string;
}

export interface PunchChallenge {
  nonce: string;
  expiresAt: string;
  requireSelfie: boolean;
}

/** Facts about the phone used to spot one phone being used for several workers. */
export interface DeviceFingerprint {
  ua: string;
  platform: string;
  model: string;
  languages: string;
  tz: string;
  screen: string;
  dpr: number;
  cores: number;
  memory: number | null;
  touch: number;
  gpu: string;
}

/** Payload signed by a newly generated device key to register it. */
export interface DeviceRegistrationPayload {
  v: 1;
  nonce: string;
  publicKey: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
  fingerprint: DeviceFingerprint;
  note: string;
}

export type DeviceKeyState = DeviceStatus | 'unknown' | 'other_user';

export interface DeviceRegistrationResult {
  deviceId: number;
  status: DeviceStatus;
  label: string;
}

export interface PresenceOutcome {
  status: PresenceStatus;
  siteName: string | null;
  distanceM: number | null;
  message: string;
}

export interface PunchOutcome {
  result: PunchResult;
  type: PunchType;
  at: string;
  siteName: string | null;
  /** Distance from the workplace in meters (for rejections). */
  distanceM: number | null;
  /** Machine-readable reason for rejections (OUTSIDE_GEOFENCE, LOW_ACCURACY, ...). */
  reason: string | null;
  lateMinutes: number | null;
  message: string;
  /** Whether the worker may send this punch to the manager as a request instead. */
  canRequest: boolean;
}

export type EntryStatus = 'open' | 'closed' | 'incomplete' | 'void';

export interface PunchSummary {
  id: number;
  type: PunchType;
  result: PunchResult;
  at: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  distanceM: number | null;
  siteName: string | null;
  flags: string[];
  riskScore: number;
  reason: string | null;
  note: string;
  reviewStatus: ReviewStatus | null;
  reviewNote: string;
  reviewedByName: string | null;
  selfieId: string | null;
  networkMatch: boolean;
  deviceLabel: string | null;
  ip: string;
}

export interface TimeEntry {
  id: number;
  workerId: number;
  workerName: string;
  siteId: number | null;
  siteName: string | null;
  shiftId: number | null;
  shiftStartsAt: string | null;
  shiftEndsAt: string | null;
  clockInAt: string;
  clockOutAt: string | null;
  status: EntryStatus;
  source: 'app' | 'manual';
  note: string;
  minutes: number | null;
  lateMinutes: number | null;
  needsReview: boolean;
  flags: string[];
  editedByName: string | null;
  editedAt: string | null;
  inPunch: PunchSummary | null;
  outPunch: PunchSummary | null;
}

// ---------------------------------------------------------------------------------------------
// Worker app

export interface WorkerShift {
  id: number;
  siteName: string;
  startsAt: string;
  endsAt: string;
  date: string;
  note: string;
  /** Attendance state of this shift from the worker's point of view. */
  state: 'upcoming' | 'now' | 'worked' | 'missed' | 'partial';
  workedMinutes: number;
}

export interface WorkerHome {
  serverTime: string;
  timezone: string;
  companyName: string;
  device: { status: DeviceStatus | 'none'; label: string | null };
  openEntry: {
    id: number;
    clockInAt: string;
    siteName: string | null;
    needsReview: boolean;
    shiftEndsAt: string | null;
  } | null;
  todayShifts: WorkerShift[];
  nextShift: WorkerShift | null;
  weekMinutes: number;
  presenceCheck: PresenceCheck | null;
  notices: string[];
}

export interface WorkerHistoryDay {
  date: string;
  minutes: number;
  entries: Array<{
    id: number;
    clockInAt: string;
    clockOutAt: string | null;
    siteName: string | null;
    status: EntryStatus;
    minutes: number | null;
    lateMinutes: number | null;
    needsReview: boolean;
  }>;
}

// ---------------------------------------------------------------------------------------------
// Manager dashboard

export type LiveStatus = 'on_site' | 'checked_out' | 'late' | 'absent' | 'upcoming' | 'missing_checkout';

export interface LiveRow {
  key: string;
  worker: { id: number; name: string; phone: string };
  shift: { id: number; startsAt: string; endsAt: string; siteId: number; siteName: string } | null;
  status: LiveStatus;
  /** Minutes late at check-in, or minutes overdue when not arrived yet. */
  lateMinutes: number | null;
  leftEarlyMinutes: number | null;
  entry: {
    id: number;
    clockInAt: string;
    clockOutAt: string | null;
    siteName: string | null;
    status: EntryStatus;
  } | null;
  location: { lat: number; lng: number; accuracy: number | null; at: string; kind: 'in' | 'out' | 'check' } | null;
  needsReview: boolean;
  flags: string[];
  selfieId: string | null;
  presence: PresenceCheck | null;
}

export interface LiveCounts {
  total: number;
  onSite: number;
  late: number;
  absent: number;
  checkedOut: number;
  upcoming: number;
  missingCheckout: number;
  lateArrivals: number;
  review: number;
}

export interface LiveResponse {
  now: string;
  date: string;
  timezone: string;
  sites: Site[];
  rows: LiveRow[];
  counts: LiveCounts;
}

export interface SecurityEvent {
  id: number;
  at: string;
  companyId: number | null;
  companyName: string | null;
  userId: number | null;
  userName: string | null;
  kind: string;
  severity: 'info' | 'warn' | 'high';
  message: string;
  details: Record<string, unknown>;
  ip: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
}

export interface ReviewQueue {
  devices: Array<Device & { userName: string; userPhone: string; currentDevice: { label: string; lastUsedAt: string | null } | null }>;
  punches: Array<PunchSummary & { workerId: number; workerName: string; workerPhone: string; entryId: number | null }>;
  incomplete: TimeEntry[];
  alerts: SecurityEvent[];
  total: number;
}

export interface ManagerOverview {
  company: Company;
  sites: Site[];
  pendingReviews: number;
}

export interface TeamMember {
  id: number;
  fullName: string;
  username: string;
  phone: string;
  employeeCode: string;
  active: boolean;
  device: { status: DeviceStatus | 'none'; label: string | null; lastUsedAt: string | null };
  lastEntry: { clockInAt: string; clockOutAt: string | null; siteName: string | null } | null;
  pushEnabled: boolean;
}

export interface TimesheetRow {
  worker: { id: number; name: string; employeeCode: string };
  scheduledMinutes: number;
  workedMinutes: number;
  daysWorked: number;
  shifts: number;
  lateCount: number;
  lateMinutes: number;
  absentCount: number;
  openIssues: number;
}

export interface TimesheetResponse {
  from: string;
  to: string;
  timezone: string;
  rows: TimesheetRow[];
  totals: { scheduledMinutes: number; workedMinutes: number; lateCount: number; absentCount: number };
}

// ---------------------------------------------------------------------------------------------
// Presence checks (manager asks a worker to prove they are still at work)

export type PresenceStatus = 'pending' | 'passed' | 'failed' | 'expired' | 'cancelled';

export interface PresenceCheck {
  id: number;
  workerId: number;
  requestedAt: string;
  expiresAt: string;
  status: PresenceStatus;
  respondedAt: string | null;
  distanceM: number | null;
  siteName: string | null;
  requestedByName: string | null;
}

// ---------------------------------------------------------------------------------------------
// Developer console

export interface HealthCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface JobRun {
  name: string;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastStatus: string | null;
  lastMessage: string;
  lastDurationMs: number | null;
  runCount: number;
  failCount: number;
  intervalMs: number;
}

export interface SystemLog {
  id: number;
  at: string;
  level: 'error' | 'warn' | 'info';
  source: string;
  message: string;
  details: Record<string, unknown>;
  resolvedAt: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  actorId: number | null;
  actorName: string;
  actorRole: string;
  companyId: number | null;
  companyName: string | null;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  details: Record<string, unknown>;
  ip: string;
}

export interface DevOverview {
  status: 'ok' | 'degraded';
  checks: HealthCheck[];
  system: {
    version: string;
    node: string;
    startedAt: string;
    uptimeSec: number;
    dbBytes: number;
    selfieBytes: number;
    diskFreeBytes: number | null;
    rssBytes: number;
    eventLoopP99Ms: number;
    env: string;
  };
  stats: {
    companies: number;
    managers: number;
    workers: number;
    sitesActive: number;
    punchesToday: { accepted: number; review: number; rejected: number };
    openEntries: number;
    pendingReviews: number;
    activeSessions: number;
    loginsFailed24h: number;
    requests24h: { total: number; errors5xx: number; errors4xx: number };
  };
  punchesByHour: Array<{ hour: string; accepted: number; review: number; rejected: number }>;
  rejectReasons24h: Array<{ reason: string; count: number }>;
  jobs: JobRun[];
  recentErrors: SystemLog[];
  recentSecurity: SecurityEvent[];
}

export interface SessionInfo {
  id: string;
  userId: number;
  userName: string;
  username: string;
  role: Role;
  companyName: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string;
  userAgent: string;
}

export interface Paged<T> {
  items: T[];
  nextCursor: number | null;
}

// ---------------------------------------------------------------------------------------------
// Human-readable explanations for punch flags (shown to managers and the developer only;
// workers never see why a punch was flagged so they cannot learn to dodge the checks).

export type FlagSeverity = 'info' | 'warn' | 'high';

export const FLAG_INFO: Record<string, { label: string; description: string; severity: FlagSeverity }> = {
  OFF_SITE_REQUEST: {
    label: 'Off-site request',
    description: 'The worker was outside the workplace and asked you to accept this anyway.',
    severity: 'warn',
  },
  DIFFERENT_SITE: {
    label: 'Different site',
    description: 'Checked in at another workplace than the one on the schedule.',
    severity: 'info',
  },
  UNSCHEDULED: { label: 'No shift', description: 'There was no scheduled shift at this time.', severity: 'info' },
  NETWORK_MATCH: {
    label: 'Workplace internet',
    description: 'The phone was connected to the workplace internet.',
    severity: 'info',
  },
  NETWORK_MISMATCH: {
    label: 'Other internet',
    description: 'The phone was not on the workplace internet connection.',
    severity: 'info',
  },
  ACCURACY_ZERO: {
    label: 'Fake GPS suspected',
    description: 'The phone reported a GPS accuracy that real GPS never reports. Typical of fake-location apps.',
    severity: 'high',
  },
  ACCURACY_TOO_PERFECT: {
    label: 'Unreal GPS precision',
    description: 'The GPS precision was better than real phones achieve.',
    severity: 'warn',
  },
  NO_JITTER: {
    label: 'Frozen location',
    description: 'Several GPS readings were exactly identical. Real GPS always moves a little.',
    severity: 'warn',
  },
  ROUND_COORDINATES: {
    label: 'Typed coordinates',
    description: 'The location has too few decimals, as if it was typed in by hand.',
    severity: 'warn',
  },
  MATCHES_SITE_CENTER: {
    label: 'Exact site pin',
    description: "The location is exactly the workplace pin. Real GPS never lands on it so precisely.",
    severity: 'high',
  },
  DUPLICATE_POSITION: {
    label: 'Same spot as a coworker',
    description: "Exactly the same coordinates as another worker's check-in today.",
    severity: 'warn',
  },
  REPEATED_POSITION: {
    label: 'Same spot as before',
    description: 'Exactly the same coordinates as one of this worker’s earlier check-ins.',
    severity: 'warn',
  },
  POSITION_JUMP: {
    label: 'Jumping location',
    description: 'The GPS readings jumped around in a way a real phone does not.',
    severity: 'warn',
  },
  IMPOSSIBLE_TRAVEL: {
    label: 'Impossible travel',
    description: 'The phone moved too far, too fast since its previous location.',
    severity: 'high',
  },
  MOVING_FAST: { label: 'In a vehicle', description: 'The phone was moving fast during the check.', severity: 'info' },
  API_TAMPERED: {
    label: 'Tampered browser',
    description: 'The location feature of the browser was replaced by an extension or script.',
    severity: 'high',
  },
  AUTOMATION: {
    label: 'Automated browser',
    description: 'The browser is being controlled by automation software.',
    severity: 'high',
  },
  EMULATED_DEVICE: {
    label: 'Fake phone',
    description: 'A computer pretending to be a phone.',
    severity: 'high',
  },
  DESKTOP_DEVICE: {
    label: 'Computer, not a phone',
    description: 'The punch came from a computer instead of a phone.',
    severity: 'warn',
  },
  CLOCK_SKEW: {
    label: 'Phone clock changed',
    description: 'The phone clock was more than 5 minutes off. The server time was used.',
    severity: 'info',
  },
  SELFIE_DUPLICATE: {
    label: 'Reused photo',
    description: 'The photo is byte-for-byte identical to an earlier one.',
    severity: 'high',
  },
  NEW_DEVICE: { label: 'New phone', description: 'First punch from a newly approved phone.', severity: 'info' },
  RAPID_RETRIES: {
    label: 'Many failed tries',
    description: 'Several rejected attempts right before this one.',
    severity: 'warn',
  },
  STALE_LOCATION: {
    label: 'Old location',
    description: 'The phone sent a location that was not fresh.',
    severity: 'warn',
  },
};

export function flagInfo(code: string) {
  return FLAG_INFO[code] ?? { label: code.replaceAll('_', ' ').toLowerCase(), description: '', severity: 'info' as const };
}

export const REJECT_REASONS: Record<string, string> = {
  OUTSIDE_GEOFENCE: 'Outside the workplace',
  LOW_ACCURACY: 'GPS not precise enough',
  STALE_LOCATION: 'Old location',
  NETWORK_REQUIRED: 'Not on workplace internet',
  NO_SHIFT: 'No shift right now',
  HIGH_RISK: 'Blocked as suspicious',
  TOO_SOON: 'Too soon after previous punch',
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  selfieMode: 'always',
  selfieRandomPercent: 30,
  maxAccuracyM: 100,
  lateGraceMin: 5,
  earlyCheckInMin: 60,
  allowUnscheduled: true,
  reviewUnscheduled: false,
  autoApproveFirstDevice: true,
  missingCheckoutAfterMin: 120,
  maxOpenHours: 14,
  photoRetentionDays: 90,
  highRiskAction: 'review',
};
