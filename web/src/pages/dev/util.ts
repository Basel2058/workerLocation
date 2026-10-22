import { t } from '../../lib/i18n';

/** "iPhone · Safari" style label from a user agent string (for lists of sessions and check-ins). */
export function deviceLabelShort(ua: string): string {
  if (!ua) return t('dev.device.unknown');
  let device = t('dev.device.computer');
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android/.test(ua)) device = 'Android';
  else if (/Windows/.test(ua)) device = 'Windows';
  else if (/Macintosh/.test(ua)) device = 'Mac';
  else if (/Linux/.test(ua)) device = 'Linux';
  let browser = '';
  if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/EdgA?\/|EdgiOS/.test(ua)) browser = 'Edge';
  else if (/FxiOS|Firefox\//.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return browser ? `${device} · ${browser}` : device;
}

/** A role in the app language. The change history also has 'system' for changes made by the app itself. */
export function roleLabel(role: string): string {
  switch (role) {
    case 'developer':
    case 'manager':
    case 'worker':
      return t(`common.roles.${role}`);
    case 'system':
      return t('dev.audit.system');
    default:
      return role;
  }
}
