-- ============================================================
-- تحديث قاعدة البيانات: ميزانية كل أسبوع
-- شغّله مرة واحدة في Supabase → SQL Editor → New query → Run
-- (آمن لو اتشغّل أكتر من مرة)
-- شغّله "قبل" ما ترفع النسخة الجديدة من الموقع.
-- ============================================================

create table if not exists public.weekly_budgets (
  id         uuid primary key default gen_random_uuid(),
  week_start date not null,                 -- تاريخ السبت اللي بيبدأ بيه الأسبوع
  type       text not null check (type in ('cash', 'insta')),
  amount     numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint weekly_budgets_week_type_key unique (week_start, type)
);

alter table public.weekly_budgets enable row level security;

-- نفس فكرة باقي الجداول: مسجّلين الدخول بس، ومع استثناء حساب الـ QR (qr_only)
drop policy if exists "weekly_budgets_authenticated_all" on public.weekly_budgets;
create policy "weekly_budgets_authenticated_all"
  on public.weekly_budgets
  for all
  to authenticated
  using      (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'qr_only')
  with check (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'qr_only');

grant select, insert, update, delete on public.weekly_budgets to authenticated;
