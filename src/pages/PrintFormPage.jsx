import React, { useState, useEffect } from 'react';
import { printCustomSheet, printMemo, printPresetReceipt, PRESET_TYPES } from '../utils/pdfDocs';
import { useApp } from '../context/AppContext';
import { todayISO } from '../utils/constants';

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

function BlankSheetTab() {
  const saved = loadSaved();
  const [title, setTitle] = useState(saved?.title ?? '');
  const [columns, setColumns] = useState(saved?.columns?.length ? saved.columns : ['الاسم', 'التوقيع']);
  const [showSerial, setShowSerial] = useState(saved?.showSerial ?? true);
  const [rowCount, setRowCount] = useState(saved?.rowCount ?? 25);
  const [showAccountantStamp, setShowAccountantStamp] = useState(false);
  const [showCompanyStamp, setShowCompanyStamp] = useState(false);
  const [showSignature, setShowSignature] = useState(false);

  // بيحفظ الشكل (العنوان والخانات وإظهار المسلسل) تلقائي في المتصفح، عشان
  // يفضل ثابت زي ما طلبت من غير ما تعيد كتابته كل مرة. عدد الصفوف والختم
  // والتوقيع بس بيتغيروا كل طبعة على حسب احتياجك، مش بيتحفظوا.
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
    printCustomSheet({ title, columns: validColumns, showSerial, rowCount: Number(rowCount) || 0, showAccountantStamp, showCompanyStamp, showSignature });
  };

  return (
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
        <p className="text-xs text-gray-400 mt-2">خانة اسمها فيه "اسم" (زي "الاسم") بتاخد عرض أوسع تلقائي في الطباعة، عشان الأسماء الثلاثية.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">عدد الصفوف</label>
        <input type="number" min="1" max="200" value={rowCount} onChange={e => setRowCount(e.target.value)}
          className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right" />
      </div>

      <SignStampControls
        showAccountantStamp={showAccountantStamp} setShowAccountantStamp={setShowAccountantStamp}
        showCompanyStamp={showCompanyStamp} setShowCompanyStamp={setShowCompanyStamp}
        showSignature={showSignature} setShowSignature={setShowSignature} />

      <div className="pt-2 border-t border-gray-100 flex justify-end">
        <PrintButton onClick={handlePrint} />
      </div>
    </div>
  );
}

// محدد الختم والتوقيع - اختياريين تمامًا، كل واحد فيهم مستقل، تقدر تضيف
// ختم المحاسب وختم الشركة مع بعض في نفس الورقة. بتختارهم كل مرة تطبع فيها،
// مش بيتحفظوا زي باقي شكل الورقة.
function SignStampControls({ showAccountantStamp, setShowAccountantStamp, showCompanyStamp, setShowCompanyStamp, showSignature, setShowSignature }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">الختم والتوقيع (اختياري)</label>
      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showAccountantStamp} onChange={e => setShowAccountantStamp(e.target.checked)} />
          ختم المحاسب
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showCompanyStamp} onChange={e => setShowCompanyStamp(e.target.checked)} />
          ختم الشركة
        </label>
        <span className="text-gray-300">|</span>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showSignature} onChange={e => setShowSignature(e.target.checked)} />
          إضافة التوقيع
        </label>
      </div>
      <p className="text-xs text-gray-400 mt-1">تقدر تضيف الختمين مع بعض لو حبيت. مش بيتحفظوا زي باقي الشكل - إنت اللي تختار كل مرة تطبع فيها.</p>
    </div>
  );
}

function PrintButton({ onClick }) {
  return (
    <button onClick={onClick}
      className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition flex items-center gap-2">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
      طباعة
    </button>
  );
}

// تبويب "مذكرات": كلام حر بتكتبه وتحفظه وترجعله تطبعه وقت ما تحب - مش جدول
// صفوف فاضية. كل المذكرات متحفوظة على السيرفر، تقدر ترجعلها من أي جهاز.
function MemosTab() {
  const { printMemos, addPrintMemo, updatePrintMemo, deletePrintMemo } = useApp();
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [showAccountantStamp, setShowAccountantStamp] = useState(false);
  const [showCompanyStamp, setShowCompanyStamp] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [saving, setSaving] = useState(false);

  const sorted = [...printMemos].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const active = sorted.find(m => m.id === activeId) || null;

  const openMemo = (m) => { setActiveId(m.id); setDraft({ title: m.title, content: m.content }); };
  const newMemo = () => { setActiveId('new'); setDraft({ title: '', content: '' }); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeId === 'new') {
        const created = await addPrintMemo(draft);
        if (created) setActiveId(created.id);
      } else if (activeId) {
        await updatePrintMemo(activeId, draft);
      }
    } catch (err) {
      alert('فشل حفظ المذكرة: ' + (err.message || 'خطأ غير متوقع') + '\n\nتأكد إنك شغّلت سكريبت supabase-print-memos.sql.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m) => {
    if (!confirm(`هل تريد حذف مذكرة "${m.title || 'بدون عنوان'}"؟`)) return;
    await deletePrintMemo(m.id);
    if (activeId === m.id) { setActiveId(null); setDraft({ title: '', content: '' }); }
  };

  const handlePrint = () => {
    if (!draft.content.trim() && !draft.title.trim()) { alert('المذكرة فاضية.'); return; }
    printMemo({ title: draft.title, content: draft.content, showAccountantStamp, showCompanyStamp, showSignature });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-2">
        <button onClick={newMemo} className="w-full bg-primary-600 hover:bg-primary-700 text-white py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          مذكرة جديدة
        </button>
        <div className="space-y-1 max-h-[28rem] overflow-y-auto pt-2">
          {sorted.length === 0 && <p className="text-xs text-gray-300 text-center py-6">مفيش مذكرات محفوظة لسه</p>}
          {sorted.map(m => (
            <div key={m.id} onClick={() => openMemo(m)}
              className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition ${activeId === m.id ? 'bg-primary-50 text-primary-800' : 'hover:bg-gray-50 text-gray-600'}`}>
              <span className="truncate">{m.title?.trim() || 'بدون عنوان'}</span>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(m); }}
                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">×</button>
            </div>
          ))}
        </div>
      </div>

      <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        {activeId ? (
          <>
            <input type="text" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              placeholder="عنوان المذكرة"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right font-medium" />
            <textarea value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
              placeholder="اكتب المذكرة هنا..." rows={12}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-right leading-loose resize-y" />
            <SignStampControls
              showAccountantStamp={showAccountantStamp} setShowAccountantStamp={setShowAccountantStamp}
              showCompanyStamp={showCompanyStamp} setShowCompanyStamp={setShowCompanyStamp}
              showSignature={showSignature} setShowSignature={setShowSignature} />
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition font-medium disabled:opacity-50">
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <PrintButton onClick={handlePrint} />
            </div>
          </>
        ) : (
          <div className="text-center text-gray-300 py-16">اختر مذكرة من القائمة أو ابدأ "مذكرة جديدة"</div>
        )}
      </div>
    </div>
  );
}

// تبويب "قوالب جاهزة": نفس تصميم الإيصالات اللي بعتها (نقدية / صرف مقاول /
// استلام عهدة). تقدر تملا البيانات من هنا فتطبع جاهزة، أو تسيب أي خانة
// فاضية تملاها بالخط بعدين - الاختيار ليك.
const PRESETS = [
  { type: 'cash', label: 'إيصال نقدية', color: '#003670' },
  { type: 'contractor', label: 'صرف نقدية مقاول', color: '#15803d' },
  { type: 'custody', label: 'إيصال استلام عهدة', color: '#b91c1c' },
];

function PresetsTab() {
  const [selected, setSelected] = useState('cash');
  const [receiptNo, setReceiptNo] = useState('');
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState({});
  const [showAccountantStamp, setShowAccountantStamp] = useState(false);
  const [showCompanyStamp, setShowCompanyStamp] = useState(false);
  const [showSignature, setShowSignature] = useState(false);

  const preset = PRESETS.find(p => p.type === selected);
  const fields = PRESET_TYPES[selected]?.fields || [];

  const selectPreset = (type) => { setSelected(type); setValues({}); };
  const setField = (f, v) => setValues(prev => ({ ...prev, [f]: v }));

  const handlePrint = () => {
    printPresetReceipt({ type: selected, values, receiptNo, date, showAccountantStamp, showCompanyStamp, showSignature });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PRESETS.map(p => (
          <button key={p.type} onClick={() => selectPreset(p.type)}
            className="font-bold py-2.5 rounded-lg text-sm transition text-white"
            style={{ background: p.color, opacity: selected === p.type ? 1 : 0.45 }}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 pt-3 border-t border-gray-100">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">رقم الإيصال (اختياري)</label>
            <input type="text" value={receiptNo} onChange={e => setReceiptNo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 text-right" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">التاريخ</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
          </div>
        </div>
        {fields.map(f => (
          <div key={f}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{f}</label>
            <input type="text" value={values[f] || ''} onChange={e => setField(f, e.target.value)}
              placeholder={`سيبها فاضية تملاها بالخط لو حبيت`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 text-right" />
          </div>
        ))}
      </div>

      <SignStampControls
        showAccountantStamp={showAccountantStamp} setShowAccountantStamp={setShowAccountantStamp}
        showCompanyStamp={showCompanyStamp} setShowCompanyStamp={setShowCompanyStamp}
        showSignature={showSignature} setShowSignature={setShowSignature} />

      <div className="pt-2 border-t border-gray-100 flex justify-end">
        <PrintButton onClick={handlePrint} />
      </div>
    </div>
  );
}

export default function PrintFormPage() {
  const [tab, setTab] = useState('sheet'); // sheet | memos | presets

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">طباعة</h2>
        <p className="text-sm text-gray-400 mt-0.5">ورقة بشكل الشركة الثابت - إنت اللي بتحدد الخانات والمسلسل والعدد، أو مذكرة حرة تحفظها وترجعلها</p>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button onClick={() => setTab('sheet')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === 'sheet' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          ورقة فاضية
        </button>
        <button onClick={() => setTab('memos')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === 'memos' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          مذكرات
        </button>
        <button onClick={() => setTab('presets')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === 'presets' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          قوالب جاهزة
        </button>
      </div>

      {tab === 'sheet' && <BlankSheetTab />}
      {tab === 'memos' && <MemosTab />}
      {tab === 'presets' && <PresetsTab />}

      <p className="text-xs text-gray-400">
        الشكل (اسم الشركة، اللوجو، تصميم الجدول) ثابت ومتطابق مع باقي أوراق الطباعة في النظام.
      </p>
    </div>
  );
}

