// ============================================================================
// حساب مصروفات فترة (أسبوع الميزانية) — المكان الوحيد اللي بيتحسب فيه.
// صفحة الميزانية والداشبورد الاتنين بيستخدموه، فالرقم واحد في الصفحتين.
//
// نفس بنود مصروفات صفحة الميزانية القديمة (السلف، العهد، المصروفات، المشتريات،
// التحويلات، مراحل البناء، القبض)، بس متفلترة بتاريخ كل بند جوه الأسبوع.
// ============================================================================
import { formatDateISO } from '../utils/constants';

export const EXPENSE_LABELS = [
  { key: 'advances', label: 'السلف' },
  { key: 'custody', label: 'العهد' },
  { key: 'food', label: 'المصروفات' },
  { key: 'purchases', label: 'المشتريات' },
  { key: 'transfers', label: 'التحويلات' },
  { key: 'pillars', label: 'مراحل البناء (لبشة/سقف/عمدان)' },
  { key: 'payments', label: 'القبض (الرواتب)' },
];

// تاريخ البند كـ YYYY-MM-DD. القبض (payments.date) مخزّن كـ timestamp فبنحوله
// لتاريخ القاهرة، باقي البنود تاريخها يوم عادي.
function dayOf(value) {
  if (!value) return '';
  const s = String(value);
  return s.length === 10 ? s : formatDateISO(s);
}

const isInsta = (p) => p.paymentType === 'insta' || p.paymentType === 'wallet';
const isCash = (p) => p.paymentType === 'cash';

// { cash: { advances, custody, food, purchases, transfers, pillars, payments, total },
//   insta: { ...نفس البنود... } }  للفترة [from, to] (الاتنين شاملين).
export function calcExpensesInRange(data, from, to) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const sources = {
    advances: [data.advances, a => a.amount],
    custody: [data.custody, c => c.amount],
    food: [data.foodExpenses, f => f.totalAmount],
    purchases: [data.purchases, p => p.amount],
    transfers: [data.transfers, t => t.amount],
    pillars: [data.pillars, p => p.cost],
    payments: [data.payments, p => p.amount],
  };

  const build = (matchType) => {
    const out = {};
    let total = 0;
    Object.entries(sources).forEach(([key, [rows, amountOf]]) => {
      const sum = (rows || [])
        .filter(r => matchType(r) && inRange(dayOf(r.date)))
        .reduce((s, r) => s + (Number(amountOf(r)) || 0), 0);
      out[key] = sum;
      total += sum;
    });
    out.total = total;
    return out;
  };

  return { cash: build(isCash), insta: build(isInsta) };
}

// ميزانية أسبوع معين ({cash, insta}) من قايمة weeklyBudgets. الأسبوع اللي ماتحطلوش ميزانية = 0.
export function budgetForWeek(weeklyBudgets, weekStart) {
  const pick = (type) => {
    const row = (weeklyBudgets || []).find(b => b.weekStart === weekStart && b.type === type);
    return row ? Number(row.amount) || 0 : 0;
  };
  const has = (type) => (weeklyBudgets || []).some(b => b.weekStart === weekStart && b.type === type);
  return { cash: pick('cash'), insta: pick('insta'), hasCash: has('cash'), hasInsta: has('insta') };
}
