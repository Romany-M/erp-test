import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { todayISO, PAYMENT_TYPES } from '../utils/constants';

export default function PurchasesPage() {
  const { purchases, addPurchase, deletePurchase } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [form, setForm] = useState({
    date: todayISO(), item: '', supplier: '', amount: '', notes: '', paymentType: 'cash',
  });

  const filtered = useMemo(() => {
    let data = [...purchases].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (search) data = data.filter(p => p.item?.includes(search) || p.supplier?.includes(search));
    if (dateFilter) data = data.filter(p => p.date === dateFilter);
    return data;
  }, [purchases, search, dateFilter]);

  const monthWeeks = useMemo(() => {
    const base = todayISO().substring(0, 7);
    const y = parseInt(base.substring(0, 4));
    const m = parseInt(base.substring(5, 7));
    const lastDay = new Date(y, m, 0).getDate();
    const weeks = [
      { key: 1, label: 'الأسبوع الأول', start: `${base}-01`, end: `${base}-07` },
      { key: 2, label: 'الأسبوع الثاني', start: `${base}-08`, end: `${base}-14` },
      { key: 3, label: 'الأسبوع الثالث', start: `${base}-15`, end: `${base}-21` },
      { key: 4, label: 'الأسبوع الرابع', start: `${base}-22`, end: `${base}-${String(lastDay).padStart(2, '0')}` },
    ];
    return weeks.map(w => {
      const weekPurchases = purchases.filter(p => p.date >= w.start && p.date <= w.end);
      return { ...w, total: weekPurchases.reduce((s, p) => s + (p.amount || 0), 0) };
    });
  }, [purchases]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.item || !form.amount) return;
    addPurchase(form);
    setForm({ date: todayISO(), item: '', supplier: '', amount: '', notes: '', paymentType: 'cash' });
    setShowAdd(false);
  };

  const totalAll = filtered.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">المشتريات</h2>
        <button onClick={() => setShowAdd(true)}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          مشتريات جديدة
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          <input type="text" placeholder="بحث بالصنف أو المورد..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800">إجمالي المشتريات حسب الأسابيع</h3>
          <span className="text-xs text-gray-400">{todayISO().substring(0, 7)}</span>
        </div>
        <div className="divide-y divide-gray-100">
          {monthWeeks.map(w => (
            <div key={w.key} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-medium text-gray-700">{w.label}</span>
                <span className="text-xs text-gray-400"> — من {w.start} إلى {w.end}</span>
              </div>
              <span className="font-bold text-purple-600">{(w.total || 0).toLocaleString('ar-EG')} ج.م</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">التاريخ</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">الصنف</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">المورد</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">المبلغ</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">نوع الصرف</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">ملاحظات</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3">{new Date(p.date).toLocaleDateString('ar-EG')}</td>
                  <td className="px-4 py-3 font-medium">{p.item}</td>
                  <td className="px-4 py-3 text-gray-600">{p.supplier || '-'}</td>
                  <td className="px-4 py-3 font-bold text-orange-600">{(p.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      p.paymentType === 'cash' ? 'bg-green-100 text-green-700' :
                      p.paymentType === 'insta' ? 'bg-purple-100 text-purple-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{PAYMENT_TYPES.find(pt => pt.value === p.paymentType)?.label || p.paymentType}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.notes || '-'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => { if (confirm('هل تريد حذف هذه المشتريات؟')) deletePurchase(p.id); }}
                      className="text-red-500 hover:bg-red-50 p-1.5 rounded transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد مشتريات مسجلة</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 bg-gray-50 border-t text-sm font-bold text-gray-700">
          الإجمالي: {totalAll.toLocaleString('ar-EG')} ج.م
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">إضافة مشتريات جديدة</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الصنف</label>
                  <input type="text" value={form.item} onChange={e => setForm({ ...form, item: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">المورد</label>
                  <input type="text" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ج.م)</label>
                  <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || '' })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 no-spinner" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">نوع الصرف</label>
                  <select value={form.paymentType} onChange={e => setForm({ ...form, paymentType: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    {PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">إلغاء</button>
                <button type="submit" className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium">إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
