/* Shielded Gated Terminal · K-MEH-20 */
(function () {
  'use strict';
  if (window.__MaatShieldedLoaded) return;
  window.__MaatShieldedLoaded = true;

  const log = (...a) => console.log('[Shielded]', ...a);

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  /* ─── Matrix rain dentro il wrapper ────────────────────────────────── */
  function startMatrixRain(wrapper) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;opacity:0.25';
    wrapper.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let cols, drops;
    function resize() {
      canvas.width = wrapper.offsetWidth || 800;
      canvas.height = wrapper.offsetHeight || 600;
      cols = Math.floor(canvas.width / 14);
      drops = Array(cols).fill(1);
    }
    resize();
    window.addEventListener('resize', resize);
    const charsArr = '01AF3E7BC9D258'.split('');
    setInterval(() => {
      if (!document.body.contains(canvas)) return;
      ctx.fillStyle = 'rgba(9, 13, 16, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#00FFA3';
      ctx.font = '14px monospace';
      for (let i = 0; i < drops.length; i++) {
        const ch = charsArr[Math.floor(Math.random() * charsArr.length)];
        ctx.fillText(ch, i * 14, drops[i] * 14);
        if (drops[i] * 14 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }, 60);
  }

  function buildOverlay(wrapper) {
    startMatrixRain(wrapper);

    const overlay = el('div', 'shielded-overlay');
    const card = el('div', 'shielded-card');

    const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    logo.setAttribute('viewBox', '0 0 120 120');
    logo.setAttribute('fill', 'none');
    logo.setAttribute('class', 'shielded-card__logo');
    logo.innerHTML = `
      <path d="M22 60 Q60 38 98 60 Q60 82 22 60 Z" stroke="#00FFA3" stroke-width="2.2" fill="#0A0D10"/>
      <circle cx="60" cy="60" r="14" stroke="#C5A059" stroke-width="1.8" fill="#11161C"/>
      <circle cx="60" cy="60" r="7" fill="#00FFA3"/>
    `;
    card.appendChild(logo);

    card.appendChild(el('span', 'shielded-card__badge', 'Accès Restreint · OMPIC'));
    card.appendChild(el('h2', 'shielded-card__title',
      'ARCHITECTURE MATÉRIELLE INDUSTRIELLE · ACCÈS RESTREINT'));
    card.appendChild(el('p', 'shielded-card__text',
      'Technologies souveraines de valorisation matière et ingénierie lourde pour le Royaume du Maroc et le continent africain. Les spécifications techniques complètes sont soumises à accréditation industrielle préalable.'));

    const actions = el('div', 'shielded-card__actions');

    const btnAccredit = el('button', 'shielded-card__btn shielded-card__btn--primary',
      'Solliciter une Accréditation Industrielle');
    btnAccredit.type = 'button';
    btnAccredit.addEventListener('click', () => {
      if (window.openKmeh20AccessModal) window.openKmeh20AccessModal();
      else console.warn('[Shielded] Modale non montata');
    });
    actions.appendChild(btnAccredit);

    const btnLogin = el('button', 'shielded-card__btn shielded-card__btn--ghost',
      'Connexion Institutionnelle');
    btnLogin.type = 'button';
    btnLogin.addEventListener('click', () => {
      if (window.openAdminLoginModal) window.openAdminLoginModal();
      else if (window.openLoginModal) window.openLoginModal();
    });
    actions.appendChild(btnLogin);

    card.appendChild(actions);
    card.appendChild(el('p', 'shielded-card__footnote',
      'Conformité Loi 28-00 & CNDP n° 09-08 · Traitement confidentiel · Dossier OMPIC en préparation'));

    overlay.appendChild(card);
    wrapper.appendChild(overlay);
    wrapper.classList.add('is-locked');
    log('locked');
  }

  function init() {
    document.querySelectorAll('.shielded-wrapper').forEach(buildOverlay);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else { init(); }

  window.MaatShielded = {
    unlock: () => {
      document.querySelectorAll('.shielded-wrapper').forEach(w => {
        w.classList.remove('is-locked');
        const ov = w.querySelector('.shielded-overlay');
        if (ov) ov.remove();
      });
    },
  };
})();
