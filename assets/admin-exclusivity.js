/* ==========================================================================
 *  assets/admin-exclusivity.js
 *  Maat OS · Control Tower · Vue Exclusivités Clients (Fase 4)
 *
 *  Flusso:
 *    vettore procura cliente → clients.procured_by_vector_id + exclusive_status='PENDING'
 *    admin in Control Tower → tab "✨ Exclusivités" → Approva / Rifiuta
 *    Approva → UPDATE clients SET exclusive_status='APPROVED',
 *              exclusive_vector_id = procured_by_vector_id
 *
 *  Nessuna RPC. Solo UPDATE clients via Supabase client (RLS admin).
 *  Nessun ALTER DB. Colonne già presenti da handover v9.1.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.MaatAdminExclusivity) return;

  var M = window.Maat, h = M.h;

  var S = {
    rows: [],
    profileMap: {},
    filter: { status: 'PENDING', q: '' }
  };

  /* ─── Helpers ──────────────────────────────────────────────────────── */
  function statusBadge(s) {
    var cls = s === 'APPROVED' ? 'bd-g' : s === 'REJECTED' ? 'bd-r' : s === 'PENDING' ? 'bd-au' : 'bd-n';
    return h('span', { class: 'bd ' + cls, text: s || '—' });
  }

  function uniq(arr) {
    return arr.filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  }

  function btn(t, fn, cls) {
    return h('button', { type: 'button', class: 'btn sm ' + (cls || 'btn-o'), text: t, onclick: fn });
  }

  function kpi(label, value, color) {
    return h('div', { class: 'card !p-3 text-center' },
      h('span', { class: 'text-[9px] text-slate-400 uppercase font-mono block', text: label }),
      h('div', { class: 'font-mono text-2xl font-black mt-1 ' + (color || 'text-white'), text: String(value) })
    );
  }

  /* ─── Data loading ────────────────────────────────────────────────── */
  async function loadRows() {
    var r = await M.sb.from('clients')
      .select('id,company_name,horeca_category,contact_name,phone,email,district,cluster,address,city,status,is_test,procured_by_vector_id,procured_at,exclusive_status,exclusive_vector_id')
      .not('exclusive_status', 'is', null)
      .order('procured_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (r.error) throw r.error;
    return r.data || [];
  }

  async function loadProfiles(ids) {
    if (!ids.length) return {};
    var r = await M.sb.from('profiles')
      .select('id,full_name,email')
      .in('id', ids);
    if (r.error) return {};
    var map = {};
    (r.data || []).forEach(function (p) { map[p.id] = p; });
    return map;
  }

  /* ─── Actions ─────────────────────────────────────────────────────── */
  async function approve(row, btn) {
    if (!(await M.confirm(
      'Approuver l\'exclusivité pour "' + row.company_name + '" ?\n\n' +
      'Le vettore ' + ((S.profileMap[row.procured_by_vector_id] || {}).full_name || row.procured_by_vector_id || '—') +
      ' aura un routage prioritaire sur ce client.'
    ))) return;

    btn.disabled = true;
    var upd = await M.sb.from('clients').update({
      exclusive_status: 'APPROVED',
      exclusive_vector_id: row.procured_by_vector_id
    }).eq('id', row.id).select('id');

    if (upd.error) {
      btn.disabled = false;
      return M.toast('Erreur : ' + upd.error.message, 'err');
    }
    if (!upd.data || !upd.data.length) {
      btn.disabled = false;
      return M.toast('0 ligne mise à jour (RLS ou session MFA)', 'err');
    }
    M.toast('✅ Exclusivité approuvée · ' + row.company_name);
    await refresh(S._box);
  }

  async function reject(row, btn) {
    var reason = window.prompt('Motif du rejet (visible en interne) :', '');
    if (reason === null) return;
    if (!reason.trim()) return M.toast('Motif requis', 'err');

    btn.disabled = true;
    var upd = await M.sb.from('clients').update({
      exclusive_status: 'REJECTED'
    }).eq('id', row.id).select('id');

    if (upd.error) {
      btn.disabled = false;
      return M.toast('Erreur : ' + upd.error.message, 'err');
    }
    if (!upd.data || !upd.data.length) {
      btn.disabled = false;
      return M.toast('0 ligne mise à jour (RLS ou session MFA)', 'err');
    }
    M.toast('✗ Exclusivité rejetée · ' + row.company_name);
    await refresh(S._box);
  }

  async function openDetail(row) {
    var vec = S.profileMap[row.procured_by_vector_id] || {};
    var body = h('div', { class: 'space-y-3 font-mono text-xs' });

    body.appendChild(h('div', { class: 'p-3 bg-black/60 rounded-xl border border-white/10 space-y-1' },
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Établissement' }), h('span', { class: 'text-white font-bold', text: row.company_name || '—' })),
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Catégorie' }), h('span', { class: 'text-white', text: row.horeca_category || '—' })),
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Contact' }), h('span', { class: 'text-white', text: row.contact_name || '—' })),
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Téléphone' }), h('span', { class: 'text-white', text: row.phone || '—' })),
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'District / Cluster' }), h('span', { class: 'text-white', text: [row.district, row.cluster].filter(Boolean).join(' · ') || '—' })),
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Statut client' }), h('span', { class: 'text-white', text: row.status || '—' }))
    ));

    body.appendChild(h('div', { class: 'p-3 bg-cyberGreen/10 rounded-xl border border-cyberGreen/30 space-y-1' },
      h('span', { class: 'text-cyberGreen font-bold block', text: '👤 Vecteur proposant' }),
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Nom' }), h('span', { class: 'text-white', text: vec.full_name || '—' })),
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Email' }), h('span', { class: 'text-white break-all', text: vec.email || '—' })),
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Proposé le' }), h('span', { class: 'text-white', text: row.procured_at ? M.fmt.dt(row.procured_at) : '—' }))
    ));

    body.appendChild(h('div', { class: 'p-3 bg-black/60 rounded-xl border border-white/10 space-y-1' },
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Exclusivité' }), statusBadge(row.exclusive_status)),
      h('div', { class: 'flex justify-between' }, h('span', { class: 'text-slate-400', text: 'Vecteur exclusif' }), h('span', { class: 'text-white text-[10px]', text: row.exclusive_vector_id ? String(row.exclusive_vector_id).slice(0, 8) + '…' : '—' }))
    ));

    M.modal('Exclusivité · ' + row.company_name, body, true);
  }

  /* ─── Render ──────────────────────────────────────────────────────── */
  function render(box) {
    box.innerHTML = '';

    var counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    S.rows.forEach(function (r) {
      if (counts[r.exclusive_status] != null) counts[r.exclusive_status]++;
    });

    var filtered = S.rows.filter(function (r) {
      if (S.filter.status !== 'ALL' && r.exclusive_status !== S.filter.status) return false;
      if (S.filter.q) {
        var hay = ((r.company_name || '') + ' ' + (r.contact_name || '') + ' ' + (r.email || '')).toLowerCase();
        if (hay.indexOf(S.filter.q) < 0) return false;
      }
      return true;
    });

    /* Header */
    var statusSel = h('select', { class: 'inp !w-auto !py-1.5 !px-2 text-[11px]' },
      [['PENDING', 'En attente'], ['APPROVED', 'Approuvées'], ['REJECTED', 'Rejetées'], ['ALL', 'Toutes']]
        .map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    statusSel.value = S.filter.status;
    statusSel.onchange = function () { S.filter.status = statusSel.value; render(box); };

    var search = h('input', { type: 'text', class: 'inp !w-44 !py-1.5 text-[11px]', placeholder: 'Rechercher…' });
    search.value = S.filter.q;
    search.oninput = function () { S.filter.q = search.value.toLowerCase(); render(box); };

    box.appendChild(h('div', { class: 'flex flex-wrap justify-between items-end gap-3 mb-4' },
      h('div', null,
        h('h2', { class: 'font-kemetTitle text-xl font-black text-white', text: '✨ Exclusivités Clients' }),
        h('p', { class: 'text-[11px] text-slate-400', text: 'Validez les exclusivités des clients apportés par vos vecteurs ambassadeurs.' })),
      h('div', { class: 'flex flex-wrap gap-2 items-center' },
        statusSel, search,
        btn('⟳ Rafraîchir', function () { refresh(box); }))
    ));

    /* KPI */
    box.appendChild(h('div', { class: 'grid grid-cols-2 md:grid-cols-4 gap-3 mb-4' },
      kpi('En attente', counts.PENDING, 'text-kemetGoldBright'),
      kpi('Approuvées', counts.APPROVED, 'text-cyberGreen'),
      kpi('Rejetées', counts.REJECTED, 'text-red-400'),
      kpi('Total', S.rows.length, 'text-white')
    ));

    /* Lista */
    if (!filtered.length) {
      box.appendChild(h('div', { class: 'card p-6 text-center text-xs font-mono text-slate-500',
        text: 'Aucune exclusivité dans cette vue.' }));
      return;
    }

    filtered.forEach(function (r, i) {
      var vec = S.profileMap[r.procured_by_vector_id] || {};
      var card = h('div', { class: 'card mb-3', style: '--i:' + i },
        h('div', { class: 'flex justify-between items-start gap-2 flex-wrap' },
          h('div', { class: 'flex-1 min-w-0' },
            h('p', { class: 'font-bold text-sm text-white', text: r.company_name || '—' }),
            h('p', { class: 'text-[10px] font-mono text-slate-400',
              text: (r.horeca_category || 'B2B') + ' · ' + ([r.district, r.cluster].filter(Boolean).join(' · ') || '—') })),
          statusBadge(r.exclusive_status)),
        h('div', { class: 'mt-2 p-2 bg-black/40 rounded-lg text-[10px] font-mono space-y-1' },
          h('div', { class: 'flex justify-between' },
            h('span', { class: 'text-slate-400', text: 'Vecteur proposant' }),
            h('span', { class: 'text-cyberGreen', text: vec.full_name || vec.email || '—' })),
          h('div', { class: 'flex justify-between' },
            h('span', { class: 'text-slate-400', text: 'Proposé le' }),
            h('span', { class: 'text-white', text: r.procured_at ? M.fmt.dt(r.procured_at) : '—' }))
        ),
        h('div', { class: 'flex gap-1 flex-wrap mt-3' },
          r.exclusive_status === 'PENDING' ? btn('✓ Approuver', function () { approve(r, this); }, 'btn-g') : null,
          r.exclusive_status === 'PENDING' ? btn('✗ Rejeter', function () { reject(r, this); }, 'btn-r') : null,
          btn('👁 Détail', function () { openDetail(r); })
        )
      );
      box.appendChild(card);
    });
  }

  /* ─── Refresh ─────────────────────────────────────────────────────── */
  async function refresh(box) {
    S._box = box;
    try {
      S.rows = await loadRows();
      var ids = uniq(S.rows.map(function (r) { return r.procured_by_vector_id; }));
      S.profileMap = await loadProfiles(ids);
      render(box);
    } catch (e) {
      box.innerHTML = '';
      box.appendChild(h('div', { class: 'card text-xs text-red-400 font-mono',
        text: 'Erreur : ' + (e.message || e) }));
    }
  }

  /* ─── API pubblica ────────────────────────────────────────────────── */
  window.MaatAdminExclusivity = {
    view: function (box) { return refresh(box); },
    refresh: function () { if (S._box) return refresh(S._box); }
  };
})();
