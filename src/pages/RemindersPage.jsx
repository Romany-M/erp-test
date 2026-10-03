import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { calcWorkerNet } from '../domain/payroll';
import { todayISO } from '../utils/constants';

const money = (n) => `${Math.round(n).toLocaleString('ar-EG')} ج.م`;

// ---------------- تنبيهات تلقائية: محسوبة لحظيًا من بيانات القبض والسلف
// الموجودة فعلاً، من غير أي تخزين إضافي - بتتحدث أول ما البيانات تتغير.
function AlertsSection() {
  const { workers, attendance, advances, transfers, pillars, payments } = useApp();
  const today = todayISO();

  const rows = useMemo(() => {
    return workers.filter(w => w.status === 'active').map(w => {
      const r = calcWorkerNet(w, { attendance, advances, transfers, pillars, payments, from: '', to: '' });
      const absentToday = attendance.some(a => a.workerId === w.id && a.date === today && a.status === 'absent');
      return { worker: w, ...r, absentToday };
    });
  }, [workers, attendance, advances, transfers, pillars, payments, today]);

  const negativeNet = rows.filter(r => r.net < 0).sort((a, b) => a.net - b.net);
  const advanceAndAbsent = rows.filter(r => r.advances > 0 && r.absentToday);
  const withAdvances = rows.filter(r => r.advances > 0).sort((a, b) => b.advances - a.advances);

  const Card = ({ title, color, items, render, empty }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color }}>
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-gray-300 py-2">{empty}</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">{items.map(render)}</div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card
        title="صافي بالسالب" color="#b91c1c" items={negativeNet} empty="مفيش حد صافيه بالسالب دلوقتي"
        render={r => (
          <div key={r.worker.id} className="flex justify-between items-center text-sm px-2 py-1.5 rounded-lg bg-red-50">
            <span className="text-gray-700">{r.worker.name}</span>
            <span className="font-bold text-red-700">{money(r.net)}</span>
          </div>
        )} />
      <Card
        title="عليه سلفة وغايب النهاردة" color="#b45309" items={advanceAndAbsent} empty="مفيش حد غايب ومديون سلفة النهاردة"
        render={r => (
          <div key={r.worker.id} className="flex justify-between items-center text-sm px-2 py-1.5 rounded-lg bg-amber-50">
            <span className="text-gray-700">{r.worker.name}</span>
            <span className="font-bold text-amber-700">{money(r.advances)}</span>
          </div>
        )} />
      <Card
        title="عليهم سلفة قائمة" color="#1d4ed8" items={withAdvances} empty="مفيش سلف قائمة دلوقتي"
        render={r => (
          <div key={r.worker.id} className="flex justify-between items-center text-sm px-2 py-1.5 rounded-lg bg-blue-50">
            <span className="text-gray-700">{r.worker.name}</span>
            <span className="font-bold text-blue-700">{money(r.advances)}</span>
          </div>
        )} />
    </div>
  );
}

// ---------------- تذكيرات يدوية: مرة واحدة بتاريخ، أو يومية (بترجع كل يوم
// لحد ما تتشال). كله متحفوظ على السيرفر.
function RemindersSection() {
  const { reminders, addReminder, updateReminder, deleteReminder } = useApp();
  const today = todayISO();
  const [text, setText] = useState('');
  const [kind, setKind] = useState('once');
  const [dueDate, setDueDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const isDueToday = (r) => (r.kind === 'daily' ? r.doneDate !== today : !r.done && r.dueDate && r.dueDate <= today);

  const sorted = [...reminders].sort((a, b) => {
    const da = isDueToday(a) ? 0 : 1;
    const db = isDueToday(b) ? 0 : 1;
    if (da !== db) return da - db;
    return (a.dueDate || '').localeCompare(b.dueDate || '');
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await addReminder({ text: text.trim(), kind, dueDate: kind === 'once' ? dueDate : null });
      setText('');
    } catch (err) {
      alert('فشل إضافة التذكير: ' + (err.message || 'خطأ غير متوقع') + '\n\nتأكد إنك شغّلت سكريبت supabase-reminders.sql.');
    } finally {
      setSaving(false);
    }
  };

  const markDone = (r) => {
    if (r.kind === 'daily') updateReminder(r.id, { doneDate: today });
    else updateReminder(r.id, { done: true });
  };

  const handleDelete = (r) => {
    if (confirm(`حذف تذكير "${r.text}"؟`)) deleteReminder(r.id);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">نص التذكير</label>
          <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="مثال: ادفع فاتورة الكهرباء"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 text-right" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">التكرار</label>
          <div className="flex gap-2 border border-gray-300 rounded-lg p-1.5">
            <label className="flex items-center gap-1 text-sm px-1">
              <input type="radio" checked={kind === 'once'} onChange={() => setKind('once')} /> مرة واحدة
            </label>
            <label className="flex items-center gap-1 text-sm px-1">
              <input type="radio" checked={kind === 'daily'} onChange={() => setKind('daily')} /> يومي
            </label>
          </div>
        </div>
        {kind === 'once' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">التاريخ</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
          </div>
        )}
        <button type="submit" disabled={saving}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
          إضافة
        </button>
      </form>

      <div className="space-y-1.5 pt-3 border-t border-gray-100">
        {sorted.length === 0 && <p className="text-sm text-gray-300 text-center py-6">مفيش تذكيرات مضافة</p>}
        {sorted.map(r => {
          const due = isDueToday(r);
          return (
            <div key={r.id} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg ${due ? 'bg-amber-50' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2 text-sm">
                <span className={due ? 'font-medium text-amber-800' : 'text-gray-500'}>{r.text}</span>
                <span className="text-[11px] text-gray-400">
                  {r.kind === 'daily' ? '(يومي)' : r.dueDate ? `(${r.dueDate})` : ''}
                </span>
                {r.done && <span className="text-[11px] text-green-600">تم ✓</span>}
              </div>
              <div className="flex items-center gap-2">
                {!r.done && (
                  <button onClick={() => markDone(r)} className="text-xs text-green-700 hover:bg-green-100 px-2 py-1 rounded-lg transition">
                    {r.kind === 'daily' ? 'تم النهاردة' : 'تم'}
                  </button>
                )}
                <button onClick={() => handleDelete(r)} className="text-xs text-red-500 hover:bg-red-100 px-2 py-1 rounded-lg transition">حذف</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RemindersPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">تذكيرات وتنبيهات</h2>
        <p className="text-sm text-gray-400 mt-0.5">تنبيهات تلقائية من بيانات القبض والسلف، وتذكيرات تضيفها إنت بنفسك</p>
      </div>

      <AlertsSection />

      <div>
        <h3 className="font-bold text-gray-700 mb-3">تذكيراتي</h3>
        <RemindersSection />
      </div>
    </div>
  );
}
