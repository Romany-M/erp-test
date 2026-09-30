import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';

// مكوّن صغير قابل لإعادة الاستخدام: شريط "عمال المكان ده" - شيبس بزر حذف،
// وخانة بحث تضيف عامل بضغطة واحدة. مفيش خطوة تانية ولا صفحة تانية.
function LocationWorkers({ locationId, workers, onRemove, onAdd }) {
  const [query, setQuery] = useState('');
  const assigned = workers.filter(w => w.locationId === locationId);
  const results = query.trim()
    ? workers.filter(w => w.status === 'active' && w.locationId !== locationId && w.name.includes(query.trim())).slice(0, 6)
    : [];

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {assigned.map(w => (
          <span key={w.id} className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-xs px-2 py-1 rounded-full">
            {w.name}
            <button onClick={() => onRemove(w.id)} title="شيل العامل من هنا" className="text-teal-400 hover:text-red-500">×</button>
          </span>
        ))}
        {assigned.length === 0 && <span className="text-xs text-gray-300">مفيش عمال هنا دلوقتي</span>}
      </div>
      <div className="relative">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="+ اكتب اسم عامل يتضاف..."
          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-500" />
        {results.length > 0 && (
          <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
            {results.map(w => (
              <button key={w.id} onClick={() => { onAdd(w.id); setQuery(''); }}
                className="block w-full text-right px-3 py-1.5 text-xs hover:bg-gray-50 border-b border-gray-50 last:border-0">
                {w.name} <span className="text-gray-400">({w.role})</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkLocationsPage() {
  const { workers, attendance, workLocations, addWorkLocation, updateWorkLocation, deleteWorkLocation, assignWorkersToLocation } = useApp();

  const [showAddArea, setShowAddArea] = useState(false);
  const [areaForm, setAreaForm] = useState({ name: '', buildingName: '' });
  const [addBuildingFor, setAddBuildingFor] = useState(null); // area id اللي بنضيفله مبنى دلوقتي
  const [buildingName, setBuildingName] = useState('');
  const [renaming, setRenaming] = useState(null); // { id, name }

  const areas = useMemo(() => workLocations.filter(l => !l.parentId).sort((a, b) => a.name.localeCompare(b.name, 'ar')), [workLocations]);
  const buildingsOf = (areaId) => workLocations.filter(l => l.parentId === areaId).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const countAt = (locationId) => workers.filter(w => w.locationId === locationId).length;

  // تكلفة مكان واحد بس (مش شامل الأبناء): من سجلات الحضور اللي اتختمت
  // بالمكان ده وقت تسجيلها. نفس معادلة حساب المرتب بالظبط (يومية + أوفرتايم
  // - خصم) عشان الرقم يطابق القبض، مش رقم منفصل تاني.
  const ownCost = (locationId) => {
    const recs = attendance.filter(a => a.locationId === locationId);
    const present = recs.filter(a => a.status === 'present' && !(a.pillarCost > 0));
    const daysPay = present.reduce((s, a) => {
      const w = workers.find(x => x.id === a.workerId);
      return s + (w?.dailyWage || 0);
    }, 0);
    const overtime = recs.reduce((s, a) => s + (a.overtimeValue || 0), 0);
    const deductions = recs.reduce((s, a) => s + (a.deduction || 0), 0);
    return { days: present.length, total: daysPay + overtime - deductions };
  };

  // تكلفة المنطقة = تكلفة عمالها المباشرين + تكلفة كل مبانيها.
  const areaCost = (areaId) => {
    const own = ownCost(areaId);
    return buildingsOf(areaId).reduce((acc, b) => {
      const bc = ownCost(b.id);
      return { days: acc.days + bc.days, total: acc.total + bc.total };
    }, own);
  };

  const fmtMoney = (n) => `${n.toLocaleString('ar-EG')} ج.م`;

  // بنـalert بأي خطأ بدل ما نسيبه يفشل بصمت - لو حصل مشكلة (زي إن سكريبت
  // supabase-work-locations.sql لسه ما اتشغّلش) تشوفها على طول بدل ما
  // تفضل مش فاهم ليه العامل ما اتضافش أو التكلفة ما ظهرتش.
  const handleAssign = async (locationId, workerId) => {
    try { await assignWorkersToLocation(locationId, [workerId]); }
    catch (err) { alert('فشل تعيين العامل: ' + (err.message || 'خطأ غير متوقع') + '\n\nتأكد إنك شغّلت سكريبت supabase-work-locations.sql على قاعدة البيانات.'); }
  };
  const handleUnassign = async (workerId) => {
    try { await assignWorkersToLocation(null, [workerId]); }
    catch (err) { alert('فشل شيل العامل: ' + (err.message || 'خطأ غير متوقع')); }
  };

  // إضافة منطقة (وأول مبنى فيها لو اتكتب) في نفس الخطوة - من غير ما نسيب الشاشة.
  const handleAddArea = async (e) => {
    e.preventDefault();
    const name = areaForm.name.trim();
    if (!name) return;
    const area = await addWorkLocation({ name, parentId: null });
    if (areaForm.buildingName.trim() && area) {
      await addWorkLocation({ name: areaForm.buildingName.trim(), parentId: area.id });
    }
    setAreaForm({ name: '', buildingName: '' });
    setShowAddArea(false);
  };

  const handleAddBuilding = async (e, areaId) => {
    e.preventDefault();
    if (!buildingName.trim()) return;
    await addWorkLocation({ name: buildingName.trim(), parentId: areaId });
    setBuildingName('');
    setAddBuildingFor(null);
  };

  const handleDeleteArea = (area) => {
    const kids = buildingsOf(area.id);
    const msg = kids.length > 0
      ? `هل تريد حذف "${area.name}"؟ المباني اللي جواها (${kids.length}) هتتحذف معاها، والعمال اللي فيها هيبقوا بدون تحديد.`
      : `هل تريد حذف "${area.name}"؟ العمال اللي فيها هيبقوا بدون تحديد.`;
    if (confirm(msg)) deleteWorkLocation(area.id);
  };

  const handleDeleteBuilding = (b) => {
    if (confirm(`هل تريد حذف "${b.name}"؟ العمال اللي فيه هيبقوا بدون تحديد.`)) deleteWorkLocation(b.id);
  };

  const saveRename = async () => {
    if (!renaming || !renaming.name.trim()) { setRenaming(null); return; }
    await updateWorkLocation(renaming.id, { name: renaming.name.trim() });
    setRenaming(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">أماكن العمل</h2>
          <p className="text-sm text-gray-400 mt-0.5">منطقة، مبانيها، وعمالها - كله في نفس الشاشة</p>
        </div>
        <button onClick={() => { setAreaForm({ name: '', buildingName: '' }); setShowAddArea(true); }}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          إضافة منطقة
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {areas.map(area => (
          <div key={area.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-1">
              {renaming?.id === area.id ? (
                <input autoFocus value={renaming.name} onChange={e => setRenaming({ id: area.id, name: e.target.value })}
                  onBlur={saveRename} onKeyDown={e => e.key === 'Enter' && saveRename()}
                  className="font-bold text-gray-800 text-lg border-b border-primary-400 focus:outline-none" />
              ) : (
                <h3 className="font-bold text-gray-800 text-lg cursor-text" onClick={() => setRenaming({ id: area.id, name: area.name })}>
                  {area.name}
                </h3>
              )}
              <button onClick={() => handleDeleteArea(area)} className="text-red-500 hover:bg-red-50 p-1.5 rounded transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">{countAt(area.id)} عامل بدون مبنى محدد جوه المنطقة</p>
            <LocationWorkers locationId={area.id} workers={workers}
              onAdd={(wid) => handleAssign(area.id, wid)} onRemove={handleUnassign} />

            <p className="text-[11px] text-gray-300 mt-3 mb-1">من الحضور الفعلي، شامل النهاردة تلقائي</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-blue-50 rounded p-2 text-center">
                <p className="text-xs text-blue-600">أيام عمل محسوبة</p>
                <p className="font-bold text-blue-800">{areaCost(area.id).days}</p>
              </div>
              <div className="bg-gray-50 rounded p-2 text-center">
                <p className="text-xs text-gray-500">إجمالي تكلفة المنطقة</p>
                <p className="font-bold text-gray-800">{fmtMoney(areaCost(area.id).total)}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              {buildingsOf(area.id).map(b => (
                <div key={b.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    {renaming?.id === b.id ? (
                      <input autoFocus value={renaming.name} onChange={e => setRenaming({ id: b.id, name: e.target.value })}
                        onBlur={saveRename} onKeyDown={e => e.key === 'Enter' && saveRename()}
                        className="font-medium text-gray-700 text-sm border-b border-primary-400 focus:outline-none" />
                    ) : (
                      <h4 className="font-medium text-gray-700 text-sm cursor-text" onClick={() => setRenaming({ id: b.id, name: b.name })}>
                        {b.name} <span className="text-gray-400 font-normal">({countAt(b.id)})</span>
                      </h4>
                    )}
                    <button onClick={() => handleDeleteBuilding(b)} className="text-red-400 hover:bg-red-50 p-1 rounded transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                  <LocationWorkers locationId={b.id} workers={workers}
                    onAdd={(wid) => handleAssign(b.id, wid)} onRemove={handleUnassign} />
                  <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                    <div className="bg-blue-50 rounded p-1.5 text-center">
                      <p className="text-blue-600">أيام محسوبة</p>
                      <p className="font-bold text-blue-800">{ownCost(b.id).days}</p>
                    </div>
                    <div className="bg-white rounded p-1.5 text-center border border-gray-100">
                      <p className="text-gray-500">التكلفة</p>
                      <p className="font-bold text-gray-800">{fmtMoney(ownCost(b.id).total)}</p>
                    </div>
                  </div>
                </div>
              ))}

              {addBuildingFor === area.id ? (
                <form onSubmit={(e) => handleAddBuilding(e, area.id)} className="flex gap-2">
                  <input autoFocus value={buildingName} onChange={e => setBuildingName(e.target.value)} placeholder="اسم المبنى"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
                  <button type="submit" className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">إضافة</button>
                  <button type="button" onClick={() => { setAddBuildingFor(null); setBuildingName(''); }}
                    className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">إلغاء</button>
                </form>
              ) : (
                <button onClick={() => { setAddBuildingFor(area.id); setBuildingName(''); }}
                  className="text-sm text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  إضافة مبنى في {area.name}
                </button>
              )}
            </div>
          </div>
        ))}

        {areas.length === 0 && (
          <div className="col-span-full text-center py-10 text-gray-400">لا توجد أماكن عمل مسجلة. ابدأ بإضافة منطقة.</div>
        )}
      </div>

      {showAddArea && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddArea(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">إضافة منطقة جديدة</h3>
            <form onSubmit={handleAddArea} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم المنطقة</label>
                <input type="text" value={areaForm.name} onChange={e => setAreaForm({ ...areaForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">أول مبنى فيها (اختياري)</label>
                <input type="text" value={areaForm.buildingName} onChange={e => setAreaForm({ ...areaForm, buildingName: e.target.value })}
                  placeholder="ممكن تسيبها فاضية وتضيف مباني بعدين"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
              </div>
              <p className="text-xs text-gray-400">
                بعد الإضافة تقدر تختار العمال على طول من نفس الكارت - العمال بيتغيروا يوميًا، فمفيش داعي تتنقل بين شاشات.
              </p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAddArea(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">إلغاء</button>
                <button type="submit" className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium">إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
