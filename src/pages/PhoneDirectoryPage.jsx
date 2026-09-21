import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ROLES } from '../utils/constants';
import { telHref, whatsappHref } from '../utils/phone';
import { printPhoneDirectory } from '../utils/pdfDocs';

const n = (v) => Number(v || 0).toLocaleString('ar-EG');
const norm = (v) => String(v || '').trim().toLowerCase();

// دليل الهاتف: أسماء وأرقام كل العمال في مكان واحد، مع اتصال وواتساب بضغطة،
// وإمكانية إضافة/تعديل الرقم من نفس الصفحة.
export default function PhoneDirectoryPage() {
  const { workers, housingApartments, updateWorker } = useApp();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const aptLabel = (apartmentId) => {
    const a = housingApartments.find(x => x.id === apartmentId);
    return a ? `${a.buildingName} — شقة ${a.apartmentNumber}` : '';
  };

  const scope = useMemo(
    () => workers.filter(w => showInactive || w.status === 'active'),
    [workers, showInactive]
  );

  const withPhone = scope.filter(w => (w.phone || '').trim()).length;

  const list = useMemo(() => {
    const q = norm(search);
    return scope
      .filter(w => !role || w.role === role)
      .filter(w => !onlyMissing || !(w.phone || '').trim())
      .filter(w => {
        if (!q) return true;
        return (
          norm(w.name).includes(q) || norm(w.code).includes(q) ||
          norm(w.phone).includes(q) || norm(aptLabel(w.apartmentId)).includes(q)
        );
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, search, role, onlyMissing, housingApartments]);

  // دليل الهاتف PDF: بنفس الفلاتر المعروضة
  const handlePdf = () => {
    if (list.length === 0) { alert('لا يوجد عمال لطباعتهم'); return; }
    const filtersText = [
      role && `الفئة: ${role}`,
      !showInactive && 'النشطين فقط',
      onlyMissing && 'بدون رقم فقط',
      search && `بحث: ${search}`,
    ].filter(Boolean).join(' — ');
    printPhoneDirectory({
      workers: list.map(w => ({ name: w.name, code: w.code, role: w.role, phone: w.phone, apartmentLabel: aptLabel(w.apartmentId) })),
      filtersText,
    });
  };

  const startEdit = (w) => { setEditingId(w.id); setEditValue(w.phone || ''); };
  const cancelEdit = () => { setEditingId(null); setEditValue(''); };

  const saveEdit = async (w) => {
    setSaving(true);
    try {
      await updateWorker(w.id, { phone: editValue.trim() });
      cancelEdit();
    } catch (err) {
      alert('تعذر حفظ الرقم: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">دليل الهاتف</h2>
          <p className="text-xs text-gray-400 mt-1">أسماء وأرقام العمال — اضغط على الرقم للاتصال أو الواتساب</p>
        </div>
        <button onClick={handlePdf} disabled={list.length === 0}
          title="حفظ الدليل كملف PDF (بنفس الفلاتر المعروضة)"
          className="bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          تحميل دليل الهاتف PDF
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-primary-50 rounded-xl border border-primary-100 p-4">
          <p className="text-sm text-primary-600 font-medium">عدد العمال</p>
          <p className="text-2xl font-bold text-primary-700 mt-1">{n(scope.length)}</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-100 p-4">
          <p className="text-sm text-green-600 font-medium">عندهم رقم</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{n(withPhone)}</p>
        </div>
        <button onClick={() => setOnlyMissing(v => !v)}
          className={`text-right rounded-xl border p-4 transition ${onlyMissing ? 'bg-amber-100 border-amber-300' : 'bg-amber-50 border-amber-100 hover:bg-amber-100'}`}>
          <p className="text-sm text-amber-700 font-medium">بدون رقم {onlyMissing ? '(معروضين)' : ''}</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{n(scope.length - withPhone)}</p>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        <input type="text" placeholder="بحث بالاسم أو الكود أو الرقم أو العمارة..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
        <select value={role} onChange={e => setRole(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white">
          <option value="">كل الفئات</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-4 h-4 accent-primary-600" />
          إظهار غير النشطين
        </label>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {list.map(w => {
            const phone = (w.phone || '').trim();
            const apt = aptLabel(w.apartmentId);
            const editing = editingId === w.id;
            return (
              <div key={w.id} className={`px-5 py-3 flex flex-wrap items-center justify-between gap-3 ${w.status !== 'active' ? 'opacity-60' : ''}`}>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800">
                    {w.name} <span className="text-xs text-gray-400">{w.code}</span>
                    {w.status !== 'active' && <span className="mr-2 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">غير نشط</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {w.role}{apt ? ` — ${apt}` : ''}
                  </p>
                </div>

                {editing ? (
                  <div className="flex items-center gap-2">
                    <input type="tel" value={editValue} autoFocus dir="ltr"
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(w); if (e.key === 'Escape') cancelEdit(); }}
                      placeholder="01xxxxxxxxx"
                      className="w-44 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
                    <button onClick={() => saveEdit(w)} disabled={saving}
                      className="px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition">حفظ</button>
                    <button onClick={cancelEdit} className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition">إلغاء</button>
                  </div>
                ) : phone ? (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-700 font-medium text-sm" dir="ltr">{phone}</span>
                    <a href={telHref(phone)} title="اتصال"
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition">اتصال</a>
                    <a href={whatsappHref(phone)} target="_blank" rel="noopener noreferrer" title="واتساب"
                      className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium transition">واتساب</a>
                    <button onClick={() => startEdit(w)} title="تعديل الرقم" className="text-gray-400 hover:bg-gray-100 p-1.5 rounded transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(w)}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-medium transition">+ إضافة رقم</button>
                )}
              </div>
            );
          })}
          {list.length === 0 && (
            <p className="text-center text-gray-400 py-10">مفيش نتائج</p>
          )}
        </div>
      </div>
    </div>
  );
}
