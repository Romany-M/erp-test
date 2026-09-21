// أدوات أرقام الهاتف (أرقام مصرية غالبًا: 01xxxxxxxxx)

// أرقام فقط (مع الإبقاء على + في الأول لو موجودة)
export function cleanPhone(phone) {
  const s = String(phone || '').trim();
  if (!s) return '';
  const plus = s.startsWith('+') ? '+' : '';
  return plus + s.replace(/[^0-9]/g, '');
}

// للاتصال المباشر tel:
export function telHref(phone) {
  const p = cleanPhone(phone);
  return p ? `tel:${p}` : '';
}

// رقم دولي بدون + (للواتساب): 01012345678 -> 201012345678
export function internationalDigits(phone) {
  let p = cleanPhone(phone).replace(/^\+/, '');
  if (!p) return '';
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('20') && p.length >= 12) return p;
  if (p.startsWith('0')) return '20' + p.slice(1);
  if (p.length === 10 && p.startsWith('1')) return '20' + p;
  return p;
}

export function whatsappHref(phone) {
  const d = internationalDigits(phone);
  return d ? `https://wa.me/${d}` : '';
}
