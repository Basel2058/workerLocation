import type { Translation } from '../../../../shared/i18n';
import type { auth as en } from '../en/auth';

export const auth: Translation<typeof en> = {
  signIn: {
    title: 'התחברות',
    subtitle: 'עם שם המשתמש והסיסמה שקיבלת.',
    username: 'שם משתמש',
    password: 'סיסמה',
    submit: 'התחברות',
    forgot: 'שכחת את הסיסמה? המנהל יכול לאפס אותה.',
  },
  code: {
    title: 'אימות דו-שלבי',
    subtitle: 'יש להזין את הקוד בן 6 הספרות מאפליקציית האימות.',
    label: 'קוד אימות',
    verify: 'אימות',
    otherAccount: 'התחברות לחשבון אחר',
  },
  changePassword: {
    current: 'הסיסמה הנוכחית',
    new: 'סיסמה חדשה',
    newHint: 'לפחות 8 תווים. משפט קצר קל לזכור.',
    repeat: 'אימות הסיסמה החדשה',
    mismatch: 'הסיסמאות לא תואמות.',
    submit: 'שמירת הסיסמה החדשה',
  },
  forceChange: {
    title: 'בחירת סיסמה',
    subtitle: 'יש להחליף את הסיסמה הזמנית בסיסמה אישית שרק לך ידועה.',
    submit: 'שמירה והמשך',
    signOut: 'התנתקות',
  },
};
