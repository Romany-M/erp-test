// بناة ملفات الـ PDF. كل دالة بتجهّز HTML وتفتح نافذة الطباعة (openPrintWindow).
// الدوال دي بترجّع HTML بس في نسخ build*Html عشان تتجرّب من غير متصفح.
import { PAYMENT_TYPES, todayISO } from './constants';
import { PDF_STAMP_DATA_URI } from '../assets/pdfStamp';
import { MANAGER_SIGNATURE_DATA_URI } from '../assets/managerSignature';
import { amountInArabicWords } from './arabicWords';
import {
  COMPANY_NAME, NAVY, esc, nAr, moneyAr, dateAr, letterheadHtml, openPrintWindow,
} from './printDoc';

export const ACCOUNTANT_NAME = 'روماني مكرم';

const typeLabel = (type) => (PAYMENT_TYPES.find(p => p.value === type) || PAYMENT_TYPES[0]).label;
const phoneCell = (phone) => {
  const p = String(phone || '').trim();
  return p ? `<span class="ltr">${esc(p)}</span>` : '<span class="muted">—</span>';
};
const footHtml = () =>
  `<div class="doc-foot">${COMPANY_NAME} — تاريخ الطباعة: ${dateAr(todayISO())}</div>`;

// ============================================================================
// 1) أرشيف مدفوعات مقاول (اللي اتصرف بس)
// ============================================================================
function archiveRows(payments) {
  return [...payments].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export function buildContractorArchiveHtml({ contractor, payments }) {
  const rows = archiveRows(payments);
  const total = rows.reduce((s, p) => s + (p.amount || 0), 0);

  const byType = {};
  rows.forEach(p => { byType[typeLabel(p.paymentType)] = (byType[typeLabel(p.paymentType)] || 0) + (p.amount || 0); });
  const typeChips = Object.entries(byType).length > 1
    ? Object.entries(byType).map(([label, sum]) => `<div class="chip">${esc(label)} <b>${moneyAr(sum)}</b></div>`).join('')
    : '';

  const bodyRows = rows.map((p, i) => `
    <tr>
      <td>${nAr(i + 1)}</td>
      <td>${dateAr(p.date)}</td>
      <td class="num">${moneyAr(p.amount)}</td>
      <td>${esc(typeLabel(p.paymentType))}</td>
      <td>${p.paidBy ? esc(p.paidBy) : '<span class="muted">—</span>'}</td>
      <td>${p.paidAt ? dateAr(p.paidAt) : '<span class="muted">—</span>'}</td>
    </tr>`).join('');

  return `
    ${letterheadHtml('أرشيف مدفوعات مقاول', `تاريخ الطباعة:<br><b>${dateAr(todayISO())}</b>`)}
    <div class="chips">
      <div class="chip">المقاول <b>${esc(contractor.name)}</b></div>
      <div class="chip">القسم <b>${esc(contractor.role)}</b></div>
      <div class="chip">عدد الدفعات <b>${nAr(rows.length)}</b></div>
      <div class="chip">إجمالي ما تم صرفه <b>${moneyAr(total)}</b></div>
      ${typeChips}
    </div>
    <table class="t">
      <thead>
        <tr><th>م</th><th>تاريخ الدفعة</th><th>المبلغ</th><th>نوع الصرف</th><th>صُرفت بواسطة</th><th>تاريخ الصرف</th></tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr><td colspan="2" class="r">الإجمالي</td><td class="num">${moneyAr(total)}</td><td colspan="3" class="r" style="font-size:11px">${esc(amountInArabicWords(total))}</td></tr>
      </tfoot>
    </table>
    ${footHtml()}`;
}

export function printContractorArchive({ contractor, payments }) {
  return openPrintWindow({
    title: `أرشيف-المقاول-${contractor.name}`,
    body: buildContractorArchiveHtml({ contractor, payments }),
  });
}

// ============================================================================
// 2) إيصال المقاول (بنفس شكل التمبلت: عربي بس) — يطبع كل الأرشيف + توقيعين + الختم
// ============================================================================
const RECEIPT_CSS = `
  .rc { border: 2px solid ${NAVY}; border-radius: 14px; padding: 12px 14px 14px; }
  .rc table.lh { margin-bottom: 6px; border-bottom: 1px solid #cfdcee; }
  .rc-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; margin: 8px 0 10px; }
  .rc-field { font-size: 12.5px; font-weight: 700; color: ${NAVY}; white-space: nowrap; }
  .rc-field .line { display: inline-block; min-width: 42mm; border-bottom: 1.5px solid #64748b; height: 15px; vertical-align: bottom; }
  .rc-title { background: ${NAVY}; color: #fff; text-align: center; border-radius: 10px; padding: 6px 34px; font-size: 20px; font-weight: 800; }
  .ack { margin-top: 12px; border: 1.5px solid #b9c7dc; background: #f6f9fd; border-radius: 10px; padding: 9px 12px; font-size: 12.5px; line-height: 1.9; }
  .ack b { color: ${NAVY}; }
  table.sigs { width: 100%; border-collapse: collapse; margin-top: 16px; page-break-inside: avoid; }
  table.sigs td { vertical-align: middle; padding: 0 7px; }
  .sig-box { position: relative; height: 44mm; border: 1.5px solid ${NAVY}; border-radius: 10px; overflow: hidden; }
  .sig-h { background: ${NAVY}; color: #fff; text-align: center; font-weight: 800; font-size: 13px; padding: 5px; }
  .sig-img { display: block; margin: 5mm auto 0; height: 15mm; width: auto; }
  .sig-name { position: absolute; left: 8px; right: 8px; bottom: 6px; font-size: 11.5px; font-weight: 700; color: #0f172a;
              text-align: center; border-top: 1px dashed #94a3b8; padding-top: 4px; line-height: 1.5; }
  .sig-role { font-size: 10px; color: #64748b; font-weight: 500; }
  .stamp { text-align: center; }
  .stamp img { width: 38mm; height: 38mm; transform: rotate(-6deg); }
`;

export function buildContractorReceiptHtml({ contractor, payments, printedOn }) {
  const rows = archiveRows(payments);
  const total = rows.reduce((s, p) => s + (p.amount || 0), 0);
  const words = amountInArabicWords(total);

  const bodyRows = rows.map((p, i) => `
    <tr>
      <td>${nAr(i + 1)}</td>
      <td>${dateAr(p.date)}</td>
      <td class="num">${moneyAr(p.amount)}</td>
      <td>${esc(typeLabel(p.paymentType))}</td>
      <td>${p.paidBy ? esc(p.paidBy) : '<span class="muted">—</span>'}</td>
      <td>${p.paidAt ? dateAr(p.paidAt) : '<span class="muted">—</span>'}</td>
    </tr>`).join('');

  return `
    <div class="rc">
      ${letterheadHtml('')}
      <div class="rc-row">
        <div class="rc-field">التاريخ: ${dateAr(printedOn || todayISO())}</div>
        <div class="rc-title">إيصال نقدية</div>
        <div class="rc-field">رقم الإيصال: <span class="line"></span></div>
      </div>
      <div class="chips">
        <div class="chip">اسم المقاول <b>${esc(contractor.name)}</b></div>
        <div class="chip">القسم <b>${esc(contractor.role)}</b></div>
        <div class="chip">عدد الدفعات <b>${nAr(rows.length)}</b></div>
      </div>
      <table class="t">
        <thead>
          <tr><th>م</th><th>تاريخ الدفعة</th><th>المبلغ</th><th>نوع الصرف</th><th>صُرفت بواسطة</th><th>تاريخ الصرف</th></tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr><td colspan="2" class="r">الإجمالي</td><td class="num">${moneyAr(total)}</td><td colspan="3" class="r" style="font-size:11px">${esc(words)}</td></tr>
        </tfoot>
      </table>
      <div class="ack">
        أقر أنا المقاول / <b>${esc(contractor.name)}</b> بأنني استلمت من ${COMPANY_NAME}
        المبالغ الموضحة بالجدول أعلاه، وإجماليها <b>${moneyAr(total)}</b> (${esc(words)}).
      </div>
      <table class="sigs"><tr>
        <td style="width:36%">
          <div class="sig-box">
            <div class="sig-h">توقيع المقاول</div>
            <div class="sig-name">${esc(contractor.name)}</div>
          </div>
        </td>
        <td style="width:36%">
          <div class="sig-box">
            <div class="sig-h">توقيع المحاسب</div>
            <img class="sig-img" src="${MANAGER_SIGNATURE_DATA_URI}" alt="توقيع المحاسب" />
            <div class="sig-name">${ACCOUNTANT_NAME}<div class="sig-role">المحاسب</div></div>
          </div>
        </td>
        <td class="stamp"><img src="${PDF_STAMP_DATA_URI}" alt="ختم الشركة" /></td>
      </tr></table>
    </div>`;
}

export function printContractorReceipt({ contractor, payments }) {
  return openPrintWindow({
    title: `إيصال-المقاول-${contractor.name}`,
    body: buildContractorReceiptHtml({ contractor, payments }),
    css: RECEIPT_CSS,
  });
}

// ============================================================================
// 3) دليل السكن — لكل شقة: العمارة / المنطقة / رقم الشقة / الغرف + ساكنيها وأرقامهم
// apartments: [{ buildingName, area, apartmentNumber, rooms, notes, occupants: [worker] }]
// ============================================================================
const HOUSING_CSS = `
  .apt { margin-bottom: 11px; page-break-inside: avoid; }
  .apt-h { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; background: #e8eff9; border: 1.5px solid ${NAVY};
           border-bottom: none; border-radius: 8px 8px 0 0; padding: 5px 10px; font-size: 12px; color: #334155; }
  .apt-h b { color: ${NAVY}; font-size: 14px; }
  .apt-note { font-size: 10.5px; color: #64748b; padding: 3px 10px; border: 1px solid #b9c7dc; border-bottom: none; }
`;

export function buildHousingDirectoryHtml({ apartments, filtersText }) {
  const totalWorkers = apartments.reduce((s, a) => s + a.occupants.length, 0);

  const blocks = apartments.map(a => {
    const rows = a.occupants.map((w, i) => `
      <tr>
        <td>${nAr(i + 1)}</td>
        <td class="r"><b>${esc(w.name)}</b> <span class="muted">${esc(w.code)}</span></td>
        <td>${esc(w.role)}</td>
        <td>${phoneCell(w.phone)}</td>
      </tr>`).join('');
    return `
      <section class="apt">
        <div class="apt-h">
          <b>${esc(a.buildingName)}</b>
          ${a.area ? `<span>المنطقة: <strong>${esc(a.area)}</strong></span>` : ''}
          <span>شقة رقم: <strong>${esc(a.apartmentNumber)}</strong></span>
          <span>الغرف: <strong>${nAr(a.rooms)}</strong></span>
          <span>العمال: <strong>${nAr(a.occupants.length)}</strong></span>
        </div>
        ${a.notes ? `<div class="apt-note">${esc(a.notes)}</div>` : ''}
        <table class="t">
          <thead><tr><th style="width:9%">م</th><th class="r">الاسم</th><th style="width:22%">الفئة</th><th style="width:26%">رقم الهاتف</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="muted">لا يوجد عمال في الشقة</td></tr>'}</tbody>
        </table>
      </section>`;
  }).join('');

  return `
    ${letterheadHtml('دليل السكن', `تاريخ الطباعة:<br><b>${dateAr(todayISO())}</b>`)}
    <div class="chips">
      <div class="chip">عدد الشقق <b>${nAr(apartments.length)}</b></div>
      <div class="chip">عدد العمال <b>${nAr(totalWorkers)}</b></div>
      ${filtersText ? `<div class="chip">${esc(filtersText)}</div>` : ''}
    </div>
    ${blocks || '<p class="muted" style="text-align:center;padding:20px">لا توجد شقق</p>'}
    ${footHtml()}`;
}

export function printHousingDirectory({ apartments, filtersText }) {
  return openPrintWindow({
    title: 'دليل-السكن',
    body: buildHousingDirectoryHtml({ apartments, filtersText }),
    css: HOUSING_CSS,
  });
}

// ============================================================================
// 4) دليل الهاتف — أسماء وأرقام العمال
// workers: [{ name, code, role, phone, apartmentLabel }]
// ============================================================================
export function buildPhoneDirectoryHtml({ workers, filtersText }) {
  const withPhone = workers.filter(w => String(w.phone || '').trim()).length;
  const rows = workers.map((w, i) => `
    <tr>
      <td>${nAr(i + 1)}</td>
      <td class="r"><b>${esc(w.name)}</b></td>
      <td>${esc(w.code)}</td>
      <td>${esc(w.role)}</td>
      <td>${phoneCell(w.phone)}</td>
      <td class="r">${w.apartmentLabel ? esc(w.apartmentLabel) : '<span class="muted">—</span>'}</td>
    </tr>`).join('');

  return `
    ${letterheadHtml('دليل الهاتف', `تاريخ الطباعة:<br><b>${dateAr(todayISO())}</b>`)}
    <div class="chips">
      <div class="chip">عدد العمال <b>${nAr(workers.length)}</b></div>
      <div class="chip">عندهم رقم <b>${nAr(withPhone)}</b></div>
      ${filtersText ? `<div class="chip">${esc(filtersText)}</div>` : ''}
    </div>
    <table class="t">
      <thead><tr><th style="width:6%">م</th><th class="r">الاسم</th><th style="width:11%">الكود</th><th style="width:16%">الفئة</th><th style="width:20%">رقم الهاتف</th><th class="r" style="width:22%">السكن</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted">لا يوجد عمال</td></tr>'}</tbody>
    </table>
    ${footHtml()}`;
}

export function printPhoneDirectory({ workers, filtersText }) {
  return openPrintWindow({
    title: 'دليل-الهاتف',
    body: buildPhoneDirectoryHtml({ workers, filtersText }),
  });
}
