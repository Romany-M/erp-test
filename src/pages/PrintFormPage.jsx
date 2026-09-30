import React, { useState, useEffect } from 'react';
import { printCustomSheet } from '../utils/pdfDocs';

const STORAGE_KEY = 'printSheetTemplate';

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function PrintFormPage() {
  const saved = loadSaved();
  const [title, setTitle] = useState(saved?.title ?? '');
  const [columns, setColumns] = useState(saved?.columns?.length ? saved.columns : ['الاسم', 'التوقيع']);
  const [showSerial, setShowSerial] = useState(saved?.showSerial ?? true);
  const [rowCount, setRowCount] = useState(saved?.rowCount ?? 25);

  // بيحفظ الشكل (العنوان والخانات وإظهار المسلسل) تلقائي في المتصفح، عشان
  // يفضل ثابت زي ما طلبت من غير ما تعيد كتابته كل مرة. عدد الصفوف بس
  // بيتغيّر كل طبعة على حسب احتياجك.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ title, columns, showSerial }));
  }, [title, columns, showSerial]);

  const updateColumn = (i, value) => setColumns(cols => cols.map((c, idx) => (idx === i ? value : c)));
  const addColumn = () => setColumns(cols => [...cols, '']);
  const removeColumn = (i) => setColumns(cols => cols.filter((_, idx) => idx !== i));
  const moveColumn = (i, dir) => setColumns(cols => {
    const next = [...cols];
    const j = i + dir;
    if (j < 0 || j >= next.length) return cols;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const validColumns = columns.filter(c => c.trim());

  const handlePrint = () => {
    if (validColumns.length === 0) { alert('لازم تضيف خانة واحدة على الأقل قبل الطباعة.'); return; }
    printCustomSheet({ title, columns: validColumns, showSerial, rowCount: Number(rowCount) || 0 });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">طباعة</h2>
        <p className="text-sm text-gray-400 mt-0.5">ورقة بشكل الشركة الثابت - إنت اللي بتحدد الخانات والمسلسل والعدد وتطبعها براحتك</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">عنوان الورقة (اختياري)</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: كشف تسليم عهدة"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">الخانات (أعمدة الجدول)</label>
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={showSerial} onChange={e => setShowSerial(e.target.checked)} />
              عمود "م" (المسلسل)
            </label>
          </div>
          <div className="space-y-2">
            {columns.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-300 w-5 text-center">{i + 1}</span>
                <input type="text" value={c} onChange={e => updateColumn(i, e.target.value)} placeholder="اسم الخانة"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 text-right" />
                <button onClick={() => moveColumn(i, -1)} disabled={i === 0} title="حرّك لفوق"
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-20 p-1">▲</button>
                <button onClick={() => moveColumn(i, 1)} disabled={i === columns.length - 1} title="حرّك لتحت"
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-20 p-1">▼</button>
                <button onClick={() => removeColumn(i)} title="احذف الخانة" className="text-red-400 hover:text-red-600 p-1">×</button>
              </div>
            ))}
          </div>
          <button onClick={addColumn} className="mt-3 text-sm text-primary-700 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            إضافة خانة
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">عدد الصفوف</label>
          <input type="number" min="1" max="200" value={rowCount} onChange={e => setRowCount(e.target.value)}
            className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
        </div>

        <div className="pt-2 border-t border-gray-100 flex justify-end">
          <button onClick={handlePrint}
            className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            طباعة
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        الشكل (اسم الشركة، اللوجو، تصميم الجدول) ثابت ومتطابق مع باقي أوراق الطباعة في النظام. الخانات والعنوان بيتحفظوا تلقائي عشان تفضل جاهزة المرة الجاية.
      </p>
    </div>
  );
}
