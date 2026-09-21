// Single source of truth for "how much does this worker actually get paid".
//
// This used to be implemented three separate times (Dashboard.jsx's calcNet,
// PayrollPage.jsx's getFilteredPayroll, and TimesheetPage.jsx's workerStats),
// and the three copies had quietly drifted apart:
//   - Timesheet never subtracted "transfers" (بنك تحويلات) at all.
//   - Timesheet never excluded days that had already been paid out via a
//     previous صرف on صفحة القبض, so a worker paid mid-period would still
//     show their already-paid days as if still owed.
//   - Timesheet never counted the standalone "pillars" (عمدان) collection,
//     only pillarCost embedded on an attendance row.
// That is why الإجمالي في التايم شيت كان بيطلع مختلف عن المستحق للقبض في
// صفحة القبض وعن كارت لوحة التحكم. Every page must call computeWorkerPayroll
// below instead of re-deriving the formula locally.

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

// Computes exactly what a worker is owed for [from, to], net of advances,
// transfers, and deductions, and excluding anything already settled by an
// earlier payment. `from`/`to` are inclusive ISO date strings; either can be
// '' to leave that bound open.
export function computeWorkerPayroll(worker, { attendance, advances, transfers, pillars, payments }, from, to) {
  const through = getPaidThrough(payments, worker.id);
  const isUnpaid = (d) => !through || d > through;
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);

  const wAttendance = attendance.filter(a => a.workerId === worker.id && isUnpaid(a.date) && inRange(a.date));
  const wAdvances = advances.filter(a => a.workerId === worker.id && isUnpaid(a.date) && inRange(a.date));
  const wTransfers = transfers.filter(t => t.workerId === worker.id && isUnpaid(t.date) && inRange(t.date));
  const wPillars = pillars.filter(p => p.workerId === worker.id && isUnpaid(p.date) && inRange(p.date));

  const pillarAttendance = wAttendance.filter(a => a.pillarCost > 0);
  const present = wAttendance.filter(a => a.status === 'present' && !(a.pillarCost > 0));
  const absent = wAttendance.filter(a => a.status === 'absent' && !(a.pillarCost > 0));
  const pillarDays = new Set([...wPillars.map(p => p.date), ...pillarAttendance.map(a => a.date)]);
  const regularDays = present.filter(a => !pillarDays.has(a.date)).length;

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
