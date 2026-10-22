import { hashPassword } from './auth/password';
import type { AppConfig } from './config';
import type { DB } from './db';
import { msg } from './i18n';
import { generatePassword } from './lib/crypto';
import { nowIso } from './lib/time';
import { audit, SYSTEM_ACTOR } from './services/logs';

/**
 * Creates the first developer (platform owner) account on a fresh install. Uses BOOTSTRAP_DEV_USERNAME /
 * BOOTSTRAP_DEV_PASSWORD when set; otherwise prints a one-time random password that must be changed.
 */
export async function ensureDeveloper(db: DB, config: AppConfig, log: (msg: string) => void): Promise<void> {
  const exists = db.prepare("SELECT 1 FROM users WHERE role = 'developer' LIMIT 1").get();
  if (exists) return;
  const username = config.bootstrapDeveloper.username.trim().toLowerCase() || 'developer';
  const provided = config.bootstrapDeveloper.password;
  const password = provided && provided.length >= 8 ? provided : generatePassword();
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (company_id, role, username, password_hash, full_name, must_change_password, password_changed_at, created_at, updated_at)
     VALUES (NULL, 'developer', ?, ?, 'Developer', ?, ?, ?, ?)`,
  ).run(username, await hashPassword(password), provided ? 0 : 1, now, now, now);
  audit(db, SYSTEM_ACTOR, 'user.bootstrap', { entity: 'user', summary: msg('Created the first owner account “{username}”', { username }) });
  if (!provided) {
    log(
      [
        '',
        '================================================================',
        '  First start: a developer account was created.',
        `  Username: ${username}`,
        `  Password: ${password}`,
        '  You will be asked to choose a new password after signing in.',
        '================================================================',
        '',
      ].join('\n'),
    );
  } else {
    log(`Created developer account "${username}" from BOOTSTRAP_DEV_* settings.`);
  }
}
