/* ==========================================================================
 *  assets/admin-clients.js
 *  Maat OS · Admin · Clients Management v4.0
 *  - Bouton "Clients" injecté dans le header admin
 *  - Section plein écran : recherche, filtre, grille cards clients
 *  - Création client via /api/create-client (serverless)
 *  - Détail client : profils liés, unlink, edit
 *  - UI Tailwind, zéro prompt/alert natif
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatAdminClientsLoaded) return;
  window.__MaatAdminClientsLoaded = true;

  const log = (...a) => console.log('[AdminClients]', ...a);

  const DISTRICTS = [
    'Guéliz','Hivernage','Semlalia','Daoudiate','Amerchich','Sidi Abbad',
    'Médina','Kasbah','Mellah','Bab Doukkala','Riad Laarouss','Kennaria',
    'SYBA','Sidi Ghanem','Al Masar',
    'Targa','Massira I','Massira II','Massira III','Mhamid','Hay Al Hassani',
    'Azli','Iziki','Mabrouka','Al Izdihar',
    'Palmeraie','Agdal','Chrifia','Ain Itti','Ennakhil',
    'Route de Casablanca','Route de Fès',"Route d'Ourika","Route d'Amizmiz"
  ];

  const CATEGORIES = ['Hotel/Riad','Restaurant','Artisan/Atelier','Commerce','Bureau','Autre'];

  function getClient() {
    const c = [window.Maat && window.Maat.sb, window.maatSupabase, window.supabaseClient, window.sb];
    for (const x of c) if (x && typeof x.rpc === 'function') return x;
    return null;
  }

  function toast(msg, isErr) {
    if (window.Maat && typeof window.Maat.toast === 'function') {
      window.Maat.toast(msg, isErr ? 'err' : 'ok'); return;
    }
    let t = document.getElementById('ac-toast');
    if (!t) { t = document.createElement('div'); t.id = 'ac-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[10001] px-5 py-3 rounded-lg font-mono text-xs font-bold max-w-[90vw] shadow-2xl ' +
      (isErr ? 'bg-red-900 border border-red-400 text-red-100' : 'bg-emerald-900 border border-emerald-400 text-emerald-100');
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.remove(), 4000);
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  /* ─── Inject header button ─────────────────────────────────────────── */
  function injectHeaderButton() {
    if (document.getElementById('ac-header-btn')) return;
    const headerActions = document.querySelector('header .flex.items-center.gap-2');
    const pwaLink = headerActions?.querySelector('a[href="pwa.html"]');
    if (!headerActions) return;

    const btn = document.createElement('button');
    btn.id = 'ac-header-btn';
    btn.type = 'button';
    btn.className = 'text-[10px] font-mono px-2.5 py-1 rounded bg-kemetGold/20 text-kemetGold border border-kemetGold/40 hover:bg-kemetGold/30 transition-colors';
    btn.textContent = '👥 Clients';
    btn.title = 'Gestion des clients B2B';
    btn.addEventListener('click', openClientsSection);
    if (pwaLink) headerActions.insertBefore(btn, pwaLink);
    else headerActions.appendChild(btn);
  }

  /* ─── Section plein écran ──────────────────────────────────────────── */
  function openClientsSection() {
    document.querySelectorAll('.ac-section').forEach(n => n.remove());

    const sec = document.createElement('div');
    sec.className = 'ac-section fixed inset-0 z-[9995] bg-[#060A0D] overflow-y-auto';

    sec.innerHTML = `
      <div class="sticky top-0 z-10 bg-obsidianCard/95 backdrop-blur border-b border-kemetGold/30 shadow-lg">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center gap-3">
          <div class="flex items-center gap-3">
            <h1 class="font-kemetTitle text-base sm:text-lg font-black tracking-widest text-white">👥 CLIENTS · ONBOARDING B2B</h1>
          </div>
          <div class="flex items-center gap-2">
            <button id="ac-btn-new" type="button" class="px-4 py-2 rounded-lg bg-cyberGreen text-obsidian font-black text-xs font-mono hover:brightness-110 transition-all">+ Nouveau Client</button>
            <button id="ac-btn-close" type="button" class="w-9 h-9 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-red-400 font-bold" title="Fermer">✕</button>
          </div>
        </div>
      </div>
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div class="flex flex-col sm:flex-row gap-3 mb-6">
          <input id="ac-search" type="text" placeholder="🔍 Rechercher par nom, référent ou email…"
            class="flex-1 px-4 py-3 bg-[#0F1419] border border-slate-700 rounded-lg text-slate-100 font-mono text-sm placeholder-slate-500 focus:border-kemetGold focus:outline-none">
          <select id="ac-filter-status"
            class="px-4 py-3 bg-[#0F1419] border border-slate-700 rounded-lg text-slate-100 font-mono text-sm focus:border-kemetGold focus:outline-none">
            <option value="ALL">Tous statuts</option>
            <option value="ACTIVE">Actifs</option>
            <option value="PENDING">En attente</option>
            <option value="SUSPENDED">Suspendus</option>
          </select>
        </div>
        <div id="ac-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
        <div id="ac-empty" class="hidden text-center py-16 text-slate-500 font-mono text-sm">
          Aucun client ne correspond à vos critères.
        </div>
      </div>
    `;

    document.body.appendChild(sec);

    sec.querySelector('#ac-btn-close').addEventListener('click', () => sec.remove());
    sec.querySelector('#ac-btn-new').addEventListener('click', () => openCreateForm(sec));
    sec.querySelector('#ac-search').addEventListener('input', debounce(() => loadClients(sec), 250));
    sec.querySelector('#ac-filter-status').addEventListener('change', () => loadClients(sec));

    loadClients(sec);
  }

  let _debounceTimers = {};
  function debounce(fn, ms) {
    return function () {
      clearTimeout(_debounceTimers[fn]);
      _debounceTimers[fn] = setTimeout(fn, ms);
    };
  }

  /* ─── Liste clients ────────────────────────────────────────────────── */
  async function loadClients(sec) {
    const grid = sec.querySelector('#ac-grid');
    const empty = sec.querySelector('#ac-empty');
    const search = (sec.querySelector('#ac-search').value || '').trim();
    const status = sec.querySelector('#ac-filter-status').value;

    grid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-500 font-mono text-sm">⏳ Chargement…</div>';
    empty.classList.add('hidden');

    const sb = getClient();
    if (!sb) { grid.innerHTML = '<div class="col-span-full text-center text-red-400 font-mono">❌ Supabase non disponible</div>'; return; }

    let req = sb.from('clients')
      .select('id, company_name, contact_name, email, phone, district, cluster, status, horeca_category, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (search) req = req.or(`company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`);
    if (status !== 'ALL') req = req.eq('status', status);

    const { data, error } = await req;
    grid.innerHTML = '';
    if (error) { grid.innerHTML = `<div class="col-span-full text-center text-red-400 font-mono">❌ ${esc(error.message)}</div>`; return; }
    if (!data || data.length === 0) { empty.classList.remove('hidden'); return; }

    for (const c of data) grid.appendChild(renderClientCard(c, sec));
  }

  function statusBadge(status) {
    const map = {
      ACTIVE: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      PENDING: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      SUSPENDED: 'bg-red-500/20 text-red-300 border-red-500/40',
      PROSPECT: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    };
    return `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${map[status] || map.PROSPECT}">${esc(status || '—')}</span>`;
  }

  function renderClientCard(c, sec) {
    const card = document.createElement('div');
    card.className = 'bg-[#0F1419] border border-slate-700 rounded-xl p-4 cursor-pointer hover:border-kemetGold transition-all hover:shadow-[0_0_20px_rgba(197,160,89,0.15)]';
    card.innerHTML = `
      <div class="flex justify-between items-start mb-3 gap-2">
        <h3 class="font-bold text-white text-sm leading-tight flex-1 min-w-0 truncate" title="${esc(c.company_name)}">${esc(c.company_name || '—')}</h3>
        ${statusBadge(c.status)}
      </div>
      <div class="space-y-1.5 text-xs font-mono text-slate-400">
        ${c.contact_name ? `<div>👤 ${esc(c.contact_name)}</div>` : ''}
        ${c.email ? `<div class="truncate" title="${esc(c.email)}">✉️ ${esc(c.email)}</div>` : ''}
        ${c.phone ? `<div>📞 ${esc(c.phone)}</div>` : ''}
        ${(c.district || c.cluster) ? `<div>📍 ${esc(c.district || c.cluster)}</div>` : ''}
        ${c.horeca_category ? `<div>🏷️ ${esc(c.horeca_category)}</div>` : ''}
      </div>
      <div class="mt-3 pt-3 border-t border-slate-800 text-[10px] font-mono text-kemetGold">
        Cliquer pour gérer →
      </div>
    `;
    card.addEventListener('click', () => openClientDetail(c, sec));
    return card;
  }

  /* ─── Détail client ────────────────────────────────────────────────── */
  async function openClientDetail(client, parentSec) {
    const modal = document.createElement('div');
    modal.className = 'ac-modal fixed inset-0 z-[9996] bg-black/85 backdrop-blur-sm overflow-y-auto p-4 sm:p-8 flex items-start justify-center';
    modal.innerHTML = `
      <div class="w-full max-w-3xl bg-[#0A0D10] border border-kemetGold/50 rounded-xl p-6 font-mono text-sm text-slate-200 shadow-2xl">
        <div class="flex justify-between items-start gap-3 mb-5 pb-4 border-b border-slate-800">
          <div class="flex-1 min-w-0">
            <h2 class="text-lg font-black text-kemetGold mb-1 truncate">🏢 ${esc(client.company_name)}</h2>
            <p class="text-[11px] text-slate-500">ID: ${esc(client.id)}</p>
          </div>
          <button type="button" class="ac-x w-9 h-9 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-red-400 font-bold flex-shrink-0">✕</button>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-6 text-xs">
          <div class="bg-[#0F1419] rounded-lg p-3 border border-slate-800"><div class="text-slate-500 mb-1 text-[10px]">RÉFÉRENT</div><div class="text-slate-100 font-bold">${esc(client.contact_name || '—')}</div></div>
          <div class="bg-[#0F1419] rounded-lg p-3 border border-slate-800"><div class="text-slate-500 mb-1 text-[10px]">STATUT</div>${statusBadge(client.status)}</div>
          <div class="bg-[#0F1419] rounded-lg p-3 border border-slate-800"><div class="text-slate-500 mb-1 text-[10px]">EMAIL</div><div class="text-slate-100 truncate" title="${esc(client.email || '')}">${esc(client.email || '—')}</div></div>
          <div class="bg-[#0F1419] rounded-lg p-3 border border-slate-800"><div class="text-slate-500 mb-1 text-[10px]">TÉLÉPHONE</div><div class="text-slate-100">${esc(client.phone || '—')}</div></div>
          <div class="bg-[#0F1419] rounded-lg p-3 border border-slate-800"><div class="text-slate-500 mb-1 text-[10px]">DISTRICT</div><div class="text-slate-100">${esc(client.district || client.cluster || '—')}</div></div>
          <div class="bg-[#0F1419] rounded-lg p-3 border border-slate-800"><div class="text-slate-500 mb-1 text-[10px]">CATÉGORIE</div><div class="text-slate-100">${esc(client.horeca_category || '—')}</div></div>
        </div>

        <h3 class="text-cyberGreen text-xs uppercase tracking-wider font-bold mb-2">🔗 Profils liés</h3>
        <div id="ac-profiles" class="space-y-2 mb-5 text-xs">⏳ Chargement…</div>

        <div class="flex justify-end pt-3 border-t border-slate-800">
          <button type="button" class="ac-x px-4 py-2 rounded-lg bg-slate-700 text-slate-200 font-bold text-xs hover:bg-slate-600">Fermer</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('.ac-x').forEach(b => b.addEventListener('click', () => modal.remove()));
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    const profList = modal.querySelector('#ac-profiles');
    const sb = getClient();
    const { data, error } = await sb.rpc('get_client_profiles', { p_client_id: client.id });
    profList.innerHTML = '';
    if (error) { profList.innerHTML = `<div class="text-red-400">❌ ${esc(error.message)}</div>`; return; }
    if (!data || data.length === 0) { profList.innerHTML = '<div class="text-slate-500 italic">Aucun profil lié.</div>'; return; }

    for (const p of data) {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-3 p-3 bg-[#0F1419] border border-slate-800 rounded-lg';
      row.innerHTML = `
        <div class="flex-1 min-w-0">
          <div class="text-slate-100 font-bold truncate" title="${esc(p.email)}">${esc(p.email)}</div>
          <div class="text-[10px] text-slate-500">${esc(p.full_name || '—')} · ${esc(p.role)} · ${esc(p.status)}</div>
        </div>
      `;
      const unlink = document.createElement('button');
      unlink.type = 'button';
      unlink.className = 'px-3 py-1 rounded border border-red-500/50 text-red-400 text-[10px] font-bold hover:bg-red-500/10';
      unlink.textContent = '🗑 Délier';
      unlink.addEventListener('click', async () => {
        if (!confirm('Délier ' + p.email + ' ? L\'utilisateur sera suspendu.')) return;
        unlink.disabled = true;
        const { error: e2 } = await sb.rpc('unlink_client_profile', { p_email: p.email });
        if (e2) { toast('❌ ' + e2.message, true); unlink.disabled = false; return; }
        toast('✅ Profil délié', false);
        openClientDetail(client, parentSec);
      });
      row.appendChild(unlink);
      profList.appendChild(row);
    }
  }

  /* ─── Formulaire création ──────────────────────────────────────────── */
  function openCreateForm(parentSec) {
    document.querySelectorAll('.ac-form').forEach(n => n.remove());
    const modal = document.createElement('div');
    modal.className = 'ac-form fixed inset-0 z-[9997] bg-black/90 backdrop-blur-sm overflow-y-auto p-4 sm:p-8 flex items-start justify-center';
    modal.innerHTML = `
      <div class="w-full max-w-3xl bg-[#0A0D10] border border-kemetGold/50 rounded-xl p-6 font-mono text-sm text-slate-200 shadow-2xl">
        <div class="flex justify-between items-center mb-5 pb-4 border-b border-slate-800">
          <h2 class="text-lg font-black text-kemetGold">➕ Nouveau Client</h2>
          <button type="button" class="ac-x w-9 h-9 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-red-400 font-bold">✕</button>
        </div>

        <form id="ac-create-form" class="space-y-6">
          <section>
            <h3 class="text-cyberGreen text-xs uppercase tracking-wider font-bold mb-3">🏢 Entreprise</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Raison sociale *</span><input name="raison_sociale" required class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm" placeholder="Elite Garden Corporation"></label>
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Catégorie</span><select name="category" class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm"><option value="">— Sélectionner —</option>${CATEGORIES.map(x => `<option value="${x}">${x}</option>`).join('')}</select></label>
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">ICE</span><input name="ice" class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm"></label>
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">IF fiscal</span><input name="if_fiscal" class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm"></label>
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">RC</span><input name="rc" class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm"></label>
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Patente</span><input name="patente" class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm"></label>
            </div>
          </section>

          <section>
            <h3 class="text-cyberGreen text-xs uppercase tracking-wider font-bold mb-3">👤 Référent & Accès</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Nom complet référent *</span><input name="contact_name" required class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm" placeholder="El Mahdi Zandoul"></label>
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Email (login) *</span><input name="email" type="email" required class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm" placeholder="elmahdi@example.ma"></label>
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Téléphone / WhatsApp *</span><input name="phone_whatsapp" required class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm" placeholder="+212 6 XX XX XX XX"></label>
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Mot de passe provisoire *</span><input name="password" required minlength="8" class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm" placeholder="Min 8 caractères"></label>
            </div>
          </section>

          <section>
            <h3 class="text-cyberGreen text-xs uppercase tracking-wider font-bold mb-3">📍 Localisation</h3>
            <div class="space-y-3">
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Quartier / District *</span><select name="district" required class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm"><option value="">— Sélectionner —</option>${DISTRICTS.map(x => `<option value="${x}">${x}</option>`).join('')}</select></label>
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Adresse complète *</span><input name="address" required class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm" placeholder="Rue, n°, détails d'accès"></label>
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Google Maps URL</span><input name="google_maps_url" class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm" placeholder="https://maps.google.com/?q=..."></label>
            </div>
          </section>

          <section>
            <h3 class="text-cyberGreen text-xs uppercase tracking-wider font-bold mb-3">📎 Documents (optionnel)</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Fiche technique (URL)</span><input name="fiche_technique_url" class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm" placeholder="https://…/fiche.pdf"></label>
              <label class="block"><span class="text-[10px] text-slate-500 uppercase">Contrat / LOI (URL)</span><input name="contract_url" class="ac-in w-full mt-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-sm" placeholder="https://…/contrat.pdf"></label>
            </div>
          </section>

          <div class="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button type="button" class="ac-x px-4 py-2 rounded-lg border border-slate-600 text-slate-300 font-bold text-xs hover:bg-slate-800">Annuler</button>
            <button type="submit" id="ac-submit" class="px-5 py-2 rounded-lg bg-cyberGreen text-obsidian font-black text-xs hover:brightness-110">✓ Créer et provisionner l'accès</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('.ac-x').forEach(b => b.addEventListener('click', () => modal.remove()));
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    const form = modal.querySelector('#ac-create-form');
    const submitBtn = modal.querySelector('#ac-submit');

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const payload = {};
      for (const [k, v] of fd.entries()) payload[k] = String(v).trim();

      if (!payload.raison_sociale || !payload.contact_name || !payload.email || !payload.phone_whatsapp || !payload.district || !payload.address) {
        toast('Remplissez tous les champs obligatoires (*)', true); return;
      }
      if (payload.password.length < 8) { toast('Mot de passe min 8 caractères', true); return; }

      const sb = getClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) { toast('Session introuvable, reconnectez-vous', true); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Création en cours…';

      try {
        const res = await fetch('/api/create-client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) {
          const msg = json.error || 'Erreur';
          if (msg === 'EMAIL_ALREADY_REGISTERED') toast('❌ Email déjà utilisé. Utilisez "Lier un profil existant".', true);
          else if (msg === 'NOT_ADMIN') toast('❌ Session admin requise (MFA)', true);
          else toast('❌ ' + msg + (json.detail ? ' · ' + json.detail : ''), true);
          submitBtn.disabled = false;
          submitBtn.textContent = '✓ Créer et provisionner l\'accès';
          return;
        }
        toast('✅ Client créé · mot de passe: ' + json.temporary_password, false);
        log('created:', json);
        modal.remove();
        loadClients(parentSec);
      } catch (e) {
        toast('❌ Erreur réseau: ' + e.message, true);
        submitBtn.disabled = false;
        submitBtn.textContent = '✓ Créer et provisionner l\'accès';
      }
    });
  }

  /* Init */
  function init() {
    let attempts = 0;
    const tryInject = () => {
      attempts++;
      if (document.querySelector('header .flex.items-center.gap-2')) {
        injectHeaderButton();
      } else if (attempts < 30) {
        setTimeout(tryInject, 200);
      }
    };
    tryInject();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  log('ready v4.0.0');
})();
