/* ==========================================================================
 *  assets/materials.js
 *  Maat OS · Material Types Registry (source unique de vérité)
 *  Les codes DOIVENT correspondre au CHECK constraint DB :
 *  'PET','PEHD','LDPE','PP','CARD','ALU','FER','GLASS','ORG','DIB'
 * ========================================================================== */
(function () {
  'use strict';
  if (window.MAAT_MATERIALS) return;

  window.MAAT_MATERIALS = [
    {
      id: 'PET', icon: '🟢', label: 'PET transparent',
      color: '#00FFA3', hint: 'Bouteilles eau/soda',
      active: true
    },
    {
      id: 'PEHD', icon: '🟡', label: 'PE-HD rigide',
      color: '#E6CA65', hint: 'Bidons, flacons lessive',
      active: true
    },
    {
      id: 'PP', icon: '🥤', label: 'Polypropylène (PP)',
      color: '#FB923C', hint: 'Cagettes, bouchons, contenants',
      active: true
    },
    {
      id: 'ALU', icon: '🥫', label: 'Aluminium',
      color: '#C5A059', hint: 'Canettes, barquettes',
      active: true
    },
    {
      id: 'GLASS', icon: '🍾', label: 'Verre blanc',
      color: '#7EB8D9', hint: 'Bouteilles boisson',
      active: true
    },
    {
      id: 'CARD', icon: '📦', label: 'Carton / Papier',
      color: '#B48A5A', hint: 'Emballages, cartons, journaux',
      active: true
    },
    {
      id: 'LDPE', icon: '🎞️', label: 'Film plastique (LDPE)',
      color: '#67E8F9', hint: 'Sacs, emballages souples',
      active: true
    },
    {
      id: 'FER', icon: '⚙️', label: 'Métaux ferreux',
      color: '#A1A1AA', hint: 'Fonte et acier',
      active: true
    },
    {
      id: 'DIB', icon: '🗑️', label: 'Encombrants DIB',
      color: '#94A3B8', hint: 'Filière dédiée B2B',
      active: true
    },
    {
      id: 'ORG', icon: '🌱', label: 'Déchets organiques',
      color: '#A78BFA', hint: 'Biométhanisation (phase test)',
      active: false,      // désactivé tant que la filière n'est pas ouverte
      phase_test: true
    }
  ];

  // Helper : trouver un matériau par son id
  window.MAAT_MATERIALS_BY_ID = window.MAAT_MATERIALS.reduce(function (acc, m) {
    acc[m.id] = m;
    return acc;
  }, {});

  console.log('[MaatMaterials] ready · ' + window.MAAT_MATERIALS.length + ' matériaux');
})();
