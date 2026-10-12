-- =====================================================================
-- MAAT OS — Schéma Supabase (Industrial Illusion SARL)
-- Backup repository dello schema eseguito sul Database Supabase.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- PROFILS, RÔLES, CAPACITÉS ----------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'public' CHECK (role IN ('public','client','operator','admin')),
  capabilities text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','REJECTED')),
  grade text, merit_score numeric, cluster text, vehicle text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'ACTIVE') $$;

CREATE OR REPLACE FUNCTION public.has_cap(c text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'ACTIVE' AND (role = 'admin' OR (role = 'operator' AND c = ANY(capabilities)))) $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text := coalesce(new.raw_user_meta_data->>'type', 'standard');
BEGIN
  INSERT INTO profiles(id, email, full_name, role, status)
  VALUES (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'name', new.email),
          CASE t WHEN 'client' THEN 'client' WHEN 'operator' THEN 'operator' ELSE 'public' END,
          CASE WHEN t IN ('client','operator') THEN 'PENDING' ELSE 'ACTIVE' END);
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.guard_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin()
     AND (new.role IS DISTINCT FROM old.role OR new.status IS DISTINCT FROM old.status OR new.capabilities IS DISTINCT FROM old.capabilities
          OR new.grade IS DISTINCT FROM old.grade OR new.merit_score IS DISTINCT FROM old.merit_score OR new.email IS DISTINCT FROM old.email) THEN
    RAISE EXCEPTION 'Modification réservée à la Direction';
  END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS guard_profile ON public.profiles;
CREATE TRIGGER guard_profile BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile();

-- ---------- CLIENTS, PROSPECTS, VECTEURS ----------
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL, horeca_category text, contact_name text, email text, phone text,
  address text, city text DEFAULT 'Marrakech', cluster text, volume_estimate text, message text, kit_requested boolean DEFAULT false,
  status text NOT NULL DEFAULT 'PROSPECT' CHECK (status IN ('PROSPECT','ACTIVE','PAUSED')),
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_type text, full_name text, email text, phone text, city text, vehicle text, message text,
  status text NOT NULL DEFAULT 'NEW', created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- RETIRS PROGRAMMÉS ----------
CREATE TABLE public.pickups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL, window_minutes int DEFAULT 60, materials text, notes text,
  vector_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','ASSIGNED','IN_PROGRESS','DONE','CANCELLED')),
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pickups_vector_idx ON public.pickups(vector_id, scheduled_at);

-- ---------- PESÉES ----------
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid uuid UNIQUE,
  pickup_id uuid REFERENCES public.pickups(id), client_id uuid REFERENCES public.clients(id),
  bag_qr_id text NOT NULL, material_type text NOT NULL,
  weight_collect_kg numeric NOT NULL CHECK (weight_collect_kg > 0 AND weight_collect_kg <= 1000),
  weight_depot_kg numeric CHECK (weight_depot_kg > 0 AND weight_depot_kg <= 100000),
  status text NOT NULL DEFAULT 'IN_TRANSIT' CHECK (status IN ('IN_TRANSIT','ANCHORED','DISCREPANCY')),
  weighing_method text, scale_fault_photo text, depot_fault_photo text,
  gps_location text, gps_accuracy_m int, device_time timestamptz, deposit_time timestamptz,
  payload_hash text, blockchain_hash text,
  operator_id uuid DEFAULT auth.uid(), operator_email text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX collections_status_idx ON public.collections(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.anchor_collection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF new.weight_collect_kg IS DISTINCT FROM old.weight_collect_kg OR new.bag_qr_id IS DISTINCT FROM old.bag_qr_id OR new.client_id IS DISTINCT FROM old.client_id
       OR new.material_type IS DISTINCT FROM old.material_type OR new.payload_hash IS DISTINCT FROM old.payload_hash OR new.operator_id IS DISTINCT FROM old.operator_id
       OR new.status IS DISTINCT FROM old.status AND new.weight_depot_kg IS NOT DISTINCT FROM old.weight_depot_kg THEN
      RAISE EXCEPTION 'Champs de collecte non modifiables';
    END IF;
    IF old.weight_depot_kg IS NOT NULL THEN RAISE EXCEPTION 'Seconde pesée déjà enregistrée'; END IF;
  END IF;
  IF new.weight_depot_kg IS NOT NULL AND old.weight_depot_kg IS NULL THEN
    new.deposit_time := now();
    new.status := CASE WHEN abs(new.weight_depot_kg - new.weight_collect_kg) / new.weight_collect_kg <= 0.03 THEN 'ANCHORED' ELSE 'DISPUTED' END;
    new.blockchain_hash := '0x' || encode(digest(new.id::text || new.weight_collect_kg || '|' || new.weight_depot_kg || '|' || coalesce(new.payload_hash,'') || '|' || new.deposit_time::text, 'sha256'), 'hex');
  END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS anchor_collection ON public.collections;
CREATE TRIGGER anchor_collection BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.anchor_collection();

-- ---------- CONTRATS AMBASSADEURS ----------
CREATE TABLE public.ambassador_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  ambassador_email text, company_name text NOT NULL, category text, contact_name text, phone text,
  photo_path text, client_id uuid REFERENCES public.clients(id),
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','VALIDATED','REJECTED')),
  bonus_mad numeric DEFAULT 0, review_note text, reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- WALLET, VIREMENTS, CAISSE ----------
CREATE TABLE public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  label text NOT NULL, amount_mad numeric NOT NULL,
  kind text NOT NULL CHECK (kind IN ('COURSE','BONUS','DIVIDEND','ADVANCE','PAYOUT','ADJUST')),
  ref text, notarized boolean DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id), operator text,
  amount_mad numeric NOT NULL CHECK (amount_mad > 0), method text, details text, cash_slot text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','PAID','REJECTED')),
  reviewed_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cash_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  amount_mad numeric NOT NULL CHECK (amount_mad > 0), motif text, ref text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.field_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid DEFAULT auth.uid(), operator_email text, note_type text, content text, gps_location text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.wallet_summary WITH (security_invoker = true) AS
  SELECT user_id,
         coalesce(sum(amount_mad) FILTER (WHERE kind <> 'DIVIDEND'), 0) AS balance_mad,
         coalesce(sum(amount_mad) FILTER (WHERE kind = 'DIVIDEND'), 0) AS class_b_dividends_mad
  FROM public.wallet_ledger GROUP BY user_id;

CREATE OR REPLACE VIEW public.operator_stats WITH (security_invoker = true) AS
  SELECT p.id AS user_id, p.grade, p.merit_score,
         (extract(year FROM age(now(), p.created_at)) * 12 + extract(month FROM age(now(), p.created_at)))::int AS tenure_months,
         coalesce(sum(c.weight_collect_kg), 0) AS tonnage_kg, count(c.id)::int AS tours_count
  FROM public.profiles p LEFT JOIN public.collections c ON c.operator_id = p.id GROUP BY p.id;

CREATE OR REPLACE FUNCTION public.settle_payout(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r payout_requests; bal numeric;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Réservé à la Direction'; END IF;
  SELECT * INTO r FROM payout_requests WHERE id = p_id AND status IN ('PENDING','APPROVED') FOR UPDATE;
  IF NOT found THEN RAISE EXCEPTION 'Demande introuvable ou déjà traitée'; END IF;
  SELECT coalesce(sum(amount_mad) FILTER (WHERE kind <> 'DIVIDEND'), 0) INTO bal FROM wallet_ledger WHERE user_id = r.user_id;
  IF bal < r.amount_mad THEN RAISE EXCEPTION 'Solde insuffisant (%)', bal; END IF;
  INSERT INTO wallet_ledger(user_id, label, amount_mad, kind, ref, notarized) VALUES (r.user_id, 'Règlement ' || coalesce(r.method,''), -r.amount_mad, 'PAYOUT', r.id::text, true);
  UPDATE payout_requests SET status = 'PAID', reviewed_by = auth.uid() WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.validate_contract(p_id uuid, p_bonus numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c ambassador_contracts; cid uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Réservé à la Direction'; END IF;
  SELECT * INTO c FROM ambassador_contracts WHERE id = p_id AND status = 'SUBMITTED' FOR UPDATE;
  IF NOT found THEN RAISE EXCEPTION 'Contrat introuvable ou déjà traité'; END IF;
  INSERT INTO clients(company_name, horeca_category, contact_name, phone, status, created_by) VALUES (c.company_name, c.category, c.contact_name, c.phone, 'ACTIVE', auth.uid()) RETURNING id INTO cid;
  UPDATE ambassador_contracts SET status = 'VALIDATED', client_id = cid, bonus_mad = greatest(coalesce(p_bonus,0),0), reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
  IF coalesce(p_bonus,0) > 0 THEN
    INSERT INTO wallet_ledger(user_id, label, amount_mad, kind, ref, notarized) VALUES (c.ambassador_id, 'Prime contrat — ' || c.company_name, p_bonus, 'BONUS', p_id::text, true);
  END IF;
END $$;

CREATE TABLE public.emission_factors (material_type text PRIMARY KEY, kg_co2_per_kg numeric NOT NULL DEFAULT 0);

CREATE OR REPLACE VIEW public.live_impact_summary AS
  SELECT coalesce(sum(c.weight_depot_kg), 0) AS matiere_valorisee_kg,
         coalesce(sum(c.weight_depot_kg * coalesce(f.kg_co2_per_kg, 0)), 0) AS co2_evite_kg
  FROM public.collections c LEFT JOIN public.emission_factors f ON f.material_type = c.material_type WHERE c.status = 'ANCHORED';
GRANT SELECT ON public.live_impact_summary TO anon, authenticated;

-- ---------- JOURNAL D'AUDIT ----------
CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor uuid, action text, entity text, entity_id text, detail jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF tg_op = 'DELETE' THEN r := old; ELSE r := new; END IF;
  INSERT INTO audit_log(actor, action, entity, entity_id, detail) VALUES (auth.uid(), tg_op, tg_table_name, r.id::text, to_jsonb(r) - 'scale_fault_photo' - 'depot_fault_photo');
  RETURN r;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','clients','pickups','collections','ambassador_contracts','payout_requests','wallet_ledger','field_notes'] LOOP
    EXECUTE format('drop trigger if exists audit_%1$s on public.%1$s', t);
    EXECUTE format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit()', t);
  END LOOP; END $$;

-- ---------- SÉCURITÉ : RLS ----------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emission_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_self ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY p_upd ON public.profiles FOR UPDATE USING (id = auth.uid() OR public.is_admin());

CREATE POLICY c_anon_ins ON public.clients FOR INSERT TO anon, authenticated WITH CHECK (status = 'PROSPECT' OR public.is_admin());
CREATE POLICY c_read ON public.clients FOR SELECT USING (public.is_admin() OR (status = 'ACTIVE' AND (public.has_cap('vector') OR public.has_cap('ambassador'))));
CREATE POLICY c_admin ON public.clients FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY v_anon_ins ON public.vectors FOR INSERT TO anon, authenticated WITH CHECK (status = 'NEW');
CREATE POLICY v_admin ON public.vectors FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY k_read ON public.pickups FOR SELECT USING (public.is_admin() OR vector_id = auth.uid());
CREATE POLICY k_upd ON public.pickups FOR UPDATE USING (vector_id = auth.uid() AND public.has_cap('vector')) WITH CHECK (vector_id = auth.uid());
CREATE POLICY k_admin ON public.pickups FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY col_read ON public.collections FOR SELECT USING (public.is_admin() OR (public.has_cap('vector') AND (operator_id = auth.uid() OR status = 'IN_TRANSIT')));
CREATE POLICY col_ins ON public.collections FOR INSERT WITH CHECK (public.has_cap('vector') AND operator_id = auth.uid() AND status = 'IN_TRANSIT');
CREATE POLICY col_upd ON public.collections FOR UPDATE USING (public.is_admin() OR (public.has_cap('vector') AND status = 'IN_TRANSIT')) WITH CHECK (public.is_admin() OR public.has_cap('vector'));

CREATE POLICY ct_read ON public.ambassador_contracts FOR SELECT USING (public.is_admin() OR ambassador_id = auth.uid());
CREATE POLICY ct_ins ON public.ambassador_contracts FOR INSERT WITH CHECK (public.has_cap('ambassador') AND ambassador_id = auth.uid() AND status = 'SUBMITTED');
CREATE POLICY ct_admin ON public.ambassador_contracts FOR UPDATE USING (public.is_admin());

CREATE POLICY w_read ON public.wallet_ledger FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY w_admin ON public.wallet_ledger FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY pr_read ON public.payout_requests FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY pr_ins ON public.payout_requests FOR INSERT WITH CHECK (user_id = auth.uid() AND status = 'PENDING' AND (public.has_cap('vector') OR public.has_cap('ambassador')));
CREATE POLICY pr_admin ON public.payout_requests FOR UPDATE USING (public.is_admin());

CREATE POLICY cr_read ON public.cash_receipts FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY cr_ins ON public.cash_receipts FOR INSERT WITH CHECK (user_id = auth.uid() AND (public.has_cap('vector') OR public.has_cap('ambassador')));

CREATE POLICY fn_read ON public.field_notes FOR SELECT USING (operator_id = auth.uid() OR public.is_admin());
CREATE POLICY fn_ins ON public.field_notes FOR INSERT WITH CHECK (operator_id = auth.uid() AND (public.has_cap('vector') OR public.has_cap('ambassador')));

CREATE POLICY a_read ON public.audit_log FOR SELECT USING (public.is_admin());

CREATE POLICY ef_read ON public.emission_factors FOR SELECT USING (public.is_admin());
CREATE POLICY ef_admin ON public.emission_factors FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- BUCKETS STORAGE ----------
INSERT INTO storage.buckets (id, name, public) VALUES ('proofs', 'proofs', false), ('contracts', 'contracts', false) ON CONFLICT (id) DO NOTHING;

CREATE POLICY st_ins ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('proofs','contracts') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY st_upd ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('proofs','contracts') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY st_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('proofs','contracts') AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

-- ---------- REALTIME ----------
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['collections','pickups','payout_requests','ambassador_contracts','profiles','clients'] LOOP
    BEGIN EXECUTE format('alter publication supabase_realtime add table public.%I', t); EXCEPTION WHEN duplicate_object THEN null; END;
  END LOOP; END $$;
