// Maintenance commands for the platform owner, run on the server:
//   npm run cli -- create-developer <username> [password]
//   npm run cli -- reset-password <username> [password]
//   npm run cli -- unlock <username>
// In the Docker image: docker compose exec app node dist/server/cli.js <command> ...
import { hashPassword, passwordProblem } from './auth/password';
import { revokeUserSessions } from './auth/sessions';
import { loadConfig } from './config';
import { openDatabase } from './db';
import type { UserRow } from './db/rows';
import { generatePassword } from './lib/crypto';
import { nowIso } from './lib/time';
import { audit } from './services/logs';

const CLI_ACTOR = { id: null, name: 'Server console', role: 'system' };

async function main() {
  const [command, username, givenPassword] = process.argv.slice(2);
  if (!command || !username) {
    console.log('Usage: cli <create-developer|reset-password|unlock> <username> [password]');
    process.exit(1);
  }
  const db = openDatabase(loadConfig().dbFile);
  const name = username.toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(name) as UserRow | undefined;

  if (command === 'create-developer') {
    if (user) throw new Error(`User ${name} already exists.`);
    const password = givenPassword ?? generatePassword();
    const problem = passwordProblem(password, name);
    if (problem) throw new Error(problem);
    const now = nowIso();
    db.prepare(
      `INSERT INTO users (company_id, role, username, password_hash, full_name, must_change_password, password_changed_at, created_at, updated_at)
       VALUES (NULL, 'developer', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(name, await hashPassword(password), name, givenPassword ? 0 : 1, now, now, now);
    audit(db, CLI_ACTOR, 'user.create', { entity: 'user', summary: `Created developer ${name} from the server console` });
    console.log(`Developer "${name}" created. Password: ${password}`);
  } else if (command === 'reset-password') {
    if (!user) throw new Error(`No user ${name}.`);
    const password = givenPassword ?? generatePassword();
    const problem = passwordProblem(password, name);
    if (problem) throw new Error(problem);
    db.prepare(
      'UPDATE users SET password_hash = ?, must_change_password = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
    ).run(await hashPassword(password), givenPassword ? 0 : 1, nowIso(), user.id);
    revokeUserSessions(db, user.id);
    audit(db, CLI_ACTOR, 'user.reset_password', { companyId: user.company_id, entity: 'user', entityId: user.id, summary: `Reset password of ${name} from the server console` });
    console.log(`Password of "${name}" reset. New password: ${password}`);
  } else if (command === 'unlock') {
    if (!user) throw new Error(`No user ${name}.`);
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, active = 1 WHERE id = ?').run(user.id);
    audit(db, CLI_ACTOR, 'user.unlock', { companyId: user.company_id, entity: 'user', entityId: user.id, summary: `Unlocked ${name} from the server console` });
    console.log(`"${name}" unlocked.`);
  } else {
    throw new Error(`Unknown command ${command}`);
  }
  db.close();
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
