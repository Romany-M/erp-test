// ============================================================================
// THE ONLY place "how much does a worker still have coming to them" is
// calculated. Every screen that shows a payroll/مستحق number (Dashboard,
// صفحة التايم شيت, صفحة القبض, التقارير) MUST import from here. Nowhere else
// in the app is allowed to re-derive this formula.
//
// History, for context: this used to be implemented separately in
// Dashboard.jsx (calcNet), PayrollPage.jsx (getFilteredPayroll),
// TimesheetPage.jsx (workerStats), src/utils/payroll.js, AND
// src/utils/payrollCalc.js — five copies that had quietly drifted apart.
// ReportsPage.jsx also had its own two hand-rolled copies that never
// excluded already-paid days and, in one case, forgot to subtract
// deductions from the net entirely. That's why التايم شيت / القبض /
// التقارير could each show a different "مستحق" for the same worker and
// the same date range. All of that has been deleted. This file is what's
// left.
// ============================================================================

// The most recent date this worker has been paid *through* (inclusive).
// Any attendance/advance/transfer/pillar record dated on/after this is still
// unpaid and outstanding.
export function getPaidThrough(payments, workerId) {
  let through = '';
  payments.forEach(p => {
    if (p.workerId !== workerId) return;
    const d = p.dateTo && p.dateTo !== 'النهاية' ? p.dateTo : (p.date ? p.date.substring(0, 10) : '');
    if (d && d > through) through = d;
  });
  return through;
}

// NOTE: this "latest single paid-through date" model assumes payments are
// always made in order with no gaps (pay week 1, then week 2, then week 3 -
// never week 1 and week 3 while skipping week 2). If a payment is ever
// recorded out of order, everything before the latest paid-through date
// will be treated as settled even if a specific earlier stretch wasn't
// actually paid. Flagging this as a known limitation of the current model,
// not something silently "fixed" here - changing it is a real data-model
// decision, not a one-line patch.

// هل للعامل شغل في الفترة؟ (حضور، أو عمدان من صفحة الحضور، أو سجل في صفحة العمدان).
// نفس الشرط بالظبط بيستخدمه القبض والتايم شيت عشان قايمة العمال في الصفحتين تبقى واحدة.
export function workerHasWorkInRange(worker, { attendance, pillars, from, to }) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  return attendance.some(a =>
    a.workerId === worker.id && inRange(a.date) && (a.status === 'present' || a.pillarCost > 0)
  ) || pillars.some(p => p.workerId === worker.id && inRange(p.date));
}

// هل للعامل شغل عمدان في الفترة؟ (عشان العامل تحت الاختبار بدون أجر يومي
// لكن له قبض عمدان لازم يظهر في التايم شيت زي ما بيظهر في القبض)
export function workerHasPillarWorkInRange(worker, { attendance, pillars, from, to }) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  return attendance.some(a => a.workerId === worker.id && inRange(a.date) && a.pillarCost > 0)
    || pillars.some(p => p.workerId === worker.id && inRange(p.date));
}

// Net pay still owed to `worker` for attendance/advances/transfers/pillar
// work inside [from, to] (inclusive; either bound may be omitted), after
// excluding anything already covered by a prior payment.
//
// تعريف أيام الحضور (واحد في كل الصفحات):
//   daysWorked  = كل يوم اشتغل فيه العامل (يوم عادي + يوم عمدان)، كل تاريخ بيتعد مرة واحدة بس
//   regularDays = الأيام اللي اتحاسبت بالأجر اليومي (أجر الأيام = regularDays × الأجر اليومي)
//   pillarDays  = أيام العمدان (تاريخ واحد = يوم واحد حتى لو فيه أكتر من سجل عمدان)
//   absentDays  = أيام الغياب المسجلة (مش بيتحسب غياب يوم فيه عمدان)
export function calcWorkerNet(worker, { attendance, advances, transfers, pillars, payments, from, to }) {
  const through = getPaidThrough(payments, worker.id);
  const isUnpaid = (d) => !through || d > through;
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const isRelevant = (d) => isUnpaid(d) && inRange(d);

  const wAttendance = attendance.filter(a => a.workerId === worker.id && isRelevant(a.date));
  const wAdvances = advances.filter(a => a.workerId === worker.id && isRelevant(a.date));
  const wTransfers = transfers.filter(t => t.workerId === worker.id && isRelevant(t.date));
  const wPillars = pillars.filter(p => p.workerId === worker.id && isRelevant(p.date));

  const pillarAttendance = wAttendance.filter(a => a.pillarCost > 0);
  const present = wAttendance.filter(a => a.status === 'present' && !(a.pillarCost > 0));
  const absent = wAttendance.filter(a => a.status === 'absent' && !(a.pillarCost > 0));
  const pillarDaysSet = new Set([...wPillars.map(p => p.date), ...pillarAttendance.map(a => a.date)]);
  const regularDays = present.filter(a => !pillarDaysSet.has(a.date)).length;
  const absentDays = absent.filter(a => !pillarDaysSet.has(a.date)).length;
  const pillarDays = pillarDaysSet.size;
  const daysWorked = regularDays + pillarDays;

  const daysPay = regularDays * (worker.dailyWage || 0);
  const pillarPay = wPillars.reduce((s, p) => s + (p.cost || 0), 0)
    + wAttendance.reduce((s, a) => s + (a.pillarCost || 0), 0);
  const overtime = wAttendance.reduce((s, a) => s + (a.overtimeValue || 0), 0);
  const deductions = wAttendance.reduce((s, a) => s + (a.deduction || 0), 0);
  const advancesTotal = wAdvances.reduce((s, a) => s + (a.amount || 0), 0);
  const transfersTotal = wTransfers.reduce((s, t) => s + (t.amount || 0), 0);
  const gross = daysPay + pillarPay + overtime;
  const net = gross - advancesTotal - transfersTotal - deductions;

  return {
    through,
    daysWorked,
    totalDays: daysWorked, // اسم قديم — نفس daysWorked
    regularDays,
    absentDays,
    pillarDays,
    daysPay,
    pillarPay,
    overtime,
    deductions,
    advances: advancesTotal,
    transfers: transfersTotal,
    gross,
    net,
  };
}

// الكشف اليومي للعامل (اللي بيظهر في صفحة القبض وبيتطبع في كشف الحساب).
// اتنقل هنا من صفحة القبض عشان يبقى في نفس مكان المعادلة الأساسية.
// ملاحظة: التحويلات مش بتتوزع على الأيام — بتتخصم مرة واحدة من الإجمالي
// (raw dayTotal مش شامل التحويلات، والصافي = مجموع الأيام غير المدفوعة − التحويلات).
export function calcDailyRows(worker, { attendance, advances, pillars, payments, from, to }) {
  const through = getPaidThrough(payments, worker.id);
  let wAttendance = attendance.filter(a => a.workerId === worker.id);
  let wAdvances = advances.filter(a => a.workerId === worker.id);
  let wPillars = pillars.filter(p => p.workerId === worker.id);
  if (from) {
    wAttendance = wAttendance.filter(a => a.date >= from);
    wAdvances = wAdvances.filter(a => a.date >= from);
    wPillars = wPillars.filter(p => p.date >= from);
  }
  if (to) {
    wAttendance = wAttendance.filter(a => a.date <= to);
    wAdvances = wAdvances.filter(a => a.date <= to);
    wPillars = wPillars.filter(p => p.date <= to);
  }

  const attByDate = {};
  wAttendance.forEach(a => { attByDate[a.date] = a; });
  const advByDate = {};
  wAdvances.forEach(a => { advByDate[a.date] = (advByDate[a.date] || 0) + (a.amount || 0); });
  const pilByDate = {};
  wPillars.forEach(p => { pilByDate[p.date] = (pilByDate[p.date] || 0) + (p.cost || 0); });

  const allDates = new Set([...Object.keys(attByDate), ...Object.keys(advByDate), ...Object.keys(pilByDate)]);
  return [...allDates].sort().map(date => {
    const att = attByDate[date];
    const status = att ? att.status : 'absent';
    const overtime = att?.overtimeValue || 0;
    const pillarCost = (att?.pillarCost || 0) + (pilByDate[date] || 0);
    const advance = advByDate[date] || 0;
    const deduction = att?.deduction || 0;
    let dayTotal = 0;
    if (pillarCost > 0) {
      dayTotal = pillarCost + overtime;
    } else if (status === 'present') {
      dayTotal = (worker.dailyWage || 0) + overtime;
    } else {
      dayTotal = overtime;
    }
    dayTotal -= advance + deduction;
    const paid = !!through && date <= through;
    return { date, status, overtime, pillarCost, advance, deduction, dayTotal, paid };
  });
}

// Mirrors the "تم الصرف" condition used to badge a worker as fully settled
// for [from, to]: some payment record covers the range, either by its
// dateTo reaching (or exceeding) `to`, or - when `to` is open-ended - by
// there being no attendance after that payment at all.
export function isWorkerPaidForRange(payments, attendance, workerId, from, to) {
  return payments.some(p => {
    if (p.workerId !== workerId) return false;
    if (p.dateTo && p.dateTo !== 'النهاية') {
      if (!to) {
        return !attendance.some(a => a.workerId === workerId && (!from || a.date >= from) && a.date > p.dateTo);
      }
      return p.dateTo >= to;
    }
    if (from && (p.date ? p.date.substring(0, 10) : '') < from) return false;
    return true;
  });
}

// Sums a list of per-worker net amounts into a "total still payable" figure,
// treating any worker whose net came out negative (advances/transfers/
// deductions outweighing what they earned) as owing nothing rather than
// letting them offset what's owed to everyone else. This exact
// `Math.max(net, 0)` step used to be re-typed by hand at every call site
// (and was sometimes forgotten) - now there's one function to call.
export function sumPayableNet(nets) {
  return nets.reduce((sum, net) => sum + Math.max(net || 0, 0), 0);
}
