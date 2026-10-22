import type { Translation } from '../../../../shared/i18n';
import type { format as en } from '../en/format';

export const format: Translation<typeof en> = {
  duration: {
    hm: '{h} س {m} د',
    h: '{h} س',
    m: '{m} د',
    dh: '{d} ي {h} س',
  },
  justNow: 'الآن',
  greeting: {
    morning: 'صباح الخير، {name}',
    afternoon: 'مساء الخير، {name}',
    evening: 'مساء الخير، {name}',
  },
};
