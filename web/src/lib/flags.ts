import { FLAG_INFO, type FlagSeverity } from '../../../shared/types';
import en from '../i18n/en';
import { t, type MsgKey } from './i18n';

/** A punch flag in the app's language: what it means and how serious it is. */
export function flagInfo(code: string): { label: string; description: string; severity: FlagSeverity } {
  const severity = FLAG_INFO[code]?.severity ?? 'info';
  if (!(code in en.flags)) return { label: code.replaceAll('_', ' ').toLowerCase(), description: '', severity };
  return {
    label: t(`flags.${code}.label` as MsgKey),
    description: t(`flags.${code}.description` as MsgKey),
    severity,
  };
}

/** Why a punch was refused, in the app's language. */
export function rejectReason(code: string | null | undefined): string {
  return code && code in en.rejectReasons ? t(`rejectReasons.${code}` as MsgKey) : t('rejectReasons.rejected');
}
