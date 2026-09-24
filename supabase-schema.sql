-- شغّل هذا الملف مرة واحدة داخل Supabase: SQL Editor -> New query -> الصق والصق ثم Run

create table if not exists users (
  id text primary key,
  username text not null unique,
  created_at bigint not null,
  data jsonb not null
);

create table if not exists audit_log (
  id text primary key,
  timestamp bigint not null,
  data jsonb not null
);
create index if not exists audit_log_timestamp_idx on audit_log (timestamp desc);

create table if not exists scans (
  id text primary key,
  timestamp bigint not null,
  data jsonb not null
);
create index if not exists scans_timestamp_idx on scans (timestamp desc);

create table if not exists vulnerabilities (
  id text primary key,
  data jsonb not null
);

-- ملاحظة أمنية: هذا تطبيق تجريبي (demo) يستخدم مفتاح anon العام مباشرة من
-- المتصفح، لذلك سياسات RLS هنا مفتوحة (قراءة/كتابة للجميع) لتسهيل التشغيل.
-- لا تستخدم هذا الإعداد لبيانات حقيقية أو حسّاسة بدون إضافة مصادقة حقيقية
-- (Supabase Auth) وسياسات RLS مبنية على auth.uid().

alter table users enable row level security;
alter table audit_log enable row level security;
alter table scans enable row level security;
alter table vulnerabilities enable row level security;

create policy "public read/write - users" on users
  for all using (true) with check (true);
create policy "public read/write - audit_log" on audit_log
  for all using (true) with check (true);
create policy "public read/write - scans" on scans
  for all using (true) with check (true);
create policy "public read/write - vulnerabilities" on vulnerabilities
  for all using (true) with check (true);
