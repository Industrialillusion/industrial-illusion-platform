/* ============================================================
   MAAT OS v8.1 — Workstation Opérateurs & Super-Admin (Production)
   Industrial Illusion SARL · Projet PurKemet Phase 1
   ------------------------------------------------------------
   FASE 3a-3g integrated:
   - MFA gate in boot · window.S exposed · activePickupId/cleanupView
   - GPS Point A sur Démarrer · gpsNow() one-shot
   - vCollect: MAAT_MATERIALS · FAB scanner · insert direct
   - vDepot: P2 multi-pickup · ANCHORED/DISCREPANCY · clôture
   - openMissionClose: trigger course · payout_requests · link
   - vAmbassador: clients portés · avances · contrats
   ============================================================ */
(function () {
  'use strict';

  if (!window.Maat) {
    document.body.innerHTML = '<p style="font-family:monospace;color:#f87171;padding:2rem">Maat OS — kernel (core.js) introuvable. Vérifiez assets/core.js.</p>';
    return;
  }

  var M = window.Maat, $ = M.$, h = M.h;
  var DEMO = /[?&]demo=1/.test(location.search);
  var SVC = M.cfg.SCALE_SERVICE || 0x181D, CHR = M.cfg.SCALE_CHAR || 0x2A9D;
  var app = $('app'), bn = $('bnav');

  /* =================================================================
     1. ÉTAT GLOBAL
     ================================================================= */
  var S = {
    P: null, mode: null, view: null, pos: null, wake: null,
    deferred: null, scanner: null, stream: null, chan: null,
    lastSync: null,
    activePickupId: null,   // FASE 3a · mission active
    cleanupView: null,      // FASE 3a · cleanup listeners fin vue
    onBagScan: null,        // FASE 3c · callback registered par vCollect/vDepot
    sessionBags: []         // FASE 3c · sacs ajoutés dans la session courante
  };
  window.S = S;

  var ctx = { pickup: null, client: '', qr: '', mat: '' };

  /* =================================================================
     2. CONSTANTES MÉTIER
     ================================================================= */
  var CATS = [
    ['RIAD', 'Riad / Maison d\'hôtes'], ['RESTAURANT', 'Restaurant / Rooftop'],
    ['HOTEL_RESORT', 'Hôtel / Resort'], ['CLINIQUE', 'Clinique'],
    ['ECOLE', 'École / Université'], ['COMMERCE', 'Commerce / Artisan'],
    ['SUPERMARCHE', 'Supermarché']
  ];

  var GRADES = {
    'Bronze':      { icon: '🥉', color: '#B48A5A' },
    'Silver':      { icon: '🥈', color: '#C0C0C0' },
    'Gold':        { icon: '🥇', color: '#E6CA65' },
    'Kemet Elite': { icon: '👑', color: '#00FFA3' }
  };

  var PAY_METHODS = [
    ['ESPECES_CAISSE', '💵 Espèces — caisse du Hub'],
    ['CIH_BANK',       '🏦 Virement CIH Bank'],
    ['ATTIJARIWAFA',   '🏦 Virement Attijariwafa'],
    ['CASH_PLUS',      '📲 Cash Plus'],
    ['WAFACASH',       '📲 Wafacash']
  ];

  /* =================================================================
     3. UTILITAIRES SYSTÈME
     ================================================================= */
  function buzz(p) { M.buzz(p); }

  function voice(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR'; u.rate = 1.05; u.pitch = 1;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
      var ind = h('div', { class: 'voice-indicator', text: '🔊 ' + text });
      document.body.appendChild(ind);
      setTimeout(function () { ind.remove(); }, 2600);
    } catch (e) {}
  }

  async function hashRow(o) { return await M.sha(JSON.stringify(o)); }

  function startGPS() {
    var c = $('gpsChip'); if (!c) return;
    c.classList.remove('hidden');
    if (!navigator.geolocation) {
      c.textContent = 'GPS indisponible';
      c.style.color = '#f87171';
      return;
    }
    navigator.geolocation.watchPosition(function (p) {
      S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      c.textContent = 'GPS ±' + Math.round(S.pos.acc) + ' m';
      c.style.color = S.pos.acc <= 30 ? '#00FFA3' : '#E6CA65';
    }, function () {
      S.pos = null;
      c.textContent = 'GPS ✕';
      c.style.color = '#f87171';
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }

  function gpsStr() {
    return S.pos ? S.pos.lat.toFixed(6) + ', ' + S.pos.lng.toFixed(6) : null;
  }

  // FASE 3b · GPS one-shot (Point A/B/C) · ne bloque jamais
  function gpsNow(timeoutMs) {
    var t = timeoutMs || 8000;
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, t);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (done) return;
          done = true; clearTimeout(timer);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy || null });
        },
        function () {
          if (done) return;
          done = true; clearTimeout(timer);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: t, maximumAge: 10000 }
      );
    });
  }

  function keepAwake() {
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { S.wake = w; }); } catch (e) {}
  }

  function stopStream() {
    if (S.stream) {
      S.stream.getTracks().forEach(function (t) { t.stop(); });
      S.stream = null;
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.P) keepAwake(); else stopStream();
  });

  function success(txt) {
    $('okTxt').textContent = txt;
    $('okOverlay').classList.add('show');
    buzz([80, 40, 120]);
    setTimeout(function () { $('okOverlay').classList.remove('show'); }, 2000);
  }

  /* =================================================================
     4. COMPOSANT BALANCE BLUETOOTH CERTIFIÉE
     ================================================================= */
  function Scale(refW) {
    var s = { stable: false, w: 0, fault: false, photo: null, buf: [], ref: refW || '' };
    var el = h('div', { class: 'card g text-center space-y-3' });
    el.innerHTML =
      '<div class="flex justify-between items-center border-b border-white/10 pb-2 font-mono">' +
        '<span data-r="mode" class="text-[10px] font-bold uppercase text-cyberGreen">Balance Bluetooth</span>' +
        '<span data-r="ref" class="text-[9px] text-slate-400"></span></div>' +
      '<div class="flex items-end justify-center gap-2">' +
        '<input data-r="w" type="number" step="0.01" min="0" max="100000" readonly value="00.00" class="wnum" aria-label="Poids en kilogrammes">' +
        '<span class="font-mono text-xs text-slate-400 pb-2">Kg</span></div>' +
      '<div class="stab-wrap"><span class="text-[9px] font-mono text-slate-500" data-r="stabt">Signal</span>' +
        '<div class="stab-track"><div class="stab-fill" data-r="stabar"></div></div></div>' +
      '<p data-r="msg" class="text-[9px] font-mono text-slate-400 uppercase">⚠️ Saisie manuelle bloquée — pesée Bluetooth requise</p>' +
      '<p data-r="st" class="text-[10px] font-mono text-slate-500">Balance non connectée</p>' +
      '<div data-r="fault" class="hidden p-3 bg-red-950/40 border border-red-500/40 rounded-xl space-y-3 text-left">' +
        '<span class="text-[10px] font-mono font-bold text-red-400 uppercase block">Procédure défaillance balance</span>' +
        '<p class="text-[10px] text-slate-300">Photographiez le cadran : la saisie d\'urgence se débloque et la preuve est notarisée.</p>' +
        '<video data-r="v" class="hidden w-full rounded-xl border border-red-500/40" playsinline muted></video>' +
        '<div class="photo-proof hidden" data-r="proofwrap"><img data-r="img" alt="Photo du cadran"><div class="meta-stamp" data-r="stamp"></div></div>' +
        '<button type="button" data-r="proof" class="btn !bg-red-600 !text-white">📸 Photographier le cadran</button></div>' +
      '<div class="space-y-2">' +
        '<button type="button" data-r="bt" class="btn btn-o">📶 Connecter la balance Bluetooth</button>' +
        '<button type="button" data-r="fb" class="btn btn-r !py-2 !text-[10px]">⚠️ Déclarer un dysfonctionnement</button>' +
        (DEMO ? '<button type="button" data-r="demo" class="btn btn-au !py-2 !text-[10px]">🧪 Simuler pesée (Mode Démo URL)</button>' : '') +
      '</div>';

    var r = function (k) { return el.querySelector('[data-r="' + k + '"]'); };
    r('ref').textContent = s.ref;

    var setW = function (v, c) { r('w').value = v.toFixed(2); r('w').className = 'wnum ' + (c || ''); };
    var setStab = function (pct, warn) { var b = r('stabar'); b.style.width = Math.max(0, Math.min(100, pct)) + '%'; b.classList.toggle('warn', !!warn); };
    var setSt = function (t, c) { r('st').textContent = t; r('st').style.color = c || '#64748b'; };

    function parse(dv) {
      if (CHR === 0x2A9D) {
        var raw = dv.getUint16(1, true);
        return (dv.getUint8(0) & 1) ? raw * 0.01 * 0.45359237 : raw * 0.005;
      }
      var m = new TextDecoder().decode(dv.buffer).match(/-?\d+(?:[.,]\d+)?/);
      return m ? parseFloat(m[0].replace(',', '.')) : NaN;
    }

    function reading(w) {
      if (!(w >= 0) || s.fault) return;
      s.buf.push(w); if (s.buf.length > 8) s.buf.shift();
      var spread = s.buf.length >= 6 ? (Math.max.apply(null, s.buf) - Math.min.apply(null, s.buf)) : 99;
      var ok = s.buf.length >= 6 && w > 0.05 && spread <= 0.02;
      var stabPct = Math.max(0, 100 - (spread / 0.15) * 100);
      setStab(stabPct, spread > 0.06);
      r('stabt').textContent = ok ? '✓ Stable' : (spread > 0.06 ? 'Instable' : 'Stabilisation');
      if (ok) {
        if (!s.stable) {
          s.stable = true; setW(w, 'locked');
          r('msg').textContent = '✓ Pesée stabilisée Bluetooth';
          buzz(60); voice('Pesée stable, ' + w.toFixed(2) + ' kilos');
        } else setW(w);
        s.w = w;
      } else {
        s.stable = false; setW(w, 'settling');
        r('msg').textContent = 'Stabilisation en cours…';
      }
      if (s.onchange) s.onchange(s);
    }

    r('bt').onclick = async function () {
      if (!navigator.bluetooth) return M.toast('Web Bluetooth disponible sur Chrome Android/macOS.', 'err');
      try {
        setSt('Recherche de la balance…', '#E6CA65');
        var dev = await navigator.bluetooth.requestDevice({ filters: [{ services: [SVC] }] });
        dev.addEventListener('gattserverdisconnected', function () {
          s.stable = false; s.buf = []; setW(0); setStab(0);
          setSt('Balance déconnectée', '#f87171');
          r('msg').textContent = '⚠️ Reconnectez la balance';
          M.toast('Balance déconnectée.', 'err'); buzz([80, 60, 80]);
        });
        var srv = await dev.gatt.connect();
        var svc = await srv.getPrimaryService(SVC);
        var ch = await svc.getCharacteristic(CHR);
        ch.addEventListener('characteristicvaluechanged', function (e) { reading(parse(e.target.value)); });
        await ch.startNotifications();
        s.fault = false; stopStream();
        r('fault').classList.add('hidden'); r('w').readOnly = true;
        setSt('Connectée : ' + (dev.name || 'balance'), '#00FFA3');
        r('msg').textContent = 'Posez le sac sur la balance…';
        setW(0); voice('Balance connectée');
      } catch (e) {
        setSt('Connexion annulée', '#f87171');
      }
    };

    r('fb').onclick = async function () {
      s.fault = true; s.stable = false; s.photo = null;
      r('proofwrap').classList.add('hidden');
      r('fault').classList.remove('hidden');
      r('mode').textContent = 'Secours : photo cadran'; r('mode').style.color = '#f87171';
      r('msg').textContent = '⚠️ Photographiez le cadran pour débloquer la saisie';
      r('w').readOnly = true; setW(0); setStab(0);
      try {
        S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        var v = r('v'); v.srcObject = S.stream; v.classList.remove('hidden'); await v.play();
      } catch (e) { M.toast('Caméra inaccessible : photo requise pour valider.', 'err'); }
    };

    r('proof').onclick = async function () {
      var v = r('v');
      if (!S.stream || !v.videoWidth) return M.toast('Caméra non prête.', 'err');
      var blob = await M.snap(v);
      var annotated = await annotate(blob, { ts: new Date().toISOString(), gps: gpsStr(), mode: 'PHOTO_CADRAN' });
      s.photo = annotated;
      r('img').src = URL.createObjectURL(annotated);
      r('stamp').textContent = '⏱ ' + new Date().toLocaleString('fr-FR') + (S.pos ? ' · ' + gpsStr() : '');
      r('proofwrap').classList.remove('hidden');
      v.classList.add('hidden'); stopStream();
      r('w').readOnly = false; r('w').value = ''; r('w').focus();
      r('w').className = 'wnum settling';
      r('msg').textContent = '✓ Preuve notarisée. Saisissez la valeur du cadran.';
      buzz(60);
    };

    r('w').addEventListener('input', function () {
      if (s.fault) { s.w = parseFloat(r('w').value) || 0; if (s.onchange) s.onchange(s); }
    });

    if (DEMO && r('demo')) {
      r('demo').onclick = function () {
        var target = 10 + Math.random() * 25, n = 0;
        var i = setInterval(function () {
          reading(target + (n++ < 6 ? (Math.random() - 0.5) * 1.5 : 0));
          if (n > 14) clearInterval(i);
        }, 180);
      };
    }

    s.el = el;
    s.value = function () { return s.fault ? parseFloat(r('w').value) : s.w; };
    s.reset = function () {
      s.stable = false; s.w = 0; s.fault = false; s.photo = null; s.buf = []; stopStream();
      r('fault').classList.add('hidden'); r('proofwrap').classList.add('hidden');
      r('w').readOnly = true; setW(0); setStab(0);
      r('msg').textContent = '⚠️ Saisie manuelle bloquée — pesée Bluetooth requise';
      r('mode').textContent = 'Balance Bluetooth'; r('mode').style.color = '#00FFA3';
    };
    return s;
  }

  /* =================================================================
     5. TIMBRE NOTARIÉ CANVAS
     ================================================================= */
  function annotate(blob, meta) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        var bh = Math.max(38, Math.round(c.height * 0.06));
        g.fillStyle = 'rgba(0,0,0,0.82)';
        g.fillRect(0, c.height - bh, c.width, bh);
        g.fillStyle = '#00FFA3';
        g.font = 'bold ' + Math.round(bh * 0.34) + 'px "JetBrains Mono", monospace';
        g.fillText('MAAT OS · ' + meta.ts.replace('T', ' ').slice(0, 19), 10, c.height - bh * 0.52);
        g.fillStyle = '#E6CA65';
        g.font = Math.round(bh * 0.28) + 'px "JetBrains Mono", monospace';
        g.fillText(meta.gps ? 'GPS ' + meta.gps : 'GPS non fixé', 10, c.height - bh * 0.14);
        c.toBlob(res, 'image/jpeg', 0.75);
      };
      img.onerror = function () { res(blob); };
      img.src = URL.createObjectURL(blob);
    });
  }

  /* =================================================================
     6. LISTENER GLOBAL · bag scan → vue active
     ================================================================= */
  window.addEventListener('maat:scan', function (e) {
    if (!e || !e.detail) return;
    var scan = e.detail;
    if (scan.type === 'bag' && typeof S.onBagScan === 'function') {
      try { S.onBagScan(scan.token); e.preventDefault(); } catch (err) {}
    }
  });

  window.addEventListener('maat:client-context', function (e) {
    if (!e || !e.detail) return;
    console.log('[pwa] client-context', e.detail.company_name);
  });

  /* =================================================================
     7. AUTHENTIFICATION LIVE SUPABASE
     ================================================================= */
  function msgBox() { return h('p', { class: 'text-[11px] text-center font-mono font-bold min-h-[1.2rem]', role: 'alert' }); }

  function showAuth() {
    bn.classList.add('hidden'); app.innerHTML = '';
    var card = h('section', { class: 'card g relative overflow-hidden space-y-4 !p-6' }), out = msgBox();
    var say = function (t, ok) { out.textContent = t; out.style.color = ok ? '#00FFA3' : '#f87171'; };

    card.innerHTML =
      '<div class="beam"></div>' +
      '<div class="text-center space-y-1">' +
        '<div class="w-12 h-12 mx-auto rounded-2xl bg-cyberGreen/10 border border-cyberGreen/30 flex items-center justify-center text-xl">📱</div>' +
        '<h2 class="font-mono font-bold text-white uppercase tracking-wider text-sm">Maat OS Workstation</h2>' +
        '<p class="text-[11px] text-slate-400">Portail Opérateurs & Direction Générale.</p></div>' +

      '<div class="grid grid-cols-3 font-mono text-[10px] text-center gap-1">' +
        '<button type="button" class="tab on" data-t="login">Connexion</button>' +
        '<button type="button" class="tab" data-t="signup">Inscription</button>' +
        '<button type="button" class="tab" data-t="otp">Code Email</button></div>' +

      '<div data-f="login" class="space-y-3 font-mono">' +
        '<div><label class="lbl" for="l_em">Email</label><input id="l_em" type="email" autocomplete="username" class="inp mt-1" placeholder="direction@industrialillusion.ma"></div>' +
        '<div><label class="lbl" for="l_pw">Mot de passe</label><input id="l_pw" type="password" autocomplete="current-password" class="inp mt-1" placeholder="••••••••"></div>' +
        '<button type="button" data-a="login" class="btn btn-g">Se connecter 🔓</button></div>' +

      '<div data-f="signup" class="hidden space-y-3 font-mono">' +
        '<div><label class="lbl" for="s_name">Nom & Prénom *</label><input id="s_name" type="text" class="inp mt-1" placeholder="Nom complet"></div>' +
        '<div><label class="lbl" for="s_em">Email opérateur *</label><input id="s_em" type="email" class="inp mt-1" placeholder="agent@domaine.ma"></div>' +
        '<div><label class="lbl" for="s_pw">Mot de passe *</label><input id="s_pw" type="password" class="inp mt-1" placeholder="Minimum 6 caractères"></div>' +
        '<label class="flex items-start gap-2 text-[10px] text-slate-300"><input type="checkbox" id="s_ok" class="mt-0.5" checked>' +
        '<span>Consentement Loi CNDP n° 09-08.</span></label>' +
        '<button type="button" data-a="signup" class="btn btn-au">Créer mon compte opérateur ✍️</button></div>' +

      '<div data-f="otp" class="hidden space-y-3 font-mono">' +
        '<div><label class="lbl" for="a_em">Email</label><input id="a_em" type="email" class="inp mt-1" placeholder="agent@domaine.ma"></div>' +
        '<button type="button" data-a="send" class="btn btn-o">Recevoir un code OTP 📩</button>' +
        '<div data-r="otp" class="hidden space-y-2 pt-2 border-t border-white/10">' +
          '<input id="a_code" inputmode="numeric" class="inp text-center !text-lg font-bold text-kemetGoldBright" placeholder="Code à 6 chiffres">' +
          '<button type="button" data-a="verify" class="btn btn-g">Valider le code 🔓</button></div></div>';

    card.appendChild(out); app.appendChild(card);
    var q = function (s) { return card.querySelector(s); };

    card.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.t;
        q('[data-f="login"]').classList.toggle('hidden', t !== 'login');
        q('[data-f="signup"]').classList.toggle('hidden', t !== 'signup');
        q('[data-f="otp"]').classList.toggle('hidden', t !== 'otp');
        card.querySelectorAll('[data-t]').forEach(function (x) { x.classList.toggle('on', x === b); });
        say('');
      };
    });

    q('[data-a="login"]').onclick = async function () {
      var em = $('l_em').value.trim().toLowerCase();
      var pw = $('l_pw').value;
      if (!em || !pw) return say('Renseignez l\'email et le mot de passe.');
      if (!M.sb) return say('Service Supabase inaccessible.');
      var b = q('[data-a="login"]');
      b.disabled = true; b.textContent = 'Connexion…';
      say('Vérification des identifiants…', true);
      var res = await M.sb.auth.signInWithPassword({ email: em, password: pw });
      b.disabled = false; b.textContent = 'Se connecter 🔓';
      if (res.error) return say('Erreur : ' + res.error.message);
      say('✓ Connexion établie. Chargement…', true);
      boot();
    };

    q('[data-a="signup"]').onclick = async function () {
      var name = $('s_name').value.trim();
      var em = $('s_em').value.trim().toLowerCase();
      var pw = $('s_pw').value;
      if (!name || !em || !pw) return say('Remplissez tous les champs.');
      if (pw.length < 6) return say('Mot de passe : minimum 6 caractères.');
      if (!$('s_ok').checked) return say('Veuillez accepter la charte CNDP.');
      if (!M.sb) return say('Service Supabase inaccessible.');
      var b = q('[data-a="signup"]');
      b.disabled = true; b.textContent = 'Création du compte…';
      say('Inscription auprès de Supabase…', true);
      var res = await M.sb.auth.signUp({
        email: em, password: pw,
        options: { data: { name: name, type: 'operator' } }
      });
      b.disabled = false; b.textContent = 'Créer mon compte opérateur ✍️';
      if (res.error) return say('Erreur : ' + res.error.message);
      say('✓ Compte créé avec succès ! Initialisation…', true);
      voice('Compte opérateur créé');
      setTimeout(boot, 600);
    };

    q('[data-a="send"]').onclick = async function () {
      var em = $('a_em').value.trim().toLowerCase();
      if (!em) return say('Saisissez une adresse email.');
      if (!M.sb) return say('Service Supabase inaccessible.');
      var b = q('[data-a="send"]');
      b.disabled = true; b.textContent = 'Envoi en cours…';
      say('Demande de jeton OTP…', true);
      var res = await M.sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: false } });
      b.disabled = false; b.textContent = 'Recevoir un code OTP 📩';
      if (res.error) return say(res.error.message);
      q('[data-r="otp"]').classList.remove('hidden');
      $('a_code').focus();
      say('Code envoyé à ' + em + '. Vérifiez votre boîte mail.', true);
    };

    q('[data-a="verify"]').onclick = async function () {
      var em = $('a_em').value.trim().toLowerCase();
      var code = $('a_code').value.trim();
      if (!code) return say('Saisissez le code reçu.');
      var b = q('[data-a="verify"]');
      b.disabled = true; b.textContent = 'Vérification…';
      var res = await M.sb.auth.verifyOtp({ email: em, token: code, type: 'email' });
      b.disabled = false; b.textContent = 'Valider le code 🔓';
      if (res.error) return say('Code invalide ou expiré.');
      say('✓ Session validée. Chargement…', true);
      boot();
    };

    $('l_pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') q('[data-a="login"]').click(); });
    $('s_pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') q('[data-a="signup"]').click(); });
    $('a_code').addEventListener('keydown', function (e) { if (e.key === 'Enter') q('[data-a="verify"]').click(); });
  }

  function gate(title, text, link) {
    bn.classList.add('hidden'); app.innerHTML = '';
    var c = h('section', { class: 'card au text-center space-y-3 !p-6' },
      h('div', { class: 'text-3xl', text: '⏳' }),
      h('h2', { class: 'font-mono font-bold text-kemetGoldBright uppercase text-sm', text: title }),
      h('p', { class: 'text-xs text-slate-300', text: text }));
    if (link) c.appendChild(h('a', { href: link[0], class: 'btn btn-o block', text: link[1] }));
    c.appendChild(h('button', { type: 'button', class: 'btn btn-o', text: 'Actualiser mon statut', onclick: boot }));
    c.appendChild(h('button', { type: 'button', class: 'btn btn-r', text: 'Se déconnecter', onclick: M.signOut }));
    app.appendChild(c);
  }

  /* =================================================================
     8. AMORÇAGE DE SESSION (boot)
     ================================================================= */
  async function boot() {
    if (!M.sb) return showAuth();
    var sess = await M.sb.auth.getSession();
    var user = sess && sess.data && sess.data.session && sess.data.session.user;
    if (!user) return showAuth();

    var p = await M.profile();
    if (!p) {
      var isDG = (user.email === 'r.passarella@industrialillusion.ma');
      var rIns = await M.sb.from('profiles').upsert({
        id: user.id, email: user.email,
        full_name: isDG ? 'Roberto Passarella' : user.email,
        role: isDG ? 'admin' : 'operator',
        status: isDG ? 'ACTIVE' : 'PENDING',
        capabilities: isDG ? ['vector', 'ambassador'] : ['vector']
      }).select().maybeSingle();
      p = rIns.data;
    }
    if (!p) return gate('Initialisation du compte', 'Compte authentifié. En attente de synchronisation avec la base centrale.');

    S.P = p;

    // FASE 3a · MFA gate
    if (window.MfaGate && window.MfaGate.done) {
      await window.MfaGate.done;
    }

    if (p.role === 'client') {
      return gate('Espace Client B2B', 'Votre compte est configuré pour l\'Espace Client ESG.', ['dashboard.html', 'Ouvrir l\'Espace ESG']);
    }
    if (p.role !== 'admin' && p.status !== 'ACTIVE') {
      return gate('Compte en attente de validation', 'Votre compte opérateur a été créé avec succès. La Direction Générale doit l\'activer depuis la Control Tower avant la première tournée.');
    }

    var caps = p.capabilities || (p.role === 'admin' ? ['vector', 'ambassador'] : ['vector']);
    S.P.capabilities = caps;

    var saved = null;
    try { saved = localStorage.getItem('ii_mode'); } catch (e) {}
    S.mode = caps.indexOf(saved) >= 0 ? saved : (caps.indexOf('vector') >= 0 ? 'vector' : 'ambassador');

    $('opInfo').textContent = (p.full_name || p.email) + (p.role === 'admin' ? ' (DG)' : '');

    if (p.role === 'admin') {
      var modeB = $('modeBtn');
      if (modeB) {
        modeB.classList.remove('hidden');
        modeB.textContent = '👑 Control Tower →';
        modeB.onclick = function () { location.href = 'admin.html'; };
      }
    }

    startGPS();
    keepAwake();
    M.flush();
    realtime();
    enter();
  }

  /* =================================================================
     9. NAVIGATION PRINCIPALE
     ================================================================= */
  function enter() {
    var caps = S.P.capabilities || ['vector', 'ambassador'], b = $('modeBtn');
    if (S.P.role !== 'admin' && caps.length > 1) {
      b.classList.remove('hidden');
      b.textContent = (S.mode === 'vector' ? '🚚 Vecteur' : '🤝 Ambassadeur') + ' ⇄';
      b.onclick = function () {
        S.mode = S.mode === 'vector' ? 'ambassador' : 'vector';
        try { localStorage.setItem('ii_mode', S.mode); } catch (e) {}
        enter(); M.toast('Modalité : ' + (S.mode === 'vector' ? 'Vecteur logistique' : 'Ambassadeur B2B'));
      };
    }
    S.mode = S.mode || (caps.indexOf('vector') >= 0 ? 'vector' : 'ambassador');

    var tabs = S.mode === 'vector'
      ? [['tour', '🗓️', 'Tournée'], ['collect', '⚖️', 'Collecte'], ['depot', '🏭', 'Dépôt'], ['wallet', '💰', 'Wallet'], ['me', '👤', 'Profil']]
      : [['contracts', '🤝', 'Ambassadeur'], ['wallet', '💰', 'Wallet'], ['me', '👤', 'Profil']];

    bn.innerHTML = ''; bn.classList.remove('hidden');
    tabs.forEach(function (t) {
      bn.appendChild(h('button', { type: 'button', class: 'tab', 'data-v': t[0], onclick: function () { go(t[0]); } },
        h('span', { text: t[1] }), h('span', { text: t[2] })));
    });
    go(tabs[0][0]);
  }

  function go(v) {
    S.view = v; stopStream();
    if (typeof S.cleanupView === 'function') { try { S.cleanupView(); } catch (e) {} S.cleanupView = null; }
    S.onBagScan = null;
    document.querySelectorAll('#bnav .tab').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    app.innerHTML = '';
    var fn = { tour: vTour, collect: vCollect, depot: vDepot, contracts: vAmbassador, wallet: vWallet, me: vMe }[v];
    try { fn(); } catch (e) { app.appendChild(h('div', { class: 'card text-xs text-red-400 font-mono', text: 'Erreur : ' + e.message })); }
    window.scrollTo(0, 0);
  }

  function title(t, sub) {
    return h('div', { class: 'px-1' },
      h('h2', { class: 'font-kemetTitle text-lg font-black', text: t }),
      sub ? h('p', { class: 'text-[11px] text-slate-400', text: sub }) : null);
  }

  /* =================================================================
     10. REALTIME
     ================================================================= */
  function realtime() {
    if (!M.sb || !S.P) return;
    if (S.chan) { try { S.chan.unsubscribe(); } catch (e) {} }
    S.chan = M.sb.channel('mine')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickups', filter: 'vector_id=eq.' + S.P.id },
        function (e) {
          var t = e.eventType === 'INSERT' ? '🗓️ Nouveau ritiro assigné' : 'Ritiro mis à jour';
          M.toast(t, ''); voice(t);
          buzz([60, 40, 60]);
          if (S.view === 'tour') go('tour');
        })
      .subscribe();
  }

  /* =================================================================
     11. CLIENTS CACHE
     ================================================================= */
  async function clients() {
    try {
      if (M.sb && navigator.onLine) {
        var r = await M.sb.from('clients')
          .select('id,company_name,horeca_category,address,city,cluster')
          .eq('status', 'ACTIVE')
          .order('company_name');
        if (!r.error && r.data) {
          try { localStorage.setItem('ii_clients', JSON.stringify(r.data)); } catch (e) {}
          return r.data;
        }
      }
    } catch (e) {}
    try {
      return JSON.parse(localStorage.getItem('ii_clients')) || [];
    } catch (e) { return []; }
  }

  /* =================================================================
     12. VUE : MA TOURNÉE
     ================================================================= */
  async function vTour() {
    app.append(title('Ma tournée', 'Vos ritiri programmés par la Direction.'));
    var kpi = h('div', { class: 'kpi-strip' },
      h('div', { class: 'kpi' }, h('b', { text: '0', id: 'kTonnage' }), h('span', { text: 'kg aujourd\'hui' })),
      h('div', { class: 'kpi' }, h('b', { text: '0', id: 'kPickups' }), h('span', { text: 'à faire' })),
      h('div', { class: 'kpi' }, h('b', { text: '0', id: 'kDone' }), h('span', { text: 'fait' })));
    app.appendChild(kpi);

    var list = h('div', { class: 'space-y-3' }, h('div', { class: 'card skel h-24' }));
    app.appendChild(list);

    var cl = await clients(), by = {}; cl.forEach(function (c) { by[c.id] = c; });
    var rows = [];

    try {
      var from = new Date(); from.setHours(0, 0, 0, 0);
      var r = await M.sb.from('pickups').select('*')
        .eq('vector_id', S.P.id)
        .in('status', ['PLANNED', 'ASSIGNED', 'IN_PROGRESS'])
        .gte('scheduled_at', from.toISOString()).order('scheduled_at').limit(50);
      rows = r.data || [];
      try { localStorage.setItem('ii_tour', JSON.stringify(rows)); } catch (e) {}
    } catch (e) {
      try { rows = JSON.parse(localStorage.getItem('ii_tour')) || []; } catch (x) {}
    }

    $('kPickups').textContent = String(rows.length);

    // FASE 3b · auto-restore mission active
    var inProg = rows.filter(function (x) { return x.status === 'IN_PROGRESS'; })[0];
    if (inProg) S.activePickupId = inProg.id;

    try {
      var r2 = await M.sb.from('collections').select('weight_collect_kg, status')
        .eq('operator_email', S.P.email)
        .gte('created_at', new Date().toISOString().slice(0, 10));
      var kg = 0, dn = 0;
      (r2.data || []).forEach(function (c) {
        kg += Number(c.weight_collect_kg || 0);
        if (c.status !== 'IN_TRANSIT') dn++;
      });
      $('kTonnage').textContent = kg.toFixed(0);
      $('kDone').textContent = String(dn);
    } catch (e) {
      $('kTonnage').textContent = '0';
      $('kDone').textContent = '0';
    }

    list.innerHTML = '';
    if (!rows.length) {
      list.appendChild(h('div', { class: 'empty-state' },
        h('div', { class: 'ico', text: '🗓️' }),
        h('p', { text: 'Aucun ritiro programmé pour cette journée.' })));
      return;
    }

    var groups = {};
    rows.forEach(function (p) {
      var c = by[p.client_id] || {}, z = c.cluster || c.city || 'Zone non définie';
      (groups[z] = groups[z] || []).push({ p: p, c: c });
    });

    Object.keys(groups).sort().forEach(function (zone) {
      var wrap = h('div', { class: 'space-y-2' },
        h('div', { class: 'zone-head' },
          h('span', { text: '📍 ' + zone }),
          h('span', { class: 'ml-auto text-[9px] text-slate-500 font-normal', text: groups[zone].length + ' ritiri' })));
      groups[zone].forEach(function (x, i) { wrap.appendChild(pickupCard(x.p, x.c, i)); });
      list.appendChild(wrap);
    });
  }

  function pickupCard(p, c, i) {
    var addr = [c.address, c.city].filter(Boolean).join(', ');
    var badge = p.status === 'IN_PROGRESS' ? 'bd-g' : 'bd-au';
    var badgeTxt = p.status === 'IN_PROGRESS' ? 'En cours' : 'À faire';
    var actionBtn;

    if (p.status === 'IN_PROGRESS') {
      actionBtn = h('button', {
        type: 'button', class: 'btn btn-g !py-2 !text-[10px]', text: '✓ Terminer',
        onclick: async function () {
          S.activePickupId = p.id;
          await openMissionClose(p.id);
        }
      });
    } else {
      actionBtn = h('button', {
        type: 'button', class: 'btn btn-au !py-2 !text-[10px]', text: '▶ Démarrer',
        onclick: async function () {
          var btn = this;
          btn.disabled = true;
          btn.textContent = '⏳ Démarrage…';
          try {
            var gpsA = await gpsNow(8000);
            if (!gpsA) M.toast('GPS indisponible — mission acceptée sans position', 'warn');
            var now = new Date().toISOString();
            var r = await M.update('pickups', {
              status: 'IN_PROGRESS',
              accepted_at: now,
              gps_accept_lat: gpsA ? gpsA.lat : null,
              gps_accept_lng: gpsA ? gpsA.lng : null
            }, { id: p.id });
            if (r.status === 'error') {
              M.toast('Erreur : ' + r.message, 'err');
              btn.disabled = false; btn.textContent = '▶ Démarrer';
              return;
            }
            S.activePickupId = p.id;
            ctx.pickup = p.id;
            ctx.client = p.client_id;
            voice('Ritiro démarré');
            go('collect');
          } catch (e) {
            M.toast('Erreur démarrage : ' + (e.message || e), 'err');
            btn.disabled = false; btn.textContent = '▶ Démarrer';
          }
        }
      });
    }

    return h('article', { class: 'card space-y-2', style: '--i:' + i },
      h('div', { class: 'flex justify-between items-start gap-2' },
        h('div', null,
          h('p', { class: 'font-bold text-sm text-white', text: c.company_name || 'Établissement Client' }),
          h('p', { class: 'text-[10px] font-mono text-slate-400', text: M.fmt.dt(p.scheduled_at) + ' · fenêtre ' + (p.window_minutes || 60) + ' min' })),
        h('span', { class: 'bd ' + badge, text: badgeTxt })),
      p.materials ? h('p', { class: 'text-[11px] text-slate-300', text: '📦 ' + p.materials }) : null,
      p.notes ? h('p', { class: 'text-[11px] text-kemetGoldBright', text: '📝 ' + p.notes }) : null,
      h('div', { class: 'grid grid-cols-2 gap-2 pt-1' },
        addr ? h('a', { class: 'btn btn-o text-center !py-2 !text-[10px]', target: '_blank', rel: 'noopener',
          href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr), text: '🧭 Itinéraire' }) : null,
        actionBtn));
  }

  /* =================================================================
     13. VUE : COLLECTE P1
     ================================================================= */
  async function vCollect() {
    app.append(title('Collecte', 'Étape 1 — Première pesée certifiée sur site'));

    if (!S.activePickupId) {
      app.appendChild(h('div', { class: 'card au text-center space-y-3 !p-6' },
        h('div', { class: 'text-3xl', text: '🚚' }),
        h('h3', { class: 'font-mono font-bold text-kemetGoldBright text-sm', text: 'Aucune mission active' }),
        h('p', { class: 'text-xs text-slate-300', text: 'Démarrez une mission depuis la Tournée avant de collecter.' }),
        h('button', { type: 'button', class: 'btn btn-au', text: '🗓️ Aller à la Tournée', onclick: function () { go('tour'); } })));
      return;
    }

    // Charger le pickup + client
    var pkData = null, clientData = null;
    try {
      var pr = await M.sb.from('pickups').select('id,client_id').eq('id', S.activePickupId).single();
      pkData = pr.data;
      if (pkData && pkData.client_id) {
        ctx.client = pkData.client_id;
        var cr = await M.sb.from('clients').select('id,company_name,horeca_category,address,city,cluster').eq('id', pkData.client_id).maybeSingle();
        clientData = cr.data;
      }
    } catch (e) {}

    if (!pkData) {
      app.appendChild(h('div', { class: 'card text-xs text-red-400 font-mono', text: 'Mission introuvable. Rechargez la page.' }));
      return;
    }

    // Header client
    var headerCard = h('div', { class: 'card g space-y-1' },
      h('div', { class: 'flex justify-between items-center' },
        h('span', { class: 'lbl', text: 'Client actif' }),
        h('span', { class: 'bd bd-g', text: 'MISSION ' + S.activePickupId.slice(0, 8) })),
      h('p', { class: 'font-bold text-white text-sm mt-1', text: clientData ? clientData.company_name : '—' }),
      clientData && (clientData.address || clientData.city) ? h('p', { class: 'text-[10px] font-mono text-slate-400', text: [clientData.address, clientData.city].filter(Boolean).join(', ') }) : null
    );
    app.appendChild(headerCard);

    // QR input (readonly) + info scanner FAB
    var qr = h('input', { class: 'inp font-mono mt-2', readonly: true,
      placeholder: 'Scannez le QR du sac via le FAB 📷',
      'aria-label': 'Identifiant du sac', value: ctx.qr || '' });

    app.appendChild(h('div', { class: 'card' },
      h('label', { class: 'lbl', for: 'qr_input', text: '1. QR du sac (scanner FAB)' }), qr,
      h('p', { class: 'text-[10px] text-slate-400 mt-1', text: '📷 Utilisez le bouton caméra en bas à gauche' })));

    // Grille matériaux (MAAT_MATERIALS)
    var mats = (window.MAAT_MATERIALS || []).filter(function (m) { return m.active; });
    var matGrid = h('div', { class: 'grid grid-cols-2 gap-2 mt-3' });
    mats.forEach(function (m, i) {
      var b = h('button', {
        type: 'button',
        class: 'mat' + (ctx.mat === m.id ? ' on' : ''),
        style: '--m:' + m.color,
        onclick: function () {
          ctx.mat = m.id;
          matGrid.querySelectorAll('.mat').forEach(function (x) { x.classList.toggle('on', x === b); });
          buzz(20); voice(m.label);
        }
      },
        h('span', { class: 'mat-ico', text: m.icon }),
        h('span', { class: 'mat-lbl', text: m.label }),
        h('span', { class: 'mat-hint', text: m.hint || '' }));
      matGrid.appendChild(b);
    });

    app.appendChild(h('div', { class: 'card' },
      h('span', { class: 'lbl', text: '2. Matériau' }),
      matGrid));

    // Balance
    var sc = Scale('Site client');
    app.appendChild(sc.el);

    // Bouton ajouter sac
    var addBtn = h('button', {
      type: 'button', class: 'btn btn-au !py-4 !text-sm !rounded-2xl font-black shadow-lg',
      text: '➕ Ajouter ce sac à la mission'
    });

    addBtn.onclick = async function () {
      if (!ctx.qr) return M.toast('Scannez le QR du sac via le FAB 📷', 'err');
      if (!ctx.mat) return M.toast('Sélectionnez le matériau', 'err');
      var w = sc.value();
      if (!(w > 0 && w <= 1000)) return M.toast('Poids invalide', 'err');
      if (sc.fault && !sc.photo) return M.toast('Photo du cadran requise', 'err');
      if (!sc.fault && !sc.stable) return M.toast('Attendez la stabilisation Bluetooth', 'err');

      if (S.sessionBags.find(function (b) { return b.qr === ctx.qr; })) {
        return M.toast('Ce sac est déjà dans la session', 'warn');
      }

      addBtn.disabled = true; addBtn.textContent = '⏳ Enregistrement…';

      try {
        // Check preventif bag_qr_id
        var chk = await M.sb.from('collections').select('id', { count: 'exact', head: true })
          .eq('bag_qr_id', ctx.qr)
          .in('status', ['IN_TRANSIT', 'ANCHORED', 'DISCREPANCY']);
        if (chk.count > 0) {
          addBtn.disabled = false; addBtn.textContent = '➕ Ajouter ce sac à la mission';
          return M.toast('❌ Ce sac (' + ctx.qr + ') est déjà utilisé', 'err');
        }

        var id = M.uuid();
        var mat = window.MAAT_MATERIALS_BY_ID && window.MAAT_MATERIALS_BY_ID[ctx.mat];
        var payload = {
          client_uuid: id,
          pickup_id: S.activePickupId,
          client_id: ctx.client,
          bag_qr_id: ctx.qr,
          material_type: ctx.mat,
          weight_collect_kg: w,
          status: 'IN_TRANSIT',
          weighing_method: sc.fault ? 'PHOTO_PROOF' : 'BLUETOOTH_IOT',
          gps_location: gpsStr(),
          gps_accuracy_m: S.pos ? Math.round(S.pos.acc) : null,
          device_time: new Date().toISOString(),
          operator_email: S.P.email
        };
        payload.payload_hash = await hashRow(payload);

        var ins = await M.sb.from('collections').insert([payload]).select('id').single();
        if (ins.error) {
          addBtn.disabled = false; addBtn.textContent = '➕ Ajouter ce sac à la mission';
          return M.toast('Erreur : ' + ins.error.message, 'err');
        }

        // Upload photo si fault
        if (sc.photo) {
          try {
            var path = S.P.id + '/p1-' + ctx.qr + '-' + Date.now() + '.jpg';
            var up = await M.sb.storage.from('proofs').upload(path, sc.photo, { contentType: 'image/jpeg', upsert: true });
            if (!up.error) {
              var pub = M.sb.storage.from('proofs').getPublicUrl(path);
              if (pub.data && pub.data.publicUrl) {
                await M.sb.from('collections').update({ scale_fault_photo: pub.data.publicUrl }).eq('bag_qr_id', ctx.qr);
              }
            }
          } catch (e) {}
        }

        S.sessionBags.push({ qr: ctx.qr, mat: ctx.mat, matLabel: mat ? mat.label : ctx.mat, weight: w, id: id });
        M.toast('✅ Sac ajouté · ' + w.toFixed(2) + ' kg', '');
        voice('Sac enregistré');

        ctx.qr = ''; ctx.mat = ''; sc.reset();
        go('collect');
      } catch (e) {
        addBtn.disabled = false; addBtn.textContent = '➕ Ajouter ce sac à la mission';
        M.toast('Erreur : ' + (e.message || e), 'err');
      }
    };

    app.appendChild(addBtn);

    // Lista sacchi sessione
    if (S.sessionBags.length > 0) {
      var totalW = S.sessionBags.reduce(function (s, b) { return s + b.weight; }, 0);
      var sess = h('div', { class: 'card g space-y-2' },
        h('div', { class: 'flex justify-between items-center' },
          h('span', { class: 'lbl', text: 'Sacs de cette mission' }),
          h('span', { class: 'text-xs font-mono font-bold text-cyberGreen', text: S.sessionBags.length + ' · ' + totalW.toFixed(2) + ' kg' })));
      S.sessionBags.forEach(function (b) {
        sess.appendChild(h('div', { class: 'flex justify-between items-center gap-2 py-1 border-t border-white/5 text-xs font-mono' },
          h('span', { class: 'text-white truncate flex-1', text: b.qr }),
          h('span', { class: 'text-slate-400', text: b.matLabel }),
          h('span', { class: 'text-cyberGreen font-bold', text: b.weight.toFixed(2) + ' kg' })));
      });
      app.appendChild(sess);
    }

    // Bouton aller au dépôt
    app.appendChild(h('button', {
      type: 'button', class: 'btn btn-g !py-3', text: '🏭 Aller au Dépôt (P2)',
      onclick: function () { go('depot'); }
    }));

    // Register bag scan callback
    S.onBagScan = function (token) {
      ctx.qr = token;
      var q = document.getElementById('qr_input');
      if (q) q.value = token;
      buzz(50); voice('Sac scanné');
      M.toast('📦 Sac : ' + token.slice(0, 24), '');
    };
    // Fix input id
    if (qr && !qr.id) qr.id = 'qr_input';
  }

  /* =================================================================
     14. VUE : DÉPÔT P2
     ================================================================= */
  async function vDepot() {
    app.append(title('Dépôt Hub', 'Étape 2 — Double pesée certifiée'));

    // Récupérer les pickups IN_PROGRESS
    var pickups = [];
    try {
      var pr = await M.sb.from('pickups')
        .select('id,client_id,scheduled_at')
        .eq('vector_id', S.P.id)
        .eq('status', 'IN_PROGRESS');
      pickups = pr.data || [];
    } catch (e) {}

    if (!pickups.length) {
      app.appendChild(h('div', { class: 'empty-state' },
        h('div', { class: 'ico', text: '🏭' }),
        h('p', { text: 'Aucune mission en cours. Démarrez une tournée pour collecter des sacs.' })));
      app.appendChild(h('button', {
        type: 'button', class: 'btn btn-au mt-3', text: '🗓️ Aller à la Tournée',
        onclick: function () { go('tour'); }
      }));
      return;
    }

    // Récupérer les sacs IN_TRANSIT de ces pickups
    var pkIds = pickups.map(function (p) { return p.id; });
    var lots = [];
    try {
      var lr = await M.sb.from('collections')
        .select('id,bag_qr_id,material_type,weight_collect_kg,client_id,pickup_id,created_at')
        .eq('status', 'IN_TRANSIT')
        .in('pickup_id', pkIds)
        .order('created_at');
      lots = lr.data || [];
    } catch (e) {}

    // Map client names
    var cl = await clients(), by = {}; cl.forEach(function (c) { by[c.id] = c; });

    // Section A · Sacs en transit
    app.appendChild(h('div', { class: 'card g space-y-2' },
      h('span', { class: 'lbl', text: '📦 Sacs en transit (' + lots.length + ')' })));

    if (!lots.length) {
      app.appendChild(h('div', { class: 'empty-state' },
        h('div', { class: 'ico', text: '✅' }),
        h('p', { text: 'Tous les sacs de vos missions en cours ont été réceptionnés.' })));
    } else {
      var lotsCard = h('div', { class: 'card space-y-2' });
      lots.forEach(function (l) {
        var clientName = (by[l.client_id] || {}).company_name || 'Client';
        var mat = (window.MAAT_MATERIALS_BY_ID && window.MAAT_MATERIALS_BY_ID[l.material_type]) || { icon: '♻️', label: l.material_type };
        lotsCard.appendChild(h('div', { class: 'flex justify-between items-center gap-2 py-2 border-b border-white/5 last:border-b-0' },
          h('div', { class: 'flex-1 min-w-0' },
            h('p', { class: 'font-mono text-xs text-white truncate', text: l.bag_qr_id }),
            h('p', { class: 'text-[10px] text-slate-400', text: mat.icon + ' ' + mat.label + ' · ' + clientName + ' · P1 ' + Number(l.weight_collect_kg).toFixed(2) + ' kg' })),
          h('button', {
            type: 'button', class: 'btn btn-au sm', text: '⚖️ Peser P2',
            onclick: function () { openP2Modal(l); }
          })));
      });
      app.appendChild(lotsCard);
    }

    // Section B · Missions à clôturer
    if (pickups.length) {
      app.appendChild(h('div', { class: 'card au space-y-2 mt-4' },
        h('span', { class: 'lbl au', text: '🔗 Missions à clôturer' })));
      var closeCard = h('div', { class: 'card space-y-2' });
      pickups.forEach(function (p) {
        var clientName = (by[p.client_id] || {}).company_name || 'Client';
        closeCard.appendChild(h('div', { class: 'flex justify-between items-center gap-2 py-2 border-b border-white/5 last:border-b-0' },
          h('div', { class: 'flex-1 min-w-0' },
            h('p', { class: 'font-bold text-sm text-white', text: clientName }),
            h('p', { class: 'text-[10px] font-mono text-slate-400', text: M.fmt.dt(p.scheduled_at) })),
          h('button', {
            type: 'button', class: 'btn btn-g sm', text: '✓ Clôturer',
            onclick: function () { S.activePickupId = p.id; openMissionClose(p.id); }
          })));
      });
      app.appendChild(closeCard);
    }

    // Register bag scan callback (P2 quick select)
    S.onBagScan = function (token) {
      var found = lots.find(function (l) { return l.bag_qr_id === token; });
      if (found) { openP2Modal(found); }
      else { M.toast('Sac non trouvé dans les lots en transit', 'warn'); }
    };
  }

  function openP2Modal(lot) {
    var mat = (window.MAAT_MATERIALS_BY_ID && window.MAAT_MATERIALS_BY_ID[lot.material_type]) || { icon: '♻️', label: lot.material_type };
    var body = h('div', { class: 'space-y-3' });
    body.innerHTML = '<div class="p-2 bg-black/60 rounded-lg border border-white/10 font-mono text-[10px] text-slate-300 space-y-1">' +
      '<div class="flex justify-between"><span>Sac</span><span class="text-cyberGreen">' + lot.bag_qr_id + '</span></div>' +
      '<div class="flex justify-between"><span>Matériau</span><span>' + mat.icon + ' ' + mat.label + '</span></div>' +
      '<div class="flex justify-between"><span>P1</span><span class="font-bold text-white">' + Number(lot.weight_collect_kg).toFixed(2) + ' kg</span></div>' +
      '</div>';

    var sc = Scale('Pont-bascule dépôt');
    body.appendChild(sc.el);

    var delta = h('p', { class: 'text-center font-mono text-xs py-1', text: '' });
    body.appendChild(delta);

    sc.onchange = function () {
      var w = sc.value();
      if (w > 0 && lot.weight_collect_kg > 0) {
        var d = Math.abs(w - lot.weight_collect_kg) / lot.weight_collect_kg * 100;
        delta.textContent = 'Écart P1↔P2: ' + d.toFixed(2) + '% ' + (d > 3 ? '⚠️' : '✓');
        delta.style.color = d > 3 ? '#f87171' : '#00FFA3';
      }
    };

    var confirmBtn = h('button', { type: 'button', class: 'btn btn-g', text: '✓ Valider P2' });
    body.appendChild(confirmBtn);

    var m = M.modal('Pesée P2 · ' + lot.bag_qr_id, body);

    confirmBtn.onclick = async function () {
      var w = sc.value();
      if (!(w > 0 && w <= 1000)) return M.toast('Poids invalide', 'err');
      if (sc.fault && !sc.photo) return M.toast('Photo cadran requise', 'err');
      if (!sc.fault && !sc.stable) return M.toast('Attendez la stabilisation', 'warn');

      confirmBtn.disabled = true; confirmBtn.textContent = '⏳ Enregistrement…';

      try {
        var photoUrl = null;
        if (sc.photo) {
          try {
            var path = S.P.id + '/p2-' + lot.bag_qr_id + '-' + Date.now() + '.jpg';
            var up = await M.sb.storage.from('proofs').upload(path, sc.photo, { contentType: 'image/jpeg', upsert: true });
            if (!up.error) {
              var pub = M.sb.storage.from('proofs').getPublicUrl(path);
              if (pub.data && pub.data.publicUrl) photoUrl = pub.data.publicUrl;
            }
          } catch (e) {}
        }

        var updates = { weight_depot_kg: w, status: 'ANCHORED' };
        if (photoUrl) updates.depot_fault_photo = photoUrl;

        var r = await M.sb.from('collections').update(updates).eq('id', lot.id)
          .select('id,status,weight_collect_kg,weight_depot_kg').single();

        if (r.error) {
          confirmBtn.disabled = false; confirmBtn.textContent = '✓ Valider P2';
          return M.toast('Erreur : ' + r.error.message, 'err');
        }

        var status = r.data.status;
        stopStream();
        m.close();
        if (status === 'DISCREPANCY') {
          M.toast('⚠️ DISCREPANCY · admin doit investiguer (Δ > 3%)', 'warn');
        } else {
          M.toast('✅ ANCHORED · ' + w.toFixed(2) + ' kg', '');
        }
        go('depot');
      } catch (e) {
        confirmBtn.disabled = false; confirmBtn.textContent = '✓ Valider P2';
        M.toast('Erreur : ' + (e.message || e), 'err');
      }
    };
  }

  /* =================================================================
     15. OPEN MISSION CLOSE (Payout COURSE)
     ================================================================= */
  function openMissionClose(pickupId) {
    return new Promise(async function (resolve) {
      var pid = pickupId || S.activePickupId;
      if (!pid) { M.toast('Aucune mission active', 'err'); return resolve(); }

      // 1) Check DISCREPANCY
      try {
        var dc = await M.sb.from('collections').select('id', { count: 'exact', head: true })
          .eq('pickup_id', pid).eq('status', 'DISCREPANCY');
        if (dc.count && dc.count > 0) {
          var ok = await M.confirm(dc.count + ' sac(s) en DISCREPANCY seront exclus du paiement. Continuer la clôture ?');
          if (!ok) return resolve();
        }
      } catch (e) {}

      // 2) GPS Point C
      var gpsC = await gpsNow(8000);
      if (!gpsC) M.toast('GPS hub indisponible — fallback serveur', 'warn');

      // 3) UPDATE pickup → DONE (trigger DB calcule course)
      var upd;
      try {
        upd = await M.sb.from('pickups').update({
          status: 'DONE',
          gps_hub_lat: gpsC ? gpsC.lat : null,
          gps_hub_lng: gpsC ? gpsC.lng : null,
          closed_at: new Date().toISOString()
        }).eq('id', pid).select('id, course_amount_mad, weight_total_kg, bags_count, distance_triangle_km').single();
      } catch (e) {
        M.toast('Erreur réseau clôture : ' + (e.message || e), 'err');
        return resolve();
      }

      if (upd.error || !upd.data) {
        M.toast('Erreur clôture: ' + (upd.error ? upd.error.message : 'données absentes'), 'err');
        return resolve();
      }

      var pk = upd.data;
      var amount = Number(pk.course_amount_mad || 0);
      var weight = Number(pk.weight_total_kg || 0);
      var dist = Number(pk.distance_triangle_km || 0);
      var bagsN = Number(pk.bags_count || 0);

      // 4) Modale breakdown + paiement
      var body = h('div', { class: 'space-y-3' });
      body.innerHTML = '<div class="p-3 bg-black/60 rounded-xl border border-cyberGreen/30 font-mono text-xs space-y-1">' +
        '<div class="flex justify-between"><span class="text-slate-400">Course</span><span class="text-cyberGreen font-bold text-lg">' + M.fmt.n(amount, 2) + ' MAD</span></div>' +
        '<div class="flex justify-between"><span class="text-slate-400">Poids ANCHORED</span><span class="text-white">' + weight.toFixed(2) + ' kg</span></div>' +
        '<div class="flex justify-between"><span class="text-slate-400">Sacs</span><span class="text-white">' + bagsN + '</span></div>' +
        '<div class="flex justify-between"><span class="text-slate-400">Distance payée</span><span class="text-white">' + dist.toFixed(2) + ' km</span></div>' +
        '</div>';

      var methodSel = h('select', { class: 'inp' });
      PAY_METHODS.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p[0]; o.textContent = p[1]; methodSel.appendChild(o);
      });
      body.appendChild(h('label', { class: 'lbl', text: 'Mode de règlement' }));
      body.appendChild(methodSel);

      var detailsInp = h('input', { type: 'text', class: 'inp', placeholder: 'RIB / téléphone (si virement)' });
      body.appendChild(h('label', { class: 'lbl', text: 'Détails (optionnel)' }));
      body.appendChild(detailsInp);

      var confirmBtn = h('button', { type: 'button', class: 'btn btn-g', text: '✓ Confirmer et enregistrer' });
      body.appendChild(confirmBtn);

      var m = M.modal('Clôture · Reçu de Mission', body);

      confirmBtn.onclick = async function () {
        confirmBtn.disabled = true; confirmBtn.textContent = '⏳ Enregistrement…';

        var method = methodSel.value;
        var details = detailsInp.value.trim() || null;
        if (method !== 'ESPECES_CAISSE' && !details) {
          confirmBtn.disabled = false; confirmBtn.textContent = '✓ Confirmer et enregistrer';
          return M.toast('RIB/téléphone requis pour ce mode', 'err');
        }

        var rates = {
          base_fare_mad: Number(S.P.contract_base_fare_mad) || 15,
          km_rate_mad: Number(S.P.contract_km_rate_mad) || 2,
          weight_prime_mad: Number(S.P.contract_weight_prime_mad) || 5,
          weight_tranche_kg: Number(S.P.contract_weight_tranche_kg) || 50
        };

        var pr = await M.sb.from('payout_requests').insert([{
          user_id: S.P.id,
          operator: S.P.email,
          amount_mad: amount,
          method: method,
          details: details,
          status: 'PENDING',
          payout_type: 'COURSE',
          pickup_id: pid,
          base_fare_mad: rates.base_fare_mad,
          km_rate_mad: rates.km_rate_mad,
          weight_prime_mad: rates.weight_prime_mad,
          weight_tranche_kg: rates.weight_tranche_kg,
          distance_km: dist,
          weight_kg: weight
        }]).select('id').single();

        if (pr.error) {
          confirmBtn.disabled = false; confirmBtn.textContent = '✓ Confirmer et enregistrer';
          return M.toast('Erreur payout: ' + pr.error.message, 'err');
        }

        // Link bidirezionale
        try { await M.sb.from('pickups').update({ payout_request_id: pr.data.id }).eq('id', pid); } catch (e) {}

        S.activePickupId = null;
        m.close();
        success('Mission clôturée · ' + amount.toFixed(2) + ' MAD');
        go('tour');
        resolve();
      };
    });
  }

  /* =================================================================
     16. VUE : AMBASSADEUR
     ================================================================= */
  async function vAmbassador() {
    app.append(title('Ambassadeur', 'Clients portés · avances · contrats signés.'));

    // Section A · Clients portés
    var clientsList = h('div', { class: 'space-y-2 mt-4' });
    app.append(h('p', { class: 'lbl au px-1', text: 'Mes clients portés' }), clientsList);

    var rows = [];
    try {
      var r = await M.sb.from('clients')
        .select('id,company_name,exclusive_status,horeca_category,exclusive_vector_id,procured_at')
        .eq('procured_by_vector_id', S.P.id)
        .order('procured_at', { ascending: false });
      rows = r.data || [];
    } catch (e) {}

    if (!rows.length) {
      clientsList.appendChild(h('div', { class: 'empty-state' },
        h('div', { class: 'ico', text: '👥' }),
        h('p', { text: 'Aucun client porté. Signez un nouveau contrat ci-dessous.' })));
    } else {
      rows.forEach(function (c, i) {
        var bd = c.exclusive_status === 'APPROVED' ? 'bd-g'
               : c.exclusive_status === 'PENDING'  ? 'bd-au'
               : c.exclusive_status === 'REJECTED' ? 'bd-r' : 'bd-n';
        var bdt = c.exclusive_status || 'N/A';
        var card = h('div', { class: 'card', style: '--i:' + i },
          h('div', { class: 'flex justify-between items-start gap-2' },
            h('div', null,
              h('p', { class: 'font-bold text-sm text-white', text: c.company_name }),
              h('p', { class: 'text-[10px] font-mono text-slate-400', text: (c.horeca_category || 'B2B') + ' · ' + M.fmt.d(c.procured_at) })),
            h('span', { class: 'bd ' + bd, text: bdt })));
        if (c.exclusive_status === 'APPROVED' || c.exclusive_status === 'PENDING') {
          card.appendChild(h('button', {
            type: 'button', class: 'btn btn-au !py-2 !text-[10px] mt-2', text: '⚡ Demander une avance',
            onclick: function () { openAvanceForm(c); }
          }));
        }
        clientsList.appendChild(card);
      });
    }

    // Section B · Nouveau contrat
    app.appendChild(h('button', {
      type: 'button', class: 'btn btn-au mt-4', text: '🤝 Nouveau contrat signé',
      onclick: openNewContractForm
    }));

    // Section C · Contrats signés (legacy)
    var contractsList = h('div', { class: 'space-y-2 mt-4' });
    app.append(h('p', { class: 'lbl au px-1', text: 'Mes contrats signés' }), contractsList);

    var crows = [];
    try {
      var cr = await M.sb.from('ambassador_contracts').select('*')
        .eq('ambassador_email', S.P.email).order('created_at', { ascending: false }).limit(30);
      crows = cr.data || [];
    } catch (e) {}

    if (!crows.length) {
      contractsList.appendChild(h('div', { class: 'empty-state' },
        h('div', { class: 'ico', text: '📄' }),
        h('p', { text: 'Aucun contrat soumis.' })));
    } else {
      crows.forEach(function (c, i) {
        var bd = c.status === 'VALIDATED' ? 'bd-g' : c.status === 'REJECTED' ? 'bd-r' : 'bd-au';
        var bdt = c.status === 'VALIDATED' ? 'Validé' : c.status === 'REJECTED' ? 'Refusé' : 'En revue';
        contractsList.appendChild(h('div', { class: 'card flex justify-between items-center gap-2', style: '--i:' + i },
          h('div', null,
            h('p', { class: 'font-bold text-sm text-white', text: c.company_name }),
            h('p', { class: 'text-[10px] font-mono text-slate-400',
              text: M.fmt.d(c.created_at) + (c.status === 'VALIDATED' && c.bonus_mad ? ' · Prime ' + M.fmt.n(c.bonus_mad, 2) + ' MAD' : '') })),
          h('span', { class: 'bd ' + bd, text: bdt })));
      });
    }
  }

  function openNewContractForm() {
    M.form('Nouveau contrat B2B', [
      { k: 'company', label: 'Établissement', required: true, placeholder: 'Nom de l\'établissement' },
      { k: 'cat', label: 'Catégorie', type: 'select', options: CATS },
      { k: 'contact', label: 'Contact sur place', required: true },
      { k: 'phone', label: 'Téléphone', type: 'tel', placeholder: '+212 6...' },
      { k: 'photo', label: 'Photo du contrat signé', type: 'file', accept: 'image/*', capture: 'environment', required: true },
      { k: 'ok', label: 'Consentement Loi CNDP 09-08 obtenu.', type: 'checkbox', required: true }
    ], 'Envoyer à la Direction', async function (v) {
      var id = M.uuid();
      var blob = await M.resize(v.photo);
      blob = await annotate(blob, { ts: new Date().toISOString(), gps: gpsStr(), mode: 'CONTRACT_SIGNED' });
      var r = await M.insert('ambassador_contracts', {
        id: id, ambassador_email: S.P.email,
        company_name: v.company, category: v.cat,
        contact_name: v.contact, phone: v.phone
      }, [{ bucket: 'contracts', path: S.P.id + '/' + id + '.jpg', blob: blob, field: 'photo_path' }]);
      if (r.status === 'error') return 'Refusé : ' + r.message;
      M.toast('Contrat transmis à la Direction.');
      voice('Contrat transmis');
      go('contracts');
    });
  }

  async function openAvanceForm(client) {
    M.form('Demande d\'avance · ' + client.company_name, [
      { k: 'amount', label: 'Montant (MAD)', type: 'number', min: 1, max: 500, step: '0.01', required: true, value: 500 },
      { k: 'method', label: 'Mode', type: 'select', options: PAY_METHODS },
      { k: 'details', label: 'RIB / Téléphone (si virement)' }
    ], 'Demander l\'avance', async function (v) {
      if (v.method !== 'ESPECES_CAISSE' && !v.details) return 'RIB ou téléphone requis';
      var r = await M.sb.from('payout_requests').insert([{
        user_id: S.P.id,
        operator: S.P.email,
        amount_mad: v.amount,
        method: v.method,
        details: v.details || null,
        status: 'PENDING',
        payout_type: 'ADVANCE_CONTRACT',
        related_client_id: client.id,
        admin_notes: 'Avance sur contrat ' + client.company_name
      }]);
      if (r.error) return 'Erreur : ' + r.error.message;
      M.toast('Demande d\'avance transmise à la Direction.');
    });
  }

  /* =================================================================
     17. VUE : KEMET WALLET
     ================================================================= */
  async function vWallet() {
    app.append(title('Kemet Wallet', 'Trésorerie opérationnelle et Actions de Classe B.'));

    var bal = h('span', { class: 'skel', text: '0000' });
    var div = h('span', { class: 'text-sm font-bold text-kemetGoldBright', text: '0,00 MAD' });
    var led = h('ul', { class: 'space-y-1.5' });
    var balance = 0;

    app.appendChild(h('div', { class: 'card g space-y-4' },
      h('div', { class: 'p-4 bg-black/60 rounded-2xl border border-cyberGreen/30 text-center font-mono' },
        h('span', { class: 'text-[10px] text-slate-400 uppercase block', text: 'Solde disponible (MAD)' }),
        h('div', { class: 'text-4xl font-black text-cyberGreen' }, bal, h('span', { class: 'text-xs font-normal', text: ' MAD' }))),
      h('div', { class: 'p-3 bg-black/40 rounded-xl border border-white/10 text-center font-mono' },
        h('span', { class: 'text-[9px] text-slate-400 uppercase block', text: 'Dividendes Actions de Classe B' }), div),
      h('div', null,
        h('p', { class: 'lbl mb-2', text: 'Registre des mouvements notarisés' }), led),
      h('div', { class: 'grid grid-cols-2 gap-2' },
        h('button', { type: 'button', class: 'btn btn-au !py-3 !text-[10px]', text: '💸 Demander un règlement',
          onclick: function () { payout(balance); } }),
        h('button', { type: 'button', class: 'btn btn-o !py-3 !text-[10px]', text: '💵 Reçu espèces',
          onclick: cashReceipt }))));

    var s = {}, rows = [];
    try {
      var a = await M.sb.from('wallet_summary').select('*').eq('user_id', S.P.id).maybeSingle();
      s = a.data || {};
      var b = await M.sb.from('wallet_ledger').select('created_at,label,amount_mad,notarized,kind')
        .eq('user_id', S.P.id).order('created_at', { ascending: false }).limit(20);
      rows = b.data || [];
    } catch (e) {}

    balance = Number(s.balance_mad || 0);
    M.countUp(bal, balance, 2);
    div.textContent = s.class_b_dividends_mad != null ? '+' + M.fmt.n(s.class_b_dividends_mad, 2) + ' MAD' : '0,00 MAD';

    if (!rows.length) {
      led.appendChild(h('li', { class: 'text-slate-500 text-xs font-mono text-center py-4', text: 'Aucun mouvement notarisé inscrit au registre.' }));
    }

    var ICONS = { COURSE: '🚚', BONUS: '🎁', DIVIDEND: '💎', ADVANCE: '⚡', PAYOUT: '💸', ADJUST: '⚖️' };
    rows.forEach(function (x, i) {
      var neg = x.amount_mad < 0;
      led.appendChild(h('li', { class: 'ledger-row', style: 'animation:rise .35s both;animation-delay:' + i * 40 + 'ms' },
        h('span', { class: 'ico', text: (x.notarized ? '🔏' : '') + (ICONS[x.kind] || '•') }),
        h('span', { class: 'lbl' }, h('span', { text: x.label }), h('small', { text: M.fmt.d(x.created_at) })),
        h('span', { class: 'amt ' + (neg ? 'neg' : 'pos'),
          text: (x.amount_mad > 0 ? '+' : '') + M.fmt.n(x.amount_mad, 2) })));
    });
  }

  function payout(balance) {
    M.form('Demande de règlement', [
      { k: 'amount', label: 'Montant (MAD) — solde : ' + M.fmt.n(balance, 2), type: 'number', min: 1, max: Math.max(balance, 1), step: '0.01', required: true },
      { k: 'method', label: 'Mode de règlement', type: 'select', options: PAY_METHODS },
      { k: 'slot', label: 'Créneau retrait espèces', type: 'select', options: [['', '— Non applicable —'], ['08:30', 'Demain 08:30'], ['12:30', 'Demain 12:30'], ['17:00', 'Demain 17:00']] },
      { k: 'details', label: 'RIB ou Téléphone du bénéficiaire' }
    ], 'Transmettre au siège', async function (v) {
      if (balance <= 0) return 'Solde insuffisant.';
      if (v.method !== 'ESPECES_CAISSE' && !v.details) return 'Indiquez le RIB ou téléphone.';
      var r = await M.insert('payout_requests', { operator: S.P.email, amount_mad: v.amount, method: v.method, details: v.details || null, cash_slot: v.slot || null });
      if (r.status === 'error') return 'Refusé : ' + r.message;
      M.toast('Demande transmise à la Direction Financière.');
    });
  }

  function cashReceipt() {
    M.form('Reçu espèces', [
      { k: 'amount', label: 'Montant (MAD)', type: 'number', min: 1, step: '0.01', required: true },
      { k: 'motif', label: 'Motif', type: 'select', options: [['AVANCE_CARBURANT', 'Micro-avance carburant'], ['INDEMNITE_NO_SHOW', 'Indemnité faux déplacement'], ['ACHAT_PETIT_MATERIEL', 'Achat petit matériel']] },
      { k: 'ref', label: 'N° de reçu papier', required: true }
    ], 'Ancrer au registre', async function (v) {
      var r = await M.insert('cash_receipts', { amount_mad: v.amount, motif: v.motif, ref: v.ref });
      if (r.status === 'error') return 'Refusé : ' + r.message;
      M.toast('Reçu ancré au registre de caisse.');
    });
  }

  /* =================================================================
     18. VUE : PROFIL
     ================================================================= */
  async function vMe() {
    var initials = (S.P.full_name || S.P.email).split(/[\s@.]+/).slice(0, 2)
      .map(function (x) { return x[0]; }).join('').toUpperCase();
    var grade = GRADES[S.P.grade] || { icon: '·', color: '#94a3b8' };

    var st = {}, vals = [
      ['Ancienneté', 'tenure_months', 0, ' mois'],
      ['Tonnage', 'tonnage_kg', 0, ' kg'],
      ['Score Maat', 'merit_score', 1, ' / 100'],
      ['Collectes', 'tours_count', 0, '']
    ];
    var cells = [];
    var grid = h('div', { class: 'grid grid-cols-2 gap-3 text-center font-mono' },
      vals.map(function (v) {
        var s = h('span', { class: 'text-base font-bold text-white skel', text: '0' });
        cells.push(s);
        return h('div', { class: 'p-3 bg-black/50 rounded-2xl border border-white/10' },
          h('span', { class: 'text-[9px] text-slate-400 uppercase block', text: v[0] }), s);
      }));

    app.appendChild(h('div', { class: 'card au space-y-4' },
      h('div', { class: 'flex items-center gap-3 border-b border-white/10 pb-3' },
        h('div', { class: 'w-14 h-14 rounded-2xl bg-black border border-kemetGold flex items-center justify-center font-kemetTitle font-black text-kemetGoldBright text-lg', text: initials }),
        h('div', null,
          h('h3', { class: 'font-bold text-sm text-white', text: S.P.full_name || S.P.email }),
          h('div', { class: 'flex gap-1 mt-1 items-center' },
            h('span', { class: 'grade-badge', style: '--gc:' + grade.color },
              h('span', { text: grade.icon }), h('span', { text: S.P.grade || 'Sans échelon' })),
            (S.P.capabilities || []).map(function (c) { return h('span', { class: 'bd bd-g', text: c === 'vector' ? 'Vecteur' : 'Ambassadeur' }); }))),
        h('div', { class: 'ml-auto ring-wrap', id: 'meritRing' })),
      grid,
      h('div', { class: 'grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300' },
        h('div', { class: 'p-2 bg-black/40 rounded-lg' },
          h('span', { class: 'text-[9px] text-slate-400 block', text: 'CLUSTER' }),
          h('span', { class: 'font-bold text-white', text: S.P.cluster || 'Non assigné' })),
        h('div', { class: 'p-2 bg-black/40 rounded-lg' },
          h('span', { class: 'text-[9px] text-slate-400 block', text: 'VÉHICULE' }),
          h('span', { class: 'font-bold text-white', text: S.P.vehicle || 'Non assigné' })))));

    (function () {
      var wrap = $('meritRing'), r = 28, c = 2 * Math.PI * r;
      wrap.innerHTML = '<svg width="68" height="68" viewBox="0 0 68 68"><circle class="ring-bg" cx="34" cy="34" r="' + r + '"/>' +
        '<circle class="ring-fg" cx="34" cy="34" r="' + r + '" stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '"/></svg>' +
        '<div class="ring-val">0</div>';
      setTimeout(function () {
        var sc = Number(S.P.merit_score || 0);
        var off = c - (c * Math.max(0, Math.min(100, sc)) / 100);
        wrap.querySelector('.ring-fg').style.strokeDashoffset = off;
        wrap.querySelector('.ring-val').textContent = Math.round(sc);
      }, 150);
    })();

    try {
      var r = await M.sb.from('operator_stats').select('*').eq('user_id', S.P.id).maybeSingle();
      st = r.data || {};
    } catch (e) {}

    vals.forEach(function (v, i) {
      M.countUp(cells[i], st[v[1]] != null ? Number(st[v[1]]) : 0, v[2], v[3]);
    });

    app.appendChild(h('div', { class: 'card space-y-3' },
      h('p', { class: 'lbl au', text: 'Journal de bord terrain' }),
      h('button', { type: 'button', class: 'btn btn-au', text: '📝 Nouvelle observation terrain',
        onclick: function () {
          M.form('Observation terrain', [
            { k: 'type', label: 'Type', type: 'select', options: [['INCIDENT', 'Anomalie / Sac endommagé'], ['QUALITE', 'Problème de tri / Contamination'], ['LOGISTIQUE', 'Accès / Horaires client'], ['GENERAL', 'Note générale']] },
            { k: 'text', label: 'Rapport d\'incident', type: 'textarea', required: true }
          ], 'Enregistrer au siège', async function (v) {
            var r = await M.insert('field_notes', { operator_email: S.P.email, note_type: v.type, content: v.text, gps_location: gpsStr() });
            if (r.status === 'error') return 'Refusé : ' + r.message;
            M.toast('Observation transmise au siège.');
          });
        } })));

    var inst = h('button', {
      type: 'button', class: 'btn btn-o ' + (S.deferred ? '' : 'hidden'),
      text: '📲 Installer l\'application Maat OS',
      onclick: function () { if (S.deferred) { S.deferred.prompt(); S.deferred = null; inst.classList.add('hidden'); } }
    });
    app.append(inst);
    app.appendChild(h('button', { type: 'button', class: 'btn btn-r', text: 'Se déconnecter 🔒', onclick: M.signOut }));
  }

  /* =================================================================
     19. INSTALLATION PWA & PULL-TO-REFRESH
     ================================================================= */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); S.deferred = e;
    var bar = $('installBar'); if (bar) bar.classList.add('show');
  });
  if ($('installGo')) $('installGo').onclick = function () {
    if (S.deferred) { S.deferred.prompt(); S.deferred = null; $('installBar').classList.remove('show'); }
  };
  if ($('installNo')) $('installNo').onclick = function () { $('installBar').classList.remove('show'); };

  (function () {
    var y0 = 0, dragging = false, ptr = $('ptr');
    document.addEventListener('touchstart', function (e) {
      if (window.scrollY <= 0 && e.touches.length === 1) { y0 = e.touches[0].clientY; dragging = true; }
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!dragging || !ptr) return;
      var dy = e.touches[0].clientY - y0;
      if (dy > 60 && window.scrollY <= 0) ptr.classList.add('show');
    }, { passive: true });
    document.addEventListener('touchend', function () {
      if (!dragging) return; dragging = false;
      if (ptr && ptr.classList.contains('show')) {
        ptr.classList.add('spin');
        M.flush().then(function () {
          setTimeout(function () { ptr.classList.remove('show', 'spin'); if (S.P) go(S.view); }, 500);
        });
      }
    });
  })();

  /* =================================================================
     20. DÉMARRAGE DU RUNTIME
     ================================================================= */
  window.addEventListener('load', function () {
    M.init();
    M.netInit($('netDot'), $('qBadge'));
    M.sw();
    boot();
  });
})();
