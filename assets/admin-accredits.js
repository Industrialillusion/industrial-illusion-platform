/* ==========================================================================
 *  assets/admin-accredits.js
 *  Control Tower · Unificazione Accrediti Istituzionali
 *  - Tab Data Lake / K-MEH-20
 *  - Filtro status (PENDING / APPROVED / REJECTED / ALL)
 *  - Azioni Approva / Rifiuta via RPC
 *  - Copia token
 *  - Realtime + fallback polling
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatAccreditsLoaded) return;
  window.__MaatAccreditsLoaded = true;

  const CFG = {
    sources: {
      datalake: {
        table:  'datalake_access_requests',
        label:  'Maat Data Lake',
        accent: 'green',
      },
      kmeh20: {
        table:  'kmeh20_access_requests',
        label:  'K-MEH-20',
        accent: 'gold',
      },
    },
    pollMs:       60000,
    clientWaitMs: 8000,
  };

  const S = {
    client:        null,
    currentSource: 'datalake',
    currentStatus: 'PENDING',
    data:          { datalake: [], kmeh20: [] },
    channel:       null,
    poll:          null,
    booted:        false,
    $section:      null,
    $list:         null,
    $badge:        null,
    $statusFilter: null,
    $tabs:         null,
  };

  const log  = (...a) => console.log('[accredits]', ...a);
  const warn = (...a) => console.warn('[accredits]', ...a);

  /* ─── Client detection ──────────────────────────────────────────────── */
  function getClient() {
    if (S.client) return S.client;
    const cands = [window.Maat && window.Maat.sb, window.maatSupabase,
                   window.supabaseClient, window.sb];
    for (const c of cands) {
      if (c && typeof c.from === 'function' && typeof c.rpc === 'function') {
        S.client = c; return c;
      }
    }
    try {
      if (window.Maat && typeof window.Maat.init === 'function') {
        window.Maat.init();
        if (window.Maat.sb) { S.client = window.Maat.sb; return S.client; }
      }
    } catch (_) {}
    return null;
  }

  function waitForClient(deadline) {
    return new Promise((resolve) => {
      const tick = () => {
        if (getClient()) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  /* ─── Utils ─────────────────────────────────────────────────────────── */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  /* ─── Normalizza record da diverse fonti ────────────────────────────── */
  function normalizeRecord(row, source) {
    if (!row) return null;
    return {
      id:          row.id,
      source,
      fullName:    row.full_name || '—',
      entity:      row.entity_name || row.organization || '—',
      role:        row.role_title || row.category || '—',
      investorType: row.investor_type || null,
      email:       row.email || '—',
      phone:       row.phone || '—',
      motivation:  row.motivation || '—',
      nda:         !!row.nda_accepted,
      status:      (row.status || 'PENDING').toUpperCase(),
      token:       row.access_token || null,
      notes:       row.notes || null,
      createdAt:   row.created_at,
      reviewedAt:  row.reviewed_at,
    };
  }

  /* ─── Caricamento ───────────────────────────────────────────────────── */
  async function loadSource(sourceKey) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase client non disponibile');

    const source = CFG.sources[sourceKey];
    if (!source) throw new Error('Sorgente sconosciuta: ' + sourceKey);

    try {
      const { data, error } = await sb
        .from(source.table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        warn(`load ${sourceKey} failed:`, error.message);
        return [];
      }

      return (data || []).map(r => normalizeRecord(r, sourceKey)).filter(Boolean);
    } catch (err) {
      warn(`load ${sourceKey} exception:`, err.message);
      return [];
    }
  }

  async function loadAll() {
    renderLoading();
    const [datalake, kmeh20] = await Promise.all([
      loadSource('datalake'),
      loadSource('kmeh20'),
    ]);
    S.data.datalake = datalake;
    S.data.kmeh20   = kmeh20;
    render();
    updateBadge();
  }

  /* ─── Rendering ─────────────────────────────────────────────────────── */
  function renderLoading() {
    if (!S.$list) return;
    S.$list.innerHTML = '<div class="admin-accredits__loading">Caricamento…</div>';
  }

  function render() {
    if (!S.$list) return;

    const allRows = S.data[S.currentSource] || [];
    const filtered = S.currentStatus === 'ALL'
      ? allRows
      : allRows.filter(r => r.status === S.currentStatus);

    S.$list.replaceChildren();

    if (!filtered.length) {
      const emptyMsg = S.currentStatus === 'PENDING'
        ? 'Nessuna richiesta in attesa'
        : `Nessuna richiesta con status ${S.currentStatus}`;
      const empty = el('div', 'admin-accredits__empty', emptyMsg);
      S.$list.appendChild(empty);
      return;
    }

    filtered.forEach(row => S.$list.appendChild(buildCard(row)));
  }

  function buildCard(row) {
    const statusClass = 'accredit-card--' + row.status.toLowerCase();
    const card = el('article', `accredit-card ${statusClass}`);

    // Head: source + status + date
    const head = el('div', 'accredit-card__head');
    const sourceBadge = el('span',
      'accredit-card__source' + (row.source === 'kmeh20' ? ' accredit-card__source--kmeh20' : ''),
      CFG.sources[row.source].label);
    head.appendChild(sourceBadge);

    const statusBadge = el('span',
      'accredit-card__status accredit-card__status--' + row.status.toLowerCase(),
      row.status);
    head.appendChild(statusBadge);

    head.appendChild(el('span', 'accredit-card__date', fmtDate(row.createdAt)));
    card.appendChild(head);

    // Nome + entità
    card.appendChild(el('h4', 'accredit-card__name', row.fullName));
    if (row.entity !== '—') {
      card.appendChild(el('p', 'accredit-card__entity', row.entity));
    }

    // Meta: email, phone, role
    const meta = el('div', 'accredit-card__meta');
    if (row.email !== '—') {
      const emailLink = el('a');
      emailLink.href = 'mailto:' + row.email;
      emailLink.textContent = row.email;
      meta.appendChild(emailLink);
    }
    if (row.phone !== '—') meta.appendChild(el('span', null, '📞 ' + row.phone));
    if (row.role !== '—')  meta.appendChild(el('span', null, '🏷 ' + row.role));
    if (row.investorType)  meta.appendChild(el('span', null, '💼 ' + row.investorType));
    if (!row.nda)          meta.appendChild(el('span', null, '⚠️ NDA non accettato'));
    card.appendChild(meta);

    // Motivation
    if (row.motivation && row.motivation !== '—') {
      const mot = el('div', 'accredit-card__motivation');
      mot.textContent = row.motivation;
      card.appendChild(mot);
    }

    // Notes (se presenti)
    if (row.notes) {
      const notes = el('div', 'accredit-card__notes');
      notes.textContent = row.notes;
      card.appendChild(notes);
    }

    // Token (se approvato)
    if (row.status === 'APPROVED' && row.token) {
      const tokenBox = el('div', 'accredit-card__token');
      tokenBox.appendChild(el('span', 'accredit-card__token-label', 'Token:'));
      tokenBox.appendChild(el('span', 'accredit-card__token-value', row.token));
      const copyBtn = el('button', 'accredit-btn accredit-btn--copy', '📋');
      copyBtn.type = 'button';
      copyBtn.title = 'Copia token';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(row.token).then(
          () => { copyBtn.textContent = '✓'; setTimeout(() => copyBtn.textContent = '📋', 1500); },
          () => alert('Copia manuale: ' + row.token)
        );
      });
      tokenBox.appendChild(copyBtn);
      card.appendChild(tokenBox);
    }

    // Actions (solo se PENDING)
    if (row.status === 'PENDING') {
      const actions = el('div', 'accredit-card__actions');

      const approveBtn = el('button', 'accredit-btn accredit-btn--approve', '✓ Approva');
      approveBtn.type = 'button';
      approveBtn.addEventListener('click', () => {
        const notes = window.prompt('Note di approvazione (opzionali):', '');
        if (notes === null) return;
        doApprove(row, notes, approveBtn);
      });
      actions.appendChild(approveBtn);

      const rejectBtn = el('button', 'accredit-btn accredit-btn--reject', '✕ Rifiuta');
      rejectBtn.type = 'button';
      rejectBtn.addEventListener('click', () => {
        const notes = window.prompt('Motivo del rifiuto (obbligatorio):', '');
        if (notes === null) return;
        if (!notes.trim()) { window.alert('Note obbligatorie per rifiutare'); return; }
        doReject(row, notes, rejectBtn);
      });
      actions.appendChild(rejectBtn);

      card.appendChild(actions);
    }

    return card;
  }

  /* ─── Azioni ────────────────────────────────────────────────────────── */
  async function doApprove(row, notes, btn) {
    const sb = getClient(); if (!sb) return;
    btn.disabled = true;
    btn.textContent = 'Approvazione…';
    try {
      const { data, error } = await sb.rpc('approve_accreditation', {
        p_source: row.source,
        p_id:     row.id,
        p_notes:  notes || null,
      });
      if (error) throw error;
      log('approved', row.id, data);
      if (window.Maat && window.Maat.toast) {
        window.Maat.toast('Accreditamento approvato. Token generato.', 'ok');
      }
      await loadAll();
    } catch (err) {
      warn('approve failed:', err);
      btn.disabled = false;
      btn.textContent = '✓ Approva';
      window.alert('Approvazione fallita: ' + (err.message || err));
    }
  }

  async function doReject(row, notes, btn) {
    const sb = getClient(); if (!sb) return;
    btn.disabled = true;
    btn.textContent = 'Rifiuto…';
    try {
      const { data, error } = await sb.rpc('reject_accreditation', {
        p_source: row.source,
        p_id:     row.id,
        p_notes:  notes,
      });
      if (error) throw error;
      log('rejected', row.id, data);
      if (window.Maat && window.Maat.toast) {
        window.Maat.toast('Accreditamento rifiutato.', 'warn');
      }
      await loadAll();
    } catch (err) {
      warn('reject failed:', err);
      btn.disabled = false;
      btn.textContent = '✕ Rifiuta';
      window.alert('Rifiuto fallito: ' + (err.message || err));
    }
  }

  /* ─── Badge pending totale ──────────────────────────────────────────── */
  function updateBadge() {
    if (!S.$badge) return;
    const totalPending =
      (S.data.datalake || []).filter(r => r.status === 'PENDING').length +
      (S.data.kmeh20   || []).filter(r => r.status === 'PENDING').length;
    if (totalPending > 0) {
      S.$badge.hidden = false;
      S.$badge.textContent = String(totalPending);
    } else {
      S.$badge.hidden = true;
    }
  }

  /* ─── Realtime ──────────────────────────────────────────────────────── */
  function subscribe() {
    const sb = getClient();
    if (!sb) return;
    if (S.channel) { try { sb.removeChannel(S.channel); } catch (_) {} }

    try {
      S.channel = sb
        .channel('accredits-tower')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: CFG.sources.datalake.table },
            () => loadAll())
        .on('postgres_changes',
            { event: '*', schema: 'public', table: CFG.sources.kmeh20.table },
            () => loadAll())
        .subscribe((status) => {
          log('realtime', status);
          if (status === 'SUBSCRIBED') {
            if (S.poll) { clearInterval(S.poll); S.poll = null; }
          } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
            startPolling();
          }
        });
    } catch (err) {
      warn('subscribe failed:', err.message);
      startPolling();
    }
  }

  function startPolling() {
    if (S.poll) return;
    warn('fallback polling ogni', CFG.pollMs, 'ms');
    S.poll = setInterval(loadAll, CFG.pollMs);
  }

  /* ─── Event bindings ────────────────────────────────────────────────── */
  function bindControls() {
    // Tabs
    if (S.$tabs) {
      S.$tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          S.currentSource = tab.dataset.source;
          S.$tabs.forEach(t => t.classList.toggle('is-active', t === tab));
          render();
        });
      });
    }

    // Status filter
    if (S.$statusFilter) {
      S.$statusFilter.addEventListener('change', () => {
        S.currentStatus = S.$statusFilter.value;
        render();
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('admin-accredits-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadAll);
    }
  }

  /* ─── Init ──────────────────────────────────────────────────────────── */
  async function init() {
    if (S.booted) return;

    S.$section      = document.getElementById('admin-accredits');
    S.$list         = document.getElementById('admin-accredits-list');
    S.$badge        = document.getElementById('admin-accredits-badge');
    S.$statusFilter = document.getElementById('admin-accredits-status');
    S.$tabs         = Array.from(document.querySelectorAll('.admin-accredits__tab'));

    if (!S.$section || !S.$list) {
      warn('#admin-accredits o #admin-accredits-list non trovati');
      return;
    }

    const ready = await waitForClient(Date.now() + CFG.clientWaitMs);
    if (!ready) { warn('client Supabase assente'); return; }

    S.booted = true;
    S.$section.hidden = false;

    bindControls();
    await loadAll();
    subscribe();
    log('online');
  }

  /* ─── Public API ────────────────────────────────────────────────────── */
  window.MaatAccredits = {
    init,
    refresh: loadAll,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
