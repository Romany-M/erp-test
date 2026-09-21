import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ROLES, PAYMENT_TYPES, todayISO } from '../utils/constants';
import { calcWorkerNet, sumPayableNet } from '../domain/payroll';
import { calcExpensesInRange, budgetForWeek } from '../domain/budget';
import { payWeekOf } from '../utils/weeks';

export default function Dashboard() {
  const { workers, attendance, advances, transfers, externalTransfers, pillars, weeklyBudgets, foodExpenses, purchases, payments, custody, contractorPayments, payrollRange, addAdvance, addTransfer, addCustody, addFoodExpense, addAttendance } = useApp();

  const activeWorkers = workers.filter(w => w.status === 'active');
  const today = todayISO();
  const todayAttendance = attendance.filter(a => a.date === today);
  const todayPresent = todayAttendance.filter(a => a.status === 'present');
  const todayAbsent = todayAttendance.filter(a => a.status === 'absent' && !(a.pillarCost > 0));
  const totalAdvances = advances.reduce((s, a) => s + (a.amount || 0), 0);
  const totalTransfers = transfers.reduce((s, t) => s + (t.amount || 0), 0);
  const totalFood = foodExpenses.reduce((s, f) => s + (f.totalAmount || 0), 0);
  const totalPurchases = purchases.reduce((s, p) => s + (p.amount || 0), 0);
  const totalCustody = custody.reduce((s, c) => s + (c.amount || 0), 0);
  const totalExternalTransfers = externalTransfers.reduce((s, t) => s + (t.amount || 0), 0);
  // الميزانية على حسب الأسبوع: المتبقي هنا هو المتبقي من ميزانية الأسبوع الحالي
  // (سبت→جمعة) النقدية، محسوب بنفس معادلة صفحة الميزانية (domain/budget.js).
  const currentWeek = payWeekOf(today);
  const weekBudget = budgetForWeek(weeklyBudgets, currentWeek.start);
  const weekExpenses = calcExpensesInRange(
    { advances, custody, foodExpenses, purchases, transfers, pillars, payments },
    currentWeek.start, currentWeek.end
  );
  const cashRemaining = weekBudget.cash - weekExpenses.cash.total;

  const [entryType, setEntryType] = useState('advance');
  const [workerQuery, setWorkerQuery] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [entryDate, setEntryDate] = useState(todayISO());
  const [entryAmount, setEntryAmount] = useState('');
  const [entryPaymentType, setEntryPaymentType] = useState('cash');
  const [entryPhone, setEntryPhone] = useState('');
  const [entryTransactionId, setEntryTransactionId] = useState('');
  const [entryWalletName, setEntryWalletName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [entryNotes, setEntryNotes] = useState('');

  const workerMatches = workerQuery.trim()
    ? activeWorkers.filter(w => w.name.includes(workerQuery.trim()) || w.code.includes(workerQuery.trim())).slice(0, 6)
    : [];

  const existingAtt = selectedWorker ? attendance.find(a => a.workerId === selectedWorker.id && a.date === entryDate) : null;
  const attStatus = existingAtt ? existingAtt.status : null;

  const resetQuickEntry = () => {
    setEntryAmount('');
    setEntryPhone('');
    setEntryTransactionId('');
    setEntryWalletName('');
    setSupplier('');
    setEntryNotes('');
    setWorkerQuery('');
    setSelectedWorker(null);
  };

  const handleQuickSave = () => {
    const amountVal = parseFloat(entryAmount);
    if (!amountVal || amountVal <= 0) { alert('اكتب المبلغ'); return; }
    const common = { date: entryDate, amount: amountVal, paymentType: entryPaymentType };
    const payment = entryPaymentType !== 'cash' ? { phone: entryPhone, walletName: entryWalletName, transactionId: entryTransactionId } : {};
    if (entryType === 'advance') {
      if (!selectedWorker) { alert('اختر العامل'); return; }
      addAdvance({ ...common, ...payment, workerId: selectedWorker.id, notes: entryNotes });
    } else if (entryType === 'transfer') {
      if (!selectedWorker) { alert('اختر العامل'); return; }
      addTransfer({ ...common, ...payment, workerId: selectedWorker.id, notes: entryNotes });
    } else if (entryType === 'custody') {
      if (!selectedWorker) { alert('اختر العامل'); return; }
      addCustody({ ...common, ...payment, workerId: selectedWorker.id, notes: entryNotes });
    } else if (entryType === 'food') {
      if (!supplier.trim()) { alert('اكتب اسم المورد / الاسم'); return; }
      addFoodExpense({ ...common, ...payment, totalAmount: amountVal, supplier: supplier.trim(), notes: entryNotes });
    }
    resetQuickEntry();
    alert('تم الحفظ');
  };

  const handleQuickAttendance = (status) => {
    if (!selectedWorker) { alert('اختر العامل'); return; }
    const newStatus = attStatus === status ? null : status;
    addAttendance({
      workerId: selectedWorker.id,
      workerName: selectedWorker.name,
      workerCode: selectedWorker.code,
      role: selectedWorker.role,
      date: entryDate,
      status: newStatus,
      overtimeFraction: existingAtt ? (existingAtt.overtimeFraction || '') : '',
      overtimeValue: existingAtt ? (existingAtt.overtimeValue || 0) : 0,
      pillarCost: existingAtt ? (existingAtt.pillarCost || 0) : 0,
      deduction: existingAtt ? (existingAtt.deduction || 0) : 0,
    });
    alert(newStatus === 'present' ? 'تم تسجيل الحضور' : newStatus === 'absent' ? 'تم تسجيل الغياب' : 'تم إلغاء التسجيل');
  };

  const roleStats = ROLES.map(role => ({
    role,
    count: activeWorkers.filter(w => w.role === role).length,
  })).filter(r => r.count > 0);

  const monthStart = today.substring(0, 7) + '-01';

  // The "period" shown on this dashboard now always follows whatever "من -
  // إلى" range is set on صفحة القبض (PayrollPage), synced here via
  // payrollRange. Before this fix, this card ignored payrollRange entirely
  // and was hardcoded to a fixed calendar quarter of the month ("current
  // week"), so it never matched the custom period the user picked on the
  // القبض page. Falls back to "from the start of this month" only when no
  // range has ever been set (payrollRange.from is empty).
  const payrollFrom = payrollRange?.from || monthStart;
  const payrollTo = payrollRange?.to || '';
  const hasCustomPayrollRange = !!(payrollRange?.from || payrollRange?.to);

  const calcNet = (w, from, to) => calcWorkerNet(w, { attendance, advances, transfers, pillars, payments, from, to }).net;

  // calcNet needs a real upper bound - an empty "to" (meaning "لسه مفتوحة،
  // لحد النهارده" on صفحة القبض) has to become today's date here, or the
  // `a.date <= to` check would reject every date against ''.
  const payrollToEffective = payrollTo || today;
  const totalNetPayable = sumPayableNet(activeWorkers.map(w => calcNet(w, payrollFrom, payrollToEffective)));

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalWagesPaid = totalPaid + totalTransfers;

  const paidWorkersThisMonth = workers.filter(w => {
    if (w.status !== 'active') return false;
    const hasAtt = attendance.some(a =>
      a.workerId === w.id && (a.status === 'present' || a.pillarCost > 0) &&
      (!payrollFrom || a.date >= payrollFrom) && (!payrollTo || a.date <= payrollTo)
    );
    if (!hasAtt) return false;
    return payments.some(p => {
      if (p.workerId !== w.id) return false;
      if (p.dateTo && p.dateTo !== 'النهاية') {
        if (!payrollTo) {
          return !attendance.some(a =>
            a.workerId === w.id && (!payrollFrom || a.date >= payrollFrom) && a.date > p.dateTo
          );
        }
        return p.dateTo >= payrollTo;
      }
      if (payrollFrom && (p.date ? p.date.substring(0, 10) : '') < payrollFrom) return false;
      return true;
    });
  }).length;

  const totalPillars = pillars.reduce((s, p) => s + (p.cost || 0), 0);
  const totalContractorsPaid = contractorPayments.filter(p => p.paid).reduce((s, p) => s + (p.amount || 0), 0);
  const totalMoneyOut = totalAdvances + totalFood + totalPurchases + totalCustody + totalPillars + totalWagesPaid + totalExternalTransfers + totalContractorsPaid;

  const moneyOutBreakdown = [
    { label: 'السلف', amount: totalAdvances, color: 'bg-orange-500' },
    { label: 'العهد', amount: totalCustody, color: 'bg-blue-500' },
    { label: 'المصروفات', amount: totalFood, color: 'bg-red-500' },
    { label: 'المشتريات', amount: totalPurchases, color: 'bg-purple-500' },
    { label: 'مراحل البناء', amount: totalPillars, color: 'bg-indigo-500' },
    { label: 'القبض والتحويلات (رواتب)', amount: totalWagesPaid, color: 'bg-rose-500' },
    { label: 'تحويلات خارجية', amount: totalExternalTransfers, color: 'bg-cyan-500' },
    { label: 'المقاولين (المدفوع)', amount: totalContractorsPaid, color: 'bg-slate-500' },
  ];

  const cards = [
    {
      title: 'إجمالي العمال',
      value: workers.length,
      sub: 'من صفحة إدارة العمال',
      color: 'bg-primary-500',
      icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
      detail: [
        { label: 'نشط', value: activeWorkers.length },
        { label: 'غير نشط', value: workers.length - activeWorkers.length },
      ],
    },
    {
      title: 'حضور اليوم',
      value: todayPresent.length,
      sub: `بتاريخ ${today}`,
      color: 'bg-green-500',
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      detail: [
        { label: 'حاضر', value: todayPresent.length },
        { label: 'غائب', value: todayAbsent.length },
      ],
    },
    {
      title: 'إجمالي السلف',
      value: totalAdvances.toLocaleString('ar-EG'),
      sub: 'ج.م',
      color: 'bg-orange-500',
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      detail: [
        { label: 'عدد السجلات', value: advances.length },
        { label: 'مجموع مبالغ السلف (amount)', value: totalAdvances.toLocaleString('ar-EG') + ' ج.م' },
      ],
    },
    {
      title: 'إجمالي المستحق للقبض',
      value: totalNetPayable.toLocaleString('ar-EG'),
      sub: hasCustomPayrollRange ? 'ج.م (حسب الفترة المختارة في صفحة القبض)' : 'ج.م (من أول الشهر لحد النهاردة)',
      color: 'bg-green-600',
      icon: 'M2 6h20v12H2V6zm3 3h14v6H5V9zm3 3a1 1 0 100 2 1 1 0 000-2zm5 0a1 1 0 100 2 1 1 0 000-2z',
      detail: [
        { label: 'الفترة', value: `${payrollFrom} ← ${payrollTo || 'النهاردة'}` },
        { label: 'الطريقة', value: 'صافي كل عامل من أيام لم تصرف' },
      ],
    },
    {
      title: 'إجمالي المقبوض (رواتب + تحويلات)',
      value: totalWagesPaid.toLocaleString('ar-EG'),
      sub: 'ج.م',
      color: 'bg-purple-600',
      icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
      detail: [
        { label: 'عدد العمال المقبوضين', value: paidWorkersThisMonth },
        { label: 'مبالغ قبض المرتب', value: totalPaid.toLocaleString('ar-EG') + ' ج.م' },
        { label: 'تحويلات العمال', value: totalTransfers.toLocaleString('ar-EG') + ' ج.م' },
      ],
    },
    {
      title: 'تحويلات خارجية',
      value: totalExternalTransfers.toLocaleString('ar-EG'),
      sub: 'ج.م (بند مستقل)',
      color: 'bg-cyan-600',
      icon: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
      detail: [
        { label: 'عدد السجلات', value: externalTransfers.length },
        { label: 'مجموع مبالغ التحويلات الخارجية', value: totalExternalTransfers.toLocaleString('ar-EG') + ' ج.م' },
      ],
    },
    {
      title: 'إجمالي ما تم صرفه',
      value: totalMoneyOut.toLocaleString('ar-EG'),
      sub: 'ج.م (كل جنيه طلع)',
      color: 'bg-rose-600',
      icon: 'M3 17l6-6 4 4 8-8M21 17v-6h-6',
      detail: [
        { label: 'السلف', value: totalAdvances.toLocaleString('ar-EG') },
        { label: 'العهد', value: totalCustody.toLocaleString('ar-EG') },
        { label: 'المصروفات', value: totalFood.toLocaleString('ar-EG') },
        { label: 'المشتريات', value: totalPurchases.toLocaleString('ar-EG') },
        { label: 'مراحل البناء', value: totalPillars.toLocaleString('ar-EG') },
        { label: 'القبض والتحويلات (رواتب)', value: totalWagesPaid.toLocaleString('ar-EG') },
        { label: 'تحويلات خارجية', value: totalExternalTransfers.toLocaleString('ar-EG') },
        { label: 'المقاولين (المدفوع)', value: totalContractorsPaid.toLocaleString('ar-EG') },
      ],
    },
    {
      title: 'المتبقي من ميزانية الأسبوع',
      value: cashRemaining.toLocaleString('ar-EG'),
      sub: 'ج.م',
      color: 'bg-blue-500',
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1',
      detail: [
        { label: 'الميزانية النقدية للأسبوع', value: weekBudget.cash.toLocaleString('ar-EG') },
        { label: 'مصروفات الأسبوع (نقدي)', value: '- ' + weekExpenses.cash.total.toLocaleString('ar-EG') },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">لوحة التحكم</h2>
        <div className="text-sm text-gray-500">مرحباً بك في نظام المناهري للمقاولات</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border-2 border-primary-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <span className="w-8 h-8 bg-primary-600 text-white rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </span>
            إدخال
          </h3>
          <span className="text-xs text-gray-400">الكارت الجوكر — سجّل سلفة / تحويلة / عهد / مصروف بسرعة</span>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">اسم العامل</label>
            {selectedWorker ? (
              <div className="flex items-center justify-between px-3 py-2 border border-primary-300 bg-primary-50 rounded-lg">
                <span className="font-medium text-sm">{selectedWorker.name} <span className="text-xs text-gray-400">({selectedWorker.code})</span></span>
                <button type="button" onClick={() => { setSelectedWorker(null); setWorkerQuery(''); }}
                  className="text-primary-600 hover:bg-primary-100 rounded p-0.5 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <>
                <input type="text" value={workerQuery} onChange={e => setWorkerQuery(e.target.value)}
                  placeholder="اكتب الاسم أو الكود..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm text-right" />
                {workerMatches.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {workerMatches.map(w => (
                      <button key={w.id} type="button"
                        onClick={() => { setSelectedWorker(w); setWorkerQuery(''); }}
                        className="w-full text-right px-3 py-2 text-sm hover:bg-primary-50 transition flex items-center justify-between">
                        <span>{w.name}</span>
                        <span className="text-xs text-gray-400">{w.code} — {w.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {selectedWorker && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">الحضور</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => handleQuickAttendance('present')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${attStatus === 'present' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  حضور
                </button>
                <button type="button" onClick={() => handleQuickAttendance('absent')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${attStatus === 'absent' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  غياب
                </button>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">القسم</label>
            <select value={entryType} onChange={e => setEntryType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm">
              <option value="advance">سلفة</option>
              <option value="transfer">تحويلة (عامل)</option>
              <option value="custody">عهد</option>
              <option value="food">مصروف</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">التاريخ</label>
            <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">المبلغ (ج.م)</label>
            <input type="number" value={entryAmount} onChange={e => setEntryAmount(e.target.value)}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm no-spinner" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">نوع الصرف</label>
            <select value={entryPaymentType} onChange={e => setEntryPaymentType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm">
              {PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {(entryType === 'transfer' || entryPaymentType !== 'cash') && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">رقم الهاتف المحول إليه</label>
                <input type="text" value={entryPhone} onChange={e => setEntryPhone(e.target.value)} dir="ltr"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">اسم الحساب</label>
                <input type="text" value={entryWalletName} onChange={e => setEntryWalletName(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm text-right" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">رقم المعاملة</label>
                <input type="text" value={entryTransactionId} onChange={e => setEntryTransactionId(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
              </div>
            </>
          )}
          {entryType === 'food' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">اسم المورد / الاسم</label>
              <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm text-right" />
            </div>
          )}
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">ملاحظات</label>
            <input type="text" value={entryNotes} onChange={e => setEntryNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm text-right" />
          </div>
          <button type="button" onClick={handleQuickSave}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            حفظ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.title}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{card.value}</p>
                <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
              </div>
              <div className={`w-12 h-12 ${card.color} rounded-lg flex items-center justify-center`}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.icon} />
                </svg>
              </div>
            </div>
            {card.detail && card.detail.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                {card.detail.map((d, j) => (
                  <div key={j} className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">{d.label}</span>
                    <span className="font-bold text-gray-600">{d.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-800 mb-4">توزيع العمال حسب الوظيفة</h3>
          <div className="space-y-3">
            {roleStats.map(r => (
              <div key={r.role} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-32">{r.role}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3">
                  <div
                    className="bg-primary-500 h-3 rounded-full transition-all"
                    style={{ width: `${(r.count / Math.max(activeWorkers.length, 1)) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-gray-700 w-8 text-center">{r.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-800 mb-4">ملخص اليوم</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">الم.workerين النشطين</span>
              <span className="font-bold">{activeWorkers.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">الحضور اليوم</span>
              <span className="font-bold text-green-600">{todayPresent.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">الغياب اليوم</span>
              <span className="font-bold text-red-600">{todayAbsent.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">إجمالي السلف</span>
              <span className="font-bold">{totalAdvances.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">تحويلات العمال</span>
              <span className="font-bold">{totalTransfers.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">تحويلات خارجية</span>
              <span className="font-bold text-cyan-600">{totalExternalTransfers.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">إجمالي المقبوض (رواتب + تحويلات)</span>
              <span className="font-bold text-purple-600">{totalWagesPaid.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">إجمالي المستحق للقبض ({hasCustomPayrollRange ? 'حسب فترة القبض' : 'من أول الشهر'})</span>
              <span className="font-bold text-green-600">{totalNetPayable.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">المباني النشطة</span>
              <span className="font-bold">{pillars.length > 0 ? new Set(pillars.map(p => p.buildingId)).size : 0}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">تفاصيل ما تم صرفه</h3>
          <span className="text-xl font-bold text-rose-600">{totalMoneyOut.toLocaleString('ar-EG')} ج.م</span>
        </div>
        <div className="space-y-3">
          {moneyOutBreakdown.map(b => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-36">{b.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-3">
                <div className={`${b.color} h-3 rounded-full transition-all`}
                  style={{ width: `${totalMoneyOut > 0 ? (b.amount / totalMoneyOut) * 100 : 0}%` }} />
              </div>
              <span className="text-sm font-bold text-gray-700 w-28 text-left">{b.amount.toLocaleString('ar-EG')} ج.م</span>
              <span className="text-xs text-gray-400 w-16 text-left">{totalMoneyOut > 0 ? ((b.amount / totalMoneyOut) * 100).toFixed(1) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
