import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { todayISO, PAYMENT_TYPES, STAGES, stageLabel } from '../utils/constants';

const STAGE_COLORS = {
  labsha: { bg: 'bg-amber-50', text: 'text-amber-700', bold: 'text-amber-800' },
  roof: { bg: 'bg-sky-50', text: 'text-sky-700', bold: 'text-sky-800' },
  columns: { bg: 'bg-purple-50', text: 'text-purple-700', bold: 'text-purple-800' },
};

function stageBreakdown(records) {
  const base = { labsha: 0, roof: 0, columns: 0 };
  records.forEach(r => {
    const stage = r.stage || 'columns';
    base[stage] = (base[stage] || 0) + (r.cost || 0);
  });
  return base;
}

export default function PillarsPage() {
  const {
    workers,
    pillars, addPillar, deletePillar,
    pillarBuildings, addBuilding, updateBuilding, deleteBuilding,
    plots, addPlot, deletePlot,
  } = useApp();

  const [activeTab, setActiveTab] = useState('plots');
  const [showAddPlot, setShowAddPlot] = useState(false);
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [showAddRecord, setShowAddRecord] = useState(false);

  const [filterPlot, setFilterPlot] = useState('');
  const [filterBuilding, setFilterBuilding] = useState('');
  const [filterStage, setFilterStage] = useState('');

  const [plotForm, setPlotForm] = useState({ name: '' });
  const [buildingForm, setBuildingForm] = useState({ name: '', plotId: '' });
  const [recordForm, setRecordForm] = useState({
    date: todayISO(), plotId: '', buildingId: '', stage: 'labsha', workerId: '', cost: '', supervisor: '', notes: '', paymentType: 'cash',
  });

  const activeWorkers = workers.filter(w => w.status === 'active');
  const supervisors = useMemo(() => {
    const supRoles = ['مهندس', 'فورمان شده', 'فورمان نجارين', 'فورمان حدادين'];
    return [...new Set(workers.filter(w => supRoles.includes(w.role)).map(w => w.name))];
  }, [workers]);

  // buildings available for the record form, filtered by chosen plot
  const recordFormBuildings = useMemo(() => {
    if (!recordForm.plotId) return pillarBuildings;
    return pillarBuildings.filter(b => b.plotId === recordForm.plotId);
  }, [pillarBuildings, recordForm.plotId]);

  const buildingStats = useMemo(() => {
    return pillarBuildings.map(b => {
      const bPillars = pillars.filter(p => p.buildingId === b.id);
      const uniqueWorkers = new Set(bPillars.map(p => p.workerId)).size;
      const uniqueDays = new Set(bPillars.map(p => p.date)).size;
      const totalCost = bPillars.reduce((s, p) => s + (p.cost || 0), 0);
      const plot = plots.find(pl => pl.id === b.plotId);
      return { ...b, workerCount: uniqueWorkers, dayCount: uniqueDays, totalCost, recordCount: bPillars.length, stageCosts: stageBreakdown(bPillars), plotName: plot?.name || '' };
    });
  }, [pillarBuildings, pillars, plots]);

  const plotStats = useMemo(() => {
    return plots.map(pl => {
      const plBuildings = pillarBuildings.filter(b => b.plotId === pl.id);
      const buildingIds = new Set(plBuildings.map(b => b.id));
      const plPillars = pillars.filter(p => buildingIds.has(p.buildingId));
      const uniqueWorkers = new Set(plPillars.map(p => p.workerId)).size;
      const totalCost = plPillars.reduce((s, p) => s + (p.cost || 0), 0);
      return { ...pl, buildingCount: plBuildings.length, workerCount: uniqueWorkers, totalCost, recordCount: plPillars.length, stageCosts: stageBreakdown(plPillars) };
    });
  }, [plots, pillarBuildings, pillars]);

  // buildings with no plot assigned, shown as "غير مصنفة"
  const unassignedBuildingsCost = useMemo(() => {
    const unassigned = pillarBuildings.filter(b => !b.plotId);
    const ids = new Set(unassigned.map(b => b.id));
    const recs = pillars.filter(p => ids.has(p.buildingId));
    return { count: unassigned.length, totalCost: recs.reduce((s, p) => s + (p.cost || 0), 0) };
  }, [pillarBuildings, pillars]);

  const filteredPillars = useMemo(() => {
    let data = [...pillars].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (filterBuilding) data = data.filter(p => p.buildingId === filterBuilding);
    else if (filterPlot) {
      const ids = new Set(pillarBuildings.filter(b => b.plotId === filterPlot).map(b => b.id));
      data = data.filter(p => ids.has(p.buildingId));
    }
    if (filterStage) data = data.filter(p => (p.stage || 'columns') === filterStage);
    return data;
  }, [pillars, filterPlot, filterBuilding, filterStage, pillarBuildings]);

  const handleAddPlot = (e) => {
    e.preventDefault();
    if (!plotForm.name.trim()) return;
    addPlot({ name: plotForm.name.trim() });
    setPlotForm({ name: '' });
    setShowAddPlot(false);
  };

  const handleAddBuilding = (e) => {
    e.preventDefault();
    if (!buildingForm.name.trim()) return;
    addBuilding({ name: buildingForm.name.trim(), plotId: buildingForm.plotId || '' });
    setBuildingForm({ name: '', plotId: '' });
    setShowAddBuilding(false);
  };

  const handleAddRecord = (e) => {
    e.preventDefault();
    if (!recordForm.workerId || !recordForm.buildingId) return;
    const { plotId, ...toSave } = recordForm; // plotId was only used to filter the building dropdown
    addPillar(toSave);
    setRecordForm({ date: todayISO(), plotId: '', buildingId: '', stage: 'labsha', workerId: '', cost: '', supervisor: '', notes: '', paymentType: 'cash' });
    setShowAddRecord(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-800">المناطق والمباني</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setShowAddPlot(true); setPlotForm({ name: '' }); }}
            className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            إضافة منطقة
          </button>
          <button onClick={() => { setShowAddBuilding(true); setBuildingForm({ name: '', plotId: filterPlot || '' }); }}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            إضافة مبنى
          </button>
          <button onClick={() => { setShowAddRecord(true); setRecordForm({ date: todayISO(), plotId: filterPlot || '', buildingId: '', stage: 'labsha', workerId: '', cost: '', supervisor: '', notes: '', paymentType: 'cash' }); }}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            تسجيل تكلفة عامل
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveTab('plots')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'plots' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
          المناطق ({plots.length})
        </button>
        <button onClick={() => setActiveTab('buildings')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'buildings' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
          المباني ({pillarBuildings.length})
        </button>
        <button onClick={() => setActiveTab('records')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'records' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
          السجلات ({pillars.length})
        </button>
      </div>

      {activeTab === 'plots' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plotStats.map(pl => (
            <div key={pl.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800 text-lg">{pl.name}</h3>
                <button onClick={() => { if (confirm('هل تريد حذف هذه المنطقة؟ المباني بداخلها هتفضل موجودة كـ "غير مصنفة".')) deletePlot(pl.id); }}
                  className="text-red-500 hover:bg-red-50 p-1.5 rounded transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              <div className="flex gap-3 text-sm text-gray-500 mb-3">
                <span>{pl.buildingCount} مبنى</span>
                <span>·</span>
                <span>{pl.workerCount} عامل</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                {STAGES.map(s => (
                  <div key={s.value} className={`${STAGE_COLORS[s.value].bg} rounded p-2 text-center`}>
                    <p className={`text-xs ${STAGE_COLORS[s.value].text}`}>{s.label}</p>
                    <p className={`font-bold ${STAGE_COLORS[s.value].bold} text-xs sm:text-sm`}>{pl.stageCosts[s.value].toLocaleString('ar-EG')}</p>
                  </div>
                ))}
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">إجمالي تكلفة المنطقة</p>
                <p className="font-bold text-gray-800 text-lg">{pl.totalCost.toLocaleString('ar-EG')} ج.م</p>
              </div>
            </div>
          ))}
          {plotStats.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-400">لا توجد مناطق مسجلة. ابدأ بإضافة منطقة (بلوك).</div>
          )}
          {unassignedBuildingsCost.count > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-dashed border-gray-300 p-5">
              <h3 className="font-bold text-gray-600 mb-2">مباني غير مصنفة</h3>
              <p className="text-sm text-gray-500 mb-2">{unassignedBuildingsCost.count} مبنى بدون منطقة محددة</p>
              <p className="font-bold text-gray-700">{unassignedBuildingsCost.totalCost.toLocaleString('ar-EG')} ج.م</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'buildings' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {buildingStats.map(b => (
            <div key={b.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-gray-800 text-lg">{b.name}</h3>
                <button onClick={() => { if (confirm('هل تريد حذف هذا المبنى؟')) deleteBuilding(b.id); }}
                  className="text-red-500 hover:bg-red-50 p-1.5 rounded transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-3">{b.plotName || 'بدون منطقة'}</p>
              <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                {STAGES.map(s => (
                  <div key={s.value} className={`${STAGE_COLORS[s.value].bg} rounded p-2 text-center`}>
                    <p className={`text-xs ${STAGE_COLORS[s.value].text}`}>{s.label}</p>
                    <p className={`font-bold ${STAGE_COLORS[s.value].bold} text-xs sm:text-sm`}>{b.stageCosts[s.value].toLocaleString('ar-EG')}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-blue-50 rounded p-2 text-center">
                  <p className="text-xs text-blue-600">العمال</p>
                  <p className="font-bold text-blue-800">{b.workerCount}</p>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-xs text-gray-500">إجمالي التكلفة</p>
                  <p className="font-bold text-gray-800">{b.totalCost.toLocaleString('ar-EG')} ج.م</p>
                </div>
              </div>
            </div>
          ))}
          {buildingStats.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-400">لا توجد مباني مسجلة</div>
          )}
        </div>
      )}

      {activeTab === 'records' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3">
            <select value={filterPlot} onChange={e => { setFilterPlot(e.target.value); setFilterBuilding(''); }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
              <option value="">كل المناطق</option>
              {plots.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </select>
            <select value={filterBuilding} onChange={e => setFilterBuilding(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
              <option value="">كل المباني</option>
              {(filterPlot ? pillarBuildings.filter(b => b.plotId === filterPlot) : pillarBuildings).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
              <option value="">كل المراحل</option>
              {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">التاريخ</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">المبنى</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">المرحلة</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">العامل</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">المشرف</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">الكلفة</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">ملاحظات</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPillars.map(p => {
                    const w = workers.find(wk => wk.id === p.workerId);
                    const b = pillarBuildings.find(bd => bd.id === p.buildingId);
                    const stage = p.stage || 'columns';
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 whitespace-nowrap">{new Date(p.date).toLocaleDateString('ar-EG')}</td>
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{b?.name || 'محذوف'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STAGE_COLORS[stage].bg} ${STAGE_COLORS[stage].text}`}>{stageLabel(stage)}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{w?.name || 'محذوف'}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.supervisor || '-'}</td>
                        <td className="px-4 py-3 font-bold text-orange-600 whitespace-nowrap">{(p.cost || 0).toLocaleString('ar-EG')} ج.م</td>
                        <td className="px-4 py-3 text-gray-500">{p.notes || '-'}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => { if (confirm('هل تريد حذف هذا السجل؟')) deletePillar(p.id); }}
                            className="text-red-500 hover:bg-red-50 p-1.5 rounded transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPillars.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا توجد سجلات</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showAddPlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddPlot(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">إضافة منطقة جديدة</h3>
            <form onSubmit={handleAddPlot} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم المنطقة (البلوك)</label>
                <input type="text" value={plotForm.name} onChange={e => setPlotForm({ name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" required autoFocus />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAddPlot(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">إلغاء</button>
                <button type="submit" className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium">إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddBuilding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddBuilding(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">إضافة مبنى جديد</h3>
            <form onSubmit={handleAddBuilding} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم المبنى</label>
                <input type="text" value={buildingForm.name} onChange={e => setBuildingForm({ ...buildingForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المنطقة (البلوك)</label>
                <select value={buildingForm.plotId} onChange={e => setBuildingForm({ ...buildingForm, plotId: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  <option value="">بدون منطقة</option>
                  {plots.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAddBuilding(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">إلغاء</button>
                <button type="submit" className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium">إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddRecord(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">تسجيل تكلفة عامل</h3>
            <form onSubmit={handleAddRecord} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
                  <input type="date" value={recordForm.date} onChange={e => setRecordForm({ ...recordForm, date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">المرحلة</label>
                  <select value={recordForm.stage} onChange={e => setRecordForm({ ...recordForm, stage: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">المنطقة</label>
                  <select value={recordForm.plotId} onChange={e => setRecordForm({ ...recordForm, plotId: e.target.value, buildingId: '' })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    <option value="">كل المناطق</option>
                    {plots.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">المبنى</label>
                  <select value={recordForm.buildingId} onChange={e => setRecordForm({ ...recordForm, buildingId: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" required>
                    <option value="">اختر المبنى</option>
                    {recordFormBuildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">العامل</label>
                <select value={recordForm.workerId} onChange={e => setRecordForm({ ...recordForm, workerId: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" required>
                  <option value="">اختر العامل</option>
                  {activeWorkers.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code} - {w.role})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">المشرف (الفورمان)</label>
                  <select value={recordForm.supervisor} onChange={e => setRecordForm({ ...recordForm, supervisor: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    <option value="">اختر المشرف</option>
                    {supervisors.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تكلفة العامل (ج.م)</label>
                  <input type="number" value={recordForm.cost} onChange={e => setRecordForm({ ...recordForm, cost: parseFloat(e.target.value) || '' })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 no-spinner" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">نوع الصرف</label>
                  <select value={recordForm.paymentType} onChange={e => setRecordForm({ ...recordForm, paymentType: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    {PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                  <input type="text" value={recordForm.notes} onChange={e => setRecordForm({ ...recordForm, notes: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAddRecord(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">إلغاء</button>
                <button type="submit" className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium">إضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
