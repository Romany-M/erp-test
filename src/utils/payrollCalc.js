// Single source of truth for "how much does a worker still have coming to
// them" math. Before this file existed, PayrollPage, Dashboard, and
// TimesheetPage each had their own hand-rolled copy of this formula, and
// they had already drifted apart (Dashboard/Payroll excluded already-paid
// days and included transfers/pillar pay; Timesheet didn't). That produced
// three different totals for the exact same date range with no way to tell
// which one was "right." There must only ever be ONE implementation of this
// math in the app - every screen that shows a payroll number imports it
// from here instead of recomputing it.

// A worker is "paid through" whatever the latest dateTo (or date, for
// open-ended payments) is across all of their payment records. Anything on
// or before that date is treated as already settled and is excluded from
// "still owed" calculations below.
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

// Net pay still owed to `worker` for attendance/advances/transfers/pillar
// work inside [from, to] (inclusive; either bound may be omitted), after
// excluding anything already covered by a prior payment.
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
    totalDays: present.length,
    absentDays: absent.length,
    pillarDays: wPillars.length + pillarAttendance.length,
    regularDays,
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

// Mirrors the "تم الصرف" condition PayrollPage uses to badge a worker as
// fully settled for [from, to]: some payment record covers the range,
// either by its dateTo reaching (or exceeding) `to`, or - when `to` is
// open-ended - by there being no attendance after that payment at all.
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
