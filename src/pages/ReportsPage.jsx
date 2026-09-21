import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ROLES, todayISO } from '../utils/constants';
import { calcWorkerNet, isWorkerPaidForRange, sumPayableNet } from '../domain/payroll';

function getDateRange(period, dateStr) {
  const d = new Date(dateStr);
  if (period === 'day') {
    const iso = d.toISOString().slice(0, 10);
    return { from: iso, to: iso };
  }
  if (period === 'week') {
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - ((day + 1) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export default function ReportsPage() {
  const { workers, attendance, advances, transfers, pillars, payments, foodExpenses, purchases, externalTransfers, contractorPayments } = useApp();
  const [filterRole, setFilterRole] = useState('');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('month');
  const [periodDate, setPeriodDate] = useState(todayISO());

  const sectionConfigs = [
    { key: 'advances', label: 'السلف', color: 'text-orange-600' },
    { key: 'food', label: 'مصروفات الأكل', color: 'text-red-600' },
    { key: 'purchases', label: 'المشتريات', color: 'text-purple-600' },
    { key: 'transfers', label: 'تحويلات العمال', color: 'text-rose-600' },
    { key: 'externalTransfers', label: 'تحويلات خارجية', color: 'text-cyan-600' },
    { key: 'contractors', label: 'المقاولين (المدفوع)', color: 'text-slate-600' },
    { key: 'payments', label: 'القبض (رواتب)', color: 'text-amber-600' },
  ];
  const [selectedSections, setSelectedSections] = useState(sectionConfigs.map(s => s.key));

  const toggleSection = (key) => {
    setSelectedSections(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const activeWorkers = useMemo(() => workers.filter(w => w.status === 'active'), [workers]);

  // Uses the same calcWorkerNet/isWorkerPaidForRange the التايم شيت and
  // القبض pages use, instead of re-deriving the formula here - this used to
  // have its own hand-rolled copy that never excluded already-paid days and
  // could disagree with every other screen in the app for the same worker
  // and date range.
  const computeWageStats = (from, to) => {
    const activeAttendance = (w) => attendance.some(a =>
      a.workerId === w.id && (!from || a.date >= from) && (!to || a.date <= to) && (a.status === 'present' || a.pillarCost > 0)
    );
    const nets = activeWorkers
      .filter(activeAttendance)
      .map(w => ({
        w,
        net: calcWorkerNet(w, { attendance, advances, transfers, pillars, payments, from, to }).net,
        fullyPaid: isWorkerPaidForRange(payments, attendance, w.id, from, to),
      }));
    const total = nets.reduce((s, n) => s + n.net, 0);
    const remaining = sumPayableNet(nets.filter(n => !n.fullyPaid).map(n => n.net));
    const rangePayments = payments.filter(p => {
      if (p.dateTo && p.dateTo !== 'النهاية') return p.dateTo >= from && (p.dateFrom || '') <= to;
      const pd = p.date ? String(p.date).substring(0, 10) : (p.dateFrom && p.dateFrom !== 'البداية') ? p.dateFrom : '';
      return pd >= from && pd <= to;
    });
    const paid = rangePayments.reduce((s, p) => s + (p.amount || 0), 0)
      + transfers.filter(t => t.date >= from && t.date <= to).reduce((s, t) => s + (t.amount || 0), 0);
    return { total, paid, remaining };
  };

  const dateRange = useMemo(() => {
    if (period === 'all') return null;
    return getDateRange(period, periodDate);
  }, [period, periodDate]);

  const monthWeeks = useMemo(() => {
    const base = periodDate.substring(0, 7);
    const y = parseInt(base.substring(0, 4));
    const m = parseInt(base.substring(5, 7));
    const lastDay = new Date(y, m, 0).getDate();
    return [
      { key: 1, label: 'الأسبوع الأول', from: `${base}-01`, to: `${base}-07` },
      { key: 2, label: 'الأسبوع الثاني', from: `${base}-08`, to: `${base}-14` },
      { key: 3, label: 'الأسبوع الثالث', from: `${base}-15`, to: `${base}-21` },
      { key: 4, label: 'الأسبوع الرابع', from: `${base}-22`, to: `${base}-${String(lastDay).padStart(2, '0')}` },
    ];
  }, [periodDate]);

  const sectionSources = {
    advances: advances,
    food: foodExpenses,
    purchases: purchases,
    transfers: transfers,
    externalTransfers: externalTransfers,
    contractors: contractorPayments.filter(c => c.paid).map(c => ({ ...c, date: c.paidAt || c.date })),
    payments: payments.map(p => ({
      ...p,
      date: p.date ? String(p.date).substring(0, 10)
        : (p.dateTo && p.dateTo !== 'النهاية') ? p.dateTo
          : (p.dateFrom && p.dateFrom !== 'البداية') ? p.dateFrom : '',
    })),
  };
  const sectionAmount = (key) => key === 'food' ? (x => x.totalAmount) : (x => x.amount);

  const sectionReports = useMemo(() => {
    return sectionConfigs.map(cfg => {
      if (cfg.key === 'payments') {
        let buckets;
        if (period === 'all') {
          const stats = computeWageStats('0000-00-00', '9999-12-31');
          buckets = [{ label: 'الكل', from: 'البداية', to: 'النهاية', ...stats }];
        } else if (period === 'day' || period === 'week') {
          const range = dateRange;
          const stats = range ? computeWageStats(range.from, range.to) : { total: 0, paid: 0, remaining: 0 };
          buckets = [{
            label: period === 'day' ? 'اليوم' : 'الأسبوع',
            from: range?.from || 'البداية',
            to: range?.to || 'النهاية',
            ...stats,
          }];
        } else {
          buckets = monthWeeks.map(w => ({ ...w, ...computeWageStats(w.from, w.to) }));
        }
        const grandTotal = buckets.reduce((s, b) => s + b.total, 0);
        const paidTotal = buckets.reduce((s, b) => s + b.paid, 0);
        const remainingTotal = buckets.reduce((s, b) => s + b.remaining, 0);
        return { ...cfg, buckets, grandTotal, paidTotal, remainingTotal, isWage: true };
      }
      const source = sectionSources[cfg.key];
      const amountFn = sectionAmount(cfg.key);
      let buckets;
      if (period === 'day' || period === 'week') {
        const range = dateRange || { from: '', to: '' };
        const total = source.filter(x => (!range.from || x.date >= range.from) && (!range.to || x.date <= range.to))
          .reduce((s, x) => s + (amountFn(x) || 0), 0);
        buckets = [{ label: period === 'day' ? 'اليوم' : 'الأسبوع', from: range.from || 'البداية', to: range.to || 'النهاية', total }];
      } else if (period === 'all') {
        const total = source.reduce((s, x) => s + (amountFn(x) || 0), 0);
        buckets = [{ label: 'الكل', from: 'البداية', to: 'النهاية', total }];
      } else {
        buckets = monthWeeks.map(w => ({
          ...w,
          total: source.filter(x => x.date >= w.from && x.date <= w.to).reduce((s, x) => s + (amountFn(x) || 0), 0),
        }));
      }
      const grandTotal = buckets.reduce((s, b) => s + b.total, 0);
      return { ...cfg, buckets, grandTotal };
    });
  }, [period, dateRange, monthWeeks, advances, foodExpenses, purchases, transfers, externalTransfers, contractorPayments, payments, attendance, activeWorkers, pillars]);

  // Same calcWorkerNet used everywhere else. The old hand-rolled version here
  // (a) never excluded days already settled by a previous صرف, and (b) left
  // deductions out of netPay entirely - both fixed automatically by routing
  // through the shared function instead of recomputing it.
  const reportData = useMemo(() => {
    return activeWorkers.map(w => {
      const wPayments = payments.filter(p => p.workerId === w.id);
      const stats = calcWorkerNet(w, {
        attendance, advances, transfers, pillars, payments,
        from: dateRange?.from || '', to: dateRange?.to || '',
      });

      const isPaid = wPayments.length > 0;
      const lastPay = wPayments.length > 0 ? wPayments[wPayments.length - 1] : null;

      return {
        ...w,
        totalPresent: stats.totalDays,
        totalAbsent: stats.absentDays,
        totalAdvances: stats.advances,
        totalTransfers: stats.transfers,
        totalOvertime: stats.overtime,
        totalDeductions: stats.deductions,
        grossPay: stats.gross,
        netPay: stats.net,
        isPaid,
        lastPay,
      };
    }).filter(w => {
      if (filterRole && w.role !== filterRole) return false;
      if (search && !w.name.includes(search) && !w.code.includes(search)) return false;
      return true;
    });
  }, [activeWorkers, attendance, advances, transfers, pillars, payments, filterRole, search, dateRange]);

  const totals = useMemo(() => ({
    attendance: reportData.reduce((s, w) => s + w.totalPresent, 0),
    absent: reportData.reduce((s, w) => s + w.totalAbsent, 0),
    advances: reportData.reduce((s, w) => s + w.totalAdvances, 0),
    transfers: reportData.reduce((s, w) => s + w.totalTransfers, 0),
    overtime: reportData.reduce((s, w) => s + w.totalOvertime, 0),
    gross: reportData.reduce((s, w) => s + w.grossPay, 0),
    net: sumPayableNet(reportData.map(w => w.netPay)),
  }), [reportData]);

  const generatePDF = () => {
    const printWindow = window.open('', '_blank');
    const periodLabel = period === 'day' ? 'يومي' : period === 'week' ? 'أسبوعي' : period === 'month' ? 'شهري' : ' شامل';
    const periodDateInfo = period !== 'all' ? ` - ${period === 'day' ? 'يوم' : period === 'week' ? 'أسبوع' : 'شهر'} ${periodDate}` : '';
    const rows = reportData.map((w, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${w.name}</td>
        <td>${w.role}</td>
        <td>${w.dailyWage?.toLocaleString('ar-EG')}</td>
        <td>${w.totalPresent}</td>
        <td>${w.totalAbsent}</td>
        <td>${w.totalOvertime.toLocaleString('ar-EG')}</td>
        <td>${w.totalAdvances.toLocaleString('ar-EG')}</td>
        <td>${w.totalTransfers.toLocaleString('ar-EG')}</td>
        <td>${w.grossPay.toLocaleString('ar-EG')}</td>
        <td style="color:#166534;font-weight:bold">${w.netPay.toLocaleString('ar-EG')}</td>
        <td>${w.isPaid ? '✓ تم الصرف' : ''}</td>
      </tr>
    `).join('');

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
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: center; }
          th { background: #2563eb; color: white; }
          .total-row { background: #f1f5f9; font-weight: bold; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>التقرير${periodLabel} - شركة المناهري للمقاولات العمومية</h1>
          <p style="color:#666">${new Date().toLocaleDateString('ar-EG')}${periodDateInfo}</p>
        </div>
        <table>
          <tr>
            <th>#</th><th>الاسم</th><th>الوظيفة</th><th>الأجر</th>
            <th>أيام الحضور</th><th>أيام الغياب</th><th>الإضافي</th>
            <th>السلف</th><th>التحويلات</th><th>الإجمالي</th><th>الصافي</th><th>حالة الصرف</th>
          </tr>
          ${rows}
          <tr class="total-row">
            <td colspan="4">الإجمالي</td>
            <td>${totals.attendance}</td>
            <td>${totals.absent}</td>
            <td>${totals.overtime.toLocaleString('ar-EG')}</td>
            <td>${totals.advances.toLocaleString('ar-EG')}</td>
            <td>${totals.transfers.toLocaleString('ar-EG')}</td>
            <td>${totals.gross.toLocaleString('ar-EG')}</td>
            <td>${totals.net.toLocaleString('ar-EG')}</td>
            <td></td>
          </tr>
        </table>
        <p style="text-align:center;color:#999;margin-top:20px;font-size:11px">شركة المناهري للمقاولات العمومية</p>
        <script>window.onload=function(){window.print()}</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const generateSectionsPDF = () => {
    const printWindow = window.open('', '_blank');
    const periodLabel = period === 'day' ? 'يومي' : period === 'week' ? 'أسبوعي' : period === 'month' ? 'شهري' : 'شامل';
    const periodInfo = period !== 'all' ? ` - ${periodDate}` : '';
    const sectionsHtml = sectionReports
      .filter(r => selectedSections.includes(r.key))
      .map(r => {
        if (r.isWage) {
          return `
            <div style="margin-bottom:22px">
              <h3 style="color:#1e40af;margin:0 0 6px 0;font-size:16px">${r.label}</h3>
              <table>
                <tr><th>الفترة</th><th>من</th><th>إلى</th><th>الأجر المستحق</th><th>اتصرف (قبض+تحويلات)</th><th>الباقي</th></tr>
                ${r.buckets.map(b => `<tr><td>${b.label}</td><td>${b.from}</td><td>${b.to}</td><td>${b.total.toLocaleString('ar-EG')} ج.م</td><td>${b.paid.toLocaleString('ar-EG')} ج.م</td><td>${b.remaining.toLocaleString('ar-EG')} ج.م</td></tr>`).join('')}
                <tr class="total-row"><td colspan="3">الإجمالي</td><td>${r.grandTotal.toLocaleString('ar-EG')} ج.م</td><td>${r.paidTotal.toLocaleString('ar-EG')} ج.م</td><td>${r.remainingTotal.toLocaleString('ar-EG')} ج.م</td></tr>
              </table>
            </div>`;
        }
        return `
          <div style="margin-bottom:22px">
            <h3 style="color:#1e40af;margin:0 0 6px 0;font-size:16px">${r.label}</h3>
            <table>
              <tr><th>الفترة</th><th>من</th><th>إلى</th><th>الإجمالي</th></tr>
              ${r.buckets.map(b => `<tr><td>${b.label}</td><td>${b.from}</td><td>${b.to}</td><td>${b.total.toLocaleString('ar-EG')} ج.م</td></tr>`).join('')}
              <tr class="total-row"><td colspan="3">الإجمالي</td><td>${r.grandTotal.toLocaleString('ar-EG')} ج.م</td></tr>
            </table>
          </div>`;
      })
      .join('');

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
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
          th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: center; }
          th { background: #2563eb; color: white; }
          .total-row { background: #f1f5f9; font-weight: bold; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>تقرير الأقسام ${periodLabel} - شركة المناهري للمقاولات العمومية</h1>
          <p style="color:#666">${new Date().toLocaleDateString('ar-EG')}${periodInfo}</p>
        </div>
        ${sectionsHtml}
        <p style="text-align:center;color:#999;margin-top:20px;font-size:11px">شركة المناهري للمقاولات العمومية</p>
        <script>window.onload=function(){window.print()}</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">التقارير الشاملة</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={generatePDF}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            تحميل PDF (العمال)
          </button>
          <button onClick={generateSectionsPDF}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            PDF الأقسام المختارة
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          <input type="text" placeholder="بحث بالاسم أو الكود..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
            <option value="">كل الوظائف</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button onClick={() => setPeriod('all')}
              className={`px-3 py-2 text-xs font-medium transition ${period === 'all' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              الكل
            </button>
            <button onClick={() => setPeriod('day')}
              className={`px-3 py-2 text-xs font-medium transition ${period === 'day' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              يوم
            </button>
            <button onClick={() => setPeriod('week')}
              className={`px-3 py-2 text-xs font-medium transition ${period === 'week' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              أسبوع
            </button>
            <button onClick={() => setPeriod('month')}
              className={`px-3 py-2 text-xs font-medium transition ${period === 'month' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              شهر
            </button>
          </div>
          {period !== 'all' && (
            <input type="date" value={periodDate} onChange={e => setPeriodDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="font-bold text-gray-800">الأقسام حسب الفترة</h3>
          <div className="flex flex-wrap gap-2">
            {sectionConfigs.map(cfg => (
              <label key={cfg.key}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition select-none ${
                  selectedSections.includes(cfg.key) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}>
                <input type="checkbox" className="hidden" checked={selectedSections.includes(cfg.key)} onChange={() => toggleSection(cfg.key)} />
                {cfg.label}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sectionReports.filter(r => selectedSections.includes(r.key)).map(r => (
            <div key={r.key} className="border border-gray-200 rounded-xl p-4">
              <h4 className="font-bold text-gray-800 mb-2">{r.label}</h4>
              <div className="divide-y divide-gray-100">
                {r.buckets.map((b, i) => (
                  <div key={i} className="py-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-gray-600">{b.label}</span>
                        <span className="text-[10px] text-gray-400"> — {b.from} إلى {b.to}</span>
                      </div>
                      <span className={`font-bold ${r.color}`}>{b.total.toLocaleString('ar-EG')} ج.م</span>
                    </div>
                    {r.isWage && (
                      <div className="grid grid-cols-3 gap-1 mt-1 text-center text-[11px]">
                        <div className="bg-primary-50 rounded p-1">
                          <div className="text-gray-500">الأجر المستحق</div>
                          <div className="font-bold text-gray-700">{b.total.toLocaleString('ar-EG')}</div>
                        </div>
                        <div className="bg-rose-50 rounded p-1">
                          <div className="text-gray-500">اتصرف (قبض+تحويلات)</div>
                          <div className="font-bold text-rose-600">{b.paid.toLocaleString('ar-EG')}</div>
                        </div>
                        <div className="bg-amber-50 rounded p-1">
                          <div className="text-gray-500">الباقي</div>
                          <div className="font-bold text-amber-600">{b.remaining.toLocaleString('ar-EG')}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between font-bold text-sm">
                <span className="text-gray-700">{r.isWage ? 'إجمالي الأجر المستحق' : 'الإجمالي'}</span>
                <span className="text-gray-800">{r.grandTotal.toLocaleString('ar-EG')} ج.م</span>
              </div>
            </div>
          ))}
          {selectedSections.length === 0 && (
            <div className="col-span-full text-center py-6 text-gray-400">اختر قسمًا واحدًا على الأقل</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">إجمالي الحضور</p>
          <p className="text-lg font-bold text-green-600">{totals.attendance}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">إجمالي الإضافي</p>
          <p className="text-lg font-bold text-blue-600">{totals.overtime.toLocaleString('ar-EG')} ج.م</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">إجمالي السلف</p>
          <p className="text-lg font-bold text-orange-600">{totals.advances.toLocaleString('ar-EG')} ج.م</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">إجمالي الصافي</p>
          <p className="text-lg font-bold text-green-600">{totals.net.toLocaleString('ar-EG')} ج.م</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">#</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">الاسم</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">الوظيفة</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">الحضور</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">الغياب</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">الإضافي</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">السلف</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">التحويلات</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">الإجمالي</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">الصافي</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">حالة الصرف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reportData.map((w, i) => (
                <tr key={w.id} className="hover:bg-gray-50 transition">
                  <td className="px-3 py-2.5 text-center text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium">{w.name}</td>
                  <td className="px-3 py-2.5"><span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded text-xs">{w.role}</span></td>
                  <td className="px-3 py-2.5 text-center font-bold text-green-600">{w.totalPresent}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-red-600">{w.totalAbsent}</td>
                  <td className="px-3 py-2.5 text-center text-blue-600">{w.totalOvertime.toLocaleString('ar-EG')}</td>
                  <td className="px-3 py-2.5 text-center text-orange-600">{w.totalAdvances.toLocaleString('ar-EG')}</td>
                  <td className="px-3 py-2.5 text-center text-red-600">{w.totalTransfers.toLocaleString('ar-EG')}</td>
                  <td className="px-3 py-2.5 text-center font-bold">{w.grossPay.toLocaleString('ar-EG')}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-green-700">{w.netPay.toLocaleString('ar-EG')}</td>
                  <td className="px-3 py-2.5 text-center">
                    {w.isPaid ? (
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">
                        ✓ تم صرف المرتب
                      </span>
                    ) : '-'}
                  </td>
                </tr>
              ))}
              {reportData.length === 0 && (
                <tr><td colSpan={11} className="text-center py-8 text-gray-400">لا توجد بيانات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
