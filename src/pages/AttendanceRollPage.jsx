import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { todayISO } from '../utils/constants';
import { addDaysISO, payWeekOf } from '../utils/weeks';
import { printAttendanceRollSheet, groupRollWorkers } from '../utils/pdfDocs';
import { locationOptions, matchesLocation } from '../utils/locations';

const DAY_LABELS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const dayLabel = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
const norm = (v) => String(v || '').trim().toLowerCase();

// العمال المختارين بيتحفظوا على الجهاز (أكواد بس)، عشان لو المستخدم راح لأي
// قسم تاني ورجع — أو عمل ريفريش — الكشف يفضل زي ما هو لحد ما يفرّغه بنفسه.
const STORAGE_KEY = 'attendance-roll:selected-ids';
const loadSavedIds = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
};

// طباعة التمام: كشف ورقي فاضي يمسكه التايم كيبر ويعلّم عليه يوميًا بالقلم.
// خانة الأسماء مش بتتملى تلقائي من كل العمال — المستخدم هو اللي بيدوّر بالاسم
// ويختار مين يدخل الكشف، عشان يقدر يطبع كشف مخصص لموقع أو فريق معيّن.
export default function AttendanceRollPage() {
  const { workers, plots, pillarBuildings } = useApp();

  const currentWeekStart = payWeekOf(todayISO()).start;
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const week = payWeekOf(weekStart);
  const isCurrentWeek = weekStart === currentWeekStart;

  const [search, setSearch] = useState('');
  const [selectedIdList, setSelectedIdList] = useState(loadSavedIds);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIdList)); } catch { /* التخزين مش متاح */ }
  }, [selectedIdList]);

  // بنحوّل الأكواد لعمال فعليين من البيانات الحالية (لو عامل اتحذف أو بقى غير نشط مش هيظهر،
  // ومش بنمسح كوده من التخزين عشان لو البيانات لسه بتتحمّل ما نخسرش الاختيار).
  const selected = useMemo(() => {
    const byId = new Map(workers.map(w => [w.id, w]));
    return selectedIdList.map(id => byId.get(id)).filter(w => w && w.status === 'active');
  }, [workers, selectedIdList]);

  const selectedIds = useMemo(() => new Set(selectedIdList), [selectedIdList]);

  const matches = useMemo(() => {
    const q = norm(search);
    if (!q) return [];
    return workers
      .filter(w => w.status === 'active' && !selectedIds.has(w.id))
      .filter(w => norm(w.name).includes(q) || norm(w.code).includes(q))
      .slice(0, 8);
  }, [workers, search, selectedIds]);

  const addWorker = (w) => {
    setSelectedIdList(prev => [...prev, w.id]);
    setSearch('');
  };
  const locOptions = useMemo(() => locationOptions(plots || [], pillarBuildings || []), [plots, pillarBuildings]);
  const addLocationWorkers = (value) => {
    if (!value) return;
    const ids = workers.filter(w => w.status === 'active' && matchesLocation(w, value)).map(w => w.id);
    if (ids.length === 0) { alert('مفيش عمال نشطين في المكان ده.'); return; }
    setSelectedIdList(prev => [...prev, ...ids.filter(id => !prev.includes(id))]);
  };
  const removeWorker = (id) => setSelectedIdList(prev => prev.filter(x => x !== id));
  const clearAll = () => { if (window.confirm('هل تريد إفراغ الكشف من كل العمال؟')) setSelectedIdList([]); };

  // نفس ترتيب الطباعة: مجموعة لكل مهنة، والفورمان فوق عماله
  const groups = useMemo(() => groupRollWorkers(selected), [selected]);
  const sortedSelected = useMemo(() => groups.flatMap(g => g.workers), [groups]);

  const days = useMemo(
    () => DAY_LABELS.map((label, i) => ({ label, date: addDaysISO(week.start, i) })),
    [week.start]
  );
  const weekLabel = `من ${dayLabel(week.start)} إلى ${dayLabel(week.end)}`;

  const handlePrint = () => {
    if (sortedSelected.length === 0) return;
    printAttendanceRollSheet({ workers: sortedSelected, days, weekLabel });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">طباعة التمام</h2>
          <p className="text-xs text-gray-400 mt-1">كشف ورقي فاضي يوقّع عليه التايم كيبر يوميًا بالقلم — اختار العمال والأسبوع واطبع</p>
        </div>
        <select value="" onChange={e => addLocationWorkers(e.target.value)}
          title="إضافة كل عمال مكان العمل للكشف"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500">
          <option value="">+ إضافة عمال مكان عمل</option>
          {locOptions.map(o => <option key={o.value} value={o.value}>{o.isZone ? `${o.label} (كل المنطقة)` : o.label}</option>)}
        </select>
        <button onClick={handlePrint} disabled={sortedSelected.length === 0}
          title="طباعة كشف التمام بالعمال والأسبوع المختارين"
          className="bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          طباعة كشف التمام
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-3">
        <button onClick={() => setWeekStart(addDaysISO(weekStart, -7))} title="الأسبوع السابق" className="p-2 hover:bg-gray-100 rounded-lg transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
        <div className="text-center flex-1 min-w-[180px]">
          <p className="font-bold text-gray-800">
            {weekLabel}
            {isCurrentWeek && <span className="mr-2 bg-primary-100 text-primary-700 text-[11px] px-2 py-0.5 rounded-full">الأسبوع الحالي</span>}
          </p>
          <p className="text-xs text-gray-400">{week.start} ← {week.end}</p>
        </div>
        <button onClick={() => setWeekStart(addDaysISO(weekStart, 7))} title="الأسبوع التالي" className="p-2 hover:bg-gray-100 rounded-lg transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <input type="date" value={weekStart}
          onChange={e => e.target.value && setWeekStart(payWeekOf(e.target.value).start)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
        {!isCurrentWeek && (
          <button onClick={() => setWeekStart(currentWeekStart)}
            className="text-sm text-primary-600 hover:bg-primary-50 px-3 py-2 rounded-lg transition">الأسبوع الحالي</button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">إضافة عامل للكشف</label>
        <div className="relative">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الكود..."
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {matches.map(w => (
                <button key={w.id} onClick={() => addWorker(w)}
                  className="w-full text-right px-4 py-2.5 hover:bg-primary-50 transition flex items-center justify-between gap-3 border-b border-gray-50 last:border-0">
                  <span className="text-sm font-medium text-gray-800">{w.name} <span className="text-xs text-gray-400">{w.code}</span></span>
                  <span className="text-xs text-gray-500">{w.role}</span>
                </button>
              ))}
            </div>
          )}
          {search && matches.length === 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm text-gray-400">
              مفيش عامل نشط مطابق (أو اتضاف بالفعل)
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">عمال الكشف</h3>
            <p className="text-xs text-gray-400 mt-1">هيتطبعوا مقسّمين حسب المهنة، والفورمان فوق عماله</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-primary-700">{sortedSelected.length.toLocaleString('ar-EG')} عامل</span>
            {sortedSelected.length > 0 && (
              <button onClick={clearAll} className="text-xs text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition">إفراغ الكشف</button>
            )}
          </div>
        </div>
        {sortedSelected.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">مفيش عمال مختارين — ابحث بالاسم فوق وضيفهم</p>
        ) : (
          <div>
            {groups.map(g => (
              <div key={g.label}>
                <div className="px-5 py-1.5 bg-primary-50 text-primary-700 text-xs font-bold flex items-center justify-between">
                  <span>{g.label}</span>
                  <span>{g.workers.length.toLocaleString('ar-EG')}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {g.workers.map(w => (
                    <div key={w.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">{w.name} <span className="text-xs text-gray-400">{w.code}</span></p>
                        <p className="text-xs text-gray-400">{w.role}</p>
                      </div>
                      <button onClick={() => removeWorker(w.id)} title="إزالة من الكشف"
                        className="text-red-400 hover:bg-red-50 p-1.5 rounded transition flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
