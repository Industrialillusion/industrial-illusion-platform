/* ==========================================================================
 *  assets/admin-variance.js
 *  Phase 🅲 · Control Tower — Doppia Pesata Atomica
 *  Colonne reali: qr_code, weight_collect_kg, weight_depot_kg, delta_pct
 *  Tabella: variance_alerts (OPEN/INVESTIGATING/RESOLVED/REJECTED)
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatVarianceTowerLoaded) return;
  window.__MaatVarianceTowerLoaded = true;

  const CFG = {
    table: 'variance_alerts',
    pollMs: 30000,
    soundOn: true,
    maxCards: 6,
    openStates: ['OPEN', 'INVESTIGATING'],
    thresholdPct: 3.00,
    clientWaitMs: 8000,
  };

  const S = {
    client: null, channel: null, poll: null, alerts: new Map(),
    audio: null, $section: null, $stack: null, $badge: null, booted: false,
  };

  const ACTION_LABEL = {
    ACCEPTED_P1: 'Accetta P1',
    ACCEPTED_P2: 'Accetta P2',
    REWEIGH:     'Ripesatura',
    REJECTED:    'Rifiuta',
  };

  const log  = (...a) => { if (window.__MAAT_DEBUG__) console.log('[variance]', ...a); };
  const warn = (...a) => console.warn('[variance]', ...a);

  function getClient() {
    if (S.client) return S.client;
    const cands = [window.Maat && window.Maat.sb, window.maatSupabase,
                   window.supabaseClient, window.sb];
    for (const c of cands) {
      if (c && typeof c.from === 'function' && typeof c.channel === 'function') {
        S.client = c; return c;
      }
    }
    try {
      if (window.Maat && typeof window.Maat.init === 'function') {
        window.Maat.init();
        if (window.Maat.sb && typeof window.Maat.sb.from === 'function') {
          S.client = window.Maat.sb; return S.client;
        }
      }
    } catch (_) {}
    return null;
  }

  function deriveSeverity(delta) {
    const d = Number(delta);
    if (!Number.isFinite(d)) return 'warning';
    if (d > CFG.thresholdPct * 2.0) return 'fraud_suspected';
    if (d > CFG.thresholdPct * 1.5) return 'critical';
    return 'warning';
  }

  const fmt = (n, d) => {
    const v = Number(n);
    return Number.isFinite(v)
      ? v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d })
      : '—';
  };

  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  };

  function beep() {
    if (!CFG.soundOn) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      S.audio = S.audio || new Ctx();
      if (S.audio.state === 'suspended') S.audio.resume();
      const t0 = S.audio.currentTime;
      [880, 660, 880].forEach((f, i) => {
        const o = S.audio.createOscillator(), g = S.audio.createGain(), t = t0 + i * 0.12;
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        o.connect(g).connect(S.audio.destination);
        o.start(t); o.stop(t + 0.12);
      });
    } catch (_) {}
  }

  function render() {
    if (!S.$stack) return;
    const rows = [...S.alerts.values()]
      .filter(a => CFG.openStates.includes(a.status))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, CFG.maxCards);
    S.$stack.replaceChildren();
    if (!rows.length) {
      if (S.$section) S.$section.hidden = true;
      if (S.$badge)   S.$badge.hidden   = true;
      return;
    }
    if (S.$section) S.$section.hidden = false;
    if (S.$badge) { S.$badge.hidden = false; S.$badge.textContent = String(rows.length); }
    rows.forEach(a => S.$stack.appendChild(buildCard(a)));
  }

  function buildCard(a) {
    const sev = deriveSeverity(a.delta_pct);
    const card = el('article', `variance-card variance-card--${sev}`);
    card.dataset.alertId = a.id;
    card.setAttribute('role', 'alert');

    const head = el('header', 'variance-card__head');
    head.appendChild(el('span', 'variance-card__bag', a.qr_code || '—'));
    head.appendChild(el('span', `variance-pill variance-pill--${sev}`,
      sev.toUpperCase().replace('_', ' ')));
    head.appendChild(el('span', 'variance-card__delta', `Δ ${fmt(a.delta_pct, 2)}%`));
    card.appendChild(head);

    const meta = el('div', 'variance-card__meta');
    meta.appendChild(el('span', null, `P1 ${fmt(a.weight_collect_kg, 2)} kg`));
    meta.appendChild(el('span', 'variance-card__arrow', '→'));
    meta.appendChild(el('span', null, `P2 ${fmt(a.weight_depot_kg, 2)} kg`));
    meta.appendChild(el('span', 'variance-card__thr', `soglia ${fmt(CFG.thresholdPct, 2)}%`));
    meta.appendChild(el('span', 'variance-card__time', fmtTime(a.created_at)));
    card.appendChild(meta);

    if (a.status === 'INVESTIGATING')
      card.appendChild(el('p', 'variance-card__state', '● In corso di verifica'));

    const actions = el('div', 'variance-card__actions');
    if (a.status === 'OPEN') {
      const ack = el('button', 'variance-btn variance-btn--ghost', 'Prendi in carico');
      ack.type = 'button';
      ack.addEventListener('click', () =>
        rpc('acknowledge_variance_alert', { p_alert_id: a.id }, ack));
      actions.appendChild(ack);
    }
    Object.entries(ACTION_LABEL).forEach(([action, label]) => {
      const b = el('button', 'variance-btn', label);
      b.type = 'button';
      b.addEventListener('click', () => {
        const notes = window.prompt(`Note per «${label}» (obbligatorie per override):`, '');
        if (notes === null) return;
        if (!notes.trim() && action !== 'REJECTED') {
          window.alert('Motivazione obbligatoria per questa azione.');
          return;
        }
        rpc('resolve_variance_alert',
            { p_alert_id: a.id, p_action: action, p_notes: notes }, b);
      });
      actions.appendChild(b);
    });
    card.appendChild(actions);
    return card;
  }

  async function rpc(fn, args, btn) {
    const c = getClient(); if (!c) return;
    if (btn) btn.disabled = true;
    try {
      const { data, error } = await c.rpc(fn, args);
      if (error) throw error;
      log(fn, 'ok', data);
      if (data && data.id) upsert(data); else refresh();
    } catch (err) {
      warn(fn, 'failed', err);
      window.alert('Operazione non riuscita: ' + (err && err.message ? err.message : err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function upsert(row) {
    if (!row || !row.id) return;
    const isNewOpen = !S.alerts.has(row.id) && CFG.openStates.includes(row.status);
    S.alerts.set(row.id, row);
    if (isNewOpen) { beep(); log('nuovo alert', row.id, row.qr_code); }
    render();
  }

  async function refresh() {
    const c = getClient(); if (!c) return;
    try {
      const { data, error } = await c
        .from(CFG.table)
        .select('id,collection_id,qr_code,weight_collect_kg,weight_depot_kg,' +
                'delta_pct,status,notes,created_at')
        .in('status', CFG.openStates)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      S.alerts.clear();
      (data || []).forEach(r => S.alerts.set(r.id, r));
      render();
      log('refresh', data ? data.length : 0, 'alert attivi');
    } catch (err) { warn('refresh fallito (fail-silent)', err); }
  }

  function subscribe() {
    const c = getClient();
    if (!c) { startPolling(); return; }
    if (S.channel) { try { c.removeChannel(S.channel); } catch (_) {} }
    S.channel = c
      .channel('maat-variance-tower')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: CFG.table },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              S.alerts.delete(payload.old.id); render(); return;
            }
            upsert(payload.new);
          })
      .subscribe((status) => {
        log('realtime', status);
        if (status === 'SUBSCRIBED') stopPolling();
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) startPolling();
      });
  }

  function startPolling() {
    if (S.poll) return;
    warn('Realtime non disponibile → fallback polling ogni', CFG.pollMs, 'ms');
    S.poll = setInterval(refresh, CFG.pollMs); refresh();
  }
  function stopPolling() {
    if (S.poll) { clearInterval(S.poll); S.poll = null; log('polling fermato'); }
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

  async function init() {
    if (S.booted) return;
    S.$section = document.getElementById('variance-tower');
    S.$stack   = document.getElementById('variance-alert-stack');
    S.$badge   = document.getElementById('variance-badge');
    const btn = document.getElementById('variance-refresh');
    if (btn) btn.addEventListener('click', refresh);
    if (!S.$stack) { warn('#variance-alert-stack assente'); return; }
    const ready = await waitForClient(Date.now() + CFG.clientWaitMs);
    if (!ready) { warn('client Supabase assente'); return; }
    S.booted = true;
    await refresh();
    subscribe();
    log('tower online');
  }

  window.MaatVarianceTower = {
    init, refresh, beep,
    get alerts() { return [...S.alerts.values()]; },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else { init(); }
})();
