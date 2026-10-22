import { p } from '../../../shared/i18n';
import type { Dict } from '.';

// English needs entries only where a message has plural forms; everything else is the key itself.
const en: Dict = {
  'Too many attempts. Try again in {count} seconds.': p({
    one: 'Too many attempts. Try again in {count} second.',
    other: 'Too many attempts. Try again in {count} seconds.',
  }),
  'Too many attempts. Try again in {count} minutes.': p({
    one: 'Too many attempts. Try again in {count} minute.',
    other: 'Too many attempts. Try again in {count} minutes.',
  }),
  'Too many wrong passwords. Try again in {count} minutes.': p({
    one: 'Too many wrong passwords. Try again in {count} minute.',
    other: 'Too many wrong passwords. Try again in {count} minutes.',
  }),
  'Choose at most {count} days.': p({ one: 'Choose at most {count} day.', other: 'Choose at most {count} days.' }),
  '{name} had {count} failed check-in attempts in 15 minutes.': p({
    one: '{name} had {count} failed check-in attempt in 15 minutes.',
    other: '{name} had {count} failed check-in attempts in 15 minutes.',
  }),
  '{name} had {count} failed check-out attempts in 15 minutes.': p({
    one: '{name} had {count} failed check-out attempt in 15 minutes.',
    other: '{name} had {count} failed check-out attempts in 15 minutes.',
  }),
  'Created {count} shifts at {site} ({from}–{to})': p({
    one: 'Created {count} shift at {site} ({from}–{to})',
    other: 'Created {count} shifts at {site} ({from}–{to})',
  }),
};
export default en;
