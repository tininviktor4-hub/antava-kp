create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('proposal', 'letter')),
  document_number text not null default '',
  document_date date,
  customer text not null default '',
  executor_name text not null default '',
  grand_total numeric(14, 2) not null default 0,
  item_count integer not null default 0,
  document_state jsonb not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipients (
  id uuid primary key default gen_random_uuid(),
  customer text not null default '',
  position text not null default '',
  recipient_name text not null default '',
  address text not null default '',
  normalized_key text not null unique,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;
alter table public.recipients enable row level security;

drop policy if exists "authenticated staff can read documents" on public.documents;
create policy "authenticated staff can read documents"
on public.documents for select to authenticated using (true);

drop policy if exists "authenticated staff can create documents" on public.documents;
create policy "authenticated staff can create documents"
on public.documents for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "authenticated staff can update documents" on public.documents;
create policy "authenticated staff can update documents"
on public.documents for update to authenticated using (true) with check (true);

drop policy if exists "authenticated staff can delete documents" on public.documents;
create policy "authenticated staff can delete documents"
on public.documents for delete to authenticated using (true);

drop policy if exists "authenticated staff can read recipients" on public.recipients;
create policy "authenticated staff can read recipients"
on public.recipients for select to authenticated using (true);

drop policy if exists "authenticated staff can create recipients" on public.recipients;
create policy "authenticated staff can create recipients"
on public.recipients for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "authenticated staff can update recipients" on public.recipients;
create policy "authenticated staff can update recipients"
on public.recipients for update to authenticated using (true) with check (true);

drop policy if exists "authenticated staff can delete recipients" on public.recipients;
create policy "authenticated staff can delete recipients"
on public.recipients for delete to authenticated using (true);

create index if not exists documents_created_at_idx on public.documents (created_at desc);
create index if not exists documents_customer_idx on public.documents (customer);
create index if not exists recipients_customer_idx on public.recipients (customer);
