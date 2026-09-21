import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { todayISO, PAYMENT_TYPES, DEFAULT_WHATSAPP } from '../utils/constants';

export default function TransfersPage() {
  const { workers, transfers, addTransfer, updateTransfer, deleteTransfer } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => todayISO().substring(0, 7) + '-01');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState({
    date: todayISO(), time: '', workerId: '', phone: '', amount: '', transactionId: '', walletName: '', notes: '', paymentType: 'cash',
  });

  const activeWorkers = workers.filter(w => w.status === 'active');

  const monthWeeks = useMemo(() => {
    const base = (dateFrom || todayISO()).substring(0, 7);
    const y = parseInt(base.substring(0, 4));
    const m = parseInt(base.substring(5, 7));
    const lastDay = new Date(y, m, 0).getDate();
    const weeks = [
      { key: 1, label: 'الأسبوع الأول', start: `${base}-01`, end: `${base}-07` },
      { key: 2, label: 'الأسبوع الثاني', start: `${base}-08`, end: `${base}-14` },
      { key: 3, label: 'الأسبوع الثالث', start: `${base}-15`, end: `${base}-21` },
      { key: 4, label: 'الأسبوع الرابع', start: `${base}-22`, end: `${base}-${String(lastDay).padStart(2, '0')}` },
    ];
    const today = todayISO();
    return weeks.map(w => {
      const weekTransfers = transfers.filter(t => t.date >= w.start && t.date <= w.end);
      const total = weekTransfers.reduce((s, t) => s + (t.amount || 0), 0);
      let status = 'upcoming';
      if (w.end < today) status = 'done';
      else if (w.start <= today && today <= w.end) status = 'current';
      return { ...w, status, total };
    });
  }, [dateFrom, transfers]);

  const filtered = useMemo(() => {
    let data = [...transfers].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (search) {
      data = data.filter(t => {
        const w = workers.find(wk => wk.id === t.workerId);
        return w?.name.includes(search) || t.phone?.includes(search);
      });
    }
    if (dateFrom) data = data.filter(t => t.date >= dateFrom);
    if (dateTo) data = data.filter(t => t.date <= dateTo);
    return data;
  }, [transfers, workers, search, dateFrom, dateTo]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.workerId || !form.amount) return;
    if (editingId) updateTransfer(editingId, form);
    else addTransfer(form);
    setForm({ date: todayISO(), time: '', workerId: '', phone: '', amount: '', transactionId: '', walletName: '', notes: '', paymentType: 'cash' });
    setShowAdd(false);
    setEditingId(null);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ date: todayISO(), time: '', workerId: '', phone: '', amount: '', transactionId: '', walletName: '', notes: '', paymentType: 'cash' });
    setShowAdd(true);
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setForm({
      date: t.date,
      time: t.time || '',
      workerId: t.workerId,
      phone: t.phone || '',
      amount: t.amount,
      transactionId: t.transactionId || '',
      walletName: t.walletName || '',
      notes: t.notes || '',
      paymentType: t.paymentType,
    });
    setShowAdd(true);
  };

  const handleWorkerChange = (workerId) => {
    const w = workers.find(wk => wk.id === workerId);
    setForm({ ...form, workerId, phone: w?.phone || '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">تحويلات العمال</h2>
        <button onClick={openAdd}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          تحويلة جديدة
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          <input type="text" placeholder="بحث بالاسم أو رقم الهاتف..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="من تاريخ" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="إلى تاريخ" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800">إجمالي تحويلات العمال حسب الأسابيع</h3>
          <span className="text-xs text-gray-400">{(dateFrom || todayISO()).substring(0, 7)}</span>
        </div>
        <div className="divide-y divide-gray-100">
          {monthWeeks.map(w => (
            <div key={w.key} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-medium text-gray-700">{w.label}</span>
                <span className="text-xs text-gray-400"> — من {w.start} إلى {w.end}</span>
              </div>
              <span className="font-bold text-rose-600">{(w.total || 0).toLocaleString('ar-EG')} ج.م</span>
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
                <th className="px-4 py-3 text-right font-semibold text-gray-600">الاسم</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">رقم الهاتف</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">اسم الحساب</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">المبلغ</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">نوع الصرف</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">رقم المعاملة</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">ملاحظات</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(t => {
                const w = workers.find(wk => wk.id === t.workerId);
                return (
                  <tr key={t.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">{new Date(t.date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-4 py-3 font-medium">{w?.name || 'محذوف'}</td>
                    <td className="px-4 py-3" dir="ltr">{t.phone || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{t.walletName || '-'}</td>
                    <td className="px-4 py-3 font-bold text-red-600">{(t.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        t.paymentType === 'cash' ? 'bg-green-100 text-green-700' :
                        t.paymentType === 'insta' ? 'bg-purple-100 text-purple-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{PAYMENT_TYPES.find(p => p.value === t.paymentType)?.label || t.paymentType}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{t.transactionId || '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{t.notes || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(t)}
                          title="تعديل التحويلة"
                          className="text-blue-500 hover:bg-blue-50 p-1.5 rounded transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => { if (confirm('هل تريد حذف هذه التحويلة؟')) deleteTransfer(t.id); }}
                          className="text-red-500 hover:bg-red-50 p-1.5 rounded transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">لا توجد تحويلات مسجلة</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setShowAdd(false); setEditingId(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">{editingId ? 'تعديل تحويلة' : 'إضافة تحويلة جديدة'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الوقت</label>
                  <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">العامل</label>
                <select value={form.workerId} onChange={e => handleWorkerChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" required>
                  <option value="">اختر العامل</option>
                  {activeWorkers.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف المحول إليه</label>
                  <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" dir="ltr" placeholder="+20..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ج.م)</label>
                  <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || '' })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 no-spinner" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">نوع الصرف</label>
                  <select value={form.paymentType} onChange={e => setForm({ ...form, paymentType: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    {PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">رقم المعاملة</label>
                  <input type="text" value={form.transactionId} onChange={e => setForm({ ...form, transactionId: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم الحساب</label>
                <input type="text" value={form.walletName} onChange={e => setForm({ ...form, walletName: e.target.value })}
                  placeholder="اسم صاحب المحفظة أو حساب الانستا"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => { setShowAdd(false); setEditingId(null); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">إلغاء</button>
                <button type="submit" className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium">{editingId ? 'حفظ التعديلات' : 'إضافة'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
