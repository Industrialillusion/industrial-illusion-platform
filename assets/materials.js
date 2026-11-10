/* ==========================================================================
 *  assets/materials.js
 *  Maat OS · Fonte unica materiali (allineata CHECK constraint DB)
 *  I 10 codici validi: PET, PEHD, LDPE, PP, CARD, ALU, FER, GLASS, ORG, DIB
 *  ORG = active:false (filiera in fase test)
 *  c1 = color (primario), c2 = color2 (secondario per gradienti dashboard)
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__MaatMaterialsLoaded) return;
  window.__MaatMaterialsLoaded = true;

  window.MAAT_MATERIALS = [
    { id:'PET',   icon:'🟢', label:'PET transparent',    color:'#00FFA3', c2:'#059669', hint:'Bouteilles eau/soda',           active:true  },
    { id:'PEHD',  icon:'🟡', label:'PE-HD rigide',       color:'#E6CA65', c2:'#B8941F', hint:'Bidons, flacons lessive',       active:true  },
    { id:'LDPE',  icon:'🎞️', label:'Film plastique',     color:'#67E8F9', c2:'#0891B2', hint:'Sacs, emballages souples',      active:true  },
    { id:'PP',    icon:'🥤', label:'Polypropylène',      color:'#FB923C', c2:'#C2410C', hint:'Cagettes, bouchons',            active:true  },
    { id:'CARD',  icon:'📦', label:'Carton / Papier',    color:'#B48A5A', c2:'#78350F', hint:'Emballages, cartons, journaux', active:true  },
    { id:'ALU',   icon:'🥫', label:'Aluminium',          color:'#C5A059', c2:'#92400E', hint:'Canettes, barquettes',          active:true  },
    { id:'FER',   icon:'⚙️', label:'Métaux ferreux',     color:'#A1A1AA', c2:'#52525B', hint:'Fonte et acier',                active:true  },
    { id:'GLASS', icon:'🍾', label:'Verre blanc',        color:'#7EB8D9', c2:'#1E6FA8', hint:'Bouteilles boisson',            active:true  },
    { id:'ORG',   icon:'🌱', label:'Déchets organiques', color:'#A78BFA', c2:'#6D28D9', hint:'Biométhanisation (phase test)', active:false, phase_test:true },
    { id:'DIB',   icon:'🗑️', label:'Encombrants DIB',    color:'#94A3B8', c2:'#475569', hint:'Filière dédiée B2B',            active:true  }
  ];

  window.MAAT_MATERIALS_BY_ID = window.MAAT_MATERIALS.reduce(function (acc, m) {
    acc[m.id] = m;
    return acc;
  }, {});

  console.log('[MaatMaterials] ready · ' + window.MAAT_MATERIALS.length + ' matériaux');
})();
