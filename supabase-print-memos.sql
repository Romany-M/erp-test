-- ============================================================
-- مذكرات قسم "طباعة" - مذكرات نصية محفوظة تقدر ترجعلها وتطبعها وقت ما تحب.
-- شغّله مرة واحدة في Supabase → SQL Editor → New query → Run (آمن لو اتكرر)
-- ============================================================

create table if not exists public.print_memos (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',
  content    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists print_memos_updated_at_idx on public.print_memos(updated_at desc);

alter table public.print_memos enable row level security;
drop policy if exists "print_memos_authenticated_all" on public.print_memos;
create policy "print_memos_authenticated_all"
  on public.print_memos
  for all
  to authenticated
  using      (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'qr_only')
  with check (coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'qr_only');

grant select, insert, update, delete on public.print_memos to authenticated;
