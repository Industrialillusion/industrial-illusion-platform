/* ==========================================================================
 *  assets/admin-clients.js
 *  Maat OS · Admin · Client Onboarding Panel
 *  Phase: Pilastro 2 · 2.1b
 *  - Pannello floating (basso-destra) "👥 Clients"
 *  - Lista clienti + ricerca
 *  - Link/Unlink profilo a cliente (RPC link_client_profile / unlink_client_profile)
 *  - Guide: creazione utente via Supabase Auth Dashboard
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatAdminClientsLoaded) return;
  window.__MaatAdminClientsLoaded = true;

  const log  = (...a) => console.log('[AdminClients]', ...a);
  const warn = (...a) => console.warn('[AdminClients]', ...a);

  function getClient() {
    const c = [window.Maat && window.Maat.sb, window.maatSupabase, window.supabaseClient, window.sb];
    for (const x of c) if (x && typeof x.rpc === 'function') return x;
    return null;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function toast(msg, isErr) {
    if (window.Maat && typeof window.Maat.toast === 'function') {
      window.Maat.toast(msg, isErr ? 'err' : 'ok');
      return;
    }
    let t = document.getElementById('ac-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ac-toast';
      t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;padding:12px 20px;border-radius:8px;font-family:monospace;font-size:.75rem;font-weight:700;max-width:90vw;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = isErr ? '#7f1d1d' : '#065f46';
    t.style.color = '#fff';
    t.style.border = '1px solid ' + (isErr ? '#F87171' : '#00FFA3');
    t.style.opacity = '1';
    clearTimeout(t._tm);
    t._tm = setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3000);
  }

  /* ─── Panel ─────────────────────────────────────────────────────────── */
  function ensurePanel() {
    if (document.getElementById('ac-panel')) return;

    const fab = el('button', null, '👥 Clients');
    fab.id = 'ac-fab';
    fab.type = 'button';
    fab.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9998;padding:12px 18px;background:#C5A059;color:#0A0D10;border:none;border-radius:50px;font-weight:800;font-family:monospace;font-size:.8rem;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
    fab.addEventListener('click', openPanel);
    document.body.appendChild(fab);
  }

  async function openPanel() {
    let panel = document.getElementById('ac-panel');
    if (panel) { panel.remove(); return; }

    panel = el('div');
    panel.id = 'ac-panel';
    panel.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);overflow-y:auto;padding:20px;font-family:monospace;font-size:.8rem;color:#E2E8F0';
    panel.addEventListener('click', (e) => { if (e.target === panel) panel.remove(); });

    const card = el('div');
    card.style.cssText = 'max-width:900px;margin:0 auto;background:#0A0D10;border:1px solid #C5A059;border-radius:12px;padding:20px';

    // Header
    const hdr = el('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px';
    hdr.appendChild(el('h2', null, '👥 Onboarding Clients'));
    hdr.querySelector('h2').style.cssText = 'margin:0;color:#C5A059;font-size:1.2rem';
    const closeBtn = el('button', null, '✕');
    closeBtn.type = 'button';
    closeBtn.style.cssText = 'background:none;border:1px solid #64748B;color:#94a3b8;width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:1rem';
    closeBtn.addEventListener('click', () => panel.remove());
    hdr.appendChild(closeBtn);
    card.appendChild(hdr);

    // Guide
    const guide = el('div');
    guide.style.cssText = 'background:rgba(197,160,89,0.1);border:1px solid #C5A059;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:.7rem;line-height:1.5';
    guide.innerHTML = '<strong style="color:#C5A059">📋 Procédure d\'onboarding :</strong><br>1. Créer l\'utilisateur dans <a href="https://supabase.com/dashboard/project/sqlgsaxdqcgwfxjrkpuc/auth/users" target="_blank" style="color:#00FFA3;text-decoration:underline">Supabase Auth → Users → Add user</a> (email + mot de passe provisoire)<br>2. L\'utilisateur reçoit un email d\'activation<br>3. Revenir ici, sélectionner le client, saisir l\'email → <strong>Link</strong>';
    card.appendChild(guide);

    // Search clients
    const searchWrap = el('div');
    searchWrap.style.cssText = 'display:flex;gap:8px;margin-bottom:12px';
    const searchInput = document.createElement('input');
    searchInput.placeholder = '🔍 Rechercher un client…';
    searchInput.style.cssText = 'flex:1;padding:10px;background:#111;border:1px solid #334155;border-radius:6px;color:#E2E8F0;font-family:monospace;font-size:.75rem';
    searchWrap.appendChild(searchInput);
    card.appendChild(searchWrap);

    // Client list
    const listWrap = el('div');
    listWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto';
    card.appendChild(listWrap);

    const loadingMsg = el('p', null, '⏳ Chargement des clients…');
    loadingMsg.style.cssText = 'text-align:center;color:#64748B;padding:20px';
    listWrap.appendChild(loadingMsg);

    panel.appendChild(card);
    document.body.appendChild(panel);

    // Load
    await loadClients(searchInput, listWrap);
    searchInput.addEventListener('input', () => loadClients(searchInput, listWrap));
  }

  async function loadClients(searchInput, listWrap) {
    const sb = getClient();
    if (!sb) { listWrap.textContent = '❌ Supabase non disponibile'; return; }

    const q = (searchInput.value || '').trim();
    let query = sb.from('clients').select('id, company_name, cluster, status, email, phone, created_at').order('created_at', { ascending: false }).limit(100);
    if (q) query = query.ilike('company_name', '%' + q + '%');

    const { data, error } = await query;
    listWrap.innerHTML = '';
    if (error) { listWrap.textContent = '❌ ' + error.message; return; }
    if (!data || data.length === 0) { listWrap.textContent = 'Aucun client.'; return; }

    for (const c of data) {
      const row = el('div');
      row.style.cssText = 'padding:12px;background:#111;border:1px solid #334155;border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:10px';

      const info = el('div');
      info.style.cssText = 'flex:1;min-width:0';
      const title = el('div', null, c.company_name);
      title.style.cssText = 'font-weight:800;color:#E2E8F0;margin-bottom:2px';
      const meta = el('div', null, 'Cluster ' + (c.cluster || '—') + ' · ' + (c.status || '—'));
      meta.style.cssText = 'font-size:.65rem;color:#94a3b8';
      info.appendChild(title);
      info.appendChild(meta);
      row.appendChild(info);

      const btn = el('button', null, '🔗 Link profile');
      btn.type = 'button';
      btn.style.cssText = 'padding:8px 14px;background:#00FFA3;color:#0A0D10;border:none;border-radius:6px;font-weight:800;font-size:.7rem;cursor:pointer;font-family:monospace';
      btn.addEventListener('click', () => promptLink(c, row));
      row.appendChild(btn);

      listWrap.appendChild(row);
    }
  }

  async function promptLink(client, row) {
    const email = prompt('Email du profil à lier à "' + client.company_name + '":');
    if (!email) return;
    const fullName = prompt('Nom complet (optionnel):', '') || null;

    const sb = getClient();
    const { data, error } = await sb.rpc('link_client_profile', {
      p_email: email,
      p_client_id: client.id,
      p_full_name: fullName,
    });

    if (error) {
      toast('❌ ' + (error.message || error), true);
      return;
    }
    toast('✅ Profil lié: ' + email, false);
    log('linked', email, '→', client.company_name, data);
    row.style.borderColor = '#00FFA3';
  }

  /* Init */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePanel, { once: true });
  } else {
    ensurePanel();
  }
  log('ready v1.0.0');
})();
