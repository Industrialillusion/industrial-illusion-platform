/* Configuration publique. La clé "publishable/anon" est faite pour être exposée côté navigateur :
   la sécurité repose sur les politiques RLS de Supabase, jamais sur le secret de cette clé.
   N'ajoutez ici AUCUNE clé service_role. */
window.II_CONFIG = {
  SUPABASE_URL: 'https://sqlgsaxdqcgwfxjrkpuc.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_von1008wEcuKM8Zpm1l9Lw_zuWU4aVg',
  SCALE_SERVICE: 0x181D,
  SCALE_CHAR: 0x2A9D,

  /* ─── Monitoring (Phase 0 · Sentry) ─── */
  SENTRY_DSN: 'https://ca4e617dbfc1eb8b56d6444652460ca6@o4512293834850304.ingest.de.sentry.io/4512293855428688',
  ENVIRONMENT: 'production',
  RELEASE: 'maat@1.0.0'
};
