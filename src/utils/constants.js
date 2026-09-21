// 'بدون فئة' is a real entry, not a UI placeholder: it's a full department
// like any other. Workers land here when nobody has classified them into a
// trade yet, and everything (attendance, payroll, reports, timesheets)
// keeps working normally for them because every page maps over ROLES
// generically with no per-role special-casing.
export const NO_ROLE = 'بدون فئة';

export const ROLES = [
  NO_ROLE,
  'مهندس',
  'محاسب',
  'فورمان شده',
  'فورمان نجارين',
  'فورمان حدادين',
  'شده',
  'حداد',
  'نجار',
];

export const PAYMENT_TYPES = [
  { value: 'cash', label: 'نقدي' },
  { value: 'insta', label: 'انستاباي' },
  { value: 'wallet', label: 'محفظة' },
];

export const STAGES = [
  { value: 'labsha', label: 'لبشة' },
  { value: 'roof', label: 'سقف' },
  { value: 'columns', label: 'عمدان' },
];

export function stageLabel(value) {
  return STAGES.find(s => s.value === value)?.label || 'عمدان';
}

export const OVERTIME_FRACTIONS = [
  { value: 0.25, label: 'ربع يوم' },
  { value: 0.5, label: 'نص يوم' },
  { value: 0.75, label: 'يوم الا ربع' },
  { value: 1, label: 'يوم كامل' },
  { value: 1.25, label: 'يوم وربع' },
  { value: 1.5, label: 'يوم ونص' },
  { value: 2, label: 'يومين' },
  { value: 2.5, label: 'يومين ونص' },
];

export const DEFAULT_WHATSAPP = '+201203732787';

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function generateWorkerCode(workers) {
  const maxCode = workers.reduce((max, w) => {
    const num = parseInt(w.code?.replace('W', '') || '0');
    return num > max ? num : max;
  }, 0);
  return 'W' + String(maxCode + 1).padStart(4, '0');
}

export function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('ar-EG');
}

export function formatDateISO(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

// Every attendance/QR-scan date in the app must agree on "what day is it",
// regardless of which device is asking. This used to derive "today" from
// whatever timezone the local device's OS happened to be set to
// (`getTimezoneOffset()`) - which is fine on a laptop that's always been in
// Cairo, but a field phone used for QR scanning can easily have the wrong
// region/timezone set (or just be a different phone than usual). Near
// midnight Cairo time, a device on a different timezone computes a
// DIFFERENT calendar date for the exact same real-world instant - e.g. a
// device set to Europe/London already disagrees with Cairo for roughly the
// last 2-3 hours of every single day. That mismatch is exactly what caused
// attendance marked in the evening to land on the wrong date: it either
// silently vanished from the day it was meant for, or a QR scan reported
// "تم تسجيل حضور" successfully while filing itself under a date nobody was
// looking at.
//
// Fix: always compute the date in the company's fixed timezone
// (Africa/Cairo), never the device's own configured timezone. The device's
// underlying clock (the actual UTC instant) is virtually always correct
// even when its timezone SETTING isn't - so anchoring to a fixed IANA zone
// here removes this whole bug class regardless of any one device's
// settings.
const COMPANY_TIMEZONE = 'Africa/Cairo';

export function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: COMPANY_TIMEZONE });
}

// NOTE: payroll/"مستحق" math used to live here too (calculatePayroll), as a
// fourth copy of the formula that nothing actually called. It's been
// removed - src/domain/payroll.js is now the only place that math exists.
