
/* ============================================================
   MAAT OS — Noyau partagé (PWA opérateurs + Control Tower)
   Industrial Illusion SARL · Projet PurKemet
   ------------------------------------------------------------
   Expose window.Maat = { ... } avec toutes les primitives :
     - init()       : instancie le client Supabase
     - h()          : créateur DOM sûr (jamais innerHTML sur données)
     - toast()      : notification visuelle
     - buzz()       : vibration mobile
     - uuid()       : identifiant unique
     - sha()        : empreinte SHA-256
     - fmt.*        : formatage fr-FR (nombres, dates)
     - countUp()    : animation de compteur
     - csv()        : export CSV sécurisé
     - snap/resize  : traitement photo
     - signed()     : URL signée Storage
     - q.*          : file d'attente IndexedDB
     - exec/insert/update/rpc : écritures avec queue offline
     - flush/pending/netInit : gestion réseau
     - profile/signOut/sw : session
     - modal/confirm/form : UI déclarative
   ============================================================ */
(function () {
  'use strict';

  var C = window.II_CONFIG || {}, M = window.Maat = {};
  var $ = M.$ = function (i) { return document.getElementById(i); };

  M.sb = null;
  M.cfg = C;

  /* ---------- Initialisation Supabase ---------- */
  M.init = function () {
    try {
      if (C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase) {
        M.sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
      }
    } catch (e) { M.sb = null; }
    return M.sb;
  };

  /* ---------- DOM sûr : textContent uniquement, jamais innerHTML sur données ---------- */
  M.h = function (tag, a) {
    var e = document.createElement(tag);
    a = a || {};
    for (var k in a) {
      var v = a[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) {
        c.forEach(function (x) { if (x != null && x !== false) e.append(x); });
      } else e.append(c);
    }
    return e;
  };

  /* ---------- Utilitaires ---------- */
  M.toast = function (t, kind) {
    var box = $('toasts');
    if (!box) return;
    var d = M.h('div', { class: 'toast ' + (kind || ''), text: t, role: 'status' });
    box.appendChild(d);
    setTimeout(function () {
      d.classList.add('out');
      setTimeout(function () { d.remove(); }, 320);
    }, 4000);
  };

  M.buzz = function (p) {
    try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {}
  };

  M.uuid = function () {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  };

  M.sha = async function (s) {
    var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.prototype.map.call(
      new Uint8Array(b),
      function (x) { return x.toString(16).padStart(2, '0'); }
    ).join('');
  };

  M.fmt = {
    n: function (v, d) {
      return v == null || isNaN(v)
        ? '—'
        : Number(v).toLocaleString('fr-FR', {
            minimumFractionDigits: d || 0,
            maximumFractionDigits: d || 0
          });
    },
    dt: function (v) {
      return v
        ? new Date(v).toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit',
            hour: '2-digit', minute: '2-digit'
          })
        : '—';
    },
    d: function (v) {
      return v ? new Date(v).toLocaleDateString('fr-FR') : '—';
    }
  };

  M.countUp = function (el, to, dec, suffix) {
    el.classList.remove('skel');
    if (to == null || isNaN(to)) { el.textContent = '—'; return; }
    var t0 = performance.now();
    (function step(t) {
      var p = Math.min((t - t0) / 1000, 1);
      var v = to * (1 - Math.pow(1 - p, 3));
      el.textContent = M.fmt.n(v, dec || 0) + (suffix || '');
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  };

  M.csv = function (rows, name) {
    if (!rows.length) return M.toast('Aucune donnée à exporter.', 'warn');
    var k = Object.keys(rows[0]);
    var esc = function (v) {
      var s = v == null ? '' : String(v);
      if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = "'" + s;
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var t = [k.join(';')]
      .concat(rows.map(function (r) {
        return k.map(function (c) { return esc(r[c]); }).join(';');
      }))
      .join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv' }));
    a.download = name + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };

  /* Images : redimensionnées et compressées avant stockage (preuves photo, contrats). */
  M.snap = function (video) {
    return new Promise(function (res) {
      var k = Math.min(1, 1280 / (video.videoWidth || 1280));
      var c = document.createElement('canvas');
      c.width  = Math.round((video.videoWidth  || 640) * k);
      c.height = Math.round((video.videoHeight || 480) * k);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      c.toBlob(res, 'image/jpeg', 0.65);
    });
  };

  M.resize = async function (file) {
    var bmp = await createImageBitmap(file);
    var k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    var c = document.createElement('canvas');
    c.width  = Math.round(bmp.width  * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.7); });
  };

  M.signed = async function (bucket, path) {
    if (!M.sb || !path) return null;
    var r = await M.sb.storage.from(bucket).createSignedUrl(path, 300);
    return r.data ? r.data.signedUrl : null;
  };

  /* ---------- File d'attente hors-ligne (IndexedDB) : insert / update / rpc, avec fichiers ---------- */
  var DB = null;
  function idb() {
    return new Promise(function (res, rej) {
      if (DB) return res(DB);
      var r = indexedDB.open('maatos', 2);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains('q')) {
          r.result.createObjectStore('q', { keyPath: 'id', autoIncrement: true });
        }
      };
      r.onsuccess = function () { DB = r.result; res(DB); };
      r.onerror   = function () { rej(r.error); };
    });
  }
  function qOp(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('q', mode), out = fn(tx.objectStore('q'));
        tx.oncomplete = function () { res(out && out.result); };
        tx.onerror    = function () { rej(tx.error); };
      });
    });
  }
  M.q = {
    add: function (i) { return qOp('readwrite', function (s) { return s.add(i); }); },
    put: function (i) { return qOp('readwrite', function (s) { return s.put(i); }); },
    all: function () { return qOp('readonly',  function (s) { return s.getAll(); }); },
    del: function (id) { return qOp('readwrite', function (s) { return s.delete(id); }); }
  };

  var isNet = M.isNet = function (e) {
    return !navigator.onLine || /fetch|network|offline|load failed/i.test((e && e.message) || '');
  };

  async function run(it) {
    var sb = M.sb;
    if (!sb) return { net: true };
    try {
      var data = it.data;
      for (var i = 0; it.files && i < it.files.length; i++) {
        var f = it.files[i];
        var u = await sb.storage.from(f.bucket).upload(f.path, f.blob, {
          contentType: 'image/jpeg', upsert: true
        });
        if (u.error) return { net: isNet(u.error), err: u.error };
        data[f.field] = f.path;
      }
      var r = it.op === 'insert'
        ? await sb.from(it.table).insert([data])
        : it.op === 'update'
          ? await sb.from(it.table).update(data).match(it.match)
          : await sb.rpc(it.fn, data);
      if (r.error && r.error.code !== '23505') return { net: isNet(r.error), err: r.error };
      return { ok: true };
    } catch (e) { return { net: true, err: e }; }
  }

  /* Envoi immédiat si possible, sinon file locale. Refus serveur (RLS, schéma) : on n'enfile pas, on informe. */
  M.exec = async function (it) {
    if (M.sb && navigator.onLine) {
      var r = await run(it);
      if (r.ok) return { status: 'sent' };
      if (!r.net) return { status: 'error', message: (r.err && r.err.message) || 'Refusé par le serveur' };
    }
    await M.q.add(it);
    M.pending();
    return { status: 'queued' };
  };

  M.insert = function (table, data, files) { return M.exec({ op: 'insert', table: table, data: data, files: files }); };
  M.update = function (table, data, match, files) { return M.exec({ op: 'update', table: table, data: data, match: match, files: files }); };
  M.rpc    = function (fn, args)  { return M.exec({ op: 'rpc', fn: fn, data: args }); };

  var flushing = false;
  M.flush = async function () {
    if (flushing || !M.sb || !navigator.onLine) return;
    flushing = true;
    try {
      var items = await M.q.all();
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if ((it.tries || 0) >= 4) continue;
        var r = await run(it);
        if (r.ok) { await M.q.del(it.id); continue; }
        if (r.net) break;
        it.tries = (it.tries || 0) + 1;
        await M.q.put(it);
        if (it.tries >= 4) M.toast('Un envoi a été refusé : ' + ((r.err && r.err.message) || 'erreur'), 'err');
      }
    } catch (e) {}
    flushing = false;
    M.pending();
  };

  M.pending = async function () {
    var b = M.badge;
    if (!b) return;
    try {
      var n = (await M.q.all()).length;
      b.textContent = n + ' en attente';
      b.classList.toggle('hidden', !n);
    } catch (e) {}
  };

  M.netInit = function (dot, badge) {
    M.badge = badge;
    var st = function () {
      var on = navigator.onLine;
      if (dot) {
        dot.classList.toggle('off', !on);
        dot.title = on ? 'En ligne' : 'Hors-ligne';
      }
      if (on) M.flush();
      M.pending();
    };
    window.addEventListener('online',  function () { st(); M.toast('Connexion rétablie — synchronisation…'); });
    window.addEventListener('offline', function () { st(); M.toast('Mode hors-ligne : les envois sont mis en file.', 'warn'); });
    st();
    setInterval(M.flush, 30000);
  };

  /* ---------- Session & profil (la vérité vient de la table profiles, protégée par RLS) ---------- */
  M.profile = async function () {
    if (!M.sb) return null;
    var s = await M.sb.auth.getSession();
    var u = s.data && s.data.session && s.data.session.user;
    if (!u) return null;
    var r = await M.sb.from('profiles').select('*').eq('id', u.id).single();
    return r.data || {
      id: u.id, email: u.email, full_name: u.email,
      role: 'public', status: 'PENDING', capabilities: []
    };
  };

  M.signOut = async function () {
    try { if (M.sb) await M.sb.auth.signOut(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    location.reload();
  };

  M.sw = function () {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  };

  /* ---------- Modales & formulaires générés ---------- */
  M.modal = function (title, body, wide) {
    var esc = function (e) { if (e.key === 'Escape') close(); };
    var close = function () {
      ov.remove();
      document.removeEventListener('keydown', esc);
    };
    var ov = M.h('div', {
      class: 'ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
      onclick: function (e) { if (e.target === ov) close(); }
    },
      M.h('div', { class: 'card g box', style: wide ? 'max-width:44rem' : null },
        M.h('div', { class: 'flex justify-between items-center border-b border-white/10 pb-2 mb-3' },
          M.h('span', { class: 'lbl', text: title }),
          M.h('button', {
            type: 'button', class: 'text-xl text-slate-400 hover:text-white',
            'aria-label': 'Fermer', text: '×', onclick: close
          })),
        body));
    document.body.appendChild(ov);
    document.addEventListener('keydown', esc);
    var f = ov.querySelector('input,select,textarea');
    if (f) f.focus();
    return { el: ov, close: close };
  };

  M.confirm = function (text) {
    return new Promise(function (res) {
      var m;
      var done = function (v) { m.close(); res(v); };
      m = M.modal('Confirmation', M.h('div', { class: 'space-y-4' },
        M.h('p', { class: 'text-sm text-slate-200', text: text }),
        M.h('div', { class: 'grid grid-cols-2 gap-2' },
          M.h('button', { type: 'button', class: 'btn btn-o', text: 'Annuler', onclick: function () { done(false); } }),
          M.h('button', { type: 'button', class: 'btn btn-g', text: 'Confirmer', onclick: function () { done(true); } }))));
    });
  };

  /* fields: {k,label,type,options,required,value,min,max,step,accept,capture,placeholder}. */
  M.form = function (title, fields, submitText, onSubmit, wide) {
    var form = M.h('form', { class: 'space-y-3 font-mono text-xs text-left', novalidate: true }),
        inputs = {};
    var err = M.h('p', { class: 'text-[11px] font-bold text-red-400 min-h-[1rem]', role: 'alert' });
    fields.forEach(function (f) {
      var id = 'f_' + f.k + Math.random().toString(36).slice(2, 6), el;
      if (f.type === 'select') {
        el = M.h('select', { id: id, class: 'inp mt-1' },
          f.options.map(function (o) { return M.h('option', { value: o[0], text: o[1] }); }));
      } else if (f.type === 'textarea') {
        el = M.h('textarea', { id: id, rows: 3, class: 'inp mt-1' });
      } else if (f.type === 'checkbox') {
        el = M.h('input', { id: id, type: 'checkbox', class: 'mt-0.5' });
      } else {
        el = M.h('input', {
          id: id, type: f.type || 'text', class: 'inp mt-1',
          min: f.min, max: f.max, step: f.step,
          accept: f.accept, capture: f.capture,
          placeholder: f.placeholder
        });
      }
      if (f.value != null && f.type !== 'file') {
        if (f.type === 'checkbox') el.checked = !!f.value;
        else el.value = f.value;
      }
      inputs[f.k] = el;
      form.append(f.type === 'checkbox'
        ? M.h('label', { class: 'flex gap-2 text-[11px] text-slate-300 font-sans items-start' },
            el, M.h('span', { text: f.label }))
        : M.h('div', null,
            M.h('label', { class: 'lbl', for: id, text: f.label + (f.required ? ' *' : '') }),
            el));
    });
    var btn = M.h('button', { type: 'submit', class: 'btn btn-g', text: submitText || 'Valider' });
    form.append(err, btn);
    var m = M.modal(title, form, wide);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      err.textContent = '';
      var v = {};
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i], el = inputs[f.k];
        var val = f.type === 'checkbox' ? el.checked
                : f.type === 'file' ? (el.files[0] || null)
                : el.value.trim();
        if (f.required && (val === '' || val === null || val === false)) {
          err.textContent = 'Champ requis : ' + f.label;
          el.focus();
          return;
        }
        if (f.type === 'number' && val !== '') {
          val = parseFloat(val);
          if (isNaN(val) || (f.min != null && val < f.min) || (f.max != null && val > f.max)) {
            err.textContent = 'Valeur invalide : ' + f.label;
            return;
          }
        }
        v[f.k] = val;
      }
      btn.disabled = true;
      var r;
      try { r = await onSubmit(v, m); } catch (x) { r = (x && x.message) || 'Erreur'; }
      btn.disabled = false;
      if (typeof r === 'string') { err.textContent = r; return; }
      m.close();
    });
    return m;
  };

  /* Effet d'onde tactile */
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.btn');
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect(),
        z = Math.max(r.width, r.height),
        s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = 'width:' + z + 'px;height:' + z + 'px;left:' + (e.clientX - r.left - z / 2) + 'px;top:' + (e.clientY - r.top - z / 2) + 'px';
    b.appendChild(s);
    setTimeout(function () { s.remove(); }, 600);
  });

})();
