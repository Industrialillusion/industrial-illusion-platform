/* ==========================================================================
 *  assets/legal-footer.js
 *  Iniezione automatica del blocco legale ufficiale (mentions légales)
 *  Industrial Illusion SARL-AU · Marrakech, Maroc
 *
 *  Uso: aggiungere <script src="assets/legal-footer.js" defer></script>
 *  in ogni pagina HTML (prima di </body>).
 *
 *  Comportamento:
 *  - Se esiste già .legal-footer-official → non fa nulla (idempotente)
 *  - Se il footer esistente contiene già "©" → non duplica il copyright
 *  - Inserisce il blocco subito dopo il footer esistente (o a fondo body)
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatLegalFooterLoaded) return;
  window.__MaatLegalFooterLoaded = true;

  function buildHTML() {
    var hasCopyright = /©|&copy;/i.test(document.body.textContent || '');

    return (
      '<div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 text-center ' +
      'font-mono text-[9px] text-slate-600 leading-relaxed ' +
      'border-t border-white/5 space-y-1">' +
        (!hasCopyright
          ? '<p>© 2026 Industrial Illusion SARL-AU. Tous droits réservés.</p>'
          : '') +
        '<p>' +
          'Industrial Illusion SARL-AU · <em>Société en cours de constitution</em>' +
          ' · RC: <span class="text-slate-500">[En cours d\'attribution]</span>' +
          ' · ICE: <span class="text-slate-500">[En cours d\'attribution]</span>' +
          ' · Patente: <span class="text-slate-500">[En cours d\'attribution]</span>' +
          ' · Siège : Marrakech, Royaume du Maroc' +
          ' · Conforme <strong class="text-slate-500">Loi n° 28-00</strong>' +
          ' &amp; <strong class="text-slate-500">Loi n° 89-17</strong>' +
        '</p>' +
      '</div>'
    );
  }

  function inject() {
    if (document.querySelector('.legal-footer-official')) return;

    var block = document.createElement('div');
    block.className = 'legal-footer-official';
    block.innerHTML = buildHTML();

    var existingFooter = document.querySelector('footer');
    if (existingFooter && existingFooter.parentNode) {
      existingFooter.parentNode.insertBefore(block, existingFooter.nextSibling);
    } else {
      document.body.appendChild(block);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  } else {
    inject();
  }
})();
