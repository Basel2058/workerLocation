import type { Translation } from '../../../../shared/i18n';
import type { ui as en } from '../en/ui';

export const ui: Translation<typeof en> = {
  dialog: {
    typeToConfirm: 'לאישור, יש להקליד {text}.',
  },
  shell: {
    mainNav: 'ניווט ראשי',
    account: 'חשבון',
    accountSettings: 'הגדרות חשבון',
    signOut: 'התנתקות',
    more: 'עוד',
  },
  map: {
    label: 'מפה',
  },
  password: {
    show: 'הצגת הסיסמה',
    hide: 'הסתרת הסיסמה',
  },
  notifications: {
    title: 'התראות',
    iphoneHint: 'כדי לקבל התראות באייפון, יש להוסיף את האפליקציה למסך הבית.',
    unsupported: 'הדפדפן הזה לא יכול להציג התראות.',
    blocked: 'ההתראות חסומות. יש לאפשר אותן לאפליקציה בהגדרות הטלפון.',
    enabled: 'ההתראות הופעלו',
  },
  errors: {
    network: 'אין חיבור לשרת. יש לבדוק את החיבור לאינטרנט ולנסות שוב.',
    server: 'אירעה תקלה בשרת. כדאי לנסות שוב.',
    failed: 'הבקשה נכשלה.',
    download: 'ההורדה נכשלה.',
  },
  language: {
    label: 'שפה',
    choose: 'בחירת שפה',
    hint: 'האפליקציה, ההודעות וההתראות יוצגו בשפה הזו.',
  },
  badge: {
    overflow: '99+',
  },
};
