/* Maat OS — Thème Tailwind v8.1
   Chargé après le CDN Tailwind, avant tout rendu.
   Étend la palette Tailwind par défaut avec la charte cyber-Kemet. */
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        kemetTitle: ['Cinzel', 'serif'],
        sans:       ['Plus Jakarta Sans', 'sans-serif'],
        mono:       ['JetBrains Mono', 'monospace']
      },
      colors: {
        obsidian:        '#090D10',
        obsidianCard:    '#11161C',
        kemetGold:       '#C5A059',
        kemetGoldBright: '#E8C86A',
        cyberGreen:      '#00FFA3',
        cyberGreenDark:  '#00B871'
      }
    }
  }
};
