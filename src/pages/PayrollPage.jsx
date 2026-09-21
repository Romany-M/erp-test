import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ROLES, PAYMENT_TYPES, DEFAULT_WHATSAPP, todayISO } from '../utils/constants';
import { PAID_STAMP_DATA_URI } from '../assets/paidStamp';
import { getPaidThrough, calcWorkerNet, calcDailyRows, workerHasWorkInRange, isWorkerPaidForRange, sumPayableNet } from '../domain/payroll';
import { addDaysISO, alignToSaturday } from '../utils/weeks';

const ARABIC_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
function dayNameOf(dateISO) {
  if (!dateISO) return '';
  const d = new Date(dateISO + 'T00:00:00');
  return ARABIC_WEEKDAYS[d.getDay()];
}

const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export default function PayrollPage() {
  const { workers, attendance, advances, transfers, pillars, payments, addPayment, deletePayment, setPayrollRange } = useApp();
  const [selectedWorker, setSelectedWorker] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => todayISO().substring(0, 7) + '-01');
  const [dateTo, setDateTo] = useState('');
  const [payType, setPayType] = useState('cash');
  const [payFilter, setPayFilter] = useState('unpaid');
  const [walletNumber, setWalletNumber] = useState('');
  const [walletName, setWalletName] = useState('');

  // Whether the person has ever deliberately picked a period themselves
  // (typed a date, or clicked one of the week cards). Once true, we leave
  // their choice alone forever - only the untouched default should ever
  // auto-jump to a new month on its own.
  const [userPickedPeriod, setUserPickedPeriod] = useState(false);
  const handleDateFromChange = (value) => { setUserPickedPeriod(true); setDateFrom(value); };
  const handleDateToChange = (value) => { setUserPickedPeriod(true); setDateTo(value); };
  const handleWeekCardPick = (start, end) => { setUserPickedPeriod(true); setDateFrom(start); setDateTo(end); };

  // Which month's pay-week cards to browse. Deliberately kept separate from
  // dateFrom/dateTo (the actually-selected payroll period): a real pay week
  // can start in one calendar month and end in the next, so picking such a
  // week must NOT also silently flip the card grid to a different month.
  const [weekCardsMonth, setWeekCardsMonth] = useState(() => todayISO().substring(0, 7));
  const prevCardsMonth = () => {
    const [y, m] = weekCardsMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setWeekCardsMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextCardsMonth = () => {
    const [y, m] = weekCardsMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setWeekCardsMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  // Keeps "من تاريخ" following the real current month automatically - so
  // the week cards genuinely change every month on their own, without
  // needing a page refresh - but only while the person hasn't picked a
  // period themselves. Checks on a timer (in case the tab is left open
  // across midnight on the 1st) and immediately whenever the tab regains
  // focus.
  useEffect(() => {
    const syncToCurrentMonth = () => {
      if (userPickedPeriod) return;
      const currentMonthStart = todayISO().substring(0, 7) + '-01';
      setDateFrom(prev => (prev === currentMonthStart ? prev : currentMonthStart));
    };
    syncToCurrentMonth();
    const intervalId = setInterval(syncToCurrentMonth, 60 * 1000);
    document.addEventListener('visibilitychange', syncToCurrentMonth);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', syncToCurrentMonth);
    };
  }, [userPickedPeriod]);

  useEffect(() => {
    setPayrollRange({ from: dateFrom, to: dateTo });
  }, [dateFrom, dateTo, setPayrollRange]);

  const activeWorkers = useMemo(() => workers.filter(w => w.status === 'active'), [workers]);

  // نفس شرط التايم شيت بالظبط (workerHasWorkInRange): حضور أو عمدان في الفترة،
  // سواء اتسجل من صفحة الحضور أو من صفحة العمدان.
  const payableWorkers = useMemo(() => {
    return activeWorkers.filter(w => workerHasWorkInRange(w, { attendance, pillars, from: dateFrom || '', to: dateTo || '' }));
  }, [activeWorkers, attendance, pillars, dateFrom, dateTo]);

  const filteredWorkers = useMemo(() => {
    let list = payableWorkers;
    if (filterRole) list = list.filter(w => w.role === filterRole);
    return list;
  }, [payableWorkers, filterRole]);

  const isPaidWorker = (workerId) => isWorkerPaidForRange(payments, attendance, workerId, dateFrom || '', dateTo || '');

  const displayWorkers = useMemo(() => {
    let list = filteredWorkers;
    if (search) {
      list = list.filter(w => w.name.includes(search) || w.code.includes(search));
    }
    if (payFilter === 'all') return list;
    if (payFilter === 'paid') return list.filter(w => isPaidWorker(w.id));
    return list.filter(w => !isPaidWorker(w.id));
  }, [filteredWorkers, payFilter, search, payments, attendance, dateFrom, dateTo]);

  const worker = workers.find(w => w.id === selectedWorker);

  const workerPayments = worker
    ? payments.filter(p => p.workerId === worker.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    : [];

  const effectiveWalletNumber = walletNumber || worker?.walletNumber || '';
  const effectiveWalletName = walletName || worker?.walletName || '';

  const monthWeeks = useMemo(() => {
    const y = parseInt(weekCardsMonth.substring(0, 4));
    const m = parseInt(weekCardsMonth.substring(5, 7));
    const monthStart = `${weekCardsMonth}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${weekCardsMonth}-${String(lastDay).padStart(2, '0')}`;

    // Real Saturday->Friday weeks, generated forward from whichever Saturday
    // starts the week containing day 1 of this month. A week is included
    // here whenever it overlaps this month at all, even if most of its days
    // actually fall in the previous or next month - that's the whole point:
    // the boundary week gets exactly one card, not zero.
    const weeks = [];
    let cursorStart = alignToSaturday(monthStart);
    let idx = 1;
    while (cursorStart <= monthEnd) {
      const cursorEnd = addDaysISO(cursorStart, 6);
      weeks.push({ key: cursorStart, label: `الأسبوع ${idx}`, start: cursorStart, end: cursorEnd });
      cursorStart = addDaysISO(cursorStart, 7);
      idx++;
    }

    return weeks.map(w => {
      const weekAttendance = attendance.filter(a =>
        a.date >= w.start && a.date <= w.end && (a.status === 'present' || a.pillarCost > 0)
      );
      const workersInWeek = [...new Set(weekAttendance.map(a => a.workerId))];
      if (workersInWeek.length === 0) return { ...w, status: 'empty', stats: { total: 0, paid: 0, remaining: 0 } };

      let total = 0;
      const unpaidNets = [];
      let unpaidCount = 0;
      workersInWeek.forEach(workerId => {
        const wk = workers.find(x => x.id === workerId);
        if (!wk) return;
        const net = calcWorkerNet(wk, { attendance, advances, transfers, pillars, payments, from: w.start, to: w.end }).net;
        const fullyPaid = isWorkerPaidForRange(payments, attendance, workerId, w.start, w.end);
        total += net;
        if (!fullyPaid) { unpaidNets.push(net); unpaidCount++; }
      });
      const remaining = sumPayableNet(unpaidNets);

      const weekPayments = payments.filter(p => {
        if (p.dateTo && p.dateTo !== 'النهاية') return p.dateTo >= w.start && (p.dateFrom || '') <= w.end;
        const pd = (p.date || '').substring(0, 10);
        return pd >= w.start && pd <= w.end;
      });
      const paid = weekPayments.reduce((s, p) => s + (p.amount || 0), 0)
        + transfers.filter(t => t.date >= w.start && t.date <= w.end).reduce((s, t) => s + (t.amount || 0), 0);

      return {
        ...w,
        status: unpaidCount === 0 ? 'paid' : 'inprogress',
        stats: { total, paid, remaining },
      };
    });
  }, [weekCardsMonth, attendance, payments, workers, advances, transfers, pillars]);

  const weekCardStyle = {
    paid: 'border-green-500 bg-green-50',
    inprogress: 'border-amber-400 bg-amber-50',
    empty: 'border-gray-200 bg-gray-50',
  };
  const weekStatusLabel = {
    paid: 'مدفوع بالكامل',
    inprogress: 'جارٍ العمل — لم يُصرف كاملاً',
    empty: 'لا توجد بيانات',
  };
  const weekStatusBadge = {
    paid: 'bg-green-600 text-white',
    inprogress: 'bg-amber-500 text-white',
    empty: 'bg-gray-400 text-white',
  };

  // Thin wrapper: all the actual math lives in calcWorkerNet (shared with
  // Dashboard and TimesheetPage) so this page can never drift from them again.
  const getFilteredPayroll = (w) =>
    calcWorkerNet(w, { attendance, advances, transfers, pillars, payments, from: dateFrom || '', to: dateTo || '' });

  // الكشف اليومي من نفس ملف المعادلات (domain/payroll.js) — مفيش نسخة تانية هنا.
  const getDailyBreakdown = (w) =>
    calcDailyRows(w, { attendance, advances, pillars, payments, from: dateFrom || '', to: dateTo || '' });

  const payroll = worker ? getFilteredPayroll(worker) : null;

  const dailyRows = worker ? getDailyBreakdown(worker) : [];
  const dailyTotal = dailyRows.reduce((s, r) => s + r.dayTotal, 0);
  const paidDayTotal = dailyRows.filter(r => r.paid).reduce((s, r) => s + r.dayTotal, 0);

  const workerTransfers = worker
    ? transfers
        .filter(t => t.workerId === worker.id)
        .filter(t => !dateFrom || t.date >= dateFrom)
        .filter(t => !dateTo || t.date <= dateTo)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    : [];
  const transferWalletLabel = (t) => {
    if (t.paymentType === 'wallet') {
      const num = t.walletNumber || worker?.walletNumber || '';
      const name = t.walletName || worker?.walletName || '';
      return [name ? 'الاسم: ' + name : '', num ? 'رقم: ' + num : '', t.phone ? 'هاتف: ' + t.phone : ''].filter(Boolean).join(' — ') || '-';
    }
    if (t.paymentType === 'insta') {
      const name = t.walletName || '';
      return [name ? 'الاسم: ' + name : '', t.phone ? 'انستا: ' + t.phone : ''].filter(Boolean).join(' — ') || '-';
    }
    return 'صرف نقدي';
  };

  const handlePay = () => {
    if (!worker || !payroll || payroll.net <= 0) return;
    const extra = {};
    if (payType === 'insta' || payType === 'wallet') {
      if (effectiveWalletNumber) extra.walletNumber = effectiveWalletNumber;
      if (effectiveWalletName) extra.walletName = effectiveWalletName;
    }
    addPayment({
      workerId: worker.id,
      workerName: worker.name,
      amount: payroll.net,
      paymentType: payType,
      dateFrom: dateFrom || 'البداية',
      dateTo: dateTo || 'النهاية',
      ...extra,
    });
    setSelectedWorker('');
    setWalletNumber('');
    setWalletName('');
    alert(`تم تسجيل صرف ${payroll.net.toLocaleString('ar-EG')} ج.م لـ ${worker.name} (${PAYMENT_TYPES.find(p => p.value === payType)?.label})`);
  };

  // صافي المستحق لحد يوم معين (شامل خصم السلف والتحويلات اللي لحد اليوم ده).
  // كان بيتحسب من مجموع الأيام بس من غير التحويلات، فكان بيصرف أكتر من الصافي.
  const netThroughDate = (w, date) =>
    calcWorkerNet(w, { attendance, advances, transfers, pillars, payments, from: dateFrom || '', to: date }).net;

  // Pays this day plus every earlier unpaid day in the currently displayed
  // range — sequential settlement, consistent with how "paid through" is
  // tracked (a single max covered date per worker).
  const handlePayThroughDate = (date) => {
    if (!worker) return;
    const amount = netThroughDate(worker, date);
    if (amount <= 0) return;
    const extra = {};
    if (payType === 'insta' || payType === 'wallet') {
      if (effectiveWalletNumber) extra.walletNumber = effectiveWalletNumber;
      if (effectiveWalletName) extra.walletName = effectiveWalletName;
    }
    addPayment({
      workerId: worker.id,
      workerName: worker.name,
      amount,
      paymentType: payType,
      dateFrom: dateFrom || 'البداية',
      dateTo: date,
      ...extra,
    });
    alert(`تم تسجيل صرف ${amount.toLocaleString('ar-EG')} ج.م لـ ${worker.name} حتى يوم ${date} (${PAYMENT_TYPES.find(p => p.value === payType)?.label})`);
  };

  const sendWhatsApp = () => {
    if (!worker || !payroll) return;
    const phone = worker.phone || DEFAULT_WHATSAPP;
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const text = encodeURIComponent(
      `*سجل حضور - ${worker.name}*\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `*الكود:* ${worker.code}\n` +
      `*الوظيفة:* ${worker.role}\n` +
      `*الأجر اليومي:* ${worker.dailyWage?.toLocaleString('ar-EG')} ج.م\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `*أيام الحضور:* ${payroll.daysWorked} يوم (منها ${payroll.pillarDays} عمدان)\n` +
      `*أيام الغياب:* ${payroll.absentDays} يوم\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `*أجر الأيام:* ${payroll.daysPay.toLocaleString('ar-EG')} ج.م\n` +
      `*تكلفة العمدان:* ${payroll.pillarPay.toLocaleString('ar-EG')} ج.م\n` +
      `*الإضافي:* ${payroll.overtime.toLocaleString('ar-EG')} ج.م\n` +
      `*الإجمالي:* ${payroll.gross.toLocaleString('ar-EG')} ج.م\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `*الخصم:* -${payroll.deductions.toLocaleString('ar-EG')} ج.م\n` +
      `*السلف:* -${payroll.advances.toLocaleString('ar-EG')} ج.م\n` +
      `*التحويلات:* -${payroll.transfers.toLocaleString('ar-EG')} ج.م\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `*الصافي:* *${payroll.net.toLocaleString('ar-EG')} ج.م*\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `شركة المناهري للمقاولات العمومية`
    );
    window.open(`https://wa.me/${cleanPhone.replace('+', '')}?text=${text}`, '_blank');
  };

  const generatePDF = () => {
    if (!worker || !payroll) return;
    const printWindow = window.open('', '_blank');
    const fileName = `كشف-حساب-${worker.name}`;
    if (printWindow) printWindow.document.title = fileName;
    const lastPayment = workerPayments[0];
    const paidData = !!lastPayment && isPaidWorker(worker.id);
    const stmtType = paidData ? lastPayment.paymentType : payType;
    const stmtAmount = paidData ? lastPayment.amount : payroll.net;
    const stmtWalletNumber = paidData ? (lastPayment.walletNumber || worker.walletNumber || '') : effectiveWalletNumber;
    const stmtWalletName = paidData ? (lastPayment.walletName || worker.walletName || '') : effectiveWalletName;
    const stmtDate = paidData ? lastPayment.date : '';
    const payTypeLabel = PAYMENT_TYPES.find(p => p.value === stmtType)?.label || stmtType;
    const isTransfer = stmtType === 'insta' || stmtType === 'wallet';
    const walletDetail = isTransfer
      ? `${stmtWalletNumber ? 'رقم: ' + stmtWalletNumber : ''} ${stmtWalletNumber && stmtWalletName ? '—' : ''} ${stmtWalletName ? 'الاسم: ' + stmtWalletName : ''}`.trim() || '-'
      : 'صرف نقدي';
    const periodText = `${dateFrom || 'من البداية'} إلى ${dateTo || 'حتى الآن'}`;
    const rowsHtml = dailyRows.map((r, i) => {
      const statusClass = r.pillarCost > 0 ? 'pillar' : r.status === 'present' ? 'present' : 'absent';
      const statusLabel = r.pillarCost > 0 ? 'عمدان' : r.status === 'present' ? 'حاضر' : 'غائب';
      return `
          <tr>
            <td class="c">${i + 1}</td>
            <td class="c">${r.date} (${dayNameOf(r.date)})</td>
            <td class="c ${statusClass}">${statusLabel}</td>
            <td class="num">${r.overtime ? r.overtime.toLocaleString('ar-EG') : '-'}</td>
            <td class="num">${r.pillarCost ? r.pillarCost.toLocaleString('ar-EG') : '-'}</td>
            <td class="num red">${r.deduction ? '-' + r.deduction.toLocaleString('ar-EG') : '-'}</td>
            <td class="num red">${r.advance ? '-' + r.advance.toLocaleString('ar-EG') : '-'}</td>
            <td class="num strong">${r.dayTotal.toLocaleString('ar-EG')} ج.م</td>
          </tr>`;
    }).join('');
    const paidPrevLine = paidDayTotal !== 0
      ? `<tr class="total-row"><td colspan="7" class="r">المدفوع سابقاً (أيام مغلقة)</td><td class="num red">- ${Math.abs(paidDayTotal).toLocaleString('ar-EG')} ج.م</td></tr>`
      : '';
    const transfersLine = payroll.transfers > 0
      ? `<tr class="total-row"><td colspan="7" class="r">التحويلات</td><td class="num red">- ${payroll.transfers.toLocaleString('ar-EG')} ج.م</td></tr>`
      : '';
    const transfersRowsHtml = workerTransfers.map((t, i) => {
      const typeLabel = PAYMENT_TYPES.find(x => x.value === t.paymentType)?.label || t.paymentType;
      return `
          <tr>
            <td class="c">${i + 1}</td>
            <td class="c">${t.date} (${dayNameOf(t.date)})</td>
            <td class="c">${typeLabel}</td>
            <td class="c">${transferWalletLabel(t)}</td>
            <td class="c" dir="ltr">${t.phone || '-'}</td>
            <td class="c" dir="ltr">${t.transactionId || '-'}</td>
            <td class="num red">${(t.amount || 0).toLocaleString('ar-EG')} ج.م</td>
          </tr>`;
    }).join('');
    const transfersTableHtml = workerTransfers.length > 0
      ? `
        <div style="margin-top:7px;border:2px solid #9333ea;border-radius:8px;overflow:hidden;">
          <div style="background:#9333ea;color:white;text-align:center;padding:3px;font-size:11px;font-weight:bold;">
            التحويلات المسجلة
          </div>
          <table>
            <thead>
              <tr><th>#</th><th>التاريخ</th><th>نوع الصرف</th><th>المحفظة / الانستا</th><th>الرقم المحول إليه</th><th>رقم المعاملة</th><th>المبلغ</th></tr>
            </thead>
            <tbody>${transfersRowsHtml}</tbody>
          </table>
        </div>`
      : '';
    const transferBox = isTransfer
      ? `<div class="transfer-box">
           <div class="transfer-title">تم تحويل المبلغ المستحق عن طريق ${payTypeLabel}</div>
           <div class="transfer-amount">${stmtAmount.toLocaleString('ar-EG')} ج.م</div>
           ${stmtDate ? `<div class="transfer-detail">تاريخ التحويل: <b>${new Date(stmtDate).toLocaleDateString('ar-EG')}</b></div>` : ''}
           <div class="transfer-detail">رقم المحفظة: <b dir="ltr">${stmtWalletNumber || '-'}</b></div>
           <div class="transfer-detail">اسم المحفظة: <b>${stmtWalletName || '-'}</b></div>
         </div>`
      : '';
    // The stamp is a certification of an actual, already-recorded payment —
    // it must NEVER render for a still-unpaid statement, or it would
    // misrepresent an unsettled amount as disbursed. `paidData` (computed
    // above from isPaidWorker + the worker's last matching payment record)
    // is exactly the "تم الصرف was clicked for this period" signal.
    const paidSealHtml = paidData
      ? `<div class="paid-seal">
           <div class="paid-seal-text">
             <div class="paid-seal-title">تم الصرف</div>
             ${stmtDate ? `<div class="paid-seal-date">بتاريخ ${new Date(stmtDate).toLocaleDateString('ar-EG')}</div>` : ''}
           </div>
           <img src="${PAID_STAMP_DATA_URI}" alt="ختم الشركة - تم الصرف" />
         </div>`
      : '';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>${fileName}</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>
          @page { size: A4; margin: 7mm; }
          * { font-family: 'Tajawal', sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
          body { direction: rtl; color: #111; }
          .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-bottom: 7px; }
          .header h1 { color: #1e40af; font-size: 15px; }
          .header .sub { font-size: 12px; font-weight: bold; margin-top: 2px; }
          .info { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px; margin-bottom: 7px; }
          .info span { background: #f1f5f9; padding: 2px 8px; border-radius: 6px; font-size: 9px; color: #475569; }
          .info b { display: block; font-size: 11px; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 2px 5px; text-align: center; font-size: 10px; }
          th { background: #2563eb; color: white; font-size: 10px; }
          .c { text-align: center; }
          .num { text-align: left; direction: ltr; font-weight: bold; }
          .r { text-align: right; }
          .present { color: #15803d; font-weight: bold; }
          .absent { color: #dc2626; font-weight: bold; }
          .pillar { color: #9333ea; font-weight: bold; }
          .red { color: #dc2626; }
          .strong { font-weight: bold; }
          .total-row { background: #f1f5f9; font-weight: bold; }
          .net { background: #dcfce7; font-weight: bold; font-size: 12px; }
          .empty { color: #94a3b8; padding: 12px; }
          .footer { text-align: center; margin-top: 6px; font-size: 9px; color: #888; }
          .transfer-box { margin: 7px 0; border: 2px solid #2563eb; border-radius: 8px; padding: 6px 10px; text-align: center; background: #eff6ff; }
          .transfer-title { font-size: 11px; font-weight: bold; color: #1e40af; }
          .transfer-amount { font-size: 16px; font-weight: bold; color: #16a34a; margin: 2px 0; }
          .transfer-detail { font-size: 11px; color: #0f172a; margin-top: 1px; }
          .paid-seal { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 9px; }
          .paid-seal img { width: 130px; height: 130px; opacity: 0.92; transform: rotate(-8deg); }
          .paid-seal-text { text-align: right; }
          .paid-seal-title { font-size: 14px; font-weight: bold; color: #16a34a; }
          .paid-seal-date { font-size: 10px; color: #475569; margin-top: 1px; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>المناهري للمقاولات العمومية</h1>
          <div class="sub">كشف حساب يومي — ${worker.name}</div>
        </div>
        <div class="info">
          <span>الكود <b>${worker.code}</b></span>
          <span>الوظيفة <b>${worker.role}</b></span>
          <span>الأجر اليومي <b>${worker.dailyWage?.toLocaleString('ar-EG')} ج.م</b></span>
          <span>الفترة <b>${periodText}</b></span>
          <span>الصرف <b>${payTypeLabel} — ${walletDetail}</b></span>
        </div>
        ${transferBox}
        <table>
          <thead>
            <tr><th>#</th><th>التاريخ</th><th>الحضور</th><th>الإضافي</th><th>العمدان</th><th>الخصم</th><th>السلف</th><th>إجمالي اليوم</th></tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" class="empty">لا توجد سجلات في هذه الفترة</td></tr>'}
          </tbody>
          <tfoot>
            <tr class="total-row"><td colspan="7" class="r">إجمالي اليوميات</td><td class="num">${dailyTotal.toLocaleString('ar-EG')} ج.م</td></tr>
            ${paidPrevLine}
            ${transfersLine}
            <tr class="net"><td colspan="7" class="r">إجمالي المستحق</td><td class="num">${payroll.net.toLocaleString('ar-EG')} ج.م</td></tr>
          </tfoot>
        </table>
        ${paidSealHtml}
        ${transfersTableHtml}
        <div class="footer">شركة المناهري للمقاولات العمومية — ${new Date().toLocaleDateString('ar-EG')}</div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">القبض</h2>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          <input type="text" placeholder="بحث بالاسم أو الكود..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
            <option value="">كل الوظائف</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button onClick={() => setPayFilter('unpaid')}
              className={`px-3 py-2 text-xs font-medium transition ${payFilter === 'unpaid' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              لم يصرف ({payableWorkers.filter(w => !isPaidWorker(w.id)).length})
            </button>
            <button onClick={() => setPayFilter('paid')}
              className={`px-3 py-2 text-xs font-medium transition ${payFilter === 'paid' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              تم الصرف ({payableWorkers.filter(w => isPaidWorker(w.id)).length})
            </button>
            <button onClick={() => setPayFilter('all')}
              className={`px-3 py-2 text-xs font-medium transition ${payFilter === 'all' ? 'bg-gray-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              الكل ({payableWorkers.length})
            </button>
          </div>
          <input type="date" value={dateFrom} onChange={e => handleDateFromChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="من تاريخ" />
          <input type="date" value={dateTo} onChange={e => handleDateToChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="إلى تاريخ" />
          {userPickedPeriod && (
            <button onClick={() => { setUserPickedPeriod(false); setDateTo(''); }}
              title="يرجع الفترة تتبع الشهر الحالي تلقائيًا من تاني"
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition">
              رجوع لمتابعة الشهر الحالي تلقائيًا
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={prevCardsMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition" title="الشهر السابق">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h3 className="font-bold text-gray-700 text-sm">
            أسابيع الصرف — {ARABIC_MONTHS[parseInt(weekCardsMonth.substring(5, 7)) - 1]} {weekCardsMonth.substring(0, 4)}
          </h3>
          <button onClick={nextCardsMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition" title="الشهر التالي">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <span className="text-[11px] text-gray-400">كل أسبوع من السبت للجمعة — حتى لو قاطع شهرين</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {monthWeeks.map(w => {
          const isActive = dateFrom === w.start && dateTo === w.end;
          return (
            <button
              key={w.key}
              onClick={() => handleWeekCardPick(w.start, w.end)}
              className={`text-right bg-white rounded-xl shadow-sm border-2 p-4 transition cursor-pointer hover:shadow-md ${weekCardStyle[w.status]} ${isActive ? 'ring-2 ring-primary-500' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-gray-800">{w.label}</h4>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${weekStatusBadge[w.status]}`}>
                  {weekStatusLabel[w.status]}
                </span>
              </div>
              <div className="text-xs text-gray-500 mb-2">
                من {w.start} ({dayNameOf(w.start)}) إلى {w.end} ({dayNameOf(w.end)})
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">إجمالي الأجر المستحق</span>
                  <span className="font-bold text-gray-700">{(w.stats?.total || 0).toLocaleString('ar-EG')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">اللي اتصرف (قبض + تحويلات)</span>
                  <span className="font-bold text-rose-600">{(w.stats?.paid || 0).toLocaleString('ar-EG')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">الباقي</span>
                  <span className="font-bold text-amber-600">{(w.stats?.remaining || 0).toLocaleString('ar-EG')}</span>
                </div>
              </div>
              {isActive && (
                <div className="mt-2 pt-2 border-t border-gray-200 text-[10px] font-bold text-primary-600">✓ معروض الآن — اضغط كارت آخر لتغيير الأسبوع</div>
              )}
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-3 border-b border-gray-100 bg-gray-50">
          <p className="text-sm text-gray-500 font-medium">اختر عامل من القائمة ({displayWorkers.length} عامل)</p>
        </div>
        <div className="max-h-[320px] overflow-y-auto divide-y divide-gray-100">
          {displayWorkers.map(w => {
            const isPaid = isPaidWorker(w.id);
            const isSelected = selectedWorker === w.id;
            return (
              <button key={w.id} onClick={() => setSelectedWorker(w.id)}
                className={`w-full text-right px-4 py-3 flex items-center gap-4 transition ${
                  isSelected ? 'bg-primary-50 border-r-4 border-primary-600' : 'hover:bg-gray-50'
                }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                  isPaid ? 'bg-green-100 text-green-700' : 'bg-primary-100 text-primary-700'
                }`}>
                  {isPaid ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    w.name.charAt(0)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{w.name}</span>
                    <span className="text-xs text-gray-400">{w.code}</span>
                    <span className="bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded text-[10px]">{w.role}</span>
                    {isPaid && (
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">تم الصرف</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{(w.dailyWage || 0).toLocaleString('ar-EG')} ج.م / يوم</div>
                </div>
                {isSelected && (
                  <svg className="w-5 h-5 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                )}
              </button>
            );
          })}
          {displayWorkers.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">لا يوجد عمال</div>
          )}
        </div>
      </div>

      {worker && payroll && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 text-lg">بيانات العامل</h3>
              {isPaidWorker(worker.id) && (
                <span className="bg-green-600 text-white px-5 py-2 rounded-xl text-base font-bold flex items-center gap-2 shadow-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  تم الصرف بنجاح
                </span>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">الاسم</span>
                <span className="font-bold">{worker.name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">الكود</span>
                <span className="font-bold text-primary-600">{worker.code}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">الوظيفة</span>
                <span>{worker.role}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">الأجر اليومي</span>
                <span className="font-bold">{worker.dailyWage?.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">الهاتف</span>
                <span dir="ltr">{worker.phone || '-'}</span>
              </div>
              {(worker.walletNumber || worker.walletName) && (
                <>
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-600">رقم المحفظة</span>
                    <span dir="ltr">{worker.walletNumber || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-gray-600">اسم المحفظة</span>
                    <span>{worker.walletName || '-'}</span>
                  </div>
                </>
              )}
              {workerPayments.length > 0 && (
                <>
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <p className="text-sm font-bold text-gray-700 mb-2">سجل الصرف السابق</p>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {workerPayments.map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 text-sm">
                        <span className="text-gray-500">
                          {new Date(p.date).toLocaleDateString('ar-EG')} — {PAYMENT_TYPES.find(x => x.value === p.paymentType)?.label || p.paymentType}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-green-600">{(p.amount || 0).toLocaleString('ar-EG')} ج.م</span>
                          <button
                            onClick={() => {
                              if (window.confirm('هل تريد إلغاء (تراجع) هذا الصرف؟ سيعود العامل مستحقاً ويمكنك إعادة الصرف من جديد.')) {
                                deletePayment(p.id);
                              }
                            }}
                            title="إلغاء هذا الصرف"
                            className="text-red-500 hover:bg-red-50 p-1 rounded transition flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-gray-800 text-lg mb-4">الحساب</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">أيام الحضور (عادي + عمدان)</span>
                <span className="font-bold text-green-600">{payroll.daysWorked} يوم</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">أيام الغياب</span>
                <span className="font-bold text-red-600">{payroll.absentDays} يوم</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">منها أيام عمدان</span>
                <span className="font-bold text-blue-600">{payroll.pillarDays} يوم</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">أجر الأيام العادية ({payroll.regularDays} يوم × {(worker.dailyWage || 0).toLocaleString('ar-EG')})</span>
                <span>{payroll.daysPay.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">تكلفة العمدان</span>
                <span>{payroll.pillarPay.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">الإضافي</span>
                <span className="text-blue-600">{payroll.overtime.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-200 font-bold">
                <span>الإجمالي</span>
                <span>{payroll.gross.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">الخصم</span>
                <span className="text-red-600">- {payroll.deductions.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">السلف</span>
                <span className="text-red-600">- {payroll.advances.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-600">التحويلات</span>
                <span className="text-red-600">- {payroll.transfers.toLocaleString('ar-EG')} ج.م</span>
              </div>
              <div className="flex justify-between py-2 bg-green-50 px-3 rounded-lg font-bold text-lg">
                <span className="text-green-800">الصافي</span>
                <span className="text-green-700">{payroll.net.toLocaleString('ar-EG')} ج.م</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-lg">كشف يومي ({dateFrom || 'من البداية'} إلى {dateTo || 'حتى الآن'})</h3>
              <span className="text-xs text-gray-400">{dailyRows.length} يوم</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-3 text-right font-semibold text-gray-600 w-12">#</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-600">التاريخ</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600">الحضور</th>
                    <th className="px-3 py-3 text-center font-semibold text-blue-600">الإضافي</th>
                    <th className="px-3 py-3 text-center font-semibold text-purple-600">العمدان</th>
                    <th className="px-3 py-3 text-center font-semibold text-red-600">الخصم</th>
                    <th className="px-3 py-3 text-center font-semibold text-orange-600">السلف</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600">الحالة</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600">إجمالي اليوم</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-600">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dailyRows.map((r, i) => (
                    <tr key={r.date} className="hover:bg-gray-50 transition">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{r.date} <span className="text-gray-400 text-xs">({dayNameOf(r.date)})</span></td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                          r.pillarCost > 0 ? 'bg-purple-100 text-purple-700'
                          : r.status === 'present' ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-600'
                        }`}>
                          {r.pillarCost > 0 ? 'عمدان' : r.status === 'present' ? 'حاضر' : 'غائب'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-bold text-blue-600">{r.overtime ? r.overtime.toLocaleString('ar-EG') : '-'}</td>
                      <td className="px-3 py-2 text-center font-bold text-purple-600">{r.pillarCost ? r.pillarCost.toLocaleString('ar-EG') : '-'}</td>
                      <td className="px-3 py-2 text-center font-bold text-red-600">{r.deduction ? '-' + r.deduction.toLocaleString('ar-EG') : '-'}</td>
                      <td className="px-3 py-2 text-center font-bold text-orange-600">{r.advance ? '-' + r.advance.toLocaleString('ar-EG') : '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {r.paid ? 'مدفوع' : 'مستحق'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-bold text-gray-800">{r.dayTotal.toLocaleString('ar-EG')} ج.م</td>
                      <td className="px-3 py-2 text-center">
                        {r.paid ? (
                          <span className="text-gray-300 text-xs">—</span>
                        ) : (
                          <button
                            onClick={() => handlePayThroughDate(r.date)}
                            disabled={netThroughDate(worker, r.date) <= 0}
                            title="صرف هذا اليوم وكل الأيام المستحقة قبله"
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1 rounded-lg text-xs font-medium transition"
                          >
                            صرف
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {dailyRows.length === 0 && (
                    <tr><td colSpan={10} className="text-center py-6 text-gray-400">لا توجد سجلات في هذه الفترة</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={9} className="px-3 py-2.5 text-left font-bold text-gray-700">إجمالي اليوميات</td>
                    <td className="px-3 py-2.5 text-center font-bold text-gray-800">{dailyTotal.toLocaleString('ar-EG')} ج.م</td>
                  </tr>
                  {paidDayTotal !== 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-1.5 text-left font-semibold text-gray-500">المدفوع سابقاً (أيام مغلقة)</td>
                      <td className="px-3 py-1.5 text-center font-bold text-red-600">- {Math.abs(paidDayTotal).toLocaleString('ar-EG')} ج.م</td>
                    </tr>
                  )}
                  {payroll.transfers > 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-1.5 text-left font-semibold text-gray-500">التحويلات</td>
                      <td className="px-3 py-1.5 text-center font-bold text-red-600">- {payroll.transfers.toLocaleString('ar-EG')} ج.م</td>
                    </tr>
                  )}
                  <tr className="bg-green-50">
                    <td colSpan={9} className="px-3 py-2.5 text-left font-bold text-green-800">إجمالي المستحق</td>
                    <td className="px-3 py-2.5 text-center font-bold text-green-700 text-lg">{payroll.net.toLocaleString('ar-EG')} ج.م</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {workerTransfers.length > 0 && (
              <div className="border-t border-gray-200">
                <div className="px-6 py-3 bg-purple-50 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold text-purple-800 text-sm flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                    التحويلات المسجلة ({workerTransfers.length})
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600 w-12">#</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">التاريخ</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-gray-600">نوع الصرف</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">المحفظة / الانستا</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">الرقم المحول إليه</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">رقم المعاملة</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-red-600">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {workerTransfers.map((t, i) => {
                        const typeLabel = PAYMENT_TYPES.find(x => x.value === t.paymentType)?.label || t.paymentType;
                        const badgeClass = t.paymentType === 'insta' ? 'bg-purple-100 text-purple-700'
                          : t.paymentType === 'wallet' ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700';
                        return (
                          <tr key={t.id} className="hover:bg-gray-50 transition">
                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-2 font-medium">{new Date(t.date).toLocaleDateString('ar-EG')}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${badgeClass}`}>{typeLabel}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{transferWalletLabel(t)}</td>
                            <td className="px-3 py-2 text-gray-600" dir="ltr">{t.phone || '-'}</td>
                            <td className="px-3 py-2 text-gray-600" dir="ltr">{t.transactionId || '-'}</td>
                            <td className="px-3 py-2 text-center font-bold text-red-600">{(t.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">نوع الصرف:</label>
                <select value={payType} onChange={e => { setPayType(e.target.value); setWalletNumber(''); setWalletName(''); }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  {PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              {(payType === 'insta' || payType === 'wallet') && (
                <>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">رقم المحفظة:</label>
                    <input type="text" value={walletNumber} onChange={e => setWalletNumber(e.target.value)}
                      placeholder={worker?.walletNumber || '01...'}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" dir="ltr" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">اسم المحفظة:</label>
                    <input type="text" value={walletName} onChange={e => setWalletName(e.target.value)}
                      placeholder={worker?.walletName || 'اسم الحساب'}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
                  </div>
                </>
              )}
              <button onClick={handlePay} disabled={isPaidWorker(worker.id) || payroll.net <= 0}
                className={`px-6 py-2 rounded-lg font-medium transition flex items-center gap-2 ${isPaidWorker(worker.id) || payroll.net <= 0 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
                {isPaidWorker(worker.id) ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                )}
                {isPaidWorker(worker.id) ? 'تم الصرف' : 'قبض المرتب'}
              </button>
              <button onClick={generatePDF}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                تحميل PDF
              </button>
              <button onClick={sendWhatsApp}
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                إرسال واتساب
              </button>
            </div>
          </div>
        </div>
      )}

      {!worker && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          <p className="text-lg">اختر عامل من القائمة أعلاه لعرض كشف القبض</p>
        </div>
      )}
    </div>
  );
}
