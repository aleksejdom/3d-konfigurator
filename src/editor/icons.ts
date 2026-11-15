// Mitgelieferte Bedienelemente: einfache Linien-Symbole im Raster 24 × 24.
// Sie nutzen currentColor und nehmen damit die Farbe der Komponente an.

const wrap = (body: string, filled = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export interface GuiIcon {
  id: string;
  name: string;
  group: 'Wiedergabe' | 'Richtung' | 'Ansicht' | 'Auswahl' | 'Allgemein';
  svg: string;
}

export const ICONS: GuiIcon[] = [
  { id: 'play', name: 'Abspielen', group: 'Wiedergabe', svg: wrap('<path d="M8 5v14l11-7z"/>', true) },
  { id: 'pause', name: 'Pause', group: 'Wiedergabe', svg: wrap('<path d="M8 5v14M16 5v14"/>') },
  { id: 'stop', name: 'Stopp', group: 'Wiedergabe', svg: wrap('<rect x="6" y="6" width="12" height="12" rx="1.5"/>', true) },
  { id: 'replay', name: 'Wiederholen', group: 'Wiedergabe', svg: wrap('<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4h4"/>') },
  { id: 'power', name: 'Ein / Aus', group: 'Wiedergabe', svg: wrap('<path d="M12 3v9"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/>') },

  { id: 'arrow-left', name: 'Pfeil links', group: 'Richtung', svg: wrap('<path d="M19 12H5M11 6l-6 6 6 6"/>') },
  { id: 'arrow-right', name: 'Pfeil rechts', group: 'Richtung', svg: wrap('<path d="M5 12h14M13 6l6 6-6 6"/>') },
  { id: 'arrow-up', name: 'Pfeil oben', group: 'Richtung', svg: wrap('<path d="M12 19V5M6 11l6-6 6 6"/>') },
  { id: 'arrow-down', name: 'Pfeil unten', group: 'Richtung', svg: wrap('<path d="M12 5v14M6 13l6 6 6-6"/>') },
  { id: 'chevron-left', name: 'Zurück', group: 'Richtung', svg: wrap('<path d="M15 5l-7 7 7 7"/>') },
  { id: 'chevron-right', name: 'Weiter', group: 'Richtung', svg: wrap('<path d="M9 5l7 7-7 7"/>') },
  { id: 'rotate', name: 'Drehen', group: 'Richtung', svg: wrap('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4h-4"/>') },

  { id: 'zoom-in', name: 'Vergrößern', group: 'Ansicht', svg: wrap('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M11 8.5v5M8.5 11h5"/>') },
  { id: 'zoom-out', name: 'Verkleinern', group: 'Ansicht', svg: wrap('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M8.5 11h5"/>') },
  { id: 'expand', name: 'Vollbild', group: 'Ansicht', svg: wrap('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>') },
  { id: 'eye', name: 'Anzeigen', group: 'Ansicht', svg: wrap('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>') },
  { id: 'eye-off', name: 'Ausblenden', group: 'Ansicht', svg: wrap('<path d="M4 4l16 16"/><path d="M9.5 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.2 7.7A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.6-.8"/>') },
  { id: 'camera', name: 'Kamera', group: 'Ansicht', svg: wrap('<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>') },
  { id: 'cube', name: '3D-Ansicht', group: 'Ansicht', svg: wrap('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>') },
  { id: 'light', name: 'Licht', group: 'Ansicht', svg: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3L7 7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/>') },

  { id: 'swatch', name: 'Farbfeld', group: 'Auswahl', svg: wrap('<circle cx="12" cy="12" r="9"/>', true) },
  { id: 'palette', name: 'Farben', group: 'Auswahl', svg: wrap('<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.5-1-1.8-1-3 0-1 .8-1.6 2-1.6h2a4 4 0 0 0 4-4C21 6.300 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.300" r="1"/><circle cx="14.5" cy="7.300" r="1"/>') },
  { id: 'layers', name: 'Varianten', group: 'Auswahl', svg: wrap('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5M3 17l9 5 9-5"/>') },
  { id: 'check', name: 'Bestätigen', group: 'Auswahl', svg: wrap('<path d="M5 12.500l4.500 4.500L19 7"/>') },
  { id: 'plus', name: 'Plus', group: 'Auswahl', svg: wrap('<path d="M12 5v14M5 12h14"/>') },
  { id: 'minus', name: 'Minus', group: 'Auswahl', svg: wrap('<path d="M5 12h14"/>') },
  { id: 'settings', name: 'Einstellungen', group: 'Auswahl', svg: wrap('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>') },

  { id: 'close', name: 'Schließen', group: 'Allgemein', svg: wrap('<path d="M6 6l12 12M18 6L6 18"/>') },
  { id: 'info', name: 'Info', group: 'Allgemein', svg: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.500v.01"/>') },
  { id: 'help', name: 'Hilfe', group: 'Allgemein', svg: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1 .9-1 1.700"/><path d="M12 17v.01"/>') },
  { id: 'home', name: 'Start', group: 'Allgemein', svg: wrap('<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>') },
  { id: 'menu', name: 'Menü', group: 'Allgemein', svg: wrap('<path d="M4 7h16M4 12h16M4 17h16"/>') },
  { id: 'pointer', name: 'Antippen', group: 'Allgemein', svg: wrap('<path d="M9 11V5.500a1.500 1.500 0 0 1 3 0V11l5.500 1.200a2 2 0 0 1 1.500 2.300l-.8 4a2 2 0 0 1-2 1.500h-5a3 3 0 0 1-2.400-1.200L5.500 14.500a1.400 1.400 0 0 1 2.100-1.800L9 14z"/>') },
  { id: 'download', name: 'Herunterladen', group: 'Allgemein', svg: wrap('<path d="M12 4v11M7 10.500l5 5 5-5M5 20h14"/>') },
  { id: 'mail', name: 'E-Mail', group: 'Allgemein', svg: wrap('<rect x="3" y="5.500" width="18" height="13" rx="2"/><path d="M4 7.500l8 6 8-6"/>') },
  { id: 'phone', name: 'Telefon', group: 'Allgemein', svg: wrap('<path d="M6 3.500h3l1.500 4-2 1.500a12 12 0 0 0 6.500 6.500l1.500-2 4 1.500v3A2 2 0 0 1 18.500 20 15.500 15.500 0 0 1 4 5.500a2 2 0 0 1 2-2z"/>') },
  { id: 'external', name: 'Externer Link', group: 'Allgemein', svg: wrap('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>') },
];

export const ICON_SHAPES: Record<string, string> = {
  round: 'Rund, gefüllt',
  square: 'Quadratisch, gefüllt',
  outline: 'Rund, Umriss',
  plain: 'Nur Symbol',
};
