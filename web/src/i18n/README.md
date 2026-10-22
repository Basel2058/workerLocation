# Translations

The app speaks **English**, **Arabic** and **Hebrew**. English (`en/`) is the source of every key and the fallback;
`ar/` and `he/` must have exactly the same keys (TypeScript checks this). Arabic and Hebrew are loaded only when used.

| Folder file | Screens |
|---|---|
| `common.ts` | Words used everywhere (Save, Cancel, Today, roles…) |
| `ui.ts` | Shared components, client errors, language picker |
| `auth.ts` | Sign-in, two-step code, password screens |
| `format.ts` | Durations, greetings (used by `lib/format.ts`) |
| `flags.ts` | Why a check-in was flagged or refused (managers/owner only) |
| `worker.ts` | Worker app (`pages/worker`, `lib/geo.ts`, `lib/camera.ts`, `lib/device.ts`, `lib/pwa.ts`) |
| `manager.ts` | Manager dashboard (`pages/manager`) |
| `dev.ts` | Owner console (`pages/dev`, `pages/Account.tsx`) |

Server texts (errors, check-in results, alerts, change history, notifications, CSV headers) are translated on the
server (`server/src/i18n`) using the `x-lang` header the app sends — show them as they come.

## Using messages

```tsx
import { t, tRich } from '../../lib/i18n';
import { p } from '../../../../shared/i18n';

// en/worker.ts
export const worker = {
  home: {
    checkIn: 'Check in',
    shiftStarts: 'Shift starts at {time} (in {wait}).',
    workers: p({ one: '{count} worker', other: '{count} workers' }),
  },
};

t('worker.home.checkIn');
t('worker.home.shiftStarts', { time: fmtTime(iso, tz), wait: fmtDuration(min) });
t('worker.home.workers', { count: 3 });              // plural form picked per language
tRich('dev.people.typeName', { name: <b>{name}</b> }); // React elements in placeholders
```

- Call `t()` while rendering or in handlers — **never at module level** (the language can change at runtime). Arrays of
  options/labels must be built inside the component (or a function).
- Whole sentences only. Never glue translated pieces together (`t('a') + ' ' + name + t('b')`); use one message with
  placeholders. Word order differs between languages.
- Plurals: English needs `one`/`other`. Arabic should give `zero`, `one`, `two`, `few`, `many`, `other`; Hebrew `one`,
  `two`, `other`. `zero` may be used in any language for an exact 0 ("No workers yet").
- Dates, times, durations, distances and numbers: only through `lib/format.ts` (`fmtTime`, `fmtDay`, `fmtDuration`,
  `fmtDistance`, `fmtNumber`, `fmtRelative`…). They follow the app language. Arabic uses Western digits (0-9).
- Time ranges: `t('common.range', { from, to })`; "from → to": `t('common.arrow', { from, to })` (RTL points ←).
- Keep `{placeholders}` exactly as in English. Keep brand and technical words as they are: OnSite, GPS, Wi-Fi,
  WhatsApp, CSV, iPhone, Android, Chrome, Safari, IP.
- Server data (names, workplace names, notes, device labels) is shown as is, never translated.

## Right-to-left

- Use logical classes: `ms-/me-`, `ps-/pe-`, `start-/end-`, `text-start/text-end`, `border-s/border-e`,
  `rounded-s/rounded-e`. Never `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right` (centering with `left-1/2
  -translate-x-1/2` is fine).
- Arrows and chevrons (`ArrowLeft/Right`, `ChevronLeft/Right`, `LogIn/LogOut`, `Send`…) are mirrored automatically.
- Phone numbers, usernames, codes, IP addresses, coordinates, emails inside text: wrap in `<Ltr>` (from
  `components/ui`). Inputs for such values get `dir="ltr" className="rtl:text-right"`.
- `transform`/`translate-x` and absolutely positioned decorations need an `rtl:` variant.
- Maps (Leaflet) and the owner's charts stay left-to-right.

## Writing style

Short, friendly, plain words — many workers are not technical, and some read slowly. Address the reader directly but
keep **gender-neutral** forms:

- **Arabic** (Modern Standard, simple): buttons are verbal nouns (حفظ، إلغاء، تسجيل الحضور). Instructions with
  «يرجى + مصدر» (يرجى التوجه إلى موقع العمل). Past-tense "you" is fine undiacritized (سجلت). Avoid diacritics except
  where needed. Arabic punctuation: «،» «؟» «؛».
- **Hebrew**: buttons are nouns (שמירה, ביטול, כניסה). Instructions with «יש + infinitive» (יש להגיע למקום העבודה),
  or impersonal/plural forms. Past-tense "you" is fine (שכחת, קיבלת). Avoid present-tense forms that mark gender
  (אתה צריך / את צריכה) and slashes (עובד/ת). Use ׳ and ״ for abbreviations (ש׳, ק״מ).

## Glossary

| English | Arabic | Hebrew |
|---|---|---|
| Check in (button) | تسجيل الحضور | כניסה |
| Check out (button) | تسجيل الانصراف | יציאה |
| Checked in | تم تسجيل الحضور | נרשמה כניסה |
| Checked out | تم تسجيل الانصراف | נרשמה יציאה |
| check-in / punch (a record) | تسجيل (تسجيلات) | דיווח (דיווחים) |
| On site | في الموقع | באתר |
| Not arrived | لم يصل | טרם הגיעו (group) / ללא כניסה |
| Late | متأخر / تأخير | איחור / באיחור |
| Absent | غائب / غياب | היעדרות |
| Forgot to check out / missing check-out | لم يسجّل الانصراف | חסרה יציאה |
| Coming later | يبدأ لاحقًا | מתחילים מאוחר יותר |
| Shift | وردية (ورديات) | משמרת (משמרות) |
| Workplace / site | موقع العمل (مواقع العمل) | מקום העבודה / אתר (אתרים) |
| Location (GPS position) | الموقع الجغرافي / موقعك | מיקום |
| Worker | عامل (عمال) | עובד (עובדים) |
| Manager | مدير (مدراء) | מנהל (מנהלים) |
| Owner (app owner, developer role) | المالك | בעלים |
| Owner console | إدارة النظام | ניהול המערכת |
| Company | شركة | חברה |
| Account | حساب | חשבון |
| Username / Password | اسم المستخدم / كلمة المرور | שם משתמש / סיסמה |
| Sign in / Sign out | تسجيل الدخول / تسجيل الخروج | התחברות / התנתקות |
| Phone (the device) / This phone | الهاتف / هذا الهاتف | הטלפון / הטלפון הזה |
| Phone number | رقم الهاتف | מספר טלפון |
| Photo / selfie | صورة / صورة سيلفي | תמונה / סלפי |
| Request (to the manager) | طلب (طلبات) | בקשה (בקשות) |
| Approve / Accept / Reject | موافقة / قبول / رفض | אישור / אישור / דחייה |
| Presence check | تأكيد التواجد | בדיקת נוכחות |
| Today (manager tab "Live") | اليوم | היום |
| Requests (tab) | الطلبات | בקשות |
| Schedule (tab) | الجدول / جدول الورديات | סידור עבודה (tab: סידור) |
| Hours (tab) / Timesheet | الساعات / كشف الساعات | שעות / דוח שעות |
| Team (tab) | الفريق | צוות |
| Overview | نظرة عامة | סקירה |
| People | المستخدمون | משתמשים |
| Alerts (security) | التنبيهات | התראות אבטחה |
| Notifications (push) | الإشعارات | התראות |
| Warnings | تحذيرات | אזהרות |
| Change history | سجل التغييرات | היסטוריית שינויים |
| System log | سجل النظام | יומן מערכת |
| Sessions | الجلسات | חיבורים |
| Rules (company settings) | القواعد | כללים |
| Allowed area (geofence) | النطاق المسموح | האזור המותר |
| Two-step sign-in | التحقق بخطوتين | אימות דו-שלבי |
| Backup | نسخة احتياطية | גיבוי |
| Export | تصدير | ייצוא |
| Correct / correction (attendance) | تصحيح | תיקון |
| Reason | السبب | סיבה |

Check for leftovers with `node scripts/i18n-check.mjs web/src/pages/worker` (any path).
