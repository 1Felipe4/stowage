const ICONS: Record<string, string> = {
  CARGO: '<rect x="3.5" y="6.5" width="17" height="13"/><path d="M3.5 6.5L12 3l8.5 3.5M3.5 10.5h17M12 3v3.5M8 10.5v9M16 10.5v9"/>',
  RCT: '<circle cx="12" cy="12" r="2.4"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-60 12 12)"/>',
  BAT: '<rect x="2.5" y="7.5" width="16" height="9" rx="1"/><path d="M18.5 10.5h3v3h-3"/><path d="M11.5 9l-2.6 3.6h2.6L10.4 16"/>',
  RAD: '<rect x="4" y="6" width="16" height="12"/><path d="M8 6v12M12 6v12M16 6v12"/><path d="M6 3.5c1.5 1 1.5 1.5 0 2.5M18 3.5c1.5 1 1.5 1.5 0 2.5"/>',
  CRY: '<path d="M12 2.5v19M4 7l16 10M4 17L20 7"/><path d="M9.6 4.4L12 6.2l2.4-1.8M9.6 19.6L12 17.8l2.4 1.8"/>',
  LSP: '<path d="M12 3.5v9M9.5 4h5"/><path d="M12 9.5C10.5 7 8.5 6.6 7 7.9c-1.4 1.2-1.8 3.5-1.6 6.1.2 2.6 1 4.4 2.4 4.7 1.6.3 2.6-.9 2.9-2.6.2-1.3.3-3.3.3-4.6"/><path d="M12 9.5c1.5-2.5 3.5-2.9 5-1.6 1.4 1.2 1.8 3.5 1.6 6.1-.2 2.6-1 4.4-2.4 4.7-1.6.3-2.6-.9-2.9-2.6-.2-1.3-.3-3.3-.3-4.6"/>',
  BRT: '<path d="M2.5 19.5v-8M2.5 14.5h19v5M21.5 19.5v-7a2.5 2.5 0 00-2.5-2.5h-7v4.5"/><circle cx="7" cy="11.8" r="2.1"/>',
  THR: '<path d="M9 2.5h6l2.2 9H6.8z"/><path d="M7.5 11.5h9l-1.2 4h-6.6z"/><path d="M10 17.5v3.8M12 17.8v4M14 17.5v3.8"/>',
  SHD: '<path d="M12 2.5l8.5 3.2v6.1c0 5.2-3.7 8.8-8.5 9.7-4.8-.9-8.5-4.5-8.5-9.7V5.7z"/><path d="M12 8v6"/>',
  TNK: '<rect x="6" y="4.5" width="12" height="15" rx="3"/><path d="M6 9h12M9.5 4.5V2.5h5v2"/><path d="M9 13.5h6v4H9z"/>',
  CREW: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3.2-6.5 7-6.5s7 2.5 7 6.5"/>',
  FUEL: '<path d="M12 2.5s6 6.3 6 10.6a6 6 0 01-12 0C6 8.8 12 2.5 12 2.5z"/><path d="M9.5 14.2c.4 1.7 1.4 2.6 2.9 2.8"/>',
  PORT: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5v15M4.5 12h15"/>',
  WARP: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2L19 19M19 5l-2.8 2.8M7.8 16.2L5 19"/>',
  MASS: '<path d="M4 20h16L12 4z"/><path d="M8 15h8"/>',
  /* UI glyphs for the bridge chrome (lucide-style strokes) */
  CHECK: '<path d="M20 6L9 17l-5-5"/>',
  X: '<path d="M18 6L6 18M6 6l12 12"/>',
  ALERT: '<path d="M10.3 3.8L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.8a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  OKRING: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  GRIDX: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  ROUTE: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M12 19h4.5a3.5 3.5 0 000-7h-9a3.5 3.5 0 010-7H12"/>',
  TAGI: '<path d="M12 2H2v10l9.3 9.3a2 2 0 002.8 0l7-7a2 2 0 000-2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  STOWIN: '<path d="M12 3v12M6 9l6 6 6-6"/><path d="M5 21h14"/>',
  PLUS: '<path d="M12 5v14M5 12h14"/>',
  MINUS: '<path d="M5 12h14"/>',
  COINS: '<circle cx="8" cy="8" r="5"/><path d="M14.5 9.6a5 5 0 11-4.9 5"/>',
  BAG: '<path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 016 0"/>',
  BAN: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  SHARE: '<path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/><path d="M12 16V3"/><path d="M7.5 7.5L12 3l4.5 4.5"/>',
  FLAG: '<path d="M5 21V4"/><path d="M5 4h9l-1.2 4L14 12H5"/>',
  PLAY: '<path d="M7 4l12 8-12 8z"/>',
  TEACH: '<path d="M2.5 8.5L12 4l9.5 4.5L12 13z"/><path d="M6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5"/>',
  CUP: '<path d="M7 4h10v5a5 5 0 01-10 0z"/><path d="M7 5.5H4.5A2.5 2.5 0 007 9M17 5.5h2.5A2.5 2.5 0 0117 9"/><path d="M12 14v4M8.5 20h7"/>',
  CHEV: '<path d="M9 5l7 7-7 7"/>',
  MENU: '<path d="M4 7h16M4 12h16M4 17h16"/>'
}

export function Icon({ k, cls }: { k: string; cls?: string }) {
  return (
    <svg
      className={'ic ' + (cls || '')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: ICONS[k] || '' }}
    />
  )
}
