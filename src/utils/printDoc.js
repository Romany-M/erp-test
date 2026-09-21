// أدوات مشتركة لملفات الـ PDF (أرشيف المقاول، الإيصال، دليل السكن، دليل الهاتف).
// نفس أسلوب باقي النظام: نافذة طباعة بتفتح بـ HTML جاهز، والمتصفح بيحفظه PDF
// (اختار "Save as PDF / حفظ كـ PDF" من نافذة الطباعة).
import { PDF_LOGO_DATA_URI } from '../assets/pdfLogo';
import { formatDateISO } from './constants';

export const COMPANY_NAME = 'شركة المناهري للمقاولات العمومية';
export const NAVY = '#003670';

// أي نص جاي من بيانات المستخدم (أسماء، عمارات...) لازم يعدّي من هنا قبل ما يدخل الـ HTML
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// أرقام عربية (زي باقي النظام) من غير فاصل آلاف في السنة
export const nAr = (v) => Number(v || 0).toLocaleString('ar-EG');
export const moneyAr = (v) => `${nAr(v)} ج.م`;

function toISODate(value) {
  if (!value) return '';
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : formatDateISO(s);
}

// 2026-09-21 -> "٢١ / ٩ / ٢٠٢٦"
export function dateAr(value) {
  const iso = toISODate(value);
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const f = (x) => x.toLocaleString('ar-EG', { useGrouping: false });
  return `${f(d)} / ${f(m)} / ${f(y)}`;
}

export function letterheadHtml(title, sideHtml = '') {
  // جدول (مش grid/flex) عشان يطلع بنفس الشكل في كل المتصفحات ومحركات الطباعة
  return `
    <table class="lh"><tr>
      <td class="lh-side">${sideHtml}</td>
      <td class="lh-center">
        <div class="lh-name">${COMPANY_NAME}</div>
        ${title ? `<div class="lh-title">${esc(title)}</div>` : ''}
      </td>
      <td class="lh-logo"><img src="${PDF_LOGO_DATA_URI}" alt="شعار الشركة" /></td>
    </tr></table>`;
}

export const BASE_CSS = `
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Tajawal', 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; }
  html, body { direction: rtl; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-size: 12px; line-height: 1.5; }
  .ltr { direction: ltr; unicode-bidi: embed; display: inline-block; }

  table.lh { width: 100%; border-collapse: collapse; border-bottom: 2.5px solid ${NAVY}; margin-bottom: 10px; }
  table.lh td { padding: 0 0 8px; vertical-align: middle; }
  .lh-side { width: 24%; font-size: 10.5px; color: #475569; line-height: 1.7; text-align: right; }
  .lh-center { text-align: center; }
  .lh-name { font-size: 19px; font-weight: 800; color: ${NAVY}; }
  .lh-title { display: inline-block; margin-top: 5px; background: ${NAVY}; color: #fff; font-weight: 700;
              font-size: 13px; padding: 3px 20px; border-radius: 8px; }
  .lh-logo { width: 24%; text-align: left; }
  .lh-logo img { height: 64px; }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 9px; }
  .chip { background: #eef3fa; border: 1px solid #cfdcee; border-radius: 6px; padding: 3px 10px; font-size: 11px; color: #475569; }
  .chip b { color: ${NAVY}; font-size: 12px; margin-right: 4px; }

  table.t { width: 100%; border-collapse: collapse; }
  table.t th { background: ${NAVY}; color: #fff; font-weight: 700; font-size: 11.5px; padding: 6px; border: 1px solid ${NAVY}; }
  table.t td { border: 1px solid #b9c7dc; padding: 5px 6px; font-size: 11.5px; text-align: center; }
  table.t tbody tr:nth-child(even) td { background: #f6f9fd; }
  table.t td.r, table.t th.r { text-align: right; }
  table.t td.num { font-weight: 700; }
  table.t tfoot td { background: #e8eff9; font-weight: 800; font-size: 12.5px; color: ${NAVY}; }
  table.t thead { display: table-header-group; }
  table.t tr { page-break-inside: avoid; }
  .muted { color: #94a3b8; }

  .doc-foot { margin-top: 12px; padding-top: 4px; border-top: 1px solid #cbd5e1; text-align: center; font-size: 9.5px; color: #64748b; }
`;

// لازم تتنادى مباشرة من ضغطة زرار (عشان المتصفح ما يمنعش النافذة)
export function openPrintWindow({ title, body, css = '' }) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('المتصفح منع فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة (Pop-ups) للموقع وجرّب تاني.');
    return false;
  }
  w.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>${BASE_CSS}${css}</style>
</head>
<body>
  ${body}
  <script>
    window.addEventListener('load', function () {
      var fontsReady = (document.fonts && document.fonts.ready)
        ? Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 2500); })])
        : Promise.resolve();
      fontsReady.then(function () { setTimeout(function () { window.print(); }, 150); });
    });
  </script>
</body>
</html>`);
  w.document.close();
  return true;
}
