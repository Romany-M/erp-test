import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ROLES, todayISO } from '../utils/constants';
import { PAID_STAMP_DATA_URI } from '../assets/paidStamp';
import { MANAGER_SIGNATURE_DATA_URI } from '../assets/managerSignature';
import { calcWorkerNet, isWorkerPaidForRange, sumPayableNet, workerHasWorkInRange, workerHasPillarWorkInRange } from '../domain/payroll';
import { alignToSaturday } from '../utils/weeks';

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getMonthRange(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(i).padStart(2, '0');
    days.push(`${year}-${mm}-${dd}`);
  }
  return days;
}

function getWeekRange(weekStart) {
  const d = new Date(weekStart);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const nd = new Date(d);
    nd.setDate(d.getDate() + i);
    const y = nd.getFullYear();
    const m = String(nd.getMonth() + 1).padStart(2, '0');
    const dd = String(nd.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${dd}`);
  }
  return days;
}

function getMonthStart(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function getDayName(dateStr) {
  const days = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
  return days[new Date(dateStr).getDay()];
}

function isFriday(dateStr) {
  return new Date(dateStr).getDay() === 5;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function TimesheetPage() {
  const { workers, attendance, advances, transfers, pillars, payments } = useApp();
  const today = todayISO();
  const [viewMode, setViewMode] = useState('monthly');
  const [monthDate, setMonthDate] = useState(today);
  // الأسبوع هنا هو نفس أسبوع القبض بالظبط: من السبت إلى الجمعة
  const [weekStart, setWeekStart] = useState(() => alignToSaturday(today));
  const [dailyDate, setDailyDate] = useState(today);
  const [customFrom, setCustomFrom] = useState(() => getMonthStart(today));
  const [customTo, setCustomTo] = useState(today);
  const [selectedRole, setSelectedRole] = useState('الكل');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Timesheet is a payroll document, not a raw attendance log: it must only
  // list workers who actually have pay entitlement (a daily wage set).
  // Workers still on trial (no daily wage yet) are tracked in Attendance
  // but intentionally excluded here so the sheet only shows who "له قبض".
  // (العامل تحت الاختبار اللي له شغل عمدان في الفترة بيظهر برضه — عشان له قبض
  // فعلاً وبيظهر في صفحة القبض، فالإجمالي هنا يطابق القبض.)
  const payableWorkers = useMemo(
    () => workers.filter(w => w.status === 'active'),
    [workers]
  );

  const days = useMemo(() => {
    if (viewMode === 'daily') return [dailyDate];
    if (viewMode === 'custom') {
      if (!customFrom || !customTo || customFrom > customTo) return [];
      const result = [];
      const cursor = new Date(customFrom);
      const end = new Date(customTo);
      while (cursor <= end) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, '0');
        const dd = String(cursor.getDate()).padStart(2, '0');
        result.push(`${y}-${m}-${dd}`);
        cursor.setDate(cursor.getDate() + 1);
      }
      return result;
    }
    return viewMode === 'monthly' ? getMonthRange(monthDate) : getWeekRange(weekStart);
  }, [viewMode, monthDate, weekStart, dailyDate, customFrom, customTo]);

  const attendanceMap = useMemo(() => {
    const map = {};
    attendance.forEach(a => {
      if (!map[a.workerId]) map[a.workerId] = {};
      map[a.workerId][a.date] = a;
    });
    return map;
  }, [attendance]);

  // نفس شرط صفحة القبض بالظبط (workerHasWorkInRange): لازم يكون للعامل حضور أو
  // عمدان جوه الفترة دي، وله أجر يومي (أو شغل عمدان). غياب بس أو مفيش سجل = مش
  // بيظهر. كده قايمة العمال والإجمالي هنا بيطابقوا القبض لنفس الفترة.
  const activeWorkers = useMemo(() => {
    if (days.length === 0) return [];
    const range = { attendance, pillars, from: days[0], to: days[days.length - 1] };
    return payableWorkers.filter(w =>
      workerHasWorkInRange(w, range) &&
      (Number(w.dailyWage) > 0 || workerHasPillarWorkInRange(w, range))
    );
  }, [payableWorkers, attendance, pillars, days]);

  // العمال تحت الاختبار (بدون أجر يومي) اللي مش ظاهرين في الفترة دي. اللي له شغل
  // عمدان في الفترة بيظهر عادي فمش بيتعد هنا.
  const trialWorkersCount = useMemo(
    () => workers.filter(w =>
      w.status === 'active' && !(Number(w.dailyWage) > 0) && !activeWorkers.some(a => a.id === w.id)
    ).length,
    [workers, activeWorkers]
  );

  const roleStats = useMemo(() => {
    const stats = [{ role: 'الكل', count: activeWorkers.length }];
    ROLES.forEach(role => {
      const count = activeWorkers.filter(w => w.role === role).length;
      if (count > 0) stats.push({ role, count });
    });
    return stats;
  }, [activeWorkers]);

  const filteredWorkers = useMemo(() => {
    let list = activeWorkers;
    if (selectedRole !== 'الكل') list = list.filter(w => w.role === selectedRole);
    if (search) list = list.filter(w => w.name.includes(search) || w.code.includes(search));
    return list;
  }, [activeWorkers, selectedRole, search]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = filteredWorkers.length > 0 && filteredWorkers.every(w => selectedIds.has(w.id));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        filteredWorkers.forEach(w => next.delete(w.id));
        return next;
      }
      const next = new Set(prev);
      filteredWorkers.forEach(w => next.add(w.id));
      return next;
    });
  };

  // Exporting exports the selected workers only; with nothing selected it
  // falls back to everyone currently shown, matching the old behaviour.
  // IMPORTANT: this must intersect selectedIds against `activeWorkers`
  // (everyone eligible, across every role tab), not `filteredWorkers` (only
  // the currently-open tab) - otherwise checking workers on "شدة", then
  // switching to "نجارين" and downloading from there, silently drops the
  // شدة picks and exports whatever tab happens to be open instead.
  const exportWorkers = useMemo(() => {
    if (selectedIds.size === 0) return filteredWorkers;
    return activeWorkers.filter(w => selectedIds.has(w.id));
  }, [activeWorkers, filteredWorkers, selectedIds]);

  // Same math as صفحة القبض and الداشبورد, via the shared calcWorkerNet -
  // not a parallel reimplementation. Days already covered by a prior
  // payment are excluded here exactly like they are there, so "الإجمالي"
  // on this page can never disagree with what those pages show for the
  // same period again.
  // Computed over `activeWorkers` (everyone eligible), not `filteredWorkers`
  // (only the currently-open role tab) - otherwise selecting workers from
  // one tab, switching tabs, then downloading crashes mid-PDF the moment it
  // hits a selected worker with no entry here, and the print window opens
  // blank because the crash happens before document.write ever runs.
  const workerStats = useMemo(() => {
    const stats = {};
    if (days.length === 0) return stats;
    const from = days[0];
    const to = days[days.length - 1];
    activeWorkers.forEach(w => {
      const net = calcWorkerNet(w, { attendance, advances, transfers, pillars, payments, from, to });
      stats[w.id] = {
        present: net.daysWorked,
        absent: net.absentDays,
        overtime: net.overtime,
        deduction: net.deductions,
        advance: net.advances,
        transfer: net.transfers,
        total: net.net,
        fullyPaid: isWorkerPaidForRange(payments, attendance, w.id, from, to),
      };
    });
    return stats;
  }, [activeWorkers, attendance, advances, transfers, pillars, payments, days]);

  const columnTotals = useMemo(() => {
    const totals = {};
    days.forEach(d => {
      let present = 0;
      filteredWorkers.forEach(w => {
        const wMap = attendanceMap[w.id] || {};
        if (wMap[d]?.status === 'present') present++;
      });
      totals[d] = present;
    });
    return totals;
  }, [filteredWorkers, attendanceMap, days]);

  const grandTotal = useMemo(() => {
    // Scoped to filteredWorkers (the current tab/search view) - workerStats
    // itself now covers every active worker (so cross-tab PDF exports don't
    // crash), so summing Object.values(workerStats) directly here would
    // silently include every role, not just the one currently on screen.
    return sumPayableNet(filteredWorkers.map(w => workerStats[w.id]?.total));
  }, [filteredWorkers, workerStats]);

  // عمال صافيهم بالسالب (سلف/تحويلات/خصم أكتر من استحقاقهم): بيتعرضوا في الصف
  // زي ما هما، لكن الإجمالي بيحسبهم صفر (مفيش حاجة تتصرف لهم). بنوضح الفرق.
  const negativeNetInfo = useMemo(() => {
    const neg = filteredWorkers.filter(w => (workerStats[w.id]?.total || 0) < 0);
    return { count: neg.length, amount: neg.reduce((s, w) => s + Math.abs(workerStats[w.id].total), 0) };
  }, [filteredWorkers, workerStats]);

  // Every on-screen summary (cards + footer row) must total only the
  // currently visible tab/search results, not every active worker -
  // workerStats itself is now a superset (see comment above it).
  const visibleTotals = useMemo(() => {
    return filteredWorkers.reduce((acc, w) => {
      const ws = workerStats[w.id];
      if (!ws) return acc;
      acc.present += ws.present;
      acc.absent += ws.absent;
      acc.overtime += ws.overtime;
      acc.advance += ws.advance;
      acc.transfer += ws.transfer;
      acc.deduction += ws.deduction;
      return acc;
    }, { present: 0, absent: 0, overtime: 0, advance: 0, transfer: 0, deduction: 0 });
  }, [filteredWorkers, workerStats]);

  const periodLabel = useMemo(() => {
    if (viewMode === 'daily') {
      const d = new Date(dailyDate);
      return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    }
    if (viewMode === 'monthly') {
      const d = new Date(monthDate);
      return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
    }
    if (viewMode === 'custom') {
      if (!customFrom || !customTo) return 'اختر الفترة';
      if (customFrom > customTo) return 'الفترة غير صحيحة (من بعد إلى)';
      const startLabel = new Date(customFrom).toLocaleDateString('ar-EG', { month: 'long', day: 'numeric', year: 'numeric' });
      const endLabel = new Date(customTo).toLocaleDateString('ar-EG', { month: 'long', day: 'numeric', year: 'numeric' });
      return `${startLabel} - ${endLabel}`;
    }
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const startLabel = new Date(weekStart).toLocaleDateString('ar-EG', { month: 'long', day: 'numeric' });
    const endLabel = end.toLocaleDateString('ar-EG', { month: 'long', day: 'numeric', year: 'numeric' });
    return `${startLabel} - ${endLabel}`;
  }, [viewMode, monthDate, weekStart, dailyDate, customFrom, customTo]);

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setWeekStart(`${y}-${m}-${dd}`);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setWeekStart(`${y}-${m}-${dd}`);
  };

  const prevDay = () => {
    const d = new Date(dailyDate);
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setDailyDate(`${y}-${m}-${dd}`);
  };

  const nextDay = () => {
    const d = new Date(dailyDate);
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setDailyDate(`${y}-${m}-${dd}`);
  };

  const generatePDF = () => {
    const printWindow = window.open('', '_blank');
    const headerDays = days.map(d => {
      const dayNum = new Date(d).getDate();
      const fri = isFriday(d) ? ' style="background:#fef2f2;color:#dc2626;"' : '';
      return `<th${fri}>${dayNum}<br/><small>${getDayName(d)}</small></th>`;
    }).join('');

    const rows = exportWorkers.map((w, i) => {
      const wMap = attendanceMap[w.id] || {};
      const ws = workerStats[w.id] || {};
      const cells = days.map(d => {
        const rec = wMap[d];
        const fri = isFriday(d) ? ' style="background:#fef2f2;"' : '';
        if (!rec) return `<td${fri}>-</td>`;
        if (rec.pillarCost > 0) return `<td${fri} style="color:#9333ea;font-weight:bold;" title="عمدان">عم ${rec.pillarCost}</td>`;
        if (rec.status === 'present') {
          if (rec.overtimeValue > 0) return `<td${fri} style="color:#2563eb;font-weight:bold;">✓+${rec.overtimeValue}</td>`;
          return `<td${fri} style="color:#16a34a;font-weight:bold;">✓</td>`;
        }
        return `<td${fri} style="color:#dc2626;">✗</td>`;
      }).join('');
      return `<tr>
        <td>${i + 1}</td>
        <td style="text-align:right;font-weight:bold;white-space:normal;max-width:120px;">${w.name}${ws.fullyPaid ? ' <span style="display:inline-block;background:#dcfce7;color:#15803d;border:1px solid #86efac;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:bold;">تم الصرف</span>' : ''}</td>
        <td>${w.role}</td>
        <td>${(w.dailyWage || 0).toLocaleString('ar-EG')}</td>
        ${cells}
        <td style="font-weight:bold;color:#16a34a;">${ws.present}</td>
        <td style="font-weight:bold;color:#dc2626;">${ws.absent}</td>
        <td style="color:#2563eb;">${ws.overtime.toLocaleString('ar-EG')}</td>
        <td style="color:#ea580c;">${(ws.advance || 0).toLocaleString('ar-EG')}</td>
        <td style="color:#7e22ce;">${(ws.transfer || 0).toLocaleString('ar-EG')}</td>
        <td style="color:#dc2626;">${ws.deduction.toLocaleString('ar-EG')}</td>
        <td style="font-weight:bold;">${ws.total.toLocaleString('ar-EG')}</td>
      </tr>`;
    }).join('');

    const exportColumnTotals = {};
    days.forEach(d => {
      exportColumnTotals[d] = exportWorkers.filter(w => (attendanceMap[w.id] || {})[d]?.status === 'present').length;
    });

    const totalPresent = exportWorkers.reduce((s, w) => s + (workerStats[w.id]?.present || 0), 0);
    const totalAbsent = exportWorkers.reduce((s, w) => s + (workerStats[w.id]?.absent || 0), 0);
    const totalOvertime = exportWorkers.reduce((s, w) => s + (workerStats[w.id]?.overtime || 0), 0);
    const totalAdvance = exportWorkers.reduce((s, w) => s + (workerStats[w.id]?.advance || 0), 0);
    const totalTransfer = exportWorkers.reduce((s, w) => s + (workerStats[w.id]?.transfer || 0), 0);
    const totalDeduction = exportWorkers.reduce((s, w) => s + (workerStats[w.id]?.deduction || 0), 0);
    const exportGrandTotal = sumPayableNet(exportWorkers.map(w => workerStats[w.id]?.total));
    const title = viewMode === 'monthly' ? 'التايم شيت الشهري' : viewMode === 'weekly' ? 'التايم شيت الأسبوعي' : viewMode === 'custom' ? 'تايم شيت لفترة محددة' : 'التايم شيت اليومي';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>
          * { font-family: 'Tajawal', sans-serif; margin: 0; padding: 0; }
          body { padding: 15px; direction: rtl; font-size: 11px; }
          .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 10px; margin-bottom: 15px; }
          .header h1 { color: #1e40af; font-size: 18px; }
          .header p { color: #666; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #e2e8f0; padding: 4px 5px; text-align: center; white-space: nowrap; }
          th { background: #2563eb; color: white; font-size: 10px; }
          th:nth-child(-n+4) { text-align: right; }
          td:nth-child(-n+4) { text-align: right; }
          .total-row { background: #f1f5f9; font-weight: bold; }
          .footer { text-align: center; margin-top: 15px; color: #999; font-size: 10px; }
          .sign-off { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 22px; }
          .sign-off .sign-line { font-size: 11px; color: #475569; text-align: center; }
          .sign-off .sign-line .manager-sig { display: block; width: 130px; height: auto; margin: 4px auto 0; }
          .sign-off .stamp img { width: 150px; height: 150px; opacity: 0.92; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title} - شركة المناهري للمقاولات العمومية</h1>
          <p>${periodLabel}</p>
        </div>
        <table>
          <tr>
            <th>#</th><th style="text-align:right;white-space:normal;max-width:120px;">الاسم</th><th>الوظيفة</th><th>الأجر</th>
            ${headerDays}
            <th>حضور</th>
            <th>${(viewMode === 'daily' || viewMode === 'custom') ? 'غياب' : `غياب<br/><small>من أول ${viewMode === 'weekly' ? 'الأسبوع' : 'الشهر'}</small>`}</th><th>إضافي</th><th>السلف</th><th>التحويلات</th><th>الخصم</th><th>الإجمالي</th>
          </tr>
          ${rows}
          <tr class="total-row">
            <td colspan="4">الإجمالي</td>
            ${days.map(d => `<td>${exportColumnTotals[d]}</td>`).join('')}
            <td>${totalPresent}</td>
            <td>${totalAbsent}</td>
            <td>${totalOvertime.toLocaleString('ar-EG')}</td>
            <td>${totalAdvance.toLocaleString('ar-EG')}</td>
            <td>${totalTransfer.toLocaleString('ar-EG')}</td>
            <td>${totalDeduction.toLocaleString('ar-EG')}</td>
            <td>${exportGrandTotal.toLocaleString('ar-EG')}</td>
          </tr>
        </table>
        <div class="sign-off">
          <div class="sign-line">
            توقيع المسؤول
            <img class="manager-sig" src="${MANAGER_SIGNATURE_DATA_URI}" alt="توقيع المسؤول" />
          </div>
          <div class="stamp"><img src="${PAID_STAMP_DATA_URI}" alt="ختم الشركة" /></div>
        </div>
        <div class="footer">شركة المناهري للمقاولات العمومية - ${new Date().toLocaleDateString('ar-EG')}</div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">التايم شيت</h2>
          {trialWorkersCount > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              {trialWorkersCount} عامل تحت الاختبار (بدون أجر يومي ولا شغل عمدان في الفترة دي) غير ظاهرين هنا — راجعهم من صفحة الحضور والغياب أو ثبّت أجرهم من صفحة العمال
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <span className="text-sm text-primary-700 bg-primary-50 px-3 py-1.5 rounded-lg font-medium">
              {selectedIds.size} عامل محدد
            </span>
          )}
          <button onClick={generatePDF}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            {selectedIds.size > 0 ? `تحميل PDF (${selectedIds.size} محدد)` : 'تحميل PDF (الكل)'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button onClick={() => setViewMode('monthly')}
              className={`px-4 py-2 text-sm font-medium transition ${viewMode === 'monthly' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              شهري
            </button>
            <button onClick={() => setViewMode('weekly')}
              className={`px-4 py-2 text-sm font-medium transition ${viewMode === 'weekly' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              أسبوعي
            </button>
            <button onClick={() => setViewMode('daily')}
              className={`px-4 py-2 text-sm font-medium transition ${viewMode === 'daily' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              يومي
            </button>
            <button onClick={() => setViewMode('custom')}
              className={`px-4 py-2 text-sm font-medium transition ${viewMode === 'custom' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              من - إلى
            </button>
          </div>

          {viewMode === 'monthly' && (
            <input type="month" value={monthDate.substring(0, 7)} onChange={e => setMonthDate(e.target.value + '-01')}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          )}

          {viewMode === 'weekly' && (
            <div className="flex items-center gap-2">
              <button onClick={prevWeek} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              <input type="date" value={weekStart} onChange={e => e.target.value && setWeekStart(alignToSaturday(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
              <button onClick={nextWeek} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="text-sm text-gray-500">{periodLabel}</span>
            </div>
          )}

          {viewMode === 'daily' && (
            <div className="flex items-center gap-2">
              <button onClick={prevDay} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
              <button onClick={nextDay} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="text-sm text-gray-500">{periodLabel}</span>
            </div>
          )}

          {viewMode === 'custom' && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">من</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
              <label className="text-sm text-gray-500">إلى</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
              {customFrom && customTo && customFrom > customTo && (
                <span className="text-xs text-red-500">تاريخ "من" لازم يكون قبل "إلى"</span>
              )}
            </div>
          )}

          <input type="text" placeholder="بحث بالاسم أو الكود..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {roleStats.map(r => (
          <button key={r.role} onClick={() => setSelectedRole(r.role)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              selectedRole === r.role
                ? 'bg-primary-600 text-white shadow'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}>
            {r.role} ({r.count})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">العمال</p>
          <p className="text-lg font-bold text-gray-800">{filteredWorkers.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">أيام الحضور</p>
          <p className="text-lg font-bold text-green-600">{visibleTotals.present}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">أيام الغياب</p>
          <p className="text-lg font-bold text-red-600">{visibleTotals.absent}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">الإجمالي</p>
          <p className="text-lg font-bold text-blue-600">{grandTotal.toLocaleString('ar-EG')} ج.م</p>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        الإجمالي = (أيام الحضور × الأجر + العمدان + الإضافي) − السلف − التحويلات − الخصم. الأيام اللي اتصرفت قبل كده مش بتدخل في الحساب (زي صفحة القبض).
        {negativeNetInfo.count > 0 && (
          <span className="text-red-500"> — {negativeNetInfo.count} عامل صافيه بالسالب ({negativeNetInfo.amount.toLocaleString('ar-EG')} ج.م) مش محسوبين في الإجمالي.</span>
        )}
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 text-center w-8">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                </th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 w-8">#</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600 min-w-[88px]">الاسم</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">الوظيفة</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600">الأجر</th>
                {days.map(d => {
                  const dayNum = new Date(d).getDate();
                  const fri = isFriday(d);
                  return (
                    <th key={d} className={`px-1 py-2 text-center font-semibold min-w-[36px] ${fri ? 'bg-red-50 text-red-500' : 'text-gray-600'}`}>
                      {viewMode === 'daily' ? (
                        <div>{getDayName(d)}<br/><small>{dayNum}</small></div>
                      ) : (
                        <div className="whitespace-nowrap">
                          {dayNum}
                          <span className="text-[9px] font-normal opacity-80"> {getDayName(d)}</span>
                        </div>
                      )}
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-center font-semibold text-green-600 bg-green-50">حضور</th>
                <th className="px-1.5 py-2 text-center font-semibold text-red-600 bg-red-50 whitespace-nowrap">
                  {(viewMode === 'daily' || viewMode === 'custom') ? 'غياب' : (
                    <div className="leading-tight">
                      <div>غياب</div>
                      <div className="text-[9px] font-normal opacity-80">من أول {viewMode === 'weekly' ? 'الأسبوع' : 'الشهر'}</div>
                    </div>
                  )}
                </th>
                <th className="px-2 py-2 text-center font-semibold text-blue-600 bg-blue-50">إضافي</th>
                <th className="px-2 py-2 text-center font-semibold text-orange-600 bg-orange-50">السلف</th>
                <th className="px-2 py-2 text-center font-semibold text-purple-600 bg-purple-50">التحويلات</th>
                <th className="px-2 py-2 text-center font-semibold text-red-600 bg-red-50">الخصم</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-800 bg-gray-100">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredWorkers.map((w, i) => {
                const wMap = attendanceMap[w.id] || {};
                const ws = workerStats[w.id] || {};
                return (
                  <tr key={w.id} className={`hover:bg-gray-50 transition ${selectedIds.has(w.id) ? 'bg-primary-50/40' : ''}`}>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={selectedIds.has(w.id)} onChange={() => toggleSelect(w.id)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                    </td>
                    <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="font-medium text-xs break-words">{w.name}</div>
                        {ws.fullyPaid && (
                          <span className="bg-green-100 text-green-700 border border-green-300 px-1 py-0.5 rounded text-[9px] font-bold whitespace-nowrap" title="اتصرف بالكامل عن الفترة دي">
                            تم الصرف
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400">{w.code}</div>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded text-[10px]">{w.role}</span>
                    </td>
                    <td className="px-2 py-1.5 text-center text-[10px]">{(w.dailyWage || 0).toLocaleString('ar-EG')}</td>
                    {days.map(d => {
                      const rec = wMap[d];
                      const fri = isFriday(d);
                      const cellBg = fri ? 'bg-red-50/50' : '';
                      if (!rec) return <td key={d} className={`px-1 py-1.5 text-center text-gray-300 ${cellBg}`}>-</td>;
                      if (rec.pillarCost > 0) {
                        return (
                          <td key={d} className={`px-1 py-1.5 text-center font-bold text-purple-600 ${cellBg}`} title="عمدان">
                            <div className="text-[10px]">عم</div>
                            <div className="text-[9px]">{rec.pillarCost}</div>
                          </td>
                        );
                      }
                      if (rec.status === 'present') {
                        if (rec.overtimeValue > 0) {
                          return (
                            <td key={d} className={`px-1 py-1.5 text-center font-bold text-blue-600 ${cellBg}`} title={`${rec.overtimeFraction} - ${rec.overtimeValue} ج.م`}>
                              <div className="text-green-500 text-[10px]">✓</div>
                              <div className="text-[9px]">{rec.overtimeValue}</div>
                            </td>
                          );
                        }
                        return (
                          <td key={d} className={`px-1 py-1.5 text-center font-bold text-green-600 ${cellBg}`}>
                            <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          </td>
                        );
                      }
                      return (
                        <td key={d} className={`px-1 py-1.5 text-center text-red-400 ${cellBg}`}>
                          <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center font-bold text-green-600 bg-green-50/50">{ws.present}</td>
                    <td className="px-2 py-1.5 text-center font-bold text-red-600 bg-red-50/50">{ws.absent}</td>
                    <td className="px-2 py-1.5 text-center text-blue-600 bg-blue-50/50">{ws.overtime.toLocaleString('ar-EG')}</td>
                    <td className="px-2 py-1.5 text-center text-orange-600 bg-orange-50/50">{ws.advance ? ws.advance.toLocaleString('ar-EG') : '-'}</td>
                    <td className="px-2 py-1.5 text-center text-purple-600 bg-purple-50/50">{ws.transfer ? ws.transfer.toLocaleString('ar-EG') : '-'}</td>
                    <td className="px-2 py-1.5 text-center text-red-600 bg-red-50/50">{ws.deduction.toLocaleString('ar-EG')}</td>
                    <td className={`px-2 py-1.5 text-center font-bold bg-gray-50 ${ws.total < 0 ? 'text-red-600' : 'text-gray-800'}`}>{ws.total.toLocaleString('ar-EG')}</td>
                  </tr>
                );
              })}
              {filteredWorkers.length === 0 && (
                <tr><td colSpan={days.length + 11} className="text-center py-8 text-gray-400">لا يوجد عمال</td></tr>
              )}
              {filteredWorkers.length > 0 && (
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={5} className="px-2 py-2 text-right">الإجمالي</td>
                  {days.map(d => (
                    <td key={d} className="px-1 py-2 text-center text-[10px]">
                      {columnTotals[d] > 0 ? columnTotals[d] : ''}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center text-green-700">{visibleTotals.present}</td>
                  <td className="px-2 py-2 text-center text-red-700">{visibleTotals.absent}</td>
                  <td className="px-2 py-2 text-center text-blue-700">{visibleTotals.overtime.toLocaleString('ar-EG')}</td>
                  <td className="px-2 py-2 text-center text-orange-700">{visibleTotals.advance.toLocaleString('ar-EG')}</td>
                  <td className="px-2 py-2 text-center text-purple-700">{visibleTotals.transfer.toLocaleString('ar-EG')}</td>
                  <td className="px-2 py-2 text-center text-red-700">{visibleTotals.deduction.toLocaleString('ar-EG')}</td>
                  <td className="px-2 py-2 text-center text-gray-800">{grandTotal.toLocaleString('ar-EG')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
