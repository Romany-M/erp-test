-- ============================================================
-- تحديث قاعدة البيانات: "أماكن العمل" (بدل المناطق/المباني المنفصلة)
-- شغّله مرة واحدة في Supabase → SQL Editor → New query → Run
-- (آمن لو اتشغّل أكتر من مرة)
-- شغّله "قبل" ما ترفع النسخة الجديدة من الموقع.
--
-- ملحوظة: ده منفصل تمامًا عن جدولي plots / pillar_buildings (بتوع صفحة
-- "الأعمدة" وشغل القطعة) — مش بنلمسهم، وده جدول جديد مخصوص للعمال والحضور.
-- ============================================================

-- 1) جدول أماكن العمل: جدول واحد بمستويات، بدل منطقة + مبنى منفصلين.
--    parent_id فاضي = مكان من المستوى الأول (منطقة/مشروع). parent_id
--    معبّى = مكان تحت مكان تاني (مبنى/فيلا جوه المنطقة). لو احتجت مستوى
--    تالت الأول، مفيش تعديل في الجدول - بس تحط parent_id لمكان مستواه تاني.
create table if not exists public.work_locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  parent_id  uuid references public.work_locations(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists work_locations_parent_id_idx on public.work_locations(parent_id);

alter table public.work_locations enable row level security;
drop policy if exists "work_locations_authenticated_all" on public.work_locations;
create policy "work_locations_authenticated_all"
  on public.work_locations
  for all
  to authenticated
  using      (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'qr_only')
  with check (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'qr_only');

grant select, insert, update, delete on public.work_locations to authenticated;

-- 2) مكان العامل الحالي. فاضي = "بدون تحديد" (سواق / مشرف / عمالة متحركة) -
--    مش صف وهمي في الجدول، قيمة NULL حقيقية، فتسجيل العامل ما بيتعطلش.
alter table public.workers
  add column if not exists location_id uuid
  references public.work_locations(id) on delete set null;
create index if not exists workers_location_id_idx on public.workers(location_id);

-- 2ب) نقل مجدول (تاريخ سريان في المستقبل). لو النقل من "النهارده" منعملوش
--     استخدام لهم أصلًا - location_id بيتغيّر على طول. لو من تاريخ لاحق،
--     المكان الجاي بيتخزن هنا وبيتفعّل تلقائي أول ما حد يفتح النظام في يوم
--     السريان أو بعده (مفيش وظيفة مجدولة على السيرفر، فالتفعيل بيحصل عند
--     تحميل البيانات - انظر applyDuePendingTransfers في AppContext.jsx).
alter table public.workers
  add column if not exists pending_location_id uuid
  references public.work_locations(id) on delete set null,
  add column if not exists pending_location_date date;

-- 3) ختم كل سجل حضور بمكان العامل وقت تسجيله. ده أهم عمود في التحديث ده:
--    لو نقلت العامل من فيلا 12 لمبنى A، أيامه اللي فاتت تفضل على فيلا 12
--    وتقارير التكلفة لكل مكان تفضل صح. الكود بيملاها مرة واحدة بس وقت
--    إنشاء السجل (withLocation في AppContext.jsx) ومش بيغيّرها بعد كده.
alter table public.attendance
  add column if not exists location_id uuid
  references public.work_locations(id) on delete set null;
create index if not exists attendance_location_id_idx on public.attendance(location_id);
