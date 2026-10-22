import type { Translation } from '../../../../shared/i18n';
import type { flags as en, rejectReasons as enReasons } from '../en/flags';

export const flags: Translation<typeof en> = {
  OFF_SITE_REQUEST: {
    label: 'בקשה מחוץ לאתר',
    description: 'העובד היה מחוץ למקום העבודה וביקש לאשר את הדיווח בכל זאת.',
  },
  DIFFERENT_SITE: { label: 'אתר אחר', description: 'הכניסה נרשמה באתר אחר מזה שבסידור העבודה.' },
  UNSCHEDULED: { label: 'ללא משמרת', description: 'לא הייתה משמרת מתוכננת בשעה הזו.' },
  NETWORK_MATCH: { label: 'האינטרנט של מקום העבודה', description: 'הטלפון היה מחובר לאינטרנט של מקום העבודה.' },
  NETWORK_MISMATCH: { label: 'אינטרנט אחר', description: 'הטלפון לא היה מחובר לאינטרנט של מקום העבודה.' },
  ACCURACY_ZERO: {
    label: 'חשד ל-GPS מזויף',
    description: 'הטלפון דיווח על דיוק GPS ש-GPS אמיתי אף פעם לא מדווח. אופייני לאפליקציות לזיוף מיקום.',
  },
  ACCURACY_TOO_PERFECT: { label: 'דיוק GPS לא מציאותי', description: 'דיוק ה-GPS היה טוב יותר ממה שטלפונים אמיתיים מסוגלים.' },
  NO_JITTER: { label: 'מיקום קפוא', description: 'כמה קריאות GPS היו זהות לחלוטין. GPS אמיתי תמיד זז מעט.' },
  ROUND_COORDINATES: { label: 'קואורדינטות מוקלדות', description: 'במיקום יש מעט מדי ספרות אחרי הנקודה, כאילו הוקלד ידנית.' },
  MATCHES_SITE_CENTER: {
    label: 'בדיוק על נעץ האתר',
    description: 'המיקום הוא בדיוק הנעץ של מקום העבודה. GPS אמיתי אף פעם לא נוחת עליו בדיוק כזה.',
  },
  DUPLICATE_POSITION: { label: 'אותה נקודה כמו עובד אחר', description: 'בדיוק אותן קואורדינטות כמו בדיווח של עובד אחר היום.' },
  REPEATED_POSITION: { label: 'אותה נקודה כמו בעבר', description: 'בדיוק אותן קואורדינטות כמו באחד הדיווחים הקודמים של העובד.' },
  POSITION_JUMP: { label: 'מיקום קופץ', description: 'קריאות ה-GPS קפצו באופן שטלפון אמיתי לא עושה.' },
  IMPOSSIBLE_TRAVEL: { label: 'מעבר בלתי אפשרי', description: 'הטלפון עבר מרחק גדול מדי, מהר מדי, מאז המיקום הקודם.' },
  MOVING_FAST: { label: 'ברכב', description: 'הטלפון נע במהירות בזמן הבדיקה.' },
  API_TAMPERED: { label: 'דפדפן שעבר שינוי', description: 'תכונת המיקום של הדפדפן הוחלפה על ידי תוסף או סקריפט.' },
  AUTOMATION: { label: 'דפדפן אוטומטי', description: 'הדפדפן נשלט על ידי תוכנת אוטומציה.' },
  EMULATED_DEVICE: { label: 'טלפון מזויף', description: 'מחשב שמתחזה לטלפון.' },
  DESKTOP_DEVICE: { label: 'מחשב, לא טלפון', description: 'הדיווח נשלח ממחשב ולא מטלפון.' },
  CLOCK_SKEW: { label: 'שעון הטלפון שונה', description: 'שעון הטלפון סטה ביותר מ-5 דקות, ולכן נעשה שימוש בשעון השרת.' },
  SELFIE_DUPLICATE: { label: 'תמונה ממוחזרת', description: 'התמונה זהה לחלוטין לתמונה קודמת.' },
  NEW_DEVICE: { label: 'טלפון חדש', description: 'דיווח ראשון מטלפון שאושר לאחרונה.' },
  RAPID_RETRIES: { label: 'הרבה ניסיונות כושלים', description: 'כמה ניסיונות שנדחו ממש לפני הדיווח הזה.' },
  STALE_LOCATION: { label: 'מיקום ישן', description: 'הטלפון שלח מיקום שאינו עדכני.' },
};

export const rejectReasons: Translation<typeof enReasons> = {
  OUTSIDE_GEOFENCE: 'מחוץ למקום העבודה',
  LOW_ACCURACY: 'ה-GPS לא מדויק מספיק',
  STALE_LOCATION: 'מיקום ישן',
  NO_LOCATION: 'אין מיקום',
  NETWORK_REQUIRED: 'לא מחובר לאינטרנט של מקום העבודה',
  NO_SHIFT: 'אין משמרת כרגע',
  NO_SITES: 'לא הוגדר מקום עבודה',
  HIGH_RISK: 'נחסם כחשוד',
  TOO_SOON: 'מוקדם מדי אחרי הדיווח הקודם',
  rejected: 'נדחה',
};
