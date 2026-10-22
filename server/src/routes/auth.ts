import type { FastifyInstance, FastifyReply } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import type { LoginResponse, MeResponse } from '../../../shared/types';
import { getDummyHash, hashPassword, passwordProblem, verifyPassword } from '../auth/password';
import { completeMfa, createSession, revokeSession, revokeUserSessions, SESSION_COOKIE, sessionTtlMs } from '../auth/sessions';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../auth/totp';
import type { CompanyRow, UserRow } from '../db/rows';
import { actorOf, rateLimit, requireAuth } from '../http';
import { AppError, badRequest, forbidden, unauthorized } from '../lib/errors';
import { nowIso } from '../lib/time';
import { audit, securityEvent } from '../services/logs';
import { isLocked, toSessionUser } from '../services/users';

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

export default async function authRoutes(app: FastifyInstance) {
  const { db, config } = app.ctx;

  const setSessionCookie = (reply: FastifyReply, token: string, maxAgeMs: number) =>
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(maxAgeMs / 1000),
    });

  const companyOf = (user: UserRow) =>
    user.company_id
      ? ((db.prepare('SELECT * FROM companies WHERE id = ?').get(user.company_id) as CompanyRow | undefined) ?? null)
      : null;

  app.post('/api/auth/login', async (req, reply): Promise<LoginResponse> => {
    const body = loginSchema.parse(req.body);
    const username = body.username.toLowerCase();
    rateLimit(req, `login-ip:${req.ip}`, 30, 15 * 60_000);
    rateLimit(req, `login-user:${username}`, 10, 15 * 60_000);

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
    const invalid = () => new AppError(401, 'INVALID_CREDENTIALS', 'Wrong username or password.');
    if (!user) {
      await verifyPassword(body.password, await getDummyHash());
      securityEvent(db, { kind: 'login_failed', severity: 'info', message: `Sign-in with unknown username "${username}"`, ip: req.ip });
      throw invalid();
    }
    if (isLocked(user)) {
      const minutes = Math.max(1, Math.ceil((Date.parse(user.locked_until!) - Date.now()) / 60_000));
      throw new AppError(429, 'ACCOUNT_LOCKED', `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }
    if (!(await verifyPassword(body.password, user.password_hash))) {
      const failed = user.failed_logins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(
        lock ? 0 : failed,
        lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : user.locked_until,
        user.id,
      );
      securityEvent(db, {
        companyId: user.company_id,
        userId: user.id,
        kind: lock ? 'account_locked' : 'login_failed',
        severity: lock ? 'warn' : 'info',
        message: lock
          ? `${user.full_name}'s account was locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED_LOGINS} wrong passwords.`
          : `Wrong password for ${user.full_name}.`,
        ip: req.ip,
      });
      throw invalid();
    }
    if (!user.active) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is turned off. Contact your manager.');
    const company = companyOf(user);
    if (company && !company.active && user.role !== 'developer') {
      throw new AppError(403, 'COMPANY_INACTIVE', 'This company account is not active. Contact the app owner.');
    }

    db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ?, last_seen_at = ? WHERE id = ?').run(
      nowIso(),
      nowIso(),
      user.id,
    );
    const mfa = !!user.totp_enabled;
    const session = createSession(db, user, req.ip, req.headers['user-agent'] ?? '', mfa);
    setSessionCookie(reply, session.token, mfa ? 10 * 60_000 : sessionTtlMs(user.role));
    if (mfa) return { needsTotp: true };
    return { user: toSessionUser(user, company) };
  });

  app.post('/api/auth/totp', async (req, reply): Promise<LoginResponse> => {
    const { code } = z.object({ code: z.string().max(20) }).parse(req.body);
    const auth = req.auth;
    if (!auth || !auth.session.mfa_pending) throw unauthorized();
    rateLimit(req, `totp:${auth.session.id}`, 6, 10 * 60_000, 'Too many wrong codes. Sign in again in a few minutes.');
    const step = auth.user.totp_secret ? verifyTotp(auth.user.totp_secret, code, auth.user.totp_last_step) : null;
    if (step === null) throw new AppError(401, 'INVALID_CODE', 'That code is not right. Use the current code from your app.');
    db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, auth.user.id);
    completeMfa(db, auth.session, auth.user);
    // Re-send the cookie with the full lifetime (the pending one expires in minutes).
    const token = req.cookies[SESSION_COOKIE]!;
    setSessionCookie(reply, token, sessionTtlMs(auth.user.role));
    return { user: toSessionUser(auth.user, auth.company) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) revokeSession(db, req.auth.session.id);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req): Promise<MeResponse> => {
    const auth = requireAuth(req, { allowPasswordChange: true });
    return { user: toSessionUser(auth.user, auth.company) };
  });

  app.post('/api/auth/change-password', async (req) => {
    const auth = requireAuth(req, { allowPasswordChange: true });
    const body = z.object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) }).parse(req.body);
    rateLimit(req, `pwchange:${auth.user.id}`, 10, 15 * 60_000);
    if (!(await verifyPassword(body.currentPassword, auth.user.password_hash))) {
      throw badRequest('Your current password is not right.', 'WRONG_PASSWORD');
    }
    const problem = passwordProblem(body.newPassword, auth.user.username);
    if (problem) throw badRequest(problem, 'WEAK_PASSWORD');
    if (body.newPassword === body.currentPassword) throw badRequest('Choose a password you have not used here before.', 'WEAK_PASSWORD');
    db.prepare(
      'UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ?',
    ).run(await hashPassword(body.newPassword), nowIso(), nowIso(), auth.user.id);
    revokeUserSessions(db, auth.user.id, auth.session.id);
    audit(db, actorOf(req), 'user.change_password', {
      companyId: auth.user.company_id,
      entity: 'user',
      entityId: auth.user.id,
      summary: `${auth.user.full_name} changed their password`,
    });
    return { ok: true };
  });

  // Two-factor sign-in (authenticator app) — offered to managers and the developer.
  app.post('/api/auth/totp/setup', async (req) => {
    const auth = requireAuth(req);
    if (auth.user.role === 'worker') throw forbidden();
    if (auth.user.totp_enabled) throw badRequest('Two-step sign-in is already on.');
    const secret = generateTotpSecret();
    db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, auth.user.id);
    const url = otpauthUrl(secret, auth.user.username, config.appName);
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return { secret, otpauthUrl: url, qrSvg };
  });

  app.post('/api/auth/totp/enable', async (req) => {
    const auth = requireAuth(req);
    const { code } = z.object({ code: z.string().max(20) }).parse(req.body);
    rateLimit(req, `totp-enable:${auth.user.id}`, 10, 10 * 60_000);
    if (!auth.user.totp_secret || auth.user.totp_enabled) throw badRequest('Start the setup again.');
    const step = verifyTotp(auth.user.totp_secret, code, null);
    if (step === null) throw badRequest('That code is not right. Check the time on your phone and try again.', 'INVALID_CODE');
    db.prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?').run(step, auth.user.id);
    audit(db, actorOf(req), 'user.totp_enable', {
      companyId: auth.user.company_id,
      entity: 'user',
      entityId: auth.user.id,
      summary: `${auth.user.full_name} turned on two-step sign-in`,
    });
    return { ok: true };
  });

  app.post('/api/auth/totp/disable', async (req) => {
    const auth = requireAuth(req);
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
    rateLimit(req, `totp-disable:${auth.user.id}`, 10, 15 * 60_000);
    if (!(await verifyPassword(password, auth.user.password_hash))) throw badRequest('Your password is not right.', 'WRONG_PASSWORD');
    db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL WHERE id = ?').run(auth.user.id);
    audit(db, actorOf(req), 'user.totp_disable', {
      companyId: auth.user.company_id,
      entity: 'user',
      entityId: auth.user.id,
      summary: `${auth.user.full_name} turned off two-step sign-in`,
    });
    return { ok: true };
  });
}
