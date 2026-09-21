import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { todayISO } from '../utils/constants';
import { addDaysISO, payWeekOf } from '../utils/weeks';
import { calcExpensesInRange, budgetForWeek, EXPENSE_LABELS } from '../domain/budget';

const fmt = (v) => Number(v || 0).toLocaleString('ar-EG');
const dayLabel = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });

// الميزانية على حسب الأسبوع (من السبت للجمعة — نفس أسبوع القبض والتايم شيت).
// كل أسبوع له ميزانيته (نقدي + انستا/محفظة) ومصروفاته لوحدها، ومفيش ترحيل بين الأسابيع.
export default function BudgetPage() {
  const {
    weeklyBudgets, setWeeklyBudget,
    advances, custody, foodExpenses, purchases, transfers, pillars, payments,
  } = useApp();

  const currentWeekStart = payWeekOf(todayISO()).start;
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const week = payWeekOf(weekStart);
  const isCurrentWeek = weekStart === currentWeekStart;

  const budget = useMemo(() => budgetForWeek(weeklyBudgets, weekStart), [weeklyBudgets, weekStart]);
  const prevWeekStart = addDaysISO(weekStart, -7);
  const prevBudget = useMemo(() => budgetForWeek(weeklyBudgets, prevWeekStart), [weeklyBudgets, prevWeekStart]);

  const [cashInput, setCashInput] = useState('');
  const [instaInput, setInstaInput] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setCashInput(budget.hasCash ? String(budget.cash) : '');
    setInstaInput(budget.hasInsta ? String(budget.insta) : '');
  }, [weekStart, budget.cash, budget.insta, budget.hasCash, budget.hasInsta]);

  const data = { advances, custody, foodExpenses, purchases, transfers, pillars, payments };
  const expenses = useMemo(
    () => calcExpensesInRange(data, week.start, week.end),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [advances, custody, foodExpenses, purchases, transfers, pillars, payments, weekStart]
  );

  const cashRemaining = budget.cash - expenses.cash.total;
  const instaRemaining = budget.insta - expenses.insta.total;
  const cashPercent = budget.cash > 0 ? Math.min((expenses.cash.total / budget.cash) * 100, 100) : 0;
  const instaPercent = budget.insta > 0 ? Math.min((expenses.insta.total / budget.insta) * 100, 100) : 0;

  const save = async (type, raw) => {
    setSaving(true);
    try {
      await setWeeklyBudget(weekStart, type, parseFloat(raw) || 0);
    } catch (err) {
      alert('تعذر حفظ الميزانية: ' + (err?.message || 'خطأ غير معروف') +
        '\n(لو الرسالة بتقول إن الجدول مش موجود، شغّل ملف SQL بتاع ميزانية الأسبوع في Supabase الأول.)');
    } finally {
      setSaving(false);
    }
  };

  const copyPrevious = async () => {
    setSaving(true);
    try {
      if (prevBudget.hasCash) await setWeeklyBudget(weekStart, 'cash', prevBudget.cash);
      if (prevBudget.hasInsta) await setWeeklyBudget(weekStart, 'insta', prevBudget.insta);
    } catch (err) {
      alert('تعذر النسخ: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setSaving(false);
    }
  };

  // ملخص آخر 8 أسابيع (لحد الأسبوع المختار) — عشان تشوف ميزانية كل أسبوع جنب التاني
  const history = useMemo(() => {
    const rows = [];
    for (let i = 0; i < 8; i++) {
      const start = addDaysISO(weekStart, -7 * i);
      const w = payWeekOf(start);
      const b = budgetForWeek(weeklyBudgets, w.start);
      const e = calcExpensesInRange(data, w.start, w.end);
      rows.push({ start: w.start, end: w.end, budget: b, expenses: e });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyBudgets, advances, custody, foodExpenses, purchases, transfers, pillars, payments, weekStart]);

  const canCopy = !budget.hasCash && !budget.hasInsta && (prevBudget.hasCash || prevBudget.hasInsta);

  const renderCard = ({ title, color, icon, type, input, setInput, budgetValue, spent, remaining, percent }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center`}>
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} /></svg>
        </div>
        <h3 className="font-bold text-gray-800 text-lg">{title}</h3>
      </div>
      <div className="flex gap-2 mb-4">
        <input type="number" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(type, input); }}
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 no-spinner" placeholder="ميزانية الأسبوع ده" />
        <button onClick={() => save(type, input)} disabled={saving}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg transition font-medium">حفظ</button>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between py-1.5 border-b border-gray-100">
          <span className="text-gray-600">ميزانية الأسبوع</span>
          <span className="font-bold">{fmt(budgetValue)} ج.م</span>
        </div>
        <div className="flex justify-between py-1.5 border-b border-gray-100">
          <span className="text-gray-600">مصروفات الأسبوع</span>
          <span className="font-bold text-red-600">{fmt(spent)} ج.م</span>
        </div>
        <div className="flex justify-between py-1.5">
          <span className="text-gray-600 font-bold">المتبقي</span>
          <span className={`font-bold ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(remaining)} ج.م</span>
        </div>
      </div>
      <div className="mt-3">
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div className={`h-3 rounded-full transition-all ${percent > 80 ? 'bg-red-500' : percent > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
            style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-gray-500 mt-1 text-center">{percent.toFixed(1)}% مصروف</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">الميزانية</h2>
          <p className="text-xs text-gray-400 mt-1">كل أسبوع (من السبت للجمعة) له ميزانية ومصروفات لوحده</p>
        </div>
        {!isCurrentWeek && (
          <button onClick={() => setWeekStart(currentWeekStart)}
            className="text-sm text-primary-600 hover:bg-primary-50 px-3 py-2 rounded-lg transition">الأسبوع الحالي</button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-3">
        <button onClick={() => setWeekStart(prevWeekStart)} title="الأسبوع السابق" className="p-2 hover:bg-gray-100 rounded-lg transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
        <div className="text-center flex-1 min-w-[180px]">
          <p className="font-bold text-gray-800">
            من {dayLabel(week.start)} إلى {dayLabel(week.end)}
            {isCurrentWeek && <span className="mr-2 bg-primary-100 text-primary-700 text-[11px] px-2 py-0.5 rounded-full">الأسبوع الحالي</span>}
          </p>
          <p className="text-xs text-gray-400">{week.start} ← {week.end}</p>
        </div>
        <button onClick={() => setWeekStart(addDaysISO(weekStart, 7))} title="الأسبوع التالي" className="p-2 hover:bg-gray-100 rounded-lg transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <input type="date" value={weekStart}
          onChange={e => e.target.value && setWeekStart(payWeekOf(e.target.value).start)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm" />
      </div>

      {canCopy && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-amber-800">لسه ما حطتش ميزانية للأسبوع ده. عاوز تنسخ ميزانية الأسبوع اللي قبله؟</p>
          <button onClick={copyPrevious} disabled={saving}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition">
            نسخ ميزانية الأسبوع السابق
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderCard({
          title: 'الميزانية النقدية', color: 'bg-green-500', type: 'cash',
          icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1',
          input: cashInput, setInput: setCashInput,
          budgetValue: budget.cash, spent: expenses.cash.total, remaining: cashRemaining, percent: cashPercent,
        })}
        {renderCard({
          title: 'ميزانية الانستاباي / المحفظة', color: 'bg-purple-500', type: 'insta',
          icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1',
          input: instaInput, setInput: setInstaInput,
          budgetValue: budget.insta, spent: expenses.insta.total, remaining: instaRemaining, percent: instaPercent,
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-bold text-gray-800 text-lg mb-4">تفاصيل مصروفات الأسبوع (نقدي)</h3>
        <div className="space-y-3">
          {EXPENSE_LABELS.map(item => (
            <div key={item.key} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-40">{item.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-3">
                <div className="bg-red-400 h-3 rounded-full transition-all"
                  style={{ width: `${expenses.cash.total > 0 ? (expenses.cash[item.key] / expenses.cash.total) * 100 : 0}%` }} />
              </div>
              <span className="text-sm font-bold text-gray-700 w-28 text-left">{fmt(expenses.cash[item.key])} ج.م</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-bold text-gray-800 text-lg mb-4">تفاصيل مصروفات الأسبوع (انستا / محفظة)</h3>
        <div className="space-y-3">
          {EXPENSE_LABELS.map(item => (
            <div key={item.key} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-40">{item.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-3">
                <div className="bg-purple-400 h-3 rounded-full transition-all"
                  style={{ width: `${expenses.insta.total > 0 ? (expenses.insta[item.key] / expenses.insta.total) * 100 : 0}%` }} />
              </div>
              <span className="text-sm font-bold text-gray-700 w-28 text-left">{fmt(expenses.insta[item.key])} ج.م</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-lg">آخر 8 أسابيع</h3>
          <p className="text-xs text-gray-400 mt-1">اضغط على أي أسبوع لفتحه</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">الأسبوع</th>
                <th className="px-4 py-2 text-right font-semibold text-green-700">نقدي: ميزانية</th>
                <th className="px-4 py-2 text-right font-semibold text-green-700">مصروف</th>
                <th className="px-4 py-2 text-right font-semibold text-green-700">متبقي</th>
                <th className="px-4 py-2 text-right font-semibold text-purple-700">انستا/محفظة: ميزانية</th>
                <th className="px-4 py-2 text-right font-semibold text-purple-700">مصروف</th>
                <th className="px-4 py-2 text-right font-semibold text-purple-700">متبقي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map(r => {
                const cashLeft = r.budget.cash - r.expenses.cash.total;
                const instaLeft = r.budget.insta - r.expenses.insta.total;
                return (
                  <tr key={r.start} onClick={() => setWeekStart(r.start)}
                    className={`cursor-pointer hover:bg-gray-50 transition ${r.start === weekStart ? 'bg-primary-50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">{dayLabel(r.start)} — {dayLabel(r.end)}</td>
                    <td className="px-4 py-2">{r.budget.hasCash ? fmt(r.budget.cash) : '—'}</td>
                    <td className="px-4 py-2 text-red-600">{fmt(r.expenses.cash.total)}</td>
                    <td className={`px-4 py-2 font-bold ${cashLeft >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(cashLeft)}</td>
                    <td className="px-4 py-2">{r.budget.hasInsta ? fmt(r.budget.insta) : '—'}</td>
                    <td className="px-4 py-2 text-red-600">{fmt(r.expenses.insta.total)}</td>
                    <td className={`px-4 py-2 font-bold ${instaLeft >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(instaLeft)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
