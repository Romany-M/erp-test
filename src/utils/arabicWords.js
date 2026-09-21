// تفقيط المبالغ بالعربي (للإيصالات): 1500 -> "فقط ألف وخمسمائة جنيه لا غير".
// بيراعي مفرد/مثنى/جمع العدد والمعدود (جنيه واحد، جنيهان، ثلاثة جنيهات،
// أحد عشر جنيهاً، مائتا جنيه) وبيتعامل مع القروش لحد رقمين عشريين.

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

// اسم كل رتبة: [مفرد, مثنى (مرفوع), مثنى (مضاف قبل المعدود), جمع 3-10, تمييز 11-99]
const SCALES = [
  null,
  ['ألف', 'ألفان', 'ألفا', 'آلاف', 'ألفاً'],
  ['مليون', 'مليونان', 'مليونا', 'ملايين', 'مليوناً'],
  ['مليار', 'ملياران', 'مليارا', 'مليارات', 'ملياراً'],
];

// 1..999 بالكلمات. المائتان بتتحول لـ "مائتا" لأنها دايماً جاية قبل معدود (ألف / جنيه).
function below1000(n) {
  const parts = [];
  const h = Math.floor(n / 100);
  const t = n % 100;
  if (h) parts.push(t === 0 && h === 2 ? 'مائتا' : HUNDREDS[h]);
  if (t) {
    if (t < 10) parts.push(ONES[t]);
    else if (t < 20) parts.push(TEENS[t - 10]);
    else {
      const o = t % 10;
      const tens = Math.floor(t / 10);
      parts.push(o ? `${ONES[o]} و${TENS[tens]}` : TENS[tens]);
    }
  }
  return parts.join(' و');
}

// عبارة رتبة (آلاف/ملايين/مليارات) لمجموعة g (1..999).
// isLast = الرتبة دي هي آخر حاجة قبل كلمة "جنيه" مباشرة.
function scalePhrase(g, scaleIdx, isLast) {
  const names = SCALES[scaleIdx];
  const t = g % 100;
  if (g === 1) return names[0];
  if (g === 2) return isLast ? names[2] : names[1];
  const words = below1000(g);
  if (t >= 3 && t <= 10) return `${words} ${names[3]}`;
  if (t >= 11) return `${words} ${isLast ? names[0] : names[4]}`;
  return `${words} ${names[0]}`; // 0 أو 1 أو 2 في آخر الرقم
}

function poundsPhrase(pounds) {
  if (pounds === 0) return '';
  if (pounds === 1) return 'جنيه واحد';
  if (pounds === 2) return 'جنيهان';

  const groups = [];
  let rest = pounds;
  while (rest > 0) { groups.push(rest % 1000); rest = Math.floor(rest / 1000); }

  const units = groups[0];
  const lowestIdx = groups.findIndex(g => g > 0);
  const parts = [];
  for (let i = groups.length - 1; i >= 1; i--) {
    if (groups[i] > 0) parts.push(scalePhrase(groups[i], i, units === 0 && i === lowestIdx));
  }

  if (units === 0) return `${parts.join(' و')} جنيه`;

  const t = units % 100;
  const h = Math.floor(units / 100);
  if (t === 1 || t === 2) {
    if (h) parts.push(HUNDREDS[h]);
    parts.push(t === 1 ? 'جنيه واحد' : 'جنيهان');
    return parts.join(' و');
  }
  parts.push(below1000(units));
  const noun = t === 0 ? 'جنيه' : t <= 10 ? 'جنيهات' : 'جنيهاً';
  return `${parts.join(' و')} ${noun}`;
}

function piastresPhrase(p) {
  if (p === 0) return '';
  if (p === 1) return 'قرش واحد';
  if (p === 2) return 'قرشان';
  return `${below1000(p)} ${p <= 10 ? 'قروش' : 'قرشاً'}`;
}

// المبلغ بالحروف: "فقط ... لا غير"
export function amountInArabicWords(amount) {
  const value = Number(amount);
  if (!isFinite(value) || value < 0) return '';
  const totalPiastres = Math.round(value * 100);
  const pounds = Math.floor(totalPiastres / 100);
  const piastres = totalPiastres % 100;
  if (pounds === 0 && piastres === 0) return 'فقط صفر جنيه لا غير';
  const parts = [poundsPhrase(pounds), piastresPhrase(piastres)].filter(Boolean);
  return `فقط ${parts.join(' و')} لا غير`;
}
