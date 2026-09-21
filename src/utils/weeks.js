// أسابيع الشغل والصرف في الشركة: من السبت إلى الجمعة.
// ده المرجع الوحيد لتعريف "الأسبوع" في القبض والتايم شيت والميزانية.

export function isoOfDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function addDaysISO(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoOfDate(d);
}

// أي تاريخ -> السبت اللي بيبدأ بيه أسبوعه
export function alignToSaturday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=الأحد ... 6=السبت
  const daysSinceSaturday = (day + 1) % 7;
  d.setDate(d.getDate() - daysSinceSaturday);
  return isoOfDate(d);
}

// أي تاريخ -> { start: السبت, end: الجمعة }
export function payWeekOf(dateStr) {
  const start = alignToSaturday(dateStr);
  return { start, end: addDaysISO(start, 6) };
}
