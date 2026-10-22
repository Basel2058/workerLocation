/** "iPhone · Safari" style label from a user agent string (for lists of sessions and check-ins). */
export function deviceLabelShort(ua: string): string {
  if (!ua) return 'Unknown device';
  let device = 'Computer';
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
