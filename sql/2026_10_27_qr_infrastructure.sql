-- ============================================================================
--  PHASE 3 · QR INFRASTRUCTURE · Blocco 1
--  Industrial Illusion SARL · Maat OS · Supabase / PostgreSQL 15+
--  RPC: assign_bag_to_client + validate_and_claim_bag
--  Idempotente.
-- ============================================================================

begin;

-- ─── 1 · RPC · assign_bag_to_client ────────────────────────────────────────
-- Crea un sacco "vuoto" assegnato a un cliente (pre-pesata).
-- Chiamabile solo da admin/direction.
create or replace function public.assign_bag_to_client(
  p_bag_qr_id     text,
  p_client_id     uuid default null,
  p_material_type text default 'PET'
)
returns public.collections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.collections;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN: solo admin/direction può assegnare sacchi'
      using errcode = '42501';
  end if;

  if p_bag_qr_id is null or length(trim(p_bag_qr_id)) < 5 then
    raise exception 'INVALID_QR_ID: minimo 5 caratteri'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.collections where bag_qr_id = p_bag_qr_id) then
    raise exception 'QR_ALREADY_EXISTS: % già presente nel sistema', p_bag_qr_id
      using errcode = '23505';
  end if;

  insert into public.collections (bag_qr_id, client_id, material_type, status)
  values (p_bag_qr_id, p_client_id, p_material_type, null)
  returning * into v_row;

  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'assign_bag_to_client', 'collections', v_row.id::text,
          jsonb_build_object('qr_code', p_bag_qr_id,
                             'client_id', p_client_id,
                             'material', p_material_type));

  return v_row;
end $$;

-- ─── 2 · RPC · validate_and_claim_bag ──────────────────────────────────────
-- L'autista scansiona un sacco e registra P1 (peso + GPS + operator).
-- Idempotente: rifiuta se già pesato (anti-frode).
create or replace function public.validate_and_claim_bag(
  p_bag_qr_id text,
  p_vector_id uuid,
  p_weight_p1 numeric,
  p_gps_lat   numeric default null,
  p_gps_lng   numeric default null
)
returns public.collections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row       public.collections;
  v_gps_text  text;
  v_caller    uuid;
begin
  -- Bypass per SQL Editor / backend job
  if current_user in ('postgres','service_role') then
    v_caller := coalesce(p_vector_id, '00000000-0000-0000-0000-000000000000'::uuid);
  elsif auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  else
    v_caller := coalesce(p_vector_id, auth.uid());
  end if;

  if p_weight_p1 is null or p_weight_p1 <= 0 or p_weight_p1 > 1000 then
    raise exception 'INVALID_WEIGHT_P1: % (deve essere 0 < kg ≤ 1000)', p_weight_p1
      using errcode = '22023';
  end if;

  -- Lock atomico sulla riga
  select * into v_row
  from public.collections
  where bag_qr_id = p_bag_qr_id
  for update;

  if v_row.id is null then
    raise exception 'BAG_NOT_FOUND: QR % non assegnato a nessun cliente', p_bag_qr_id
      using errcode = 'P0001';
  end if;

  if v_row.weight_collect_kg is not null then
    raise exception 'BAG_ALREADY_COLLECTED: QR % già pesato P1 (% kg il %)',
      p_bag_qr_id, v_row.weight_collect_kg, v_row.created_at
      using errcode = 'P0001';
  end if;

  if v_row.status = 'ANCHORED' or v_row.status = 'DISCREPANCY' then
    raise exception 'BAG_IN_FINAL_STATE: QR % in stato % non ri-pesabile', 
      p_bag_qr_id, v_row.status
      using errcode = 'P0001';
  end if;

  if p_gps_lat is not null and p_gps_lng is not null then
    v_gps_text := p_gps_lat::text || ',' || p_gps_lng::text;
  end if;

  update public.collections
     set weight_collect_kg = p_weight_p1,
         operator_id       = v_caller,
         gps_location      = coalesce(v_gps_text, gps_location),
         status            = 'IN_TRANSIT',
         device_time       = now()
   where id = v_row.id
  returning * into v_row;

  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (v_caller, 'validate_and_claim_bag', 'collections', v_row.id::text,
          jsonb_build_object('qr_code', p_bag_qr_id,
                             'p1_kg', p_weight_p1,
                             'gps', v_gps_text));

  return v_row;
end $$;

-- ─── 3 · Grant ─────────────────────────────────────────────────────────────
revoke all on function public.assign_bag_to_client(text, uuid, text)             from public, anon;
revoke all on function public.validate_and_claim_bag(text, uuid, numeric, numeric, numeric) from public, anon;
grant execute on function public.assign_bag_to_client(text, uuid, text)             to authenticated;
grant execute on function public.validate_and_claim_bag(text, uuid, numeric, numeric, numeric) to authenticated;

commit;
