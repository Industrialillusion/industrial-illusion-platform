-- ============================================================================
--  PHASE 3 · QR INFRASTRUCTURE · Blocco 1 (REV 3)
--  RPC: assign_bag_to_client + validate_and_claim_bag
--  Material types HoReCa completi + freeze
--  Idempotente.
-- ============================================================================

begin;

-- ─── 1 · Schema fixes ──────────────────────────────────────────────────────
alter table public.collections alter column weight_collect_kg drop not null;
alter table public.collections drop constraint if exists collections_status_check;
alter table public.collections add constraint collections_status_check
  check (status in ('ASSIGNED','IN_TRANSIT','ANCHORED','DISCREPANCY'));
alter table public.collections alter column status set default 'ASSIGNED';

-- ─── 2 · Material type · 9 valori + freeze ─────────────────────────────────
update public.collections set material_type = 'PET' where material_type is null;
alter table public.collections alter column material_type set not null;
alter table public.collections drop constraint if exists collections_material_type_check;
alter table public.collections add constraint collections_material_type_check
  check (material_type in ('PET','PEHD','LDPE','PP','CARD','ALU','FER','GLASS','ORG'));

create or replace function public.fn_collections_freeze_material()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  if tg_op = 'UPDATE' and old.material_type is not null
     and new.material_type is distinct from old.material_type then
    raise exception 'MATERIAL_IMMUTABLE: QR % non modificabile (da % a %)',
      old.bag_qr_id, old.material_type, new.material_type using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_collections_freeze_material on public.collections;
create trigger trg_collections_freeze_material
  before update on public.collections
  for each row execute function public.fn_collections_freeze_material();

-- ─── 3 · RPC · assign_bag_to_client ────────────────────────────────────────
create or replace function public.assign_bag_to_client(
  p_bag_qr_id     text,
  p_client_id     uuid default null,
  p_material_type text default 'PET'
)
returns public.collections
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row public.collections;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_bag_qr_id is null or length(trim(p_bag_qr_id)) < 5 then
    raise exception 'INVALID_QR_ID' using errcode = '22023';
  end if;
  if p_material_type not in ('PET','PEHD','LDPE','PP','CARD','ALU','FER','GLASS','ORG') then
    raise exception 'INVALID_MATERIAL: %', p_material_type using errcode = '22023';
  end if;
  if exists (select 1 from public.collections where bag_qr_id = p_bag_qr_id) then
    raise exception 'QR_ALREADY_EXISTS: %', p_bag_qr_id using errcode = '23505';
  end if;

  insert into public.collections (bag_qr_id, client_id, material_type, status)
  values (p_bag_qr_id, p_client_id, p_material_type, 'ASSIGNED')
  returning * into v_row;

  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'assign_bag_to_client', 'collections', v_row.id::text,
          jsonb_build_object('qr_code', p_bag_qr_id, 'client_id', p_client_id, 'material', p_material_type));
  return v_row;
end $$;

-- ─── 4 · RPC · validate_and_claim_bag ──────────────────────────────────────
create or replace function public.validate_and_claim_bag(
  p_bag_qr_id text,
  p_vector_id uuid,
  p_weight_p1 numeric,
  p_gps_lat   numeric default null,
  p_gps_lng   numeric default null
)
returns public.collections
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_row public.collections;
  v_gps_text text;
  v_caller uuid;
begin
  if current_user in ('postgres','service_role') then
    v_caller := coalesce(p_vector_id, '00000000-0000-0000-0000-000000000000'::uuid);
  elsif auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  else
    v_caller := coalesce(p_vector_id, auth.uid());
  end if;

  if p_weight_p1 is null or p_weight_p1 <= 0 or p_weight_p1 > 1000 then
    raise exception 'INVALID_WEIGHT_P1: %', p_weight_p1 using errcode = '22023';
  end if;

  select * into v_row from public.collections where bag_qr_id = p_bag_qr_id for update;
  if v_row.id is null then
    raise exception 'BAG_NOT_FOUND: %', p_bag_qr_id using errcode = 'P0001';
  end if;
  if v_row.weight_collect_kg is not null then
    raise exception 'BAG_ALREADY_COLLECTED: %', p_bag_qr_id using errcode = 'P0001';
  end if;
  if v_row.status in ('ANCHORED','DISCREPANCY') then
    raise exception 'BAG_IN_FINAL_STATE: % / %', p_bag_qr_id, v_row.status using errcode = 'P0001';
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
          jsonb_build_object('qr_code', p_bag_qr_id, 'p1_kg', p_weight_p1, 'gps', v_gps_text));
  return v_row;
end $$;

-- ─── 5 · Grant ─────────────────────────────────────────────────────────────
revoke all on function public.assign_bag_to_client(text, uuid, text) from public, anon;
revoke all on function public.validate_and_claim_bag(text, uuid, numeric, numeric, numeric) from public, anon;
grant execute on function public.assign_bag_to_client(text, uuid, text) to authenticated;
grant execute on function public.validate_and_claim_bag(text, uuid, numeric, numeric, numeric) to authenticated;

commit;
