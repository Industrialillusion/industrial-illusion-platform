begin;

create table if not exists public.kmeh20_access_requests (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  entity_name     text not null,
  email           text not null,
  phone           text,
  investor_type   text check (investor_type in (
    'SERIES_A','INFRASTRUCTURE_FUND','INDUSTRIAL_PARTNER',
    'MUNICIPALITY','RESEARCH','OTHER')),
  motivation      text not null,
  nda_accepted    boolean not null default false,
  status          text not null default 'PENDING'
                  check (status in ('PENDING','APPROVED','REJECTED')),
  access_token    text,
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  created_at      timestamptz default now()
);

create index if not exists kmeh20_access_status_idx
  on public.kmeh20_access_requests (status, created_at desc);

alter table public.kmeh20_access_requests enable row level security;

drop policy if exists kmeh20_insert_public on public.kmeh20_access_requests;
create policy kmeh20_insert_public on public.kmeh20_access_requests
  for insert to anon, authenticated with check (true);

drop policy if exists kmeh20_select_admin on public.kmeh20_access_requests;
create policy kmeh20_select_admin on public.kmeh20_access_requests
  for select to authenticated using (public.is_admin());

drop policy if exists kmeh20_update_admin on public.kmeh20_access_requests;
create policy kmeh20_update_admin on public.kmeh20_access_requests
  for update to authenticated using (public.is_admin());

commit;
