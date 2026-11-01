-- ============================================================================
-- 2026-11-01 · RLS Hardening · collections
-- Chiude leak cross-vettore: ogni vettore vede/modifica SOLO i propri sacchi
-- ============================================================================

-- 1. SELECT · solo i propri sacchi (admin vede tutto, client via policy separata)
DROP POLICY IF EXISTS col_read ON public.collections;
CREATE POLICY col_read ON public.collections
  FOR SELECT
  TO public
  USING (
    is_admin()
    OR (has_cap('vector'::text) AND operator_id = auth.uid())
  );

-- 2. UPDATE · solo i propri sacchi IN_TRANSIT (admin senza restrizioni)
DROP POLICY IF EXISTS col_upd ON public.collections;
CREATE POLICY col_upd ON public.collections
  FOR UPDATE
  TO public
  USING (
    is_admin()
    OR (has_cap('vector'::text) AND operator_id = auth.uid() AND status = 'IN_TRANSIT'::text)
  )
  WITH CHECK (
    is_admin()
    OR (has_cap('vector'::text) AND operator_id = auth.uid())
  );

-- 3. INSERT · invariato (verifica solo forma)
-- col_ins già corretta: has_cap('vector') AND operator_id = auth.uid() AND status='IN_TRANSIT'

-- 4. Verifica: le 2 policy devono essere aggiornate
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'collections'
  AND policyname IN ('col_read','col_upd')
ORDER BY policyname;
