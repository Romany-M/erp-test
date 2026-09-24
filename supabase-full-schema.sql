-- ==========================================================================
-- المناهري ERP — قاعدة البيانات كاملة (الحضور والغياب + الحضور بالـ QR + القبض + باقي الجداول)
--
-- للاستخدام في مشروع Supabase "جديد وفاضي".
-- شغّله في: Supabase → SQL Editor → New query → الصق الملف كله → Run
--
-- ملاحظات:
--  * كله بـ "if not exists" فمش هيمسح ولا يبوّظ أي بيانات موجودة، لكن كمان
--    مش هيعدّل جدول موجود. لو عندك مشروع شغال بالفعل (ojslgytkohbcjncddkoj)
--    مش محتاج الملف ده — كفاية supabase-housing-migration.sql.
--  * الجداول متعمّلة من الأعمدة اللي الكود بيقراها ويكتبها (src/context/AppContext.jsx).
--  * حساب الحضور/القبض نفسه (المستحق) بيتحسب في الكود (src/domain/payroll.js)،
--    والداتابيز بتخزّن السجلات الخام بس: attendance + advances + transfers +
--    pillars + payments.
-- ==========================================================================

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- 1) السكن (لازم قبل workers لأن workers بيشاور عليه)
-- --------------------------------------------------------------------------
create table if not exists public.housing_apartments (
  id               uuid primary key default gen_random_uuid(),
  building_name    text not null,
  area             text not null default '',
  apartment_number text not null,
  rooms            integer not null default 1 check (rooms >= 1),
  notes            text not null default '',
  created_at       timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 2) العمال
-- --------------------------------------------------------------------------
create table if not exists public.workers (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                 -- W0001, W0002 ...
  name          text not null,
  role          text not null default 'بدون فئة',
  daily_wage    numeric(12,2),                        -- null = عامل تحت التجربة
  status        text not null default 'active' check (status in ('active', 'inactive')),
  phone         text not null default '',
  notes         text not null default '',
  wallet_number text,
  wallet_name   text,
  apartment_id  uuid references public.housing_apartments(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists workers_apartment_id_idx on public.workers(apartment_id);

-- --------------------------------------------------------------------------
-- 3) الحضور والغياب (سجل واحد لكل عامل في اليوم)
-- --------------------------------------------------------------------------
create table if not exists public.attendance (
  id                uuid primary key default gen_random_uuid(),
  worker_id         uuid not null references public.workers(id) on delete cascade,
  worker_name       text,
  worker_code       text,
  role              text,
  date              date not null,
  status            text not null default 'absent' check (status in ('present', 'absent')),
  overtime_fraction text not null default '',         -- 0.25 / 0.5 / 1 ... أو فاضي
  overtime_value    numeric(12,2) not null default 0,
  pillar_cost       numeric(12,2) not null default 0, -- قيمة شغل الأعمدة في اليوم ده
  deduction         numeric(12,2) not null default 0, -- خصم
  created_at        timestamptz not null default now(),
  constraint attendance_worker_date_key unique (worker_id, date)  -- الكود بيعمل upsert عليها
);
create index if not exists attendance_date_idx on public.attendance(date);

-- --------------------------------------------------------------------------
-- 4) الحضور بالـ QR
-- --------------------------------------------------------------------------
create table if not exists public.qr_codes (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null unique references public.workers(id) on delete cascade,
  employee_id text not null unique,                   -- EMP0001 ...
  created_at  timestamptz not null default now()
);

create table if not exists public.qr_attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id text not null,
  worker_id   uuid references public.workers(id) on delete cascade,
  worker_name text,
  worker_role text,
  date        date not null,
  time_in     text not null default '-',
  status      text not null default 'present' check (status in ('present', 'absent')),
  created_by  text,
  created_at  timestamptz not null default now(),
  constraint qr_attendance_employee_date_key unique (employee_id, date)  -- تكرار المسح = 23505
);
create index if not exists qr_attendance_date_idx on public.qr_attendance(date);

-- --------------------------------------------------------------------------
-- 5) السلف / العهد / التحويلات (بتتخصم من مستحق العامل)
-- --------------------------------------------------------------------------
create table if not exists public.advances (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references public.workers(id) on delete cascade,
  date         date not null,
  amount       numeric(12,2) not null default 0,
  payment_type text not null default 'cash',          -- cash / insta / wallet
  notes        text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists advances_worker_date_idx on public.advances(worker_id, date);

create table if not exists public.custody (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid references public.workers(id) on delete cascade,
  date         date not null,
  amount       numeric(12,2) not null default 0,
  payment_type text not null default 'cash',
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

create table if not exists public.transfers (
  id             uuid primary key default gen_random_uuid(),
  worker_id      uuid references public.workers(id) on delete cascade,
  date           date not null,
  time           text,
  phone          text,
  amount         numeric(12,2) not null default 0,
  transaction_id text,
  wallet_name    text,
  notes          text not null default '',
  payment_type   text not null default 'cash',
  created_at     timestamptz not null default now()
);
create index if not exists transfers_worker_date_idx on public.transfers(worker_id, date);

create table if not exists public.external_transfers (
  id             uuid primary key default gen_random_uuid(),
  date           date not null,
  recipient      text,
  phone          text,
  amount         numeric(12,2) not null default 0,
  transaction_id text,
  wallet_name    text,
  notes          text not null default '',
  payment_type   text not null default 'cash',
  created_at     timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 6) المناطق والمباني والأعمدة (شغل بالقطعة)
-- --------------------------------------------------------------------------
create table if not exists public.plots (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pillar_buildings (
  id         uuid primary key default gen_random_uuid(),
  plot_id    uuid references public.plots(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pillars (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid references public.workers(id) on delete cascade,
  building_id  uuid references public.pillar_buildings(id) on delete set null,
  date         date not null,
  stage        text not null default 'columns',       -- labsha / roof / columns
  cost         numeric(12,2) not null default 0,
  supervisor   text,
  notes        text not null default '',
  payment_type text not null default 'cash',
  created_at   timestamptz not null default now()
);
create index if not exists pillars_worker_date_idx on public.pillars(worker_id, date);

-- --------------------------------------------------------------------------
-- 7) القبض (صرف المرتبات) — كل صرف = سجل، والمدى (من/إلى) هو اللي بيحدد اللي اتدفع
--    الكود بيعتبر كل الأيام لحد آخر date_to متدفوعة. date_to ممكن يبقى 'النهاية'
--    و date_from ممكن يبقى 'البداية' ولذلك الاتنين text مش date.
-- --------------------------------------------------------------------------
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references public.workers(id) on delete cascade,
  worker_name  text,
  amount       numeric(12,2) not null default 0,
  payment_type text not null default 'cash',
  date_from    text,
  date_to      text,
  date         timestamptz not null default now()
);
create index if not exists payments_worker_idx on public.payments(worker_id);

-- آخر مدى تواريخ كان مختار في صفحة القبض (صف واحد بس)
create table if not exists public.payroll_range (
  id        boolean primary key default true check (id),
  date_from date,
  date_to   date
);
insert into public.payroll_range (id) values (true) on conflict (id) do nothing;

-- --------------------------------------------------------------------------
-- 8) المصروفات والمشتريات والميزانية
-- --------------------------------------------------------------------------
create table if not exists public.food_expenses (      -- صفحة "المصروفات"
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  supplier     text not null,
  category     text default 'أخرى',                   -- أجل / نقل / شحن كهرباء / أنبوبة غاز ...
  total_amount numeric(12,2) not null default 0,
  payment_type text not null default 'cash',
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

create table if not exists public.purchases (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  item         text not null,
  supplier     text not null default '',
  amount       numeric(12,2) not null default 0,
  payment_type text not null default 'cash',
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

create table if not exists public.budgets (
  type       text primary key check (type in ('cash', 'insta')),
  amount     numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.budgets (type, amount) values ('cash', 0), ('insta', 0)
  on conflict (type) do nothing;

create table if not exists public.weekly_budgets (     -- ميزانية كل أسبوع (سبت→جمعة)
  id         uuid primary key default gen_random_uuid(),
  week_start date not null,                            -- تاريخ السبت اللي بيبدأ بيه الأسبوع
  type       text not null check (type in ('cash', 'insta')),
  amount     numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint weekly_budgets_week_type_key unique (week_start, type)  -- الكود بيعمل upsert عليها
);

create table if not exists public.budget_history (
  id     uuid primary key default gen_random_uuid(),
  type   text not null,
  amount numeric(14,2) not null default 0,
  action text not null default 'set',
  date   timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 9) المقاولين
-- --------------------------------------------------------------------------
create table if not exists public.contractors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.contractor_payments (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  date          date not null,
  amount        numeric(12,2) not null default 0,
  payment_type  text not null default 'cash',
  paid_by       text not null default '',
  paid          boolean not null default false,
  paid_at       date,
  created_at    timestamptz not null default now()
);
create index if not exists contractor_payments_contractor_idx on public.contractor_payments(contractor_id);

-- --------------------------------------------------------------------------
-- 10) ترقيم إيصالات المقاولين (رقم الإيصال يتولّد لوحده ومايتكررش)
--    كل ضغطة على "طباعة إيصال" بتاخد رقم جديد تلقائي من الترقيم ده وتتسجّل هنا.
-- --------------------------------------------------------------------------
create sequence if not exists public.contractor_receipt_number_seq start 1;

create table if not exists public.contractor_receipts (
  id             uuid primary key default gen_random_uuid(),
  receipt_number bigint not null default nextval('public.contractor_receipt_number_seq') unique,
  contractor_id  uuid references public.contractors(id) on delete set null,
  contractor_name text not null,
  total_amount   numeric(12,2) not null default 0,  -- مبلغ الإيصال ده بس (الدفعات الجديدة)، مش إجمالي تاريخي
  payments_count integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists contractor_receipts_contractor_idx on public.contractor_receipts(contractor_id);

-- ربط كل دفعة بالإيصال اللي اتوثّقت فيه، عشان كل دفعة تدخل في إيصال واحد بس ومايتكررش
-- توثيقها في إيصال تاني. الدفعة اللي receipt_id بتاعها فاضي = لسه ما اتطبعلهاش إيصال.
alter table public.contractor_payments
  add column if not exists receipt_id uuid references public.contractor_receipts(id) on delete set null;
create index if not exists contractor_payments_receipt_idx on public.contractor_payments(receipt_id);


-- ==========================================================================
-- الأمان (Row Level Security)
--   * المستخدم العادي (الأدمن/المحاسب): صلاحية كاملة على كل الجداول.
--   * حساب الـ QR (role = 'qr_only' — المهندس/التايم كيبر): يقرا العمال وأكواد
--     الـ QR، ويسجّل/يعدّل الحضور بس. مفيش سلف ولا قبض ولا مصروفات.
--   * ولا يوجد أي وصول بدون تسجيل دخول.
-- ==========================================================================
create or replace function public.is_qr_only()
returns boolean
language sql
stable
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata'  ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  ) = 'qr_only'
$$;

do $$
declare
  t text;
  all_tables text[] := array[
    'housing_apartments', 'workers', 'attendance', 'qr_codes', 'qr_attendance',
    'advances', 'custody', 'transfers', 'external_transfers',
    'plots', 'pillar_buildings', 'pillars',
    'payments', 'payroll_range',
    'food_expenses', 'purchases', 'budgets', 'weekly_budgets', 'budget_history',
    'contractors', 'contractor_payments', 'contractor_receipts'
  ];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format(
      'create policy staff_all on public.%I for all to authenticated
         using (not public.is_qr_only()) with check (not public.is_qr_only())', t);
  end loop;
end $$;

-- صلاحيات حساب الـ QR
drop policy if exists qr_only_read on public.workers;
create policy qr_only_read on public.workers
  for select to authenticated using (public.is_qr_only());

drop policy if exists qr_only_read on public.qr_codes;
create policy qr_only_read on public.qr_codes
  for select to authenticated using (public.is_qr_only());

-- المسح بيسجّل في qr_attendance وكمان بينسخ الحضور في attendance
drop policy if exists qr_only_select on public.attendance;
create policy qr_only_select on public.attendance
  for select to authenticated using (public.is_qr_only());
drop policy if exists qr_only_insert on public.attendance;
create policy qr_only_insert on public.attendance
  for insert to authenticated with check (public.is_qr_only());
drop policy if exists qr_only_update on public.attendance;
create policy qr_only_update on public.attendance
  for update to authenticated using (public.is_qr_only()) with check (public.is_qr_only());

drop policy if exists qr_only_select on public.qr_attendance;
create policy qr_only_select on public.qr_attendance
  for select to authenticated using (public.is_qr_only());
drop policy if exists qr_only_insert on public.qr_attendance;
create policy qr_only_insert on public.qr_attendance
  for insert to authenticated with check (public.is_qr_only());
drop policy if exists qr_only_update on public.qr_attendance;
create policy qr_only_update on public.qr_attendance
  for update to authenticated using (public.is_qr_only()) with check (public.is_qr_only());

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on public.contractor_receipt_number_seq to authenticated;

-- ==========================================================================
-- (اختياري) حساب المهندس/التايم كيبر (QR فقط)
-- 1) Supabase → Authentication → Users → Add user → Create new user
--    الإيميل: timekeeper@login.almanahri.internal   (+ فعّل Auto Confirm User)
--    وفي شاشة الدخول بيكتب "timekeeper" بس.
-- 2) بعدين شغّل السطرين دول (بيحددوا إنه حساب QR فقط، ومحدّد في app_metadata
--    كمان عشان المستخدم ميقدرش يشيل القيد بنفسه):
--
-- update auth.users
--    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"qr_only"}'::jsonb,
--        raw_app_meta_data  = coalesce(raw_app_meta_data,  '{}'::jsonb) || '{"role":"qr_only"}'::jsonb
--  where email = 'timekeeper@login.almanahri.internal';
-- ==========================================================================
