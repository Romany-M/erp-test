import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { PAYMENT_TYPES, todayISO } from '../utils/constants';

export default function ExpensesReportPage() {
  const { workers, attendance, advances, custody, foodExpenses, purchases, transfers, pillars, contractors, contractorPayments, payments } = useApp();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => todayISO().substring(0, 7));
  const today = todayISO();

  const activeWorkers = workers.filter(w => w.status === 'active');

  const monthWeeks = useMemo(() => {
    const y = parseInt(selectedMonth.substring(0, 4));
    const m = parseInt(selectedMonth.substring(5, 7));
    const lastDay = new Date(y, m, 0).getDate();
    return [
      { key: 1, label: 'الأسبوع الأول', start: `${selectedMonth}-01`, end: `${selectedMonth}-07` },
      { key: 2, label: 'الأسبوع الثاني', start: `${selectedMonth}-08`, end: `${selectedMonth}-14` },
      { key: 3, label: 'الأسبوع الثالث', start: `${selectedMonth}-15`, end: `${selectedMonth}-21` },
      { key: 4, label: 'الأسبوع الرابع', start: `${selectedMonth}-22`, end: `${selectedMonth}-${String(lastDay).padStart(2, '0')}` },
    ];
  }, [selectedMonth]);

  const computeWageStats = (from, to) => {
    const inRange = (d) => (d || '') >= from && (d || '') <= to;
    let total = 0;
    let remaining = 0;
    activeWorkers.forEach(w => {
      const att = attendance.filter(a => a.workerId === w.id && inRange(a.date) && (a.status === 'present' || a.pillarCost > 0));
      if (att.length === 0) return;
      const paidForRange = payments.some(p => {
        if (p.workerId !== w.id) return false;
        if (p.dateTo && p.dateTo !== 'النهاية') return p.dateTo >= to;
        return (p.date ? p.date.substring(0, 10) : '') >= from;
      });
      const adv = advances.filter(a => a.workerId === w.id && inRange(a.date));
      const trn = transfers.filter(t => t.workerId === w.id && inRange(t.date));
      const pil = pillars.filter(p => p.workerId === w.id && inRange(p.date));
      const present = att.filter(a => a.status === 'present' && !(a.pillarCost > 0));
      const pillarAtt = att.filter(a => a.pillarCost > 0);
      const pillarDays = new Set([...pil.map(p => p.date), ...pillarAtt.map(a => a.date)]);
      const regularDays = present.filter(a => !pillarDays.has(a.date)).length;
      const daysPay = regularDays * (w.dailyWage || 0);
      const pillarPay = pil.reduce((s, p) => s + (p.cost || 0), 0) + att.reduce((s, a) => s + (a.pillarCost || 0), 0);
      const overtime = att.reduce((s, a) => s + (a.overtimeValue || 0), 0);
      const deductTotal = att.reduce((s, a) => s + (a.deduction || 0), 0);
      const advTotal = adv.reduce((s, a) => s + (a.amount || 0), 0);
      const transTotal = trn.reduce((s, t) => s + (t.amount || 0), 0);
      const net = (daysPay + pillarPay + overtime) - advTotal - transTotal - deductTotal;
      total += net;
      if (!paidForRange) remaining += net;
    });
    const weekPayments = payments.filter(p => {
      if (p.dateTo && p.dateTo !== 'النهاية') return p.dateTo >= from && (p.dateFrom || '') <= to;
      const pd = (p.date || '').substring(0, 10);
      return pd >= from && pd <= to;
    });
    const paid = weekPayments.reduce((s, p) => s + (p.amount || 0), 0)
      + transfers.filter(t => t.date >= from && t.date <= to).reduce((s, t) => s + (t.amount || 0), 0);
    return { total, paid, remaining };
  };

  const weekTotals = monthWeeks.map(w => ({ ...w, wageStats: computeWageStats(w.start, w.end) }));

  const weekStyle = {
    done: 'border-green-500 bg-green-50',
    current: 'border-amber-400 bg-amber-50',
    upcoming: 'border-gray-200 bg-gray-50',
  };
  const weekStatusLabel = { done: 'منتهي', current: 'الحالي', upcoming: 'لم يبدأ' };
  const weekStatusBadge = {
    done: 'bg-green-600 text-white',
    current: 'bg-amber-500 text-white',
    upcoming: 'bg-gray-400 text-white',
  };

  const getWorkerName = (workerId) => {
    const w = workers.find(wk => wk.id === workerId);
    return w?.name || workerId || '-';
  };

  const filterByDate = (data) => {
    let filtered = [...data];
    if (dateFrom) filtered = filtered.filter(d => d.date >= dateFrom);
    if (dateTo) filtered = filtered.filter(d => d.date <= dateTo);
    return filtered;
  };

  const paymentDateKey = (p) => {
    if (p.date) return String(p.date).substring(0, 10);
    if (p.dateTo && p.dateTo !== 'النهاية') return p.dateTo;
    if (p.dateFrom && p.dateFrom !== 'البداية') return p.dateFrom;
    return '';
  };

  const fPayments = useMemo(() => filterByDate(
    payments.map(p => ({ ...p, date: paymentDateKey(p) }))
  ), [payments, dateFrom, dateTo]);

  const fAdvances = useMemo(() => filterByDate(advances), [advances, dateFrom, dateTo]);
  const fCustody = useMemo(() => filterByDate(custody), [custody, dateFrom, dateTo]);
  const fFood = useMemo(() => filterByDate(foodExpenses), [foodExpenses, dateFrom, dateTo]);
  const fPurchases = useMemo(() => filterByDate(purchases), [purchases, dateFrom, dateTo]);
  const fTransfers = useMemo(() => filterByDate(transfers), [transfers, dateFrom, dateTo]);
  const fPillars = useMemo(() => filterByDate(pillars), [pillars, dateFrom, dateTo]);
  const fContractors = useMemo(() => filterByDate(
    contractorPayments.filter(c => c.paid).map(c => ({ ...c, date: c.paidAt || c.date }))
  ), [contractorPayments, dateFrom, dateTo]);

  const totalAdvances = fAdvances.reduce((s, a) => s + (a.amount || 0), 0);
  const totalCustody = fCustody.reduce((s, c) => s + (c.amount || 0), 0);
  const totalFood = fFood.reduce((s, f) => s + (f.totalAmount || 0), 0);
  const totalPurchases = fPurchases.reduce((s, p) => s + (p.amount || 0), 0);
  const totalTransfers = fTransfers.reduce((s, t) => s + (t.amount || 0), 0);
  const totalPillars = fPillars.reduce((s, p) => s + (p.cost || 0), 0);
  const totalContractors = fContractors.reduce((s, c) => s + (c.amount || 0), 0);
  const totalPayments = fPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const grandTotal = totalAdvances + totalCustody + totalFood + totalPurchases + totalTransfers + totalPillars + totalContractors + totalPayments;

  const summary = [
    { label: 'السلف', amount: totalAdvances, count: fAdvances.length, color: 'orange' },
    { label: 'العهد', amount: totalCustody, count: fCustody.length, color: 'blue' },
    { label: 'المصروفات', amount: totalFood, count: fFood.length, color: 'red' },
    { label: 'المشتريات', amount: totalPurchases, count: fPurchases.length, color: 'purple' },
    { label: 'التحويلات', amount: totalTransfers, count: fTransfers.length, color: 'green' },
    { label: 'مراحل البناء', amount: totalPillars, count: fPillars.length, color: 'indigo' },
    { label: 'المقاولين (المدفوع)', amount: totalContractors, count: fContractors.length, color: 'slate' },
    { label: 'القبض (رواتب)', amount: totalPayments, count: fPayments.length, color: 'rose' },
  ];

  const colorMap = {
    orange: 'bg-orange-500',
    blue: 'bg-blue-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    indigo: 'bg-indigo-500',
    slate: 'bg-slate-500',
    rose: 'bg-rose-500',
  };

  const fmt = (n) => (n || 0).toLocaleString('ar-EG');
  const dateLabel = (d) => new Date(d).toLocaleDateString('ar-EG');
  const typeLabel = (t) => PAYMENT_TYPES.find(pt => pt.value === t)?.label || t;

  const generatePDF = () => {
    const printWindow = window.open('', '_blank');
    const periodInfo = `${dateFrom || 'البداية'} إلى ${dateTo || 'النهاية'}`;
    const table = (title, headers, rows) => rows.length === 0 ? '' : `
      <h3 style="color:#1e40af;margin:20px 0 6px 0;font-size:16px">${title}</h3>
      <table>
        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        ${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
      </table>`;

    const summaryRows = summary.map(s => `
      <tr><td>${s.label}</td><td>${s.count} سجل</td><td>${fmt(s.amount)} ج.م</td></tr>`
    ).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>
          * { font-family: 'Tajawal', sans-serif; }
          body { padding: 20px; direction: rtl; }
          .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
          .header h1 { color: #1e40af; font-size: 22px; margin: 0; }
          .header h2 { color: #dc2626; font-size: 20px; margin: 10px 0 0 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
          th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: center; }
          th { background: #2563eb; color: white; }
          .total-row { background: #fef2f2; font-weight: bold; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>تقرير المصروفات - شركة المناهري للمقاولات العمومية</h1>
          <p style="color:#666">${new Date().toLocaleDateString('ar-EG')} - الفترة: ${periodInfo}</p>
        </div>
        <table>
          <tr><th>القسم</th><th>عدد السجلات</th><th>الإجمالي</th></tr>
          ${summaryRows}
          <tr class="total-row"><td colspan="2">إجمالي المصروفات</td><td>${fmt(grandTotal)} ج.م</td></tr>
        </table>
        ${table('تفاصيل السلف', ['التاريخ', 'العامل', 'المبلغ', 'نوع الصرف', 'ملاحظات'],
          fAdvances.map(a => [dateLabel(a.date), getWorkerName(a.workerId), `${fmt(a.amount)} ج.م`, typeLabel(a.paymentType), a.notes || '-']))}
        ${table('تفاصيل العهد', ['التاريخ', 'العامل', 'المبلغ', 'نوع الصرف', 'ملاحظات'],
          fCustody.map(c => [dateLabel(c.date), getWorkerName(c.workerId), `${fmt(c.amount)} ج.م`, typeLabel(c.paymentType), c.notes || '-']))}
        ${table('تفاصيل المصروفات', ['التاريخ', 'المورد / الاسم', 'القسم', 'المبلغ', 'نوع الصرف', 'ملاحظات'],
          fFood.map(f => [dateLabel(f.date), f.supplier, f.category || 'أخرى', `${fmt(f.totalAmount)} ج.م`, typeLabel(f.paymentType), f.notes || '-']))}
        ${table('تفاصيل المشتريات', ['التاريخ', 'المورد', 'المبلغ', 'نوع الصرف', 'ملاحظات'],
          fPurchases.map(p => [dateLabel(p.date), p.supplier || '-', `${fmt(p.amount)} ج.م`, typeLabel(p.paymentType), p.notes || '-']))}
        ${table('تفاصيل التحويلات', ['التاريخ', 'العامل', 'المبلغ', 'نوع الصرف', 'ملاحظات'],
          fTransfers.map(t => [dateLabel(t.date), getWorkerName(t.workerId), `${fmt(t.amount)} ج.م`, typeLabel(t.paymentType), t.notes || '-']))}
        ${table('تفاصيل مراحل البناء', ['التاريخ', 'العامل', 'التكلفة', 'ملاحظات'],
          fPillars.map(p => [dateLabel(p.date), getWorkerName(p.workerId), `${fmt(p.cost)} ج.م`, p.notes || '-']))}
        ${table('تفاصيل المقاولين (المدفوع)', ['التاريخ', 'المقاول', 'المبلغ', 'نوع الصرف', 'ملاحظات'],
          fContractors.map(c => {
            const contractor = contractors.find(x => x.id === c.contractorId);
            return [dateLabel(c.date), contractor?.name || '—', `${fmt(c.amount)} ج.م`, typeLabel(c.paymentType), c.paidBy ? `من: ${c.paidBy}` : '-'];
          }))}
        ${table('تفاصيل القبض (رواتب)', ['التاريخ', 'العامل', 'المبلغ', 'نوع الصرف'],
          fPayments.map(p => [dateLabel(p.date), p.workerName || getWorkerName(p.workerId), `${fmt(p.amount)} ج.م`, typeLabel(p.paymentType)]))}
        <p style="text-align:center;color:#999;margin-top:20px;font-size:11px">شركة المناهري للمقاولات العمومية</p>
        <script>window.onload=function(){window.print()}</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">تقرير المصروفات</h2>
        <button onClick={generatePDF}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          تحميل PDF
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-sm text-gray-600">فترة:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          <span className="text-gray-400">إلى</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          <button onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition">مسح الفلتر</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">اختر الشهر</label>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <p className="text-xs text-gray-400 pb-2">القبض والرواتب موزعة على أسابيع الشهر المختار</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {weekTotals.map(w => {
          const status = (w.end < today) ? 'done' : (w.start <= today && today <= w.end) ? 'current' : 'upcoming';
          return (
            <div key={w.key} className={`bg-white rounded-xl shadow-sm border-2 p-4 flex flex-col ${weekStyle[status]}`}>
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-bold text-gray-800 text-sm">{w.label}</h4>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${weekStatusBadge[status]}`}>{weekStatusLabel[status]}</span>
              </div>
              <div className="text-[11px] text-gray-500 mb-2">من {w.start} إلى {w.end}</div>
              <div className="flex-1 space-y-2">
                <div className="bg-primary-50/60 rounded-lg p-2 space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">إجمالي القبض</span>
                    <span className="font-bold text-gray-700">{w.wageStats.total.toLocaleString('ar-EG')}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">اللي تم صرفه</span>
                    <span className="font-bold text-rose-600">{w.wageStats.paid.toLocaleString('ar-EG')}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">لم يتم الصرف</span>
                    <span className="font-bold text-amber-600">{w.wageStats.remaining.toLocaleString('ar-EG')}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {summary.map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center hover:shadow-md transition">
            <div className={`w-8 h-1 mx-auto mb-2 rounded ${colorMap[s.color]}`} />
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className="text-lg font-bold text-gray-800">{s.amount.toLocaleString('ar-EG')}</p>
            <p className="text-xs text-gray-400">{s.count} سجل</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800 text-lg">إجمالي المصروفات</h3>
          <span className="text-2xl font-bold text-primary-600">{grandTotal.toLocaleString('ar-EG')} ج.م</span>
        </div>
        <div className="space-y-3">
          {summary.map(s => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-36">{s.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-4">
                <div className={`${colorMap[s.color]} h-4 rounded-full transition-all`}
                  style={{ width: `${grandTotal > 0 ? (s.amount / grandTotal) * 100 : 0}%` }} />
              </div>
              <span className="text-sm font-bold text-gray-700 w-28 text-left">{s.amount.toLocaleString('ar-EG')} ج.م</span>
              <span className="text-xs text-gray-400 w-16 text-left">{grandTotal > 0 ? ((s.amount / grandTotal) * 100).toFixed(1) : 0}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <h3 className="font-bold text-gray-800 p-4 border-b">تفاصيل السلف</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">التاريخ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">العامل</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">المبلغ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">نوع الصرف</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fAdvances.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{new Date(a.date).toLocaleDateString('ar-EG')}</td>
                  <td className="px-4 py-2 font-medium">{getWorkerName(a.workerId)}</td>
                  <td className="px-4 py-2 font-bold text-orange-600">{(a.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td className="px-4 py-2">{PAYMENT_TYPES.find(p => p.value === a.paymentType)?.label || a.paymentType}</td>
                  <td className="px-4 py-2 text-gray-500">{a.notes || '-'}</td>
                </tr>
              ))}
              {fAdvances.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <h3 className="font-bold text-gray-800 p-4 border-b">تفاصيل العهد</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">التاريخ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">العامل</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">المبلغ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">نوع الصرف</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fCustody.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{new Date(c.date).toLocaleDateString('ar-EG')}</td>
                  <td className="px-4 py-2 font-medium">{getWorkerName(c.workerId)}</td>
                  <td className="px-4 py-2 font-bold text-blue-600">{(c.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td className="px-4 py-2">{PAYMENT_TYPES.find(p => p.value === c.paymentType)?.label || c.paymentType}</td>
                  <td className="px-4 py-2 text-gray-500">{c.notes || '-'}</td>
                </tr>
              ))}
              {fCustody.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <h3 className="font-bold text-gray-800 p-4 border-b">تفاصيل المصروفات</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">التاريخ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">المورد / الاسم</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">القسم</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">المبلغ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">نوع الصرف</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fFood.map(f => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{new Date(f.date).toLocaleDateString('ar-EG')}</td>
                  <td className="px-4 py-2 font-medium">{f.supplier}</td>
                  <td className="px-4 py-2"><span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">{f.category || 'أخرى'}</span></td>
                  <td className="px-4 py-2 font-bold text-red-600">{(f.totalAmount || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td className="px-4 py-2">{PAYMENT_TYPES.find(p => p.value === f.paymentType)?.label || f.paymentType}</td>
                  <td className="px-4 py-2 text-gray-500">{f.notes || '-'}</td>
                </tr>
              ))}
              {fFood.length === 0 && <tr><td colSpan={6} className="text-center py-4 text-gray-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <h3 className="font-bold text-gray-800 p-4 border-b">تفاصيل المشتريات</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">التاريخ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">المورد</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">المبلغ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">نوع الصرف</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fPurchases.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{new Date(p.date).toLocaleDateString('ar-EG')}</td>
                  <td className="px-4 py-2 font-medium">{p.supplier || '-'}</td>
                  <td className="px-4 py-2 font-bold text-purple-600">{(p.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td className="px-4 py-2">{PAYMENT_TYPES.find(pt => pt.value === p.paymentType)?.label || p.paymentType}</td>
                  <td className="px-4 py-2 text-gray-500">{p.notes || '-'}</td>
                </tr>
              ))}
              {fPurchases.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <h3 className="font-bold text-gray-800 p-4 border-b">تفاصيل التحويلات</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">التاريخ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">العامل</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">المبلغ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">نوع الصرف</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fTransfers.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{new Date(t.date).toLocaleDateString('ar-EG')}</td>
                  <td className="px-4 py-2 font-medium">{getWorkerName(t.workerId)}</td>
                  <td className="px-4 py-2 font-bold text-green-600">{(t.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td className="px-4 py-2">{PAYMENT_TYPES.find(pt => pt.value === t.paymentType)?.label || t.paymentType}</td>
                  <td className="px-4 py-2 text-gray-500">{t.notes || '-'}</td>
                </tr>
              ))}
              {fTransfers.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <h3 className="font-bold text-gray-800 p-4 border-b">تفاصيل مراحل البناء</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">التاريخ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">العامل</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">التكلفة</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fPillars.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{new Date(p.date).toLocaleDateString('ar-EG')}</td>
                  <td className="px-4 py-2 font-medium">{getWorkerName(p.workerId)}</td>
                  <td className="px-4 py-2 font-bold text-indigo-600">{(p.cost || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td className="px-4 py-2 text-gray-500">{p.notes || '-'}</td>
                </tr>
              ))}
              {fPillars.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-gray-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <h3 className="font-bold text-gray-800 p-4 border-b">تفاصيل المقاولين (المدفوع)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">التاريخ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">المقاول</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">المبلغ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">نوع الصرف</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fContractors.map(c => {
                const contractor = contractors.find(x => x.id === c.contractorId);
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{new Date(c.date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-4 py-2 font-medium">{contractor?.name || '—'}</td>
                    <td className="px-4 py-2 font-bold text-slate-600">{(c.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                    <td className="px-4 py-2">{PAYMENT_TYPES.find(pt => pt.value === c.paymentType)?.label || c.paymentType}</td>
                    <td className="px-4 py-2 text-gray-500">{c.paidBy ? `من: ${c.paidBy}` : '-'}</td>
                  </tr>
                );
              })}
              {fContractors.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <h3 className="font-bold text-gray-800 p-4 border-b">تفاصيل القبض (رواتب)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">التاريخ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">العامل</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">المبلغ</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">نوع الصرف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fPayments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{new Date(p.date).toLocaleDateString('ar-EG')}</td>
                  <td className="px-4 py-2 font-medium">{p.workerName || getWorkerName(p.workerId)}</td>
                  <td className="px-4 py-2 font-bold text-rose-600">{(p.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td className="px-4 py-2">{PAYMENT_TYPES.find(pt => pt.value === p.paymentType)?.label || p.paymentType}</td>
                </tr>
              ))}
              {fPayments.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-gray-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
