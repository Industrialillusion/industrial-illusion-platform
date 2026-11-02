
/* ==========================================================================
 *  assets/admin-clients.js
 *  Maat OS · Admin · Client Onboarding Panel
 *  Phase: Pilastro 2 · 2.1c
 *  - FAB bottom-right "Clients"
 *  - Modale overlay con lista clienti + search
 *  - Pannello dettaglio cliente: profili collegati + form link nuovo
 *  - Zero prompt/alert browser nativi
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

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
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
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:10000;' +
      'padding:12px 20px;border-radius:8px;font-family:"JetBrains Mono",monospace;font-size:.75rem;' +
      'font-weight:700;max-width:90vw;box-shadow:0 4px 20px rgba(0,0,0,0.5);' +
      'background:' + (isErr ? '#7f1d1d' : '#065f46') + ';' +
      'color:#fff;border:1px solid ' + (isErr ? '#F87171' : '#00FFA3');
    clearTimeout(t._tm);
    t._tm = setTimeout(() => { t.remove(); }, 3200);
  }

  /* ─── FAB ───────────────────────────────────────────────────────────── */
  function ensureFab() {
    if (document.getElementById('ac-fab')) return;
    const fab = el('button', null, '👥 Clients');
    fab.id = 'ac-fab';
    fab.type = 'button';
    fab.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9990;padding:12px 18px;' +
      'background:#C5A059;color:#0A0D10;border:none;border-radius:50px;font-weight:800;' +
      'font-family:"JetBrains Mono",monospace;font-size:.8rem;cursor:pointer;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.5)';
    fab.addEventListener('click', openClientList);
    document.body.appendChild(fab);
  }

  /* ─── Modal builder ─────────────────────────────────────────────────── */
  function openModal(buildBody) {
    document.querySelectorAll('.ac-modal-overlay').forEach(m => m.remove());

    const ov = el('div', 'ac-modal-overlay');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);' +
      'backdrop-filter:blur(4px);overflow-y:auto;padding:20px;' +
      'display:flex;align-items:flex-start;justify-content:center';
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });

    const card = el('div');
    card.style.cssText = 'width:100%;max-width:720px;margin-top:20px;background:#0A0D10;' +
      'border:1px solid #C5A059;border-radius:12px;padding:20px 22px;' +
      'font-family:"JetBrains Mono",monospace;font-size:.8rem;color:#E2E8F0;' +
      'box-shadow:0 20px 60px rgba(0,0,0,0.7)';

    ov.appendChild(card);
    document.body.appendChild(ov);
    buildBody(card, ov);
  }

  function headerBlock(title, subtitle, onClose) {
    const hdr = el('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #1f2937';
    const left = el('div');
    const t = el('h2', null, title);
    t.style.cssText = 'margin:0;color:#C5A059;font-size:1.05rem;font-weight:800';
    left.appendChild(t);
    if (subtitle) {
      const s = el('p', null, subtitle);
      s.style.cssText = 'margin:4px 0 0;color:#94a3b8;font-size:.7rem';
      left.appendChild(s);
    }
    hdr.appendChild(left);
    const close = el('button', null, '✕');
    close.type = 'button';
    close.style.cssText = 'background:none;border:1px solid #64748B;color:#94a3b8;' +
      'width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:1rem;flex-shrink:0';
    close.addEventListener('click', onClose);
    hdr.appendChild(close);
    return hdr;
  }

  /* ─── Modale 1: lista clienti ───────────────────────────────────────── */
  function openClientList() {
    openModal((card, ov) => {
      const close = () => ov.remove();
      card.appendChild(headerBlock('👥 Onboarding Clients', 'Sélectionnez un client pour gérer ses profils', close));

      const searchInput = document.createElement('input');
      searchInput.placeholder = '🔍 Rechercher un client…';
      searchInput.style.cssText = 'width:100%;box-sizing:border-box;padding:10px 12px;background:#111;' +
        'border:1px solid #334155;border-radius:6px;color:#E2E8F0;' +
        'font-family:"JetBrains Mono",monospace;font-size:.75rem;margin-bottom:12px';
      card.appendChild(searchInput);

      const list = el('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:450px;overflow-y:auto';
      card.appendChild(list);

      async function load() {
        const sb = getClient();
        if (!sb) { list.textContent = '❌ Supabase non disponible'; return; }
        list.textContent = '⏳ Chargement…';
        const q = (searchInput.value || '').trim();
        let req = sb.from('clients').select('id, company_name, cluster, status, email, contact_name')
          .order('created_at', { ascending: false }).limit(100);
        if (q) req = req.ilike('company_name', '%' + q + '%');
        const { data, error } = await req;
        list.innerHTML = '';
        if (error) { list.textContent = '❌ ' + error.message; return; }
        if (!data || data.length === 0) { list.textContent = 'Aucun client.'; list.style.cssText += ';color:#64748B;padding:12px;text-align:center'; return; }

        for (const c of data) {
          const row = el('div');
          row.style.cssText = 'padding:12px 14px;background:#111;border:1px solid #334155;' +
            'border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;' +
            'cursor:pointer;transition:border-color .15s';
          row.addEventListener('mouseenter', () => { row.style.borderColor = '#C5A059'; });
          row.addEventListener('mouseleave', () => { row.style.borderColor = '#334155'; });

          const info = el('div');
          info.style.cssText = 'flex:1;min-width:0';
          const title = el('div', null, c.company_name);
          title.style.cssText = 'font-weight:800;color:#E2E8F0;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          const meta = el('div', null,
            (c.contact_name ? '👤 ' + c.contact_name + ' · ' : '') +
            'Cluster ' + (c.cluster || '—') + ' · ' + (c.status || '—'));
          meta.style.cssText = 'font-size:.65rem;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          info.appendChild(title);
          info.appendChild(meta);
          row.appendChild(info);

          const arr = el('span', null, '→');
          arr.style.cssText = 'color:#C5A059;font-size:1.2rem;font-weight:800';
          row.appendChild(arr);

          row.addEventListener('click', () => openClientDetail(c, ov));
          list.appendChild(row);
        }
      }

      searchInput.addEventListener('input', load);
      load();
    });
  }

  /* ─── Modale 2: dettaglio cliente ───────────────────────────────────── */
  async function openClientDetail(client, parentOverlay) {
    if (parentOverlay) parentOverlay.remove();

    openModal(async (card, ov) => {
      const close = () => ov.remove();
      card.appendChild(headerBlock(
        '🏢 ' + client.company_name,
        'ID: ' + client.id + (client.contact_name ? ' · Référent: ' + client.contact_name : ''),
        close
      ));

      // Guide bloc
      const guide = el('div');
      guide.style.cssText = 'background:rgba(197,160,89,0.08);border:1px solid rgba(197,160,89,0.4);' +
        'border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:.7rem;line-height:1.6;color:#cbd5e1';
      guide.innerHTML = '<strong style="color:#C5A059">📋 Procédure :</strong><br>' +
        '1. Créer l\'utilisateur dans <a href="https://supabase.com/dashboard/project/sqlgsaxdqcgwfxjrkpuc/auth/users" target="_blank" style="color:#00FFA3;text-decoration:underline">Supabase Auth → Users → Add user</a> (email + mot de passe provisoire, cocher "Auto Confirm")<br>' +
        '2. Revenir ici, saisir l\'email et le nom du référent → <strong>Lier le profil</strong><br>' +
        '3. L\'utilisateur reçoit un mot de passe provisoire qu\'il devra changer au premier login';
      card.appendChild(guide);

      // Section 1: profils existants
      const sec1Title = el('h3', null, '🔗 Profils actuellement liés');
      sec1Title.style.cssText = 'color:#00FFA3;font-size:.75rem;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em';
      card.appendChild(sec1Title);

      const profilesList = el('div');
      profilesList.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:18px;min-height:40px';
      profilesList.textContent = '⏳ Chargement…';
      card.appendChild(profilesList);

      async function loadProfiles() {
        const sb = getClient();
        const { data, error } = await sb.rpc('get_client_profiles', { p_client_id: client.id });
        profilesList.innerHTML = '';
        if (error) { profilesList.textContent = '❌ ' + error.message; return; }
        if (!data || data.length === 0) {
          profilesList.innerHTML = '<div style="color:#64748B;font-style:italic;padding:8px 0">Aucun profil lié pour le moment.</div>';
          return;
        }
        for (const p of data) {
          const row = el('div');
          row.style.cssText = 'padding:10px 12px;background:#111;border:1px solid #334155;' +
            'border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:10px';
          const info = el('div');
          info.style.cssText = 'flex:1;min-width:0';
          const em = el('div', null, p.email);
          em.style.cssText = 'font-weight:700;color:#E2E8F0;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          const meta = el('div', null, (p.full_name || '—') + ' · ' + p.role + ' · ' + p.status);
          meta.style.cssText = 'font-size:.62rem;color:#94a3b8';
          info.appendChild(em);
          info.appendChild(meta);
          row.appendChild(info);

          const unlinkBtn = el('button', null, '🗑 Délier');
          unlinkBtn.type = 'button';
          unlinkBtn.style.cssText = 'padding:5px 10px;background:transparent;color:#F87171;' +
            'border:1px solid #F87171;border-radius:6px;font-weight:700;font-size:.65rem;' +
            'cursor:pointer;font-family:"JetBrains Mono",monospace';
          unlinkBtn.addEventListener('click', async () => {
            if (!confirm('Délier ' + p.email + ' ? L\'utilisateur sera suspendu.')) return;
            unlinkBtn.disabled = true;
            unlinkBtn.textContent = '…';
            const sb2 = getClient();
            const { error: e2 } = await sb2.rpc('unlink_client_profile', { p_email: p.email });
            if (e2) { toast('❌ ' + e2.message, true); unlinkBtn.disabled = false; unlinkBtn.textContent = '🗑 Délier'; return; }
            toast('✅ Profil délié', false);
            loadProfiles();
          });
          row.appendChild(unlinkBtn);
          profilesList.appendChild(row);
        }
      }
      loadProfiles();

      // Section 2: form link nuovo profilo
      const sec2Title = el('h3', null, '➕ Lier un nouveau profil');
      sec2Title.style.cssText = 'color:#00FFA3;font-size:.75rem;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em';
      card.appendChild(sec2Title);

      const form = el('div');
      form.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:14px;' +
        'background:#0F1419;border:1px solid #334155;border-radius:8px';

      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.placeholder = 'Email du référent (déjà créé dans Supabase Auth)';
      emailInput.style.cssText = 'padding:10px 12px;background:#111;border:1px solid #334155;' +
        'border-radius:6px;color:#E2E8F0;font-family:"JetBrains Mono",monospace;font-size:.75rem';
      form.appendChild(emailInput);

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'Nom complet du référent (ex: El Mahdi Zandoul)';
      nameInput.style.cssText = emailInput.style.cssText;
      form.appendChild(nameInput);

      const submitBtn = el('button', null, '🔗 Lier le profil');
      submitBtn.type = 'button';
      submitBtn.style.cssText = 'padding:10px 16px;background:#00FFA3;color:#0A0D10;' +
        'border:none;border-radius:6px;font-weight:800;font-size:.75rem;cursor:pointer;' +
        'font-family:"JetBrains Mono",monospace';
      submitBtn.addEventListener('click', async () => {
        const email = (emailInput.value || '').trim();
        const name = (nameInput.value || '').trim();
        if (!email) { toast('Email obligatoire', true); emailInput.focus(); return; }
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Liaison…';
        const sb = getClient();
        const { data, error } = await sb.rpc('link_client_profile', {
          p_email: email,
          p_client_id: client.id,
          p_full_name: name || null,
        });
        submitBtn.disabled = false;
        submitBtn.textContent = '🔗 Lier le profil';
        if (error) {
          const msg = error.message || String(error);
          if (msg.includes('PROFILE_NOT_FOUND')) {
            toast('❌ Profil inexistant. Créez d\'abord l\'utilisateur dans Supabase Auth → Users', true);
          } else if (msg.includes('CANNOT_LINK_ROLE')) {
            toast('❌ Ce profil a un rôle admin/operator, impossible à lier', true);
          } else {
            toast('❌ ' + msg, true);
          }
          return;
        }
        toast('✅ Profil lié: ' + email, false);
        emailInput.value = '';
        nameInput.value = '';
        log('linked', email, '→', client.company_name);
        loadProfiles();
      });
      form.appendChild(submitBtn);
      card.appendChild(form);
    });
  }

  /* Init */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureFab, { once: true });
  } else {
    ensureFab();
  }
  log('ready v2.0.0');
})();
