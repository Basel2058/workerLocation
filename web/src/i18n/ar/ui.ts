import type { Translation } from '../../../../shared/i18n';
import type { ui as en } from '../en/ui';

export const ui: Translation<typeof en> = {
  dialog: {
    typeToConfirm: 'للتأكيد، يرجى كتابة {text}.',
  },
  shell: {
    mainNav: 'القائمة الرئيسية',
    account: 'الحساب',
    accountSettings: 'إعدادات الحساب',
    signOut: 'تسجيل الخروج',
    more: 'المزيد',
  },
  map: {
    label: 'الخريطة',
  },
  password: {
    show: 'إظهار كلمة المرور',
    hide: 'إخفاء كلمة المرور',
  },
  notifications: {
    title: 'الإشعارات',
    iphoneHint: 'لتلقي الإشعارات على iPhone، يرجى إضافة التطبيق إلى الشاشة الرئيسية.',
    unsupported: 'هذا المتصفح لا يدعم الإشعارات.',
    blocked: 'الإشعارات محظورة. يرجى السماح بها لهذا التطبيق من إعدادات الهاتف.',
    enabled: 'تم تفعيل الإشعارات',
  },
  errors: {
    network: 'لا يوجد اتصال بالخادم. يرجى التحقق من الإنترنت والمحاولة مرة أخرى.',
    server: 'حدثت مشكلة في الخادم. يرجى المحاولة مرة أخرى.',
    failed: 'تعذّر تنفيذ الطلب.',
    download: 'تعذّر التنزيل.',
  },
  language: {
    label: 'اللغة',
    choose: 'اختيار اللغة',
    hint: 'ستظهر الشاشات والرسائل والإشعارات بهذه اللغة.',
  },
  badge: {
    overflow: '99+',
  },
};
