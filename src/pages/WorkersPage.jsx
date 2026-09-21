import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ROLES, NO_ROLE, PAYMENT_TYPES } from '../utils/constants';
import { COMPANY_LOGO_DATA_URI } from '../assets/companyLogo';
import QRCode from 'qrcode';

export default function WorkersPage() {
  const { workers, addWorkersBulk, updateWorker, deleteWorker, qrCodes, generateQRCode, deleteQRCode } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const [duplicateNames, setDuplicateNames] = useState([]);
  const [zeroWageNames, setZeroWageNames] = useState([]);
  const [previewQR, setPreviewQR] = useState(null);
  const [previewWorker, setPreviewWorker] = useState(null);
  const [qrImageUrl, setQrImageUrl] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const emptyWorker = { name: '', role: NO_ROLE, dailyWage: '', status: 'active', phone: '', notes: '', walletNumber: '', walletName: '' };
  const [forms, setForms] = useState([{ ...emptyWorker }]);
  const fileRef = useRef();

  useEffect(() => {
    if (previewQR) {
      QRCode.toDataURL(previewQR, { width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
        .then(url => setQrImageUrl(url))
        .catch(() => setQrImageUrl(null));
    } else {
      setQrImageUrl(null);
    }
  }, [previewQR]);

  const filtered = workers.filter(w => {
    if (filterRole && w.role !== filterRole) return false;
    if (search && !w.name.includes(search) && !w.code.includes(search)) return false;
    return true;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) {
      const f = forms[0];
      if (!f.name.trim()) return;
      // Daily wage is optional: a worker saved without one is treated as
      // "تحت الاختبار" (on trial) — they still track attendance normally,
      // just excluded from payroll/timesheet until a wage is set later.
      try {
        await updateWorker(editId, { ...f, name: f.name.trim(), dailyWage: f.dailyWage ? Number(f.dailyWage) : null });
      } catch (err) {
        alert('فشل حفظ التعديل: ' + (err.message || 'خطأ غير متوقع') + '\n\nالبيانات في الفورم لسه موجودة، جرب تاني.');
        return;
      }
      setEditId(null);
      setForms([{ ...emptyWorker }]);
      setShowAdd(false);
      return;
    }
    const valid = forms.filter(f => f.name.trim());
    if (valid.length === 0) return;
    const existingNames = new Set(workers.map(w => w.name));
    const duplicates = [];
    const toAdd = [];
    const noWageNames = [];
    valid.forEach(f => {
      const name = f.name.trim();
      if (existingNames.has(name) || toAdd.some(a => a.name === name)) {
        duplicates.push(name);
        return;
      }
      const dailyWage = f.dailyWage ? Number(f.dailyWage) : null;
      if (!dailyWage) noWageNames.push(name);
      toAdd.push({ ...f, name, dailyWage });
    });
    if (duplicates.length > 0) {
      alert('الأسماء المكررة تم تخطيها:\n' + duplicates.join(', '));
    }
    if (toAdd.length > 0) {
      // One bulk insert, not a loop of single addWorker() calls: addWorker
      // computes its next code from the same `workers` snapshot on every
      // call, so back-to-back calls in a loop would hand out the SAME code
      // to every row before the first insert ever came back to refresh that
      // snapshot - the DB then keeps only the first (or worse, silently
      // stores duplicate codes). addWorkersBulk assigns every code from one
      // synchronous counter before any network call, so this can't happen.
      try {
        await addWorkersBulk(toAdd);
        alert(`تم إضافة ${toAdd.length} عامل بنجاح` + (noWageNames.length > 0
          ? `\n\nملحوظة: العمال دول اتضافوا بدون أجر يومي وهيبقوا "تحت الاختبار" (مش هيظهروا في التايم شيت لحد ما تحط أجرهم):\n${noWageNames.join(', ')}`
          : ''));
      } catch (err) {
        alert('فشل حفظ العمال في قاعدة البيانات: ' + (err.message || 'خطأ غير متوقع'));
      }
    }
    setForms([{ ...emptyWorker }]);
    setShowAdd(false);
  };

  const updateForm = (index, field, value) => {
    setForms(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  };

  const addRow = () => {
    setForms(prev => [...prev, { ...emptyWorker }]);
  };

  const removeRow = (index) => {
    setForms(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  };

  const handleBulkImport = async () => {
    setBulkError('');
    setDuplicateNames([]);
    setZeroWageNames([]);
    setAddedCount(0);
    const lines = bulkText.split('\n').filter(l => l.trim());
    const rows = lines.map(line => {
      const parts = line.split(/[,\t]/);
      return {
        name: (parts[0] || '').trim(),
        role: (parts[1] || '').trim() || NO_ROLE,
        dailyWage: parseInt((parts[2] || '').trim()) || 0,
        phone: (parts[3] || '').trim(),
        status: 'active',
        notes: '',
      };
    }).filter(r => r.name);

    if (rows.length === 0) {
      setBulkError('لا توجد بيانات صالحه');
      return;
    }

    const existingNames = new Set(workers.map(w => w.name));
    const duplicates = rows.filter(r => existingNames.has(r.name)).map(r => r.name);
    setDuplicateNames(duplicates);
    const zeroWage = rows.filter(r => !existingNames.has(r.name) && !r.dailyWage).map(r => r.name);
    setZeroWageNames(zeroWage);

    const newRows = rows.filter(r => !existingNames.has(r.name));
    try {
      await addWorkersBulk(newRows);
      setAddedCount(newRows.length);
      setBulkText('');
    } catch (err) {
      setBulkError('فشل الحفظ في قاعدة البيانات: ' + (err.message || 'خطأ غير متوقع'));
    }
  };

  const handleExportCSV = () => {
    const header = 'الكود,الاسم,الوظيفة,الأجر اليومي,الحالة,الهاتف,ملاحظات';
    const rows = filtered.map(w =>
      `${w.code},${w.name},${w.role},${w.dailyWage},${w.status === 'active' ? 'نشط' : 'غير نشط'},${w.phone || ''},${w.notes || ''}`
    );
    const csv = '\uFEFF' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'قائمة_العمال.csv';
    a.click();
  };

  const handleGenerateQR = (worker) => {
    const existing = qrCodes.find(q => q.workerId === worker.id);
    if (existing) {
      setPreviewQR(existing.employeeId);
      setPreviewWorker(worker);
      return;
    }
    generateQRCode(worker.id);
    const qr = worker.code.replace('W', 'EMP');
    setPreviewQR(qr);
    setPreviewWorker(worker);
  };

  // Single shared template so a one-off card and a bulk sheet of many cards
  // always look identical - QR on the left, company mark + name + role +
  // employee code on the right, matching the original printed كارنيهات
  // design (see فرامن_النجارين.pdf) rather than the old stacked layout.
  const buildCardHtml = (worker, employeeId, dataUrl) => `
    <div class="card">
      <div class="qr-box"><img src="${dataUrl}" alt="QR" /></div>
      <div class="info-box">
        <img class="logo" src="${COMPANY_LOGO_DATA_URI}" alt="المناهري للمقاولات" />
        <div class="company">المناهري للمقاولات</div>
        <div class="name">${worker.name}</div>
        <div class="role-badge">${worker.role}</div>
        <div class="emp-id">${employeeId}</div>
      </div>
    </div>
  `;

  const CARD_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Tajawal', sans-serif; direction: rtl; }
    .card {
      direction: ltr;
      width: 90mm; height: 55mm;
      border: 2px solid #1d4ed8; border-radius: 4px;
      display: flex; overflow: hidden; background: #fff;
      page-break-inside: avoid; break-inside: avoid;
    }
    .qr-box {
      flex: 0 0 42%; background: #f8fafc;
      display: flex; align-items: center; justify-content: center;
      border-left: 1px solid #dbeafe; padding: 3mm;
    }
    .qr-box img { width: 100%; max-width: 32mm; height: auto; }
    .info-box {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 1.3mm; padding: 2mm; text-align: center;
    }
    .logo { width: 30px; height: 30px; object-fit: contain; }
    .company { font-size: 7.5px; font-weight: 700; color: #1d4ed8; }
    .name { font-size: 12.5px; font-weight: 800; color: #1e3a8a; }
    .role-badge { font-size: 8px; font-weight: 600; color: #1d4ed8; background: #dbeafe; padding: 0.8mm 3mm; border-radius: 999px; }
    .emp-id { font-size: 8px; color: #94a3b8; font-family: monospace; }
  `;

  const printCards = async (workersToPrint) => {
    if (workersToPrint.length === 0) return;
    try {
      const cardsHtml = await Promise.all(workersToPrint.map(async (worker) => {
        let qr = qrCodes.find(q => q.workerId === worker.id);
        if (!qr) {
          generateQRCode(worker.id);
          qr = { employeeId: worker.code.replace('W', 'EMP') };
        }
        const dataUrl = await QRCode.toDataURL(qr.employeeId, {
          width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' }
        });
        return buildCardHtml(worker, qr.employeeId, dataUrl);
      }));

      const printWindow = window.open('', '_blank');
      const isSingle = workersToPrint.length === 1;

      // 10 cards per printed page - 2 columns × 5 rows, exactly like the
      // original كارنيهات export. Chunking into one ".sheet" per 10 cards
      // (each forced onto its own page) is what guarantees a clean 10-per-
      // page count instead of letting the browser's own page-break logic
      // decide where rows split.
      const PER_PAGE = 10;
      const sheets = [];
      for (let i = 0; i < cardsHtml.length; i += PER_PAGE) {
        sheets.push(cardsHtml.slice(i, i + PER_PAGE));
      }
      const sheetsHtml = sheets.map((sheetCards, i) => `
        <div class="sheet"${i < sheets.length - 1 ? ' style="page-break-after: always;"' : ''}>
          ${sheetCards.join('')}
        </div>
      `).join('');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            ${CARD_STYLES}
            ${isSingle
              ? `@page { size: 90mm 55mm; margin: 0; } body { display: flex; }`
              : `@page { size: A4; margin: 8mm; }
                 .sheet {
                   display: grid; grid-template-columns: repeat(2, 1fr);
                   grid-auto-rows: 53mm; gap: 4mm; justify-items: center;
                 }
                 .sheet .card { width: 95mm; height: 53mm; }`
            }
          </style>
        </head>
        <body>
          ${isSingle ? cardsHtml[0] : sheetsHtml}
          <script>
            window.onload = function() { window.print(); ${isSingle ? 'window.close();' : ''} };
          <\/script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error('Print error:', err);
    }
  };

  const handlePrintCard = (worker) => printCards([worker]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds(prev => {
      const allSelected = filtered.length > 0 && filtered.every(w => prev.has(w.id));
      if (allSelected) return new Set();
      return new Set(filtered.map(w => w.id));
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">إدارة العمال</h2>
        <div className="flex gap-2">
          <button onClick={() => { setShowAdd(true); setEditId(null); setForms([{ ...emptyWorker }]); }}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            إضافة عمال
          </button>
          <button onClick={() => setShowBulk(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            استيراد جماعي
          </button>
          <button onClick={handleExportCSV}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            تصدير CSV
          </button>
          {selectedIds.size > 0 && (
            <button onClick={() => printCards(workers.filter(w => selectedIds.has(w.id)))}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              طباعة QR للمحدد ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="بحث بالاسم أو الكود..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right"
          />
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
            <option value="">كل الوظائف</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 text-center">
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every(w => selectedIds.has(w.id))}
                    onChange={toggleSelectAllFiltered}
                    className="w-4 h-4 rounded border-gray-300" />
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">الكود</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">الاسم</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">الوظيفة</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">الأجر اليومي</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">الحالة</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">الهاتف</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">رقم المحفظة</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(w => (
                <tr key={w.id} className="hover:bg-gray-50 transition">
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked={selectedIds.has(w.id)} onChange={() => toggleSelect(w.id)}
                      className="w-4 h-4 rounded border-gray-300" />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-primary-600">{w.code}</td>
                  <td className="px-4 py-3 font-medium">{w.name}</td>
                  <td className="px-4 py-3">
                    <span className="bg-primary-50 text-primary-700 px-2 py-1 rounded text-xs">{w.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    {Number(w.dailyWage) > 0 ? (
                      `${w.dailyWage.toLocaleString('ar-EG')} ج.م`
                    ) : (
                      <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-medium" title="بدون أجر يومي — مش هيظهر في التايم شيت">
                        تحت الاختبار
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${w.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {w.status === 'active' ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td className="px-4 py-3" dir="ltr">{w.phone || '-'}</td>
                  <td className="px-4 py-3 text-xs" dir="ltr">{w.walletNumber || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => handleGenerateQR(w)}
                        className="text-purple-600 hover:bg-purple-50 p-1.5 rounded transition" title="إنشاء QR">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                      </button>
                      <button onClick={() => handlePrintCard(w)}
                        className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded transition" title="طباعة كارت">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      </button>
                      <button onClick={() => { setEditId(w.id); setForms([{ ...w, dailyWage: w.dailyWage ?? '' }]); setShowAdd(true); }}
                        className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition" title="تعديل">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => { if (confirm(`هل تريد حذف ${w.name}؟`)) deleteWorker(w.id); }}
                        className="text-red-600 hover:bg-red-50 p-1.5 rounded transition" title="حذف">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-400">لا يوجد عمال مسجلين</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500 border-t">
          إجمالي: {filtered.length} عامل
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">{editId ? 'تعديل العامل' : 'إضافة عمال جدد'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {forms.map((f, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 relative">
                  {!editId && forms.length > 1 && (
                    <button type="button" onClick={() => removeRow(idx)}
                      className="absolute top-2 left-2 text-red-500 hover:bg-red-50 p-1 rounded transition" title="حذف العامل">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                  {!editId && forms.length > 1 && (
                    <span className="absolute top-2 right-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{idx + 1}</span>
                  )}
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">اسم العامل *</label>
                      <input type="text" value={f.name} onChange={e => updateForm(idx, 'name', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">الوظيفة</label>
                      <select value={f.role} onChange={e => updateForm(idx, 'role', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">الأجر اليومي (ج.م)</label>
                      <input type="number" min="0" value={f.dailyWage} onChange={e => updateForm(idx, 'dailyWage', parseInt(e.target.value) || '')}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 no-spinner" placeholder="اختياري" />
                      <p className="text-xs text-gray-400 mt-1">
                        {f.dailyWage ? 'حساب الإضافي والتايم شيت بيعتمدوا عليه' : 'سيبها فاضية للعامل تحت الاختبار — هيتسجل حضوره لكن مش هيظهر في التايم شيت لحد ما تحط أجره'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">الحالة</label>
                      <select value={f.status} onChange={e => updateForm(idx, 'status', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                        <option value="active">نشط</option>
                        <option value="inactive">غير نشط</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
                      <input type="text" value={f.phone} onChange={e => updateForm(idx, 'phone', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" dir="ltr" placeholder="+20..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">رقم المحفظة (انستاباي / محفظة)</label>
                      <input type="text" value={f.walletNumber} onChange={e => updateForm(idx, 'walletNumber', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" dir="ltr" placeholder="01..." />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">اسم المحفظة</label>
                      <input type="text" value={f.walletName} onChange={e => updateForm(idx, 'walletName', e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" placeholder="اسم صاحب الحساب" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                    <textarea value={f.notes} onChange={e => updateForm(idx, 'notes', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" rows={1} />
                  </div>
                </div>
              ))}
              {!editId && (
                <button type="button" onClick={addRow}
                  className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-500 hover:text-primary-600 transition flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  إضافة عامل آخر
                </button>
              )}
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">إلغاء</button>
                <button type="submit"
                  className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium">
                  {editId ? 'تحديث' : `حفظ ${forms.filter(f => f.name.trim()).length > 0 ? '(' + forms.filter(f => f.name.trim()).length + ')' : ''}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulk && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowBulk(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">استيراد جماعي للعمال</h3>
            <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700 mb-4">
              <p className="font-bold mb-1">الصيغة المطلوبة (سطر واحد لكل عامل):</p>
              <p>الاسم, الوظيفة, الأجر اليومي, رقم الهاتف</p>
              <p className="text-xs mt-1">مثال: أحمد محمد, حداد, 500, 01123456789</p>
              <p className="text-xs mt-1">الوظائف: مهندس, محاسب, فورمان شده, فورمان نجارين, فورمان حدادين, شده, حداد, نجار</p>
              <p className="text-xs mt-1">لو سبت الوظيفة فاضية هتتحط تلقائيًا في قسم "{NO_ROLE}"</p>
            </div>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right font-mono text-sm"
              rows={10}
              placeholder={'أحمد محمد, حداد, 500, 01123456789\nمحمد علي, نجار, 450, 01234567890\n...'}
            />
            {bulkError && <p className="text-red-600 text-sm mt-2">{bulkError}</p>}
            {addedCount > 0 && <p className="text-green-600 text-sm mt-2">تم إضافة {addedCount} عامل بنجاح</p>}
            {duplicateNames.length > 0 && (
              <div className="text-orange-600 text-sm mt-2">
                <p className="font-bold">الأسماء المكررة (لم تُضاف):</p>
                <p>{duplicateNames.join(', ')}</p>
              </div>
            )}
            {zeroWageNames.length > 0 && (
              <div className="text-red-600 text-sm mt-2 bg-red-50 border border-red-200 rounded-lg p-2">
                <p className="font-bold">تنبيه: العمال دول اتضافوا بأجر يومي = صفر، والإضافي هيتحسب صفر لحد ما تحط أجرهم من صفحة العمال:</p>
                <p>{zeroWageNames.join(', ')}</p>
              </div>
            )}
            <div className="flex gap-3 justify-end mt-4">
              <button type="button" onClick={() => { setShowBulk(false); setBulkError(''); setAddedCount(0); setDuplicateNames([]); setZeroWageNames([]); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">إلغاء</button>
              <button onClick={handleBulkImport}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium">استيراد</button>
            </div>
          </div>
        </div>
      )}

      {previewQR && previewWorker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setPreviewQR(null); setPreviewWorker(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-2">QR Code - {previewWorker.name}</h3>
            <p className="text-sm text-gray-500 mb-4">رقم العامل: {previewQR}</p>
            <div className="flex justify-center mb-4">
              {qrImageUrl ? (
                <img src={qrImageUrl} alt="QR Code" width={200} height={200} />
              ) : (
                <div className="w-[200px] h-[200px] bg-gray-100 rounded flex items-center justify-center text-gray-400">جاري التحميل...</div>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-4">يمكنك طباعة البطاقة من زر الطباعة في جدول العمال</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => { setPreviewQR(null); setPreviewWorker(null); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">إغلاق</button>
              <button onClick={() => { handlePrintCard(previewWorker); }}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-medium">طباعة الكارت</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
