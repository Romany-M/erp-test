import React, { useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { todayISO, PAYMENT_TYPES } from '../utils/constants';
import { printContractorArchive, printContractorReceipt } from '../utils/pdfDocs';

// حساب مقاول واحد بس: كل الأرقام هنا محسوبة على مبالغ المقاول ده لوحده،
// مفيش أي جمع مع مقاولين تانيين.
export default function ContractorDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    contractors, contractorPayments, contractorReceipts,
    deleteContractor, addContractorPayment, deleteContractorPayment, markContractorPaid,
    issueContractorReceipt,
  } = useApp();
  const [printingReceipt, setPrintingReceipt] = useState(false);

  const contractor = contractors.find(c => c.id === id);

  const defaultInput = () => ({ date: todayISO(), amount: '', paymentType: 'cash', paidBy: '' });
  const [showAmount, setShowAmount] = useState(false);
  const [input, setInput] = useState(defaultInput);

  const payments = useMemo(() => {
    return contractorPayments
      .filter(p => p.contractorId === id)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [contractorPayments, id]);

  const paidPayments = useMemo(() => payments.filter(p => p.paid), [payments]);
  // الدفعات اللي اتصرفت ولسه ما اتوثقتش في إيصال (receiptId فاضي) — دي اللي بتدخل
  // في إيصال جديد. أي دفعة دخلت إيصال قبل كده مابتتكررش في إيصال تاني.
  const unreceiptedPayments = useMemo(() => paidPayments.filter(p => !p.receiptId), [paidPayments]);
  const totalAll = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalOutstanding = payments.filter(p => !p.paid).reduce((s, p) => s + (p.amount || 0), 0);
  const totalPaid = paidPayments.reduce((s, p) => s + (p.amount || 0), 0);

  if (!contractor) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <p className="text-gray-500 mb-4">المقاول ده مش موجود (يمكن اتحذف).</p>
        <Link to="/contractors" className="text-primary-600 font-medium">← الرجوع لقائمة المقاولين</Link>
      </div>
    );
  }

  const receiptNumberById = useMemo(
    () => new Map(contractorReceipts.map(r => [r.id, r.receiptNumber])),
    [contractorReceipts]
  );

  const setField = (field, value) => setInput(prev => ({ ...prev, [field]: value }));

  const handleAddAmount = async () => {
    const val = parseFloat(input.amount);
    if (!val || val <= 0 || !input.date) return;
    try {
      await addContractorPayment({
        contractorId: id,
        date: input.date,
        amount: val,
        paymentType: input.paymentType || 'cash',
        paidBy: (input.paidBy || '').trim(),
      });
      setInput(defaultInput());
      setShowAmount(false);
    } catch (err) {
      alert('تعذر تسجيل المبلغ: ' + (err?.message || 'خطأ غير معروف'));
    }
  };

  const handleMarkPaid = () => {
    if (totalOutstanding <= 0) return;
    if (!window.confirm(`هل تريد صرف ${totalOutstanding.toLocaleString('ar-EG')} ج.م للمقاول "${contractor.name}" وتسجيلها كمدفوعة؟`)) return;
    markContractorPaid(id);
  };

  const handleDelete = async () => {
    if (!window.confirm(`هل تريد حذف المقاول "${contractor.name}" وكل مبالغه المسجلة؟`)) return;
    try {
      await deleteContractor(id);
      navigate('/contractors');
    } catch (err) {
      alert('تعذر الحذف: ' + (err?.message || 'خطأ غير معروف'));
    }
  };

  const handleArchivePdf = () => {
    if (paidPayments.length === 0) return;
    const withReceiptNo = paidPayments.map(p => ({
      ...p, receiptNumber: p.receiptId ? receiptNumberById.get(p.receiptId) : null,
    }));
    printContractorArchive({ contractor, payments: withReceiptNo });
  };
  const handleReceipt = async () => {
    if (unreceiptedPayments.length === 0 || printingReceipt) return;
    setPrintingReceipt(true);
    let receipt;
    try {
      receipt = await issueContractorReceipt(contractor, unreceiptedPayments);
    } catch (err) {
      alert('تعذر توثيق الإيصال في الداتابيز: ' + (err?.message || 'خطأ غير معروف') +
        '\n(لو الرسالة بتقول إن الجدول أو العمود مش موجود، شغّل ملف SQL بتاع ترقيم الإيصالات في Supabase الأول.)');
      setPrintingReceipt(false);
      return;
    }
    setPrintingReceipt(false);
    // إجمالي المستلم من المقاول لحد النهارده (شامل الإيصال ده) — سطر معلوماتي بس،
    // مش جزء من إقرار الاستلام اللي بيوقّع عليه المقاول (اللي بيوقّع عليه هو الجديد بس).
    printContractorReceipt({
      contractor, payments: unreceiptedPayments, receiptNumber: receipt.receiptNumber,
      historicalTotal: totalPaid,
    });
  };

  const paymentLabel = (type) => (PAYMENT_TYPES.find(x => x.value === type) || PAYMENT_TYPES[0]).label;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/contractors" className="text-sm text-primary-600 hover:underline">← كل المقاولين</Link>
        <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-800">{contractor.name}</h2>
            <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded text-sm">{contractor.role}</span>
            {totalAll > 0 && totalOutstanding === 0 && (
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">تم الصرف</span>
            )}
          </div>
          <button onClick={handleDelete} title="حذف المقاول"
            className="text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg text-sm transition flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            حذف المقاول
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">حساب مستقل — لا يُحتسب مع باقي المقاولين</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-xl shadow-sm border border-green-100 p-5">
          <p className="text-sm text-green-600 font-medium">إجمالي المسجل (شامل ما تم صرفه)</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{totalAll.toLocaleString('ar-EG')} ج.م</p>
        </div>
        <div className="bg-amber-50 rounded-xl shadow-sm border border-amber-100 p-5">
          <p className="text-sm text-amber-600 font-medium">المستحق حالياً (غير مدفوع)</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{totalOutstanding.toLocaleString('ar-EG')} ج.م</p>
        </div>
        <div className="bg-primary-50 rounded-xl shadow-sm border border-primary-100 p-5">
          <p className="text-sm text-primary-600 font-medium">إجمالي ما تم صرفه</p>
          <p className="text-2xl font-bold text-primary-700 mt-1">{totalPaid.toLocaleString('ar-EG')} ج.م</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => setShowAmount(true)}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          تسجيل مبلغ جديد
        </button>
        <button onClick={handleMarkPaid} disabled={totalOutstanding <= 0}
          className={`px-5 py-2.5 rounded-lg font-medium transition flex items-center gap-2 text-sm ${
            totalOutstanding > 0 ? 'bg-green-600 hover:bg-green-700 text-white shadow' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          تم الصرف
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-lg">مبالغ {contractor.name}</h3>
        </div>
        {payments.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">لا توجد مبالغ مسجلة</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">التاريخ</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">المبلغ</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">الصرف</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-600">الحالة</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-600">الإيصال</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-600">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2">{new Date(p.date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-4 py-2 font-bold text-gray-800">{(p.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                    <td className="px-4 py-2">
                      <span className="text-xs font-medium text-gray-600">{paymentLabel(p.paymentType)}</span>
                      {p.paidBy && <span className="block text-[10px] text-gray-400 mt-0.5">من: {p.paidBy}</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {p.paid ? 'مدفوع' : 'مستحق'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {!p.paid ? (
                        <span className="text-gray-300 text-xs">—</span>
                      ) : p.receiptId ? (
                        <span className="text-xs font-bold text-primary-700 ltr" dir="ltr">
                          #{receiptNumberById.get(p.receiptId) ?? '؟'}
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">بدون إيصال</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => { if (window.confirm('هل تريد حذف هذا المبلغ؟')) deleteContractorPayment(p.id); }}
                        className="text-red-400 hover:bg-red-50 p-1.5 rounded transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">الأرشيف — ما تم صرفه</h3>
            <p className="text-xs text-gray-400 mt-1">مبالغ {contractor.name} المدفوعة فقط</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-2">
              <button onClick={handleArchivePdf} disabled={paidPayments.length === 0}
                title="حفظ أرشيف المقاول كملف PDF"
                className="px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                تحميل الأرشيف PDF
              </button>
              <button onClick={handleReceipt} disabled={unreceiptedPayments.length === 0 || printingReceipt}
                title={unreceiptedPayments.length === 0 ? 'كل الدفعات المصروفة موثّقة بإيصالات بالفعل' : `طباعة إيصال بالدفعات الجديدة (${unreceiptedPayments.length}) مع توقيع المقاول والمحاسب والختم`}
                className="relative px-3 py-2 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-primary-700 border border-primary-300 rounded-lg text-sm font-medium transition flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                {printingReceipt ? 'جارِ الترقيم...' : 'طباعة إيصال'}
                {unreceiptedPayments.length > 0 && (
                  <span className="absolute -top-2 -left-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {unreceiptedPayments.length}
                  </span>
                )}
              </button>
            </div>
            <div className="text-left">
              <p className="text-xs text-gray-500">إجمالي ما تم صرفه</p>
              <p className="text-xl font-bold text-green-700">{totalPaid.toLocaleString('ar-EG')} ج.م</p>
            </div>
          </div>
        </div>
        {paidPayments.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">لا يوجد ما تم صرفه بعد — المبالغ تظهر هنا بعد "تم الصرف"</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">التاريخ</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">المبلغ</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">الصرف</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-600">تم الصرف في</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paidPayments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2">{new Date(p.date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-4 py-2 font-bold text-gray-800">{(p.amount || 0).toLocaleString('ar-EG')} ج.م</td>
                    <td className="px-4 py-2">
                      <span className="text-xs font-medium text-gray-600">{paymentLabel(p.paymentType)}</span>
                      {p.paidBy && <span className="block text-[10px] text-gray-400 mt-0.5">من: {p.paidBy}</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{p.paidAt ? new Date(p.paidAt).toLocaleDateString('ar-EG') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAmount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowAmount(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-1">تسجيل مبلغ جديد</h3>
            <p className="text-sm text-gray-500 mb-5">
              للمقاول: <span className="font-medium text-gray-700">{contractor.name}</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
                <input type="date" value={input.date} onChange={e => setField('date', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-base" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ج.م)</label>
                <input type="number" placeholder="0" value={input.amount} autoFocus
                  onChange={e => setField('amount', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAmount(); } }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-base no-spinner" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">نوع الصرف</label>
                <select value={input.paymentType} onChange={e => setField('paymentType', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-base bg-white">
                  {PAYMENT_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم من صرف (اختياري)</label>
                <input type="text" placeholder="مثال: أحمد" value={input.paidBy}
                  onChange={e => setField('paidBy', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAmount(); } }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-base" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowAmount(false)}
                className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition">إلغاء</button>
              <button onClick={handleAddAmount}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg font-medium transition flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                تسجيل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
