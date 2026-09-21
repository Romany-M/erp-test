import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { ROLES, OVERTIME_FRACTIONS, todayISO, PAYMENT_TYPES } from '../utils/constants';

export default function AttendancePage() {
  const { workers, attendance, advances, addAttendanceBulk, addAdvance, upsertAdvance, deleteAttendanceForDate, deleteAdvancesForDate, clearOvertimeForDate } = useApp();
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [dateManuallySet, setDateManuallySet] = useState(false);
  const [selectedRole, setSelectedRole] = useState('الكل');
  const [search, setSearch] = useState('');
  const [localState, setLocalState] = useState({});
  const [advanceInputs, setAdvanceInputs] = useState({});
  const [advancePaymentTypes, setAdvancePaymentTypes] = useState({});
  const [advanceEdit, setAdvanceEdit] = useState({});
  const [attendanceEdit, setAttendanceEdit] = useState({});
  const [overtimeEdit, setOvertimeEdit] = useState({});
  const [pillarEdit, setPillarEdit] = useState({});
  const [deductionEdit, setDeductionEdit] = useState({});
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'error'
  const [saveError, setSaveError] = useState(null);
  const [showDataDiagnostic, setShowDataDiagnostic] = useState(false);
  const saveTimerRef = useRef(null);
  const savingRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const activeWorkers = useMemo(() => workers.filter(w => w.status === 'active'), [workers]);

  const todayRecords = useMemo(() => {
    return attendance.filter(a => a.date === selectedDate);
  }, [attendance, selectedDate]);

  const getRecord = (workerId) => {
    const key = `${selectedDate}:${workerId}`;
    const saved = todayRecords.find(a => a.workerId === workerId);
    const local = localState[key];
    if (local !== undefined) return local;
    if (saved) {
      return {
        status: saved.status,
        overtimeFraction: saved.overtimeFraction || '',
        overtimeValue: saved.overtimeValue || 0,
        pillarCost: saved.pillarCost || 0,
        deduction: saved.deduction || 0,
      };
    }
    return { status: 'absent', overtimeFraction: '', overtimeValue: 0, pillarCost: 0, deduction: 0 };
  };

  const setRecord = (workerId, field, value) => {
    const key = `${selectedDate}:${workerId}`;
    setLocalState(prev => {
      const current = prev[key] || getRecord(workerId);
      const updated = { ...current, [field]: value };

      if (field === 'overtimeFraction' && value !== '') {
        const worker = workers.find(w => w.id === workerId);
        const fraction = OVERTIME_FRACTIONS.find(f => f.value === parseFloat(value));
        if (worker && fraction) {
          // Trial workers (no daily wage yet) can't accrue an overtime value —
          // guard against NaN rather than silently writing it to the DB.
          updated.overtimeValue = Math.round((worker.dailyWage || 0) * parseFloat(value));
        }
      } else if (field === 'overtimeFraction') {
        updated.overtimeValue = 0;
      }

      return { ...prev, [key]: updated };
    });
  };
  const toggleAttendance = (workerId) => {
    const current = getRecord(workerId);
    setRecord(workerId, 'status', current.status === 'present' ? 'absent' : 'present');
    setAttendanceEdit(prev => ({ ...prev, [workerId]: false }));
  };

  const setAllForRole = (role, status) => {
    const workersInRole = role === 'الكل' ? activeWorkers : activeWorkers.filter(w => w.role === role);
    const newState = {};
    workersInRole.forEach(w => {
      newState[`${selectedDate}:${w.id}`] = { ...getRecord(w.id), status };
    });
    setLocalState(prev => ({ ...prev, ...newState }));
  };

  // Persists whatever is currently pending in localState for selectedDate.
  // Only clears localState / marks "saved" once Supabase has actually
  // confirmed the write - a failed or in-flight request must never look
  // like a successful save, or edits get silently lost.
  const saveAttendance = useCallback(async () => {
    const prefix = `${selectedDate}:`;
    const hasChanges = Object.keys(localState).some(k => k.startsWith(prefix));
    if (!hasChanges) return;
    if (savingRef.current) return; // a save is already in flight; it will pick up these changes when it re-runs below
    const records = [];
    activeWorkers.forEach(w => {
      if (localState[`${prefix}${w.id}`] !== undefined) {
        const rec = getRecord(w.id);
        records.push({
          workerId: w.id,
          workerName: w.name,
          workerCode: w.code,
          date: selectedDate,
          status: rec.status,
          overtimeFraction: rec.overtimeFraction || '',
          overtimeValue: rec.overtimeValue || 0,
          pillarCost: rec.pillarCost || 0,
          deduction: rec.deduction || 0,
          role: w.role,
        });
      }
    });
    if (records.length === 0) return;

    savingRef.current = true;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await addAttendanceBulk(records);
      if (!isMountedRef.current) return; // page was navigated away from mid-request; the write already landed, nothing left to update on screen
      setLocalState(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { if (k.startsWith(prefix)) delete next[k]; });
        return next;
      });
      setLastSaved(new Date());
      setSaveStatus('idle');
    } catch (err) {
      console.error('attendance save failed:', err);
      if (!isMountedRef.current) return;
      setSaveStatus('error');
      setSaveError('فشل حفظ الحضور - البيانات لسه عندك على الشاشة ومحفوظة مؤقتًا، دوس "إعادة المحاولة" أو "حفظ الحضور والغياب"');
      // Deliberately do NOT clear localState here: the edits must stay
      // visible and re-tryable until a save actually succeeds.
    } finally {
      savingRef.current = false;
    }
  }, [localState, activeWorkers, selectedDate]);

  useEffect(() => {
    if (Object.keys(localState).length === 0) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveAttendance();
    }, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [localState, saveAttendance]);

  // Flush any unsaved edits when the page is navigated away from (route
  // change / component unmount). Without this, marking someone present and
  // switching sections within the 500ms debounce window silently discards
  // the change - it never gets sent to the server at all.
  const localStateRef = useRef(localState);
  useEffect(() => { localStateRef.current = localState; }, [localState]);
  const saveAttendanceRef = useRef(saveAttendance);
  useEffect(() => { saveAttendanceRef.current = saveAttendance; }, [saveAttendance]);
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
      if (Object.keys(localStateRef.current).length > 0) {
        saveAttendanceRef.current();
      }
    };
  }, []);

  // Warn before an accidental tab close / refresh if there are unsaved edits.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (Object.keys(localState).length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [localState]);

  useEffect(() => {
    setLocalState({});
    setAdvanceInputs({});
    setAdvancePaymentTypes({});
    setAdvanceEdit({});
    setAttendanceEdit({});
    setOvertimeEdit({});
    setPillarEdit({});
    setDeductionEdit({});
  }, [selectedDate]);

  useEffect(() => {
    const checkDayRollover = () => {
      const today = todayISO();
      setSelectedDate(prev => {
        if (!dateManuallySet && today !== prev && Object.keys(localState).length === 0) {
          return today;
        }
        return prev;
      });
    };
    const id = setInterval(checkDayRollover, 30000);
    return () => clearInterval(id);
  }, [dateManuallySet, localState]);

  const submitAdvance = (workerId) => {
    const amount = advanceInputs[workerId];
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    upsertAdvance({
      workerId,
      date: selectedDate,
      amount: val,
      paymentType: advancePaymentTypes[workerId] || 'cash',
      notes: 'سلم من صفحة الحضور',
    });
    setAdvanceInputs(prev => ({ ...prev, [workerId]: '' }));
    setAdvancePaymentTypes(prev => ({ ...prev, [workerId]: 'cash' }));
    setAdvanceEdit(prev => ({ ...prev, [workerId]: false }));
    setLastSaved(new Date());
  };

  const savedAdvance = (workerId) => {
    return advances.find(a => a.workerId === workerId && a.date === selectedDate);
  };

  const hasAttendanceRecord = (workerId) => {
    return localState[`${selectedDate}:${workerId}`] !== undefined || todayRecords.some(a => a.workerId === workerId);
  };

  const hasPillarValue = (workerId) => {
    return (getRecord(workerId).pillarCost || 0) > 0;
  };

  const startEditAdvance = (workerId) => {
    const adv = savedAdvance(workerId);
    if (adv) {
      setAdvanceInputs(prev => ({ ...prev, [workerId]: String(adv.amount) }));
      setAdvancePaymentTypes(prev => ({ ...prev, [workerId]: adv.paymentType || 'cash' }));
    }
    setAdvanceEdit(prev => ({ ...prev, [workerId]: true }));
  };

  const saveAll = async () => {
    const records = [];
    activeWorkers.forEach(w => {
      const rec = getRecord(w.id);
      records.push({
        workerId: w.id,
        workerName: w.name,
        workerCode: w.code,
        date: selectedDate,
        status: rec.status,
        overtimeFraction: rec.overtimeFraction || '',
        overtimeValue: rec.overtimeValue || 0,
        pillarCost: rec.pillarCost || 0,
        deduction: rec.deduction || 0,
        role: w.role,
      });
    });
    clearTimeout(saveTimerRef.current);
    savingRef.current = true;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await addAttendanceBulk(records);
      setLocalState({});
      setLastSaved(new Date());
      setSaveStatus('idle');
    } catch (err) {
      console.error('attendance saveAll failed:', err);
      setSaveStatus('error');
      setSaveError('فشل حفظ الحضور والغياب - حاول تاني. البيانات لسه ظاهرة على الشاشة ومحفوظة مؤقتًا.');
    } finally {
      savingRef.current = false;
    }
  };

  const clearSelectedDay = () => {
    if (!window.confirm('هل تريد مسح كل سجلات الحضور والسلف لهذا اليوم؟')) return;
    deleteAttendanceForDate(selectedDate);
    deleteAdvancesForDate(selectedDate);
    setLocalState({});
    setAdvanceInputs({});
    setAdvancePaymentTypes({});
    setAdvanceEdit({});
    setAttendanceEdit({});
    setOvertimeEdit({});
    setPillarEdit({});
    setDeductionEdit({});
    setLastSaved(new Date());
  };

  const clearSelectedDayOvertime = () => {
    const hasOvertime = attendance.some(a => a.date === selectedDate && (a.overtimeValue > 0 || a.overtimeFraction));
    if (!hasOvertime) {
      alert('لا يوجد إضافي محفوظ لهذا اليوم');
      return;
    }
    if (!window.confirm('هل تريد مسح الإضافي (القيمة والتقدير) فقط لهذا اليوم؟ سيتم الحفاظ على كل بيانات الحضور والعمدان والسلف.')) return;
    clearOvertimeForDate(selectedDate);
    setLocalState({});
    setOvertimeEdit({});
    setDeductionEdit({});
    setLastSaved(new Date());
  };

  const filteredWorkers = useMemo(() => {
    let list = selectedRole === 'الكل' ? activeWorkers : activeWorkers.filter(w => w.role === selectedRole);
    if (search) {
      list = list.filter(w => w.name.includes(search) || w.code.includes(search));
    }
    return list;
  }, [activeWorkers, selectedRole, search]);

  const roleStats = useMemo(() => {
    const stats = [{ role: 'الكل', count: activeWorkers.length }];
    ROLES.forEach(role => {
      const count = activeWorkers.filter(w => w.role === role).length;
      if (count > 0) stats.push({ role, count });
    });
    return stats;
  }, [activeWorkers]);

  const summary = useMemo(() => {
    let present = 0, absent = 0, totalOvertime = 0, totalPillars = 0, totalDeductions = 0;
    filteredWorkers.forEach(w => {
      const rec = getRecord(w.id);
      if (rec.status === 'present' || rec.pillarCost > 0) present++;
      else absent++;
      totalOvertime += rec.overtimeValue || 0;
      totalPillars += rec.pillarCost || 0;
      totalDeductions += rec.deduction || 0;
    });
    return { present, absent, totalOvertime, totalPillars, totalDeductions, total: filteredWorkers.length };
  }, [filteredWorkers, localState, todayRecords]);

  // سلف اليوم للعمال المعروضين. مش بتتخصم من "إجمالي اليوم" (اللي هو اللي اتكسب)،
  // بس بنعرضها والصافي بعدها تحته.
  const advancesTotalForDay = useMemo(() => {
    const ids = new Set(filteredWorkers.map(w => w.id));
    return advances
      .filter(a => a.date === selectedDate && ids.has(a.workerId))
      .reduce((sum, a) => sum + (a.amount || 0), 0);
  }, [advances, filteredWorkers, selectedDate]);

  const calculateSummaryTotal = () => {
    let total = 0;
    filteredWorkers.forEach(w => {
      const rec = getRecord(w.id);
      const deduction = rec.deduction || 0;
      if (rec.pillarCost > 0) {
        total += rec.pillarCost - deduction;
      } else if (rec.status === 'present') {
        total += (w.dailyWage || 0) + (rec.overtimeValue || 0) - deduction;
      }
    });
    return total;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">الحضور والانصراف</h2>
        <div className="flex items-center gap-3">
          {saveStatus === 'saving' && (
            <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              جاري الحفظ...
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v3.75m0 3.75h.007v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {saveError || 'فشل الحفظ'}
              <button onClick={saveAttendance} className="underline font-medium hover:text-red-900">إعادة المحاولة</button>
            </span>
          )}
          {saveStatus === 'idle' && lastSaved && (
            <span className="text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              تم الحفظ {lastSaved.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <input type="date" value={selectedDate} onChange={async e => {
              const next = e.target.value;
              if (next !== selectedDate) {
                setDateManuallySet(true);
                clearTimeout(saveTimerRef.current);
                await saveAttendance();
              }
              setSelectedDate(next);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
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
        <div className="flex-1 min-w-[200px]">
          <input type="text" placeholder="بحث بالاسم أو الكود..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">إجمالي العمال</p>
            <p className="text-xl font-bold text-gray-800">{summary.total}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-xs text-green-600">حاضرين</p>
            <p className="text-xl font-bold text-green-700">{summary.present}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-xs text-red-600">غائبين</p>
            <p className="text-xl font-bold text-red-700">{summary.absent}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-xs text-blue-600">إجمالي الإضافي</p>
            <p className="text-xl font-bold text-blue-700">{summary.totalOvertime.toLocaleString('ar-EG')}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <p className="text-xs text-purple-600">إجمالي العمدان</p>
            <p className="text-xl font-bold text-purple-700">{summary.totalPillars.toLocaleString('ar-EG')}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-xs text-red-600">إجمالي الخصم</p>
            <p className="text-xl font-bold text-red-700">{summary.totalDeductions.toLocaleString('ar-EG')}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-3 text-center">
            <p className="text-xs text-orange-600">إجمالي اليوم</p>
            <p className="text-xl font-bold text-orange-700">{calculateSummaryTotal().toLocaleString('ar-EG')} ج.م</p>
            {advancesTotalForDay > 0 && (
              <p className="text-[10px] text-orange-700 mt-1 leading-tight">
                سلف اليوم {advancesTotalForDay.toLocaleString('ar-EG')} — الصافي بعد السلف {(calculateSummaryTotal() - advancesTotalForDay).toLocaleString('ar-EG')}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={() => setAllForRole(selectedRole, 'present')}
              className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded text-xs font-medium transition">
              تحديد الكل حاضرين
            </button>
            <button onClick={() => setAllForRole(selectedRole, 'absent')}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-medium transition">
              تحديد الكل غائبين
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 text-right font-semibold text-gray-600 w-12">#</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">الاسم</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">الوظيفة</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600">الحضور</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">تقدير الإضافي</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-600">قيمة الإضافي</th>
                <th className="px-3 py-3 text-center font-semibold text-purple-600 bg-purple-50">العمدان</th>
                <th className="px-3 py-3 text-center font-semibold text-red-600 bg-red-50">الخصم</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-600 min-w-[200px]">السلف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredWorkers.map((w, i) => {
                const rec = getRecord(w.id);
                const onTrial = !(Number(w.dailyWage) > 0);
                return (
                  <tr key={w.id} className={`hover:bg-gray-50 transition ${onTrial ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{w.name}</div>
                        {onTrial && (
                          <span className="bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap" title="بدون أجر يومي — مش هيظهر في التايم شيت لحد ما يتحط أجره">
                            تحت الاختبار
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {w.code} - {onTrial ? 'بدون أجر يومي' : `${w.dailyWage.toLocaleString('ar-EG')} ج.م`}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded text-xs">{w.role}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {hasAttendanceRecord(w.id) && !attendanceEdit[w.id] ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className={`px-3 py-1.5 rounded-lg font-bold text-sm flex items-center gap-1.5 ${
                            rec.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}>
                            {rec.status === 'present' ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            )}
                            {rec.status === 'present' ? 'حاضر' : 'غائب'}
                          </span>
                          <button onClick={() => setAttendanceEdit(prev => ({ ...prev, [w.id]: true }))} title="تعديل الحضور"
                            className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => toggleAttendance(w.id)}
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
                              rec.status === 'present'
                                ? 'bg-green-500 text-white shadow'
                                : 'bg-red-100 text-red-500'
                            }`}>
                            {rec.status === 'present' ? (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            )}
                          </button>
                          {hasAttendanceRecord(w.id) && (
                            <button onClick={() => setAttendanceEdit(prev => ({ ...prev, [w.id]: false }))} title="تثبيت"
                              className="text-gray-400 hover:bg-gray-100 p-1.5 rounded transition flex-shrink-0">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {(w.dailyWage || 0) > 0 ? (
                        <select value={rec.overtimeFraction} onChange={e => setRecord(w.id, 'overtimeFraction', e.target.value)}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm w-36">
                          <option value="">بدون إضافي</option>
                          {OVERTIME_FRACTIONS.map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span title="الأجر اليومي لهذا العامل = صفر، لازم تتحدد الأول من صفحة العمال قبل ما تحسبله إضافي"
                          className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1.5 rounded-lg inline-block w-36 text-center">
                          حدد الأجر اليومي أولًا
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {rec.overtimeValue > 0 && !overtimeEdit[w.id] && !localState[`${selectedDate}:${w.id}`] ? (
                        <div className="flex items-center gap-1.5">
                          <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold text-sm">
                            {rec.overtimeValue.toLocaleString('ar-EG')}
                          </span>
                          <button onClick={() => setOvertimeEdit(prev => ({ ...prev, [w.id]: true }))} title="تعديل قيمة الإضافي"
                            className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input type="number" value={rec.overtimeValue || ''} onChange={e => setRecord(w.id, 'overtimeValue', parseInt(e.target.value) || 0)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setOvertimeEdit(prev => ({ ...prev, [w.id]: false })); saveAttendance(); } }}
                            className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm no-spinner" />
                          {rec.overtimeValue > 0 && (
                            <button onClick={() => { setOvertimeEdit(prev => ({ ...prev, [w.id]: false })); saveAttendance(); }} title="تثبيت قيمة الإضافي"
                              className="text-green-600 hover:bg-green-50 p-1.5 rounded transition flex-shrink-0">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {rec.pillarCost > 0 && !pillarEdit[w.id] && !localState[`${selectedDate}:${w.id}`] ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg font-bold text-sm">
                            {rec.pillarCost.toLocaleString('ar-EG')}
                          </span>
                          <button onClick={() => setPillarEdit(prev => ({ ...prev, [w.id]: true }))} title="تعديل قيمة العمدان"
                            className="text-purple-600 hover:bg-purple-50 p-1.5 rounded transition flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          <input type="number" placeholder="0" value={rec.pillarCost || ''} onChange={e => setRecord(w.id, 'pillarCost', parseFloat(e.target.value) || 0)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setPillarEdit(prev => ({ ...prev, [w.id]: false })); saveAttendance(); } }}
                            className="w-28 px-3 py-1.5 border border-purple-300 focus:ring-2 focus:ring-purple-500 rounded-lg text-sm no-spinner text-center" />
                          {rec.pillarCost > 0 && (
                            <button onClick={() => { setPillarEdit(prev => ({ ...prev, [w.id]: false })); saveAttendance(); }} title="تثبيت قيمة العمدان"
                              className="text-green-600 hover:bg-green-50 p-1.5 rounded transition flex-shrink-0">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {rec.deduction > 0 && !deductionEdit[w.id] && !localState[`${selectedDate}:${w.id}`] ? (
                        <div className="flex items-center gap-1.5">
                          <span className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg font-bold text-sm">
                            {rec.deduction.toLocaleString('ar-EG')}
                          </span>
                          <button onClick={() => setDeductionEdit(prev => ({ ...prev, [w.id]: true }))} title="تعديل الخصم"
                            className="text-red-600 hover:bg-red-50 p-1.5 rounded transition flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input type="number" placeholder="0" value={rec.deduction || ''} onChange={e => setRecord(w.id, 'deduction', parseFloat(e.target.value) || 0)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setDeductionEdit(prev => ({ ...prev, [w.id]: false })); saveAttendance(); } }}
                            className="w-28 px-3 py-1.5 border border-red-300 focus:ring-2 focus:ring-red-500 rounded-lg text-sm no-spinner text-center" />
                          {rec.deduction > 0 && (
                            <button onClick={() => { setDeductionEdit(prev => ({ ...prev, [w.id]: false })); saveAttendance(); }} title="تثبيت الخصم"
                              className="text-green-600 hover:bg-green-50 p-1.5 rounded transition flex-shrink-0">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {savedAdvance(w.id) && !advanceEdit[w.id] ? (
                        <div className="flex items-center gap-2">
                          <span className="bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg font-bold text-sm">
                            {savedAdvance(w.id).amount.toLocaleString('ar-EG')} ج.م
                          </span>
                          <span className="text-[10px] text-gray-400">{PAYMENT_TYPES.find(p => p.value === savedAdvance(w.id).paymentType)?.label}</span>
                          <button onClick={() => startEditAdvance(w.id)} title="تعديل السلفة"
                            className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <input type="number" placeholder={savedAdvance(w.id) ? 'تعديل السلفة' : 'سلفة جديدة'}
                            value={advanceInputs[w.id] || ''}
                            onChange={e => setAdvanceInputs(prev => ({ ...prev, [w.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitAdvance(w.id); } }}
                            className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm no-spinner" />
                          <select value={advancePaymentTypes[w.id] || 'cash'}
                            onChange={e => setAdvancePaymentTypes(prev => ({ ...prev, [w.id]: e.target.value }))}
                            className="px-1.5 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-xs">
                            {PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </select>
                          {savedAdvance(w.id) && (
                            <button onClick={() => setAdvanceEdit(prev => ({ ...prev, [w.id]: false }))} title="إلغاء التعديل"
                              className="text-gray-400 hover:bg-gray-100 p-1.5 rounded transition flex-shrink-0">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredWorkers.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">لا يوجد عمال في هذا القسم</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          <button onClick={clearSelectedDay} title="مسح سجلات الحضور والسلف لهذا اليوم فقط"
            className="bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg font-medium transition shadow">
            مسح بيانات اليوم
          </button>
          <button onClick={clearSelectedDayOvertime} title="مسح الإضافي فقط لهذا اليوم مع الحفاظ على باقي البيانات"
            className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-lg font-medium transition shadow">
            مسح الإضافي لليوم
          </button>
          <button onClick={saveAll} disabled={saveStatus === 'saving'}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-lg font-medium transition shadow">
            {saveStatus === 'saving' ? 'جاري الحفظ...' : 'حفظ الحضور والغياب'}
          </button>
          <button onClick={() => setShowDataDiagnostic(true)} title="عرض كل سجلات الحضور المحفوظة مرتبة بالتاريخ"
            className="bg-gray-600 hover:bg-gray-700 text-white px-5 py-2.5 rounded-lg font-medium transition shadow">
            تشخيص البيانات
          </button>
        </div>
      </div>

      {showDataDiagnostic && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDataDiagnostic(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-800">سجلات الحضور المحفوظة (مرتبة بالتاريخ)</h3>
              <button onClick={() => setShowDataDiagnostic(false)} className="text-gray-500 hover:text-gray-700 p-1">✕</button>
            </div>
            <div className="p-4 overflow-auto">
              {attendance.length === 0 ? (
                <p className="text-center text-gray-400 py-8">لا توجد سجلات حضور محفوظة</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-right">التاريخ</th>
                      <th className="px-2 py-2 text-right">الكود</th>
                      <th className="px-2 py-2 text-right">الاسم</th>
                      <th className="px-2 py-2 text-center">الحالة</th>
                      <th className="px-2 py-2 text-center">الإضافي</th>
                      <th className="px-2 py-2 text-center">العمدان</th>
                      <th className="px-2 py-2 text-center">الخصم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...attendance].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((a, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5 font-medium">{a.date}</td>
                        <td className="px-2 py-1.5 text-gray-500">{a.workerCode || '-'}</td>
                        <td className="px-2 py-1.5">{a.workerName || '-'}</td>
                        <td className={`px-2 py-1.5 text-center font-medium ${a.status === 'present' ? 'text-green-600' : a.status === 'absent' ? 'text-red-500' : 'text-gray-500'}`}>
                          {a.status === 'present' ? 'حاضر' : a.status === 'absent' ? 'غائب' : a.status}
                        </td>
                        <td className="px-2 py-1.5 text-center text-blue-600 font-medium">{a.overtimeValue ? a.overtimeValue.toLocaleString('ar-EG') : '-'}</td>
                        <td className="px-2 py-1.5 text-center text-purple-600 font-medium">{a.pillarCost ? a.pillarCost.toLocaleString('ar-EG') : '-'}</td>
                        <td className="px-2 py-1.5 text-center text-red-600 font-medium">{a.deduction ? a.deduction.toLocaleString('ar-EG') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
