-- ============================================================
-- تذكيرات وتنبيهات - تذكيرات يدوية تضيفها إنت (مرة واحدة بتاريخ، أو يومية).
-- شغّله مرة واحدة في Supabase → SQL Editor → New query → Run (آمن لو اتكرر)
-- التنبيهات التلقائية (سلف، صافي بالسالب) محسوبة من بيانات موجودة فعلاً
-- (workers/attendance/advances) ومش محتاجة جدول جديد.
-- ============================================================

create table if not exists public.reminders (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  kind       text not null default 'once',   -- 'once' | 'daily'
  due_date   date,                             -- للنوع 'once' بس
  done       boolean not null default false,   -- تم نهائيًا (للنوع 'once')
  done_date  date,                              -- آخر يوم اتعلّم فيه "تم" (للنوع 'daily')
  created_at timestamptz not null default now()
);
create index if not exists reminders_kind_idx on public.reminders(kind);

alter table public.reminders enable row level security;
drop policy if exists "reminders_authenticated_all" on public.reminders;
create policy "reminders_authenticated_all"
  on public.reminders
  for all
  to authenticated
  using      (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'qr_only')
  with check (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'qr_only');

grant select, insert, update, delete on public.reminders to authenticated;
