-- ============================================================
-- تحديث قاعدة البيانات: قسم السكن + تصنيف المصروفات
-- شغّله مرة واحدة في Supabase → SQL Editor → New query → Run
-- (آمن لو اتشغّل أكتر من مرة)
-- شغّله "قبل" ما ترفع النسخة الجديدة من الموقع.
-- ============================================================

-- 1) جدول الشقق
create table if not exists public.housing_apartments (
  id               uuid primary key default gen_random_uuid(),
  building_name    text not null,
  area             text not null default '',
  apartment_number text not null,
  rooms            integer not null default 1 check (rooms >= 1),
  notes            text not null default '',
  created_at       timestamptz not null default now()
);

alter table public.housing_apartments enable row level security;

-- نفس فكرة باقي الجداول: مسجّلين الدخول بس، ومع استثناء حساب الـ QR (qr_only)
drop policy if exists "housing_apartments_authenticated_all" on public.housing_apartments;
create policy "housing_apartments_authenticated_all"
  on public.housing_apartments
  for all
  to authenticated
  using      (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'qr_only')
  with check (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'qr_only');

-- 2) ربط العامل بالشقة (العامل في شقة واحدة بس. لو الشقة اتحذفت العامل بيتفك منها ومش بيتحذف)
alter table public.workers
  add column if not exists apartment_id uuid
  references public.housing_apartments(id) on delete set null;

create index if not exists workers_apartment_id_idx on public.workers(apartment_id);

-- 3) تصنيف المصروف (شحن كهرباء / أنبوبة غاز / ...)
--    كان بيتعرض في الشاشة بس ومكانش بيتحفظ في الداتابيز.
alter table public.food_expenses
  add column if not exists category text default 'أخرى';
