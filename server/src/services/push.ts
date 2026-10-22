import webpush from 'web-push';
import { isLocale, type Locale } from '../../../shared/i18n';
import type { AppConfig } from '../config';
import { getSetting, parseJson, setSetting, type DB } from '../db';
import { trMsg, type Msg } from '../i18n';
import { nowIso } from '../lib/time';
import { systemLog } from './logs';

/** Title and body are translated for each recipient (their language, else their company's). */
export interface PushMessage {
  title: Msg;
  body: Msg;
  /** Page to open when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other on the phone. */
  tag?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushService {
  publicKey: string | null;
  subscribe(userId: number, sub: PushSubscriptionInput, userAgent: string): void;
  unsubscribe(userId: number, endpoint: string): void;
  hasSubscription(userId: number): boolean;
  /** Fire-and-forget delivery to every phone of a user. */
  notifyUser(userId: number, message: PushMessage): void;
  /** Fire-and-forget delivery to all managers of a company. */
  notifyManagers(companyId: number, message: PushMessage): void;
}

interface SubscriptionRow {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: string | null;
  company_settings: string | null;
}

// Subscriptions with the recipient's language (or their company's default language).
const SUBSCRIPTION_SELECT = `
  SELECT ps.*, u.locale, c.settings AS company_settings
  FROM push_subscriptions ps
  JOIN users u ON u.id = ps.user_id
  LEFT JOIN companies c ON c.id = u.company_id`;

function recipientLocale(row: SubscriptionRow): Locale {
  if (isLocale(row.locale)) return row.locale;
  const companyLanguage = parseJson<{ language?: string }>(row.company_settings ?? '{}', {}).language;
  return isLocale(companyLanguage) ? companyLanguage : 'en';
}

/** Web Push with VAPID keys generated on first start and kept in the database. */
export function createPushService(db: DB, config: AppConfig): PushService {
  const keys = (() => {
    const stored = getSetting(db, 'vapid_keys');
    if (stored) return JSON.parse(stored) as { publicKey: string; privateKey: string };
    const generated = webpush.generateVAPIDKeys();
    setSetting(db, 'vapid_keys', JSON.stringify(generated));
    return generated;
  })();
  const deliver = config.env !== 'test';

  async function send(rows: SubscriptionRow[], message: PushMessage): Promise<void> {
    await Promise.all(
      rows.map(async (row) => {
        const locale = recipientLocale(row);
        const payload = JSON.stringify({ ...message, title: trMsg(message.title, locale), body: trMsg(message.body, locale) });
        try {
          await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, {
            TTL: 15 * 60,
            urgency: 'high',
            vapidDetails: { subject: config.pushSubject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          });
          db.prepare('UPDATE push_subscriptions SET last_success_at = ?, failures = 0 WHERE id = ?').run(nowIso(), row.id);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
          } else {
            db.prepare('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?').run(row.id);
            db.prepare('DELETE FROM push_subscriptions WHERE id = ? AND failures >= 10').run(row.id);
            systemLog(db, 'warn', 'push', 'Push notification failed', { status, message: String((err as Error).message) });
          }
        }
      }),
    );
  }

  const dispatch = (rows: SubscriptionRow[], message: PushMessage) => {
    if (!deliver || rows.length === 0) return;
    send(rows, message).catch((err) => systemLog(db, 'error', 'push', 'Push dispatch crashed', { error: String(err) }));
  };

  return {
    get publicKey() {
      return keys.publicKey;
    },
    subscribe(userId, sub, userAgent) {
      db.prepare(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
           user_agent = excluded.user_agent, failures = 0`,
      ).run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent.slice(0, 400), nowIso());
    },
    unsubscribe(userId, endpoint) {
      db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
    },
    hasSubscription(userId) {
      return !!db.prepare('SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1').get(userId);
    },
    notifyUser(userId, message) {
      dispatch(db.prepare(`${SUBSCRIPTION_SELECT} WHERE ps.user_id = ?`).all(userId) as SubscriptionRow[], message);
    },
    notifyManagers(companyId, message) {
      dispatch(
        db
          .prepare(`${SUBSCRIPTION_SELECT} WHERE u.company_id = ? AND u.role = 'manager' AND u.active = 1`)
          .all(companyId) as SubscriptionRow[],
        message,
      );
    },
  };
}
