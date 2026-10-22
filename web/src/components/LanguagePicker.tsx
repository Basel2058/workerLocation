import { useQueryClient } from '@tanstack/react-query';
import { Languages } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { isLocale, LOCALE_INFO, LOCALES, type Locale } from '../../../shared/i18n';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { t, useI18n } from '../lib/i18n';
import { cx, Select } from './ui';

const PICKED_KEY = 'onsite.langPicked';

/** Switches the app language and, when signed in, remembers it on the account (for notifications too). */
export function useChangeLanguage() {
  const { setLocale } = useI18n();
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();
  return async (next: Locale) => {
    await setLocale(next);
    // Server texts (check-in results, alerts, history) come back in the new language.
    void queryClient.invalidateQueries();
    if (user) {
      await post('/api/auth/locale', { locale: next }).catch(() => undefined);
      void refresh();
    } else {
      try {
        sessionStorage.setItem(PICKED_KEY, next);
      } catch {
        // The choice still applies on this device.
      }
    }
  };
}

/**
 * After sign-in: use the account's language, unless the person just picked one on the sign-in screen
 * (or never chose one), in which case the account remembers the current language.
 */
export function LocaleSync() {
  const { user } = useAuth();
  const { locale, setLocale } = useI18n();
  const syncedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!user) {
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === user.id) return;
    syncedFor.current = user.id;
    let picked: string | null = null;
    try {
      picked = sessionStorage.getItem(PICKED_KEY);
      sessionStorage.removeItem(PICKED_KEY);
    } catch {
      // Ignore.
    }
    if ((isLocale(picked) || !user.locale) && user.locale !== locale) {
      void post('/api/auth/locale', { locale }).catch(() => undefined);
    } else if (user.locale && user.locale !== locale) {
      void setLocale(user.locale);
    }
  }, [user, locale, setLocale]);
  return null;
}

/** A native select: the phone's own picker is the easiest to use. */
export function LanguageSelect({ id, className }: { id?: string; className?: string }) {
  const { locale } = useI18n();
  const change = useChangeLanguage();
  return (
    <Select id={id} className={className} value={locale} onChange={(e) => void change(e.target.value as Locale)}>
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_INFO[l].name}
        </option>
      ))}
    </Select>
  );
}

/** Small globe button with the language name, for the sign-in screen. */
export function LanguageButton({ className }: { className?: string }) {
  const { locale } = useI18n();
  const change = useChangeLanguage();
  return (
    <label
      className={cx(
        'relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-surface/80 px-3 text-[13px] font-medium text-ink-2 ring-1 ring-line backdrop-blur hover:text-ink',
        className,
      )}
    >
      <Languages className="size-4" aria-hidden />
      <span>{LOCALE_INFO[locale].name}</span>
      <select
        aria-label={t('ui.language.choose')}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={locale}
        onChange={(e) => void change(e.target.value as Locale)}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_INFO[l].name}
          </option>
        ))}
      </select>
    </label>
  );
}
