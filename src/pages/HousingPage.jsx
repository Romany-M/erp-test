import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { todayISO } from '../utils/constants';
import { telHref, whatsappHref } from '../utils/phone';

const EMPTY_FORM = { buildingName: '', area: '', apartmentNumber: '', rooms: 1, notes: '' };

const n = (v) => Number(v || 0).toLocaleString('ar-EG');
const norm = (v) => String(v || '').trim().toLowerCase();

const STATUS_STYLE = {
  present: { label: 'حاضر', cls: 'bg-green-100 text-green-700' },
  absent: { label: 'غائب', cls: 'bg-red-100 text-red-600' },
  unrecorded: { label: 'لم يُسجَّل', cls: 'bg-gray-100 text-gray-500' },
};

export default function HousingPage() {
  const {
    workers, attendance, qrAttendance, housingApartments,
    addApartment, updateApartment, deleteApartment, assignWorkersToApartment,
  } = useApp();

  const [date, setDate] = useState(todayISO);
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');

  const [formFor, setFormFor] = useState(null); // null | 'new' | apartment id
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [assignFor, setAssignFor] = useState(null); // apartment id
  const [assignSearch, setAssignSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ---------- حالة الحضور لكل عامل في اليوم المختار ----------
  // حاضر = سجل حضور (أو قيمة عمل على أعمدة) في صفحة الحضور أو مسح QR.
  // غائب = متسجل له غياب فعلاً (في الحضور والانصراف أو "إنهاء الحضور" بتاع QR).
  // لم يُسجَّل = لسه محدش سجّل حاجة للعامل ده في اليوم ده (مش نفس الغياب).
  const dayStatus = useMemo(() => {
    const map = new Map();
    attendance.forEach(a => {
      if (a.date !== date) return;
      map.set(a.workerId, (a.status === 'present' || (a.pillarCost || 0) > 0) ? 'present' : 'absent');
    });
    qrAttendance.forEach(a => {
      if (a.date !== date) return;
      if (a.status === 'present') map.set(a.workerId, 'present');
      else if (!map.has(a.workerId)) map.set(a.workerId, 'absent');
    });
    return map;
  }, [attendance, qrAttendance, date]);

  const statusOf = (workerId) => dayStatus.get(workerId) || 'unrecorded';

  // ---------- الشقق + سكانها ----------
  const apartments = useMemo(() => {
    return housingApartments
      .map(apt => {
        const occupants = workers
          .filter(w => w.apartmentId === apt.id)
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
        const active = occupants.filter(w => w.status === 'active');
        return {
          ...apt,
          occupants,
          activeCount: active.length,
          present: active.filter(w => statusOf(w.id) === 'present').length,
          absent: active.filter(w => statusOf(w.id) === 'absent').length,
        };
      })
      .sort((a, b) =>
        (a.area || '').localeCompare(b.area || '', 'ar') ||
        (a.buildingName || '').localeCompare(b.buildingName || '', 'ar') ||
        String(a.apartmentNumber).localeCompare(String(b.apartmentNumber), 'ar', { numeric: true })
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [housingApartments, workers, dayStatus]);

  const areas = useMemo(
    () => [...new Set(housingApartments.map(a => (a.area || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')),
    [housingApartments]
  );

  const filteredApartments = useMemo(() => {
    const q = norm(search);
    return apartments.filter(apt => {
      if (areaFilter && (apt.area || '').trim() !== areaFilter) return false;
      if (!q) return true;
      return (
        norm(apt.buildingName).includes(q) ||
        norm(apt.area).includes(q) ||
        norm(apt.apartmentNumber).includes(q) ||
        apt.occupants.some(w => norm(w.name).includes(q) || norm(w.code).includes(q))
      );
    });
  }, [apartments, search, areaFilter]);

  // ---------- الغائبون (شغالين ومسكّنين) في اليوم المختار ----------
  const absentRows = useMemo(() => {
    const rows = [];
    apartments.forEach(apt => {
      apt.occupants.forEach(w => {
        if (w.status === 'active' && statusOf(w.id) === 'absent') rows.push({ worker: w, apt });
      });
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartments, dayStatus]);

  const totalHoused = apartments.reduce((s, a) => s + a.activeCount, 0);
  const totalUnrecorded = apartments.reduce(
    (s, a) => s + a.occupants.filter(w => w.status === 'active' && statusOf(w.id) === 'unrecorded').length, 0);

  // ---------- إضافة / تعديل شقة ----------
  const openNew = () => { setForm(EMPTY_FORM); setFormFor('new'); };
  const openEdit = (apt) => {
    setForm({
      buildingName: apt.buildingName || '',
      area: apt.area || '',
      apartmentNumber: apt.apartmentNumber || '',
      rooms: apt.rooms || 1,
      notes: apt.notes || '',
    });
    setFormFor(apt.id);
  };

  const handleSaveApartment = async (e) => {
    e.preventDefault();
    const payload = {
      buildingName: form.buildingName.trim(),
      area: form.area.trim(),
      apartmentNumber: String(form.apartmentNumber).trim(),
      rooms: Math.max(1, parseInt(form.rooms, 10) || 1),
      notes: form.notes.trim(),
    };
    if (!payload.buildingName || !payload.apartmentNumber) return;

    const duplicate = housingApartments.some(a =>
      a.id !== formFor &&
      norm(a.buildingName) === norm(payload.buildingName) &&
      norm(a.area) === norm(payload.area) &&
      norm(a.apartmentNumber) === norm(payload.apartmentNumber)
    );
    if (duplicate) {
      alert('الشقة دي متسجلة قبل كده (نفس العمارة والمنطقة ورقم الشقة).');
      return;
    }

    setSaving(true);
    try {
      if (formFor === 'new') await addApartment(payload);
      else await updateApartment(formFor, payload);
      setFormFor(null);
    } catch (err) {
      alert('تعذر حفظ الشقة: ' + (err?.message || 'خطأ غير معروف') +
        '\n(لو الرسالة بتقول إن الجدول مش موجود، شغّل ملف الـ SQL بتاع السكن في Supabase الأول.)');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteApartment = async (apt) => {
    const msg = apt.occupants.length > 0
      ? `الشقة فيها ${n(apt.occupants.length)} عامل هيتم إخراجهم من السكن (العمال نفسهم مش هيتحذفوا). متأكد إنك عاوز تحذف الشقة؟`
      : 'هل تريد حذف هذه الشقة؟';
    if (!window.confirm(msg)) return;
    try {
      await deleteApartment(apt.id);
    } catch (err) {
      alert('تعذر حذف الشقة: ' + (err?.message || 'خطأ غير معروف'));
    }
  };

  // ---------- تسكين / إخراج عمال ----------
  const assignApt = apartments.find(a => a.id === assignFor);

  const candidates = useMemo(() => {
    if (!assignFor) return [];
    const q = norm(assignSearch);
    const aptLabel = (id) => {
      const a = housingApartments.find(x => x.id === id);
      return a ? `${a.buildingName} - شقة ${a.apartmentNumber}` : '';
    };
    return workers
      .filter(w => w.status === 'active' && w.apartmentId !== assignFor)
      .filter(w => !q || norm(w.name).includes(q) || norm(w.code).includes(q))
      .map(w => ({ ...w, currentApt: w.apartmentId ? aptLabel(w.apartmentId) : '' }))
      .sort((a, b) => (a.apartmentId ? 1 : 0) - (b.apartmentId ? 1 : 0) || (a.name || '').localeCompare(b.name || '', 'ar'));
  }, [workers, assignFor, assignSearch, housingApartments]);

  const openAssign = (apt) => { setAssignFor(apt.id); setAssignSearch(''); setSelectedIds(new Set()); };
  const closeAssign = () => { setAssignFor(null); setSelectedIds(new Set()); };

  const toggleSelected = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;
    setSaving(true);
    try {
      await assignWorkersToApartment(assignFor, [...selectedIds]);
      closeAssign();
    } catch (err) {
      alert('تعذر التسكين: ' + (err?.message || 'خطأ غير معروف') +
        '\n(لو الرسالة بتقول إن العمود مش موجود، شغّل ملف الـ SQL بتاع السكن في Supabase الأول.)');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveWorker = async (worker) => {
    if (!window.confirm(`إخراج "${worker.name}" من الشقة؟`)) return;
    try {
      await assignWorkersToApartment(null, [worker.id]);
    } catch (err) {
      alert('تعذر الإخراج: ' + (err?.message || 'خطأ غير معروف'));
    }
  };

  const aptLine = (apt) => [apt.buildingName, apt.area, `شقة ${apt.apartmentNumber}`].filter(Boolean).join(' — ');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">السكن</h2>
          <p className="text-xs text-gray-400 mt-1">الشقق اللي فيها عمال — مين ساكن فين، ومين غايب النهارده</p>
        </div>
        <button onClick={openNew}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          شقة جديدة
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-primary-50 rounded-xl border border-primary-100 p-4">
          <p className="text-sm text-primary-600 font-medium">عدد الشقق</p>
          <p className="text-2xl font-bold text-primary-700 mt-1">{n(apartments.length)}</p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
          <p className="text-sm text-blue-600 font-medium">عمال في السكن</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{n(totalHoused)}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4">
          <p className="text-sm text-red-600 font-medium">غياب مسجّل</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{n(absentRows.length)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600 font-medium">لم يُسجَّل حضورهم</p>
          <p className="text-2xl font-bold text-gray-700 mt-1">{n(totalUnrecorded)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">تاريخ الحضور:</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value || todayISO())}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
        </div>
        <input type="text" placeholder="بحث بالعمارة أو رقم الشقة أو اسم العامل..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
        <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white">
          <option value="">كل المناطق</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* الغائبون في السكن */}
      <div className={`rounded-xl shadow-sm border overflow-hidden ${absentRows.length > 0 ? 'bg-white border-red-200' : 'bg-white border-gray-100'}`}>
        <div className={`px-5 py-3 border-b flex items-center justify-between gap-3 ${absentRows.length > 0 ? 'bg-red-50 border-red-100' : 'border-gray-100'}`}>
          <h3 className={`font-bold ${absentRows.length > 0 ? 'text-red-700' : 'text-gray-700'}`}>
            الغائبون من ساكني الشقق — {new Date(date).toLocaleDateString('ar-EG')}
          </h3>
          <span className="text-sm font-bold text-red-600">{n(absentRows.length)}</span>
        </div>
        {absentRows.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-6">لا يوجد غياب مسجّل لساكني الشقق في اليوم ده</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">العامل</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">رقم التليفون</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">الفئة</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">العمارة</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">المنطقة</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">رقم الشقة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {absentRows.map(({ worker, apt }) => (
                  <tr key={worker.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {worker.name} <span className="text-xs text-gray-400">{worker.code}</span>
                    </td>
                    <td className="px-4 py-2">
                      {(worker.phone || '').trim() ? (
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-gray-800 font-medium" dir="ltr">{worker.phone}</span>
                          <a href={telHref(worker.phone)} className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition">اتصال</a>
                          <a href={whatsappHref(worker.phone)} target="_blank" rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium transition">واتساب</a>
                        </div>
                      ) : (
                        <span className="text-xs text-amber-600">لا يوجد رقم (أضفه من دليل الهاتف)</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{worker.role}</td>
                    <td className="px-4 py-2">{apt.buildingName}</td>
                    <td className="px-4 py-2">{apt.area || '—'}</td>
                    <td className="px-4 py-2 font-bold">{apt.apartmentNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* كروت الشقق */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredApartments.map(apt => (
          <div key={apt.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-800 text-lg">{apt.buildingName}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {apt.area ? `${apt.area} — ` : ''}شقة رقم <span className="font-bold text-gray-700">{apt.apartmentNumber}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(apt)} title="تعديل الشقة"
                    className="text-gray-500 hover:bg-gray-100 p-1.5 rounded transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => handleDeleteApartment(apt)} title="حذف الشقة"
                    className="text-red-500 hover:bg-red-50 p-1.5 rounded transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="bg-primary-50 text-primary-700 px-2.5 py-1 rounded-full text-xs font-medium">{n(apt.rooms)} غرفة</span>
                <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium">{n(apt.activeCount)} عامل</span>
                {apt.absent > 0 && (
                  <span className="bg-red-100 text-red-600 px-2.5 py-1 rounded-full text-xs font-bold">غياب {n(apt.absent)}</span>
                )}
              </div>
              {apt.notes && <p className="text-xs text-gray-400 mt-2">{apt.notes}</p>}
            </div>

            <div className="divide-y divide-gray-100">
              {apt.occupants.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">لا يوجد عمال في الشقة دي</p>
              ) : apt.occupants.map(w => {
                const inactive = w.status !== 'active';
                const st = STATUS_STYLE[statusOf(w.id)];
                return (
                  <div key={w.id} className={`px-5 py-2.5 flex items-center justify-between gap-3 ${inactive ? 'opacity-50' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 text-sm truncate">{w.name}</p>
                      <p className="text-xs text-gray-400">
                        {w.role}{inactive ? ' — غير نشط' : ''}
                        {(w.phone || '').trim() && (
                          <> — <a href={telHref(w.phone)} className="text-blue-600 hover:underline" dir="ltr">{w.phone}</a></>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!inactive && (
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                      )}
                      <button onClick={() => handleRemoveWorker(w)} title="إخراج من الشقة"
                        className="text-red-400 hover:bg-red-50 p-1 rounded transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <button onClick={() => openAssign(apt)}
                className="w-full bg-primary-50 hover:bg-primary-100 text-primary-700 border border-primary-200 px-4 py-2.5 rounded-lg text-sm font-medium transition">
                + إضافة عمال للشقة
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredApartments.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
          <p className="text-lg">{apartments.length === 0 ? 'لا توجد شقق مسجلة بعد' : 'مفيش نتائج مطابقة للبحث'}</p>
          {apartments.length === 0 && <p className="text-sm mt-1">اضغط "شقة جديدة" لإضافة أول شقة</p>}
        </div>
      )}

      {/* نافذة إضافة/تعديل شقة */}
      {formFor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setFormFor(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">{formFor === 'new' ? 'إضافة شقة جديدة' : 'تعديل الشقة'}</h3>
            <form onSubmit={handleSaveApartment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم العمارة</label>
                <input type="text" value={form.buildingName} required autoFocus
                  onChange={e => setForm({ ...form, buildingName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المنطقة</label>
                <input type="text" value={form.area} list="housing-areas"
                  onChange={e => setForm({ ...form, area: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
                <datalist id="housing-areas">{areas.map(a => <option key={a} value={a} />)}</datalist>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">رقم الشقة</label>
                  <input type="text" value={form.apartmentNumber} required
                    onChange={e => setForm({ ...form, apartmentNumber: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">عدد الغرف</label>
                  <input type="number" min="1" value={form.rooms} required
                    onChange={e => setForm({ ...form, rooms: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 no-spinner" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات (اختياري)</label>
                <input type="text" value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setFormFor(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">إلغاء</button>
                <button type="submit" disabled={saving}
                  className="px-6 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg transition font-medium">
                  {saving ? 'جارِ الحفظ...' : (formFor === 'new' ? 'إضافة' : 'حفظ')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسكين عمال */}
      {assignFor && assignApt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={closeAssign}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">إضافة عمال للشقة</h3>
              <p className="text-sm text-gray-500 mt-1">{aptLine(assignApt)}</p>
              <input type="text" placeholder="بحث باسم العامل أو الكود..." value={assignSearch} autoFocus
                onChange={e => setAssignSearch(e.target.value)}
                className="w-full mt-3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {candidates.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">مفيش عمال متاحين</p>
              ) : candidates.map(w => (
                <label key={w.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selectedIds.has(w.id)} onChange={() => toggleSelected(w.id)}
                    className="w-4 h-4 accent-primary-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{w.name} <span className="text-xs text-gray-400">{w.code}</span></p>
                    <p className="text-xs text-gray-400">{w.role}</p>
                  </div>
                  {w.currentApt && (
                    <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[10px] flex-shrink-0">
                      ساكن في: {w.currentApt}
                    </span>
                  )}
                </label>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={closeAssign} className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition">إلغاء</button>
              <button onClick={handleAssign} disabled={selectedIds.size === 0 || saving}
                className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium transition">
                {saving ? 'جارِ الحفظ...' : `إضافة ${n(selectedIds.size)} عامل للشقة`}
              </button>
            </div>
            <p className="px-5 pb-3 text-[11px] text-gray-400">العامل اللي ساكن في شقة تانية هيتنقل للشقة دي.</p>
          </div>
        </div>
      )}
    </div>
  );
}
