import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ROLES } from '../utils/constants';

// صفحة المقاولين = قايمة بس. كل مقاول له صفحة حساب مستقلة (ContractorDetailPage)
// فيها مبالغه هو وبس. مفيش هنا أي إجمالي بيجمع أكتر من مقاول على بعض.
export default function ContractorsPage() {
  const { contractors, contractorPayments, addContractor } = useApp();
  const navigate = useNavigate();

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('شده');
  const [search, setSearch] = useState('');

  const filteredContractors = useMemo(() => {
    let list = [...contractors].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (search) {
      list = list.filter(c => c.name.includes(search) || c.role.includes(search));
    }
    return list;
  }, [contractors, search]);

  const statsFor = (contractorId) => {
    const mine = contractorPayments.filter(p => p.contractorId === contractorId);
    const outstanding = mine.filter(p => !p.paid).reduce((s, p) => s + (p.amount || 0), 0);
    const total = mine.reduce((s, p) => s + (p.amount || 0), 0);
    return { outstanding, total, count: mine.length };
  };

  const handleAddContractor = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const created = await addContractor({ name: name.trim(), role });
      setName('');
      setRole('شده');
      setShowAdd(false);
      if (created?.id) navigate(`/contractors/${created.id}`);
    } catch (err) {
      alert('تعذر إضافة المقاول: ' + (err?.message || 'خطأ غير معروف'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">مقاولين</h2>
          <p className="text-xs text-gray-400 mt-1">لكل مقاول صفحة وحساب مستقل — اضغط على المقاول لفتح حسابه</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          مقاول جديد
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <input type="text" placeholder="بحث باسم المقاول أو القسم..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredContractors.map(c => {
          const { outstanding, total, count } = statsFor(c.id);
          const allPaid = total > 0 && outstanding === 0;
          return (
            <button key={c.id} onClick={() => navigate(`/contractors/${c.id}`)}
              className="text-right bg-white rounded-xl shadow-sm border border-gray-100 hover:border-primary-300 hover:shadow-md transition p-5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-gray-800 text-lg">{c.name}</h3>
                <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded text-xs">{c.role}</span>
                {allPaid && (
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">تم الصرف</span>
                )}
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-500">المستحق حالياً</p>
                  <p className={`text-xl font-bold ${outstanding > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {outstanding.toLocaleString('ar-EG')} ج.م
                  </p>
                </div>
                <p className="text-xs text-gray-400">{count.toLocaleString('ar-EG')} مبلغ مسجل</p>
              </div>
              <p className="text-xs text-primary-600 font-medium mt-4">فتح الحساب ←</p>
            </button>
          );
        })}
      </div>

      {filteredContractors.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
          <p className="text-lg">لا يوجد مقاولون بعد</p>
          <p className="text-sm mt-1">اضغط "مقاول جديد" لإضافة أول مقاول</p>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">إضافة مقاول جديد</h3>
            <form onSubmit={handleAddContractor} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم المقاول</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">القسم</label>
                <select value={role} onChange={e => setRole(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
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
