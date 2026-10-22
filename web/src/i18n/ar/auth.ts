import type { Translation } from '../../../../shared/i18n';
import type { auth as en } from '../en/auth';

export const auth: Translation<typeof en> = {
  signIn: {
    title: 'تسجيل الدخول',
    subtitle: 'باستخدام اسم المستخدم وكلمة المرور اللذين حصلت عليهما.',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    submit: 'تسجيل الدخول',
    forgot: 'نسيت كلمة المرور؟ يمكن لمديرك إعادة تعيينها.',
  },
  code: {
    title: 'التحقق بخطوتين',
    subtitle: 'يرجى إدخال الرمز المكوّن من 6 أرقام من تطبيق المصادقة.',
    label: 'رمز التحقق',
    verify: 'التحقق',
    otherAccount: 'استخدام حساب آخر',
  },
  changePassword: {
    current: 'كلمة المرور الحالية',
    new: 'كلمة المرور الجديدة',
    newHint: '8 أحرف على الأقل. الجملة القصيرة يسهل تذكّرها.',
    repeat: 'تأكيد كلمة المرور الجديدة',
    mismatch: 'كلمتا المرور غير متطابقتين.',
    submit: 'حفظ كلمة المرور الجديدة',
  },
  forceChange: {
    title: 'اختيار كلمة المرور',
    subtitle: 'يرجى استبدال كلمة المرور المؤقتة بكلمة مرور لا يعرفها أحد غيرك.',
    submit: 'حفظ ومتابعة',
    signOut: 'تسجيل الخروج',
  },
};
