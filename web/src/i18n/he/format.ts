import type { Translation } from '../../../../shared/i18n';
import type { format as en } from '../en/format';

export const format: Translation<typeof en> = {
  duration: {
    hm: '{h} ש׳ {m} ד׳',
    h: '{h} ש׳',
    m: '{m} ד׳',
    dh: '{d} ימ׳ {h} ש׳',
  },
  justNow: 'הרגע',
  greeting: {
    morning: 'בוקר טוב, {name}',
    afternoon: 'צהריים טובים, {name}',
    evening: 'ערב טוב, {name}',
  },
};
