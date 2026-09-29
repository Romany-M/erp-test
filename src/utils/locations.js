// أماكن العمل: جدول واحد work_locations بعمود parent_id. المكان ممكن يبقى
// مستوى أول (منطقة/مشروع) أو مستوى تاني (مبنى/فيلا) تحت مكان تاني، والعامل
// بياخد location_id واحد بس - ممكن يبقى فاضي (بدون تحديد)، مش صف وهمي في
// الجدول. لو احتجت مستوى تالت بعدين، الكود هنا بيمشي عادي من غير تعديل
// لأنه بيمشي على السلسلة (parent_id) مهما طالت.

// قيمة في الـ <select> تعني "بدون تحديد" (location_id = null فعليًا).
export const LOC_NONE = '__none__';

function byId(locations) {
  const map = new Map();
  (locations || []).forEach(l => map.set(l.id, l));
  return map;
}

// "الساحل — فيلا 12": بيطلع من الأب للابن تلقائي مهما كان عدد المستويات.
// بتقبل إما عامل (وبتاخد locationId منه) أو location_id مباشر.
export function locationLabel(workerOrId, locations) {
  const id = workerOrId && typeof workerOrId === 'object' ? workerOrId.locationId : workerOrId;
  if (!id) return '';
  const map = byId(locations);
  const chain = [];
  let cur = map.get(id);
  let guard = 0;
  while (cur && guard++ < 10) {
    chain.unshift(cur.name);
    cur = cur.parentId ? map.get(cur.parentId) : null;
  }
  return chain.join(' — ');
}

// كل الأبناء (على أي عمق) لمكان معيّن - عشان فلترة "كل المنطقة".
function descendantIds(locationId, locations) {
  const ids = new Set();
  const stack = [locationId];
  while (stack.length) {
    const id = stack.pop();
    (locations || []).forEach(l => {
      if (l.parentId === id && !ids.has(l.id)) {
        ids.add(l.id);
        stack.push(l.id);
      }
    });
  }
  return ids;
}

// قائمة مسطّحة جاهزة لـ <select>: كل مكان من المستوى الأول يتبعه أبناءه
// بترتيب هجائي، بمسافة بادئة في التسمية. hasChildren بتفرق بين اختيار
// "المكان ده بالظبط" واختيار "المكان ده وكل اللي تحته".
export function locationOptions(locations) {
  const list = locations || [];
  const roots = list.filter(l => !l.parentId).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const childrenOf = (id) => list.filter(l => l.parentId === id).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const out = [];
  roots.forEach(root => {
    const kids = childrenOf(root.id);
    out.push({ value: root.id, label: root.name, depth: 0, hasChildren: kids.length > 0 });
    kids.forEach(k => out.push({ value: k.id, label: `${root.name} — ${k.name}`, depth: 1, hasChildren: false }));
  });
  return out;
}

// هل العامل واقع تحت المكان ده؟ لو المكان أب (زي "الساحل")، بتشمل كل
// أبناءه (فلترة "كل المنطقة") مش بس اللي معينين عليه هو بالظبط.
export function matchesLocation(worker, value, locations) {
  if (!value) return true;
  if (value === LOC_NONE) return !worker.locationId;
  if (worker.locationId === value) return true;
  return descendantIds(value, locations).has(worker.locationId);
}

// تجهيز قيمة الـ select لإرسالها لـ assignWorkersToLocation: بدون تحديد = null.
export function parseLocation(value) {
  return value === LOC_NONE ? null : (value || null);
}
