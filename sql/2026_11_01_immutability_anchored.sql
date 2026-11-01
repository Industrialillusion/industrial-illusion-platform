-- ============================================================================
-- 2026-11-01 · Immutability WORM · collections ANCHORED
-- Una volta ANCHORED, i campi critici sono write-once.
-- Bypass consentito solo a postgres/service_role (manutenzione) con audit.
-- ============================================================================

-- 1. Trigger function
CREATE OR REPLACE FUNCTION public.fn_collections_immutable_anchored()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_critical_cols text[] := ARRAY[
    'bag_qr_id','client_id','material_type',
    'weight_collect_kg','weight_depot_kg',
    'gps_location','gps_accuracy_m','device_time','deposit_time',
    'payload_hash','blockchain_hash',
    'operator_id','operator_email',
    'weighing_method','scale_fault_photo','depot_fault_photo'
  ];
  v_col text;
  v_changed text[] := ARRAY[]::text[];
BEGIN
  -- Bypass per manutenzione DB
  IF current_user IN ('postgres','service_role') THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- DELETE su ANCHORED: sempre bloccato
  IF TG_OP = 'DELETE' AND OLD.status = 'ANCHORED' THEN
    RAISE EXCEPTION 'IMMUTABLE_ANCHORED_DELETE: % non può essere cancellato (status=ANCHORED)', OLD.bag_qr_id
      USING ERRCODE = 'P0001';
  END IF;

  -- UPDATE su ANCHORED: blocca se tocca campi critici
  IF TG_OP = 'UPDATE' AND OLD.status = 'ANCHORED' THEN
    FOREACH v_col IN ARRAY v_critical_cols LOOP
      IF (to_jsonb(NEW) ->> v_col) IS DISTINCT FROM (to_jsonb(OLD) ->> v_col) THEN
        v_changed := array_append(v_changed, v_col);
      END IF;
    END LOOP;
    IF array_length(v_changed, 1) > 0 THEN
      RAISE EXCEPTION 'IMMUTABLE_ANCHORED: % ha status ANCHORED, campi immutabili modificati: %',
        OLD.bag_qr_id, array_to_string(v_changed, ', ')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

-- 2. Trigger BEFORE UPDATE OR DELETE
DROP TRIGGER IF EXISTS trg_collections_immutable_anchored ON public.collections;
CREATE TRIGGER trg_collections_immutable_anchored
  BEFORE UPDATE OR DELETE ON public.collections
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_collections_immutable_anchored();

-- 3. Verifica trigger attivo
SELECT tgname, tgtype, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.collections'::regclass
  AND tgname = 'trg_collections_immutable_anchored';
