import type { Translation } from '../../../../shared/i18n';
import type { flags as en, rejectReasons as enReasons } from '../en/flags';

export const flags: Translation<typeof en> = {
  OFF_SITE_REQUEST: {
    label: 'طلب من خارج الموقع',
    description: 'كان العامل خارج موقع العمل وطلب قبول هذا التسجيل رغم ذلك.',
  },
  DIFFERENT_SITE: { label: 'موقع مختلف', description: 'تم تسجيل الحضور في موقع عمل غير المحدد في الجدول.' },
  UNSCHEDULED: { label: 'بدون وردية', description: 'لم تكن هناك وردية مجدولة في هذا الوقت.' },
  NETWORK_MATCH: { label: 'إنترنت موقع العمل', description: 'كان الهاتف متصلاً بإنترنت موقع العمل.' },
  NETWORK_MISMATCH: { label: 'إنترنت آخر', description: 'لم يكن الهاتف متصلاً بإنترنت موقع العمل.' },
  ACCURACY_ZERO: {
    label: 'اشتباه بتزييف GPS',
    description: 'أبلغ الهاتف عن دقة GPS لا يبلغ عنها أي GPS حقيقي، وهذا معتاد في تطبيقات تزييف الموقع.',
  },
  ACCURACY_TOO_PERFECT: { label: 'دقة GPS غير واقعية', description: 'كانت دقة الـGPS أفضل مما تصل إليه الهواتف الحقيقية.' },
  NO_JITTER: { label: 'موقع ثابت تمامًا', description: 'كانت عدة قراءات GPS متطابقة تمامًا، بينما الـGPS الحقيقي يتحرك قليلاً دائمًا.' },
  ROUND_COORDINATES: { label: 'إحداثيات مُدخلة يدويًا', description: 'في الموقع عدد قليل جدًا من الأرقام العشرية، كأنه كُتب يدويًا.' },
  MATCHES_SITE_CENTER: {
    label: 'مطابق تمامًا لدبوس الموقع',
    description: 'الموقع هو دبوس موقع العمل بالضبط، والـGPS الحقيقي لا يقع عليه بهذه الدقة أبدًا.',
  },
  DUPLICATE_POSITION: { label: 'نفس مكان زميل', description: 'الإحداثيات نفسها تمامًا كما في تسجيل حضور عامل آخر اليوم.' },
  REPEATED_POSITION: { label: 'نفس المكان السابق', description: 'الإحداثيات نفسها تمامًا كما في أحد تسجيلات هذا العامل السابقة.' },
  POSITION_JUMP: { label: 'موقع متقلّب', description: 'قفزت قراءات الـGPS بطريقة لا تحدث في هاتف حقيقي.' },
  IMPOSSIBLE_TRAVEL: { label: 'تنقّل مستحيل', description: 'انتقل الهاتف مسافة بعيدة جدًا وبسرعة كبيرة جدًا منذ موقعه السابق.' },
  MOVING_FAST: { label: 'داخل مركبة', description: 'كان الهاتف يتحرك بسرعة أثناء التحقق.' },
  API_TAMPERED: { label: 'متصفح معدَّل', description: 'تم استبدال خاصية تحديد الموقع في المتصفح بإضافة أو برنامج نصي.' },
  AUTOMATION: { label: 'متصفح آلي', description: 'المتصفح يخضع لتحكم برنامج أتمتة.' },
  EMULATED_DEVICE: { label: 'هاتف مزيّف', description: 'حاسوب يتظاهر بأنه هاتف.' },
  DESKTOP_DEVICE: { label: 'حاسوب وليس هاتفًا', description: 'جاء التسجيل من حاسوب بدلاً من هاتف.' },
  CLOCK_SKEW: { label: 'ساعة الهاتف مُعدّلة', description: 'كان فرق ساعة الهاتف أكثر من 5 دقائق، فتم استخدام وقت الخادم.' },
  SELFIE_DUPLICATE: { label: 'صورة مكرّرة', description: 'الصورة مطابقة تمامًا لصورة سابقة.' },
  NEW_DEVICE: { label: 'هاتف جديد', description: 'أول تسجيل من هاتف تمت الموافقة عليه حديثًا.' },
  RAPID_RETRIES: { label: 'محاولات فاشلة كثيرة', description: 'عدة محاولات مرفوضة قبل هذا التسجيل مباشرة.' },
  STALE_LOCATION: { label: 'موقع قديم', description: 'أرسل الهاتف موقعًا غير حديث.' },
};

export const rejectReasons: Translation<typeof enReasons> = {
  OUTSIDE_GEOFENCE: 'خارج موقع العمل',
  LOW_ACCURACY: 'دقة GPS غير كافية',
  STALE_LOCATION: 'موقع قديم',
  NO_LOCATION: 'لا يوجد موقع',
  NETWORK_REQUIRED: 'غير متصل بإنترنت موقع العمل',
  NO_SHIFT: 'لا توجد وردية الآن',
  NO_SITES: 'لم يتم إعداد موقع عمل',
  HIGH_RISK: 'حُظر للاشتباه',
  TOO_SOON: 'بعد وقت قصير جدًا من التسجيل السابق',
  rejected: 'مرفوض',
};
