-- ============================================================================
--  PHASE 3 · BLOCCO 4 · DEPOT INFRASTRUCTURE
--  Industrial Illusion SARL · Maat OS · Supabase / PostgreSQL 15+
--  Tabella depots + RPC checkin + RPC P2
--  Idempotente.
-- ============================================================================

begin;

-- ─── 1 · Tabella depots ───────────────────────────────────────────────────
create table if not exists public.depots (
  id         uuid primary key default gen_random_uuid(),
  depot_code text unique not null,
  name       text not null,
  cluster    text not null
             check (cluster in ('MED','GUEL','PALM','HIVER','AGDAL','SEM','TARGA')),
  address    text not null,
  gps_lat    numeric(10,7),
  gps_lng    numeric(10,7),
  is_active  boolean default true,
  created_at timestamptz default now()
);

create index if not exists depots_code_idx on public.depots(depot_code);
create index if not exists depots_cluster_idx on public.depots(cluster) where is_active = true;

-- Seed default (Hub principale generico)
insert into public.depots (depot_code, name, cluster, address, is_active)
values ('DEPOT-HUB-01', 'Dépôt Central PurKemet · Hub Principal', 'MED', 'Marrakech Central Hub', true)
on conflict (depot_code) do nothing;

-- ─── 2 · RLS ──────────────────────────────────────────────────────────────
alter table public.depots enable row level security;

drop policy if exists depots_read_all on public.depots;
create policy depots_read_all on public.depots
  for select to authenticated using (true);

drop policy if exists depots_admin_write on public.depots;
create policy depots_admin_write on public.depots
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── 3 · RPC · checkin_depot_station ──────────────────────────────────────
-- Input: QR depot scansionato dalla PWA (es. 'DEPOT-MED-01')
-- Output: JSON { depot_id, depot_name, depot_code, cluster, bags: [...] }
-- Effetto: valida depot attivo, restituisce sacchi IN_TRANSIT dell'autista
create or replace function public.checkin_depot_station(p_depot_qr text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_depot   public.depots;
  v_bags    jsonb;
  v_caller  uuid;
begin
  -- Bypass SQL Editor
  if current_user in ('postgres','service_role') then
    v_caller := auth.uid();
  elsif auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  else
    v_caller := auth.uid();
  end if;

  if p_depot_qr is null or length(trim(p_depot_qr)) < 5 then
    raise exception 'INVALID_DEPOT_QR' using errcode = '22023';
  end if;

  select * into v_depot from public.depots
   where depot_code = trim(p_depot_qr) and is_active = true;

  if v_depot.id is null then
    raise exception 'DEPOT_NOT_FOUND_OR_INACTIVE: %', p_depot_qr
      using errcode = 'P0001';
  end if;

  -- Sacchi IN_TRANSIT dell'autista chiamante (o tutti se admin in SQL Editor)
  select jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'bag_qr_id', c.bag_qr_id,
      'material_type', c.material_type,
      'weight_collect_kg', c.weight_collect_kg,
      'client_id', c.client_id,
      'created_at', c.created_at
    ) order by c.created_at
  )
  into v_bags
  from public.collections c
  where c.status = 'IN_TRANSIT'
    and (v_caller is null or c.operator_id = v_caller);

  return jsonb_build_object(
    'depot_id', v_depot.id,
    'depot_code', v_depot.depot_code,
    'depot_name', v_depot.name,
    'cluster', v_depot.cluster,
    'address', v_depot.address,
    'bags', coalesce(v_bags, '[]'::jsonb),
    'bag_count', coalesce(jsonb_array_length(v_bags), 0)
  );
end $$;

-- ─── 4 · RPC · register_depot_weighing_p2 ─────────────────────────────────
-- Input: QR sacco + peso P2 + QR depot (per audit geografico)
-- Effetto: aggiorna weight_depot_kg, deposito_id, deposit_time; il trigger
--          fn_collections_delta_guard calcola Δ e transiziona ad ANCHORED
--          (se Δ≤3%) o DISCREPANCY (se Δ>3%). Atomic.
create or replace function public.register_depot_weighing_p2(
  p_bag_qr_id   text,
  p_depot_qr    text,
  p_weight_p2   numeric
)
returns public.collections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     public.collections;
  v_depot   public.depots;
  v_caller  uuid;
begin
  if current_user in ('postgres','service_role') then
    v_caller := auth.uid();
  elsif auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  else
    v_caller := auth.uid();
  end if;

  if p_weight_p2 is null or p_weight_p2 <= 0 or p_weight_p2 > 100000 then
    raise exception 'INVALID_WEIGHT_P2: % (deve essere 0 < kg ≤ 100000)', p_weight_p2
      using errcode = '22023';
  end if;

  -- Verifica depot attivo
  select * into v_depot from public.depots
   where depot_code = trim(p_depot_qr) and is_active = true;
  if v_depot.id is null then
    raise exception 'DEPOT_NOT_FOUND_OR_INACTIVE: %', p_depot_qr using errcode = 'P0001';
  end if;

  -- Lock sacco
  select * into v_row from public.collections
   where bag_qr_id = trim(p_bag_qr_id) for update;

  if v_row.id is null then
    raise exception 'BAG_NOT_FOUND: %', p_bag_qr_id using errcode = 'P0001';
  end if;
  if v_row.status not in ('IN_TRANSIT', 'DISCREPANCY') then
    raise exception 'BAG_NOT_IN_TRANSIT: % (stato %)', p_bag_qr_id, v_row.status
      using errcode = 'P0001';
  end if;
  if v_row.weight_depot_kg is not null then
    raise exception 'BAG_ALREADY_WEIGHED_P2: %', p_bag_qr_id using errcode = 'P0001';
  end if;
  -- Sicurezza: l'autista può pesare solo i propri sacchi (admin bypass)
  if v_caller is not null and v_row.operator_id is not null
     and v_row.operator_id <> v_caller and not public.is_admin() then
    raise exception 'FORBIDDEN: sacco % non assegnato a questo operatore', p_bag_qr_id
      using errcode = '42501';
  end if;

  -- Update: il trigger si occupa della transizione di stato
  update public.collections
     set weight_depot_kg = p_weight_p2,
         deposit_time    = now()
   where id = v_row.id
  returning * into v_row;

  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (v_caller, 'register_depot_weighing_p2', 'collections', v_row.id::text,
          jsonb_build_object('bag_qr_id', p_bag_qr_id,
                             'depot_code', p_depot_qr,
                             'p2_kg', p_weight_p2,
                             'status_after', v_row.status));

  return v_row;
end $$;

-- ─── 5 · Grant ────────────────────────────────────────────────────────────
revoke all on function public.checkin_depot_station(text) from public, anon;
revoke all on function public.register_depot_weighing_p2(text, text, numeric) from public, anon;
grant execute on function public.checkin_depot_station(text) to authenticated;
grant execute on function public.register_depot_weighing_p2(text, text, numeric) to authenticated;

commit;
