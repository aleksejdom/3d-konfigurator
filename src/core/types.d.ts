// Projektformat des 3D-Web-Editors (Version 3).
// Diese Typen beschreiben project.json. Editor, Vorschau und Export lesen dasselbe Format.

export type Vec3 = [number, number, number];

/**
 * Zahl, Vektor (Position, Drehung in Radiant, Skalierung), Farbe als "#rrggbb" oder eine Auswahl
 * (z. B. das Look-At-Ziel "pointer", "node:<ID>", "hotspot:<ID>", "point:x,y,z", "camera").
 * Zwischen zwei Auswahlen liefert die Timeline Gewichte, z. B. { "pointer": 0.3, "camera": 0.7 }.
 */
export type Value = number | Vec3 | string | Record<string, number>;

/** local = "Nur in diesem Abschnitt", inherit = "In Folgeabschnitte übernehmen". */
export type Scope = 'local' | 'inherit';

export interface KeyValue {
  value: Value;
  scope: Scope;
  /** Name aus easing.js. Standard: "easeInOut". */
  easing?: string;
  /** Übergangslänge in Abschnittslängen (1 = ein ganzer Abschnitt). null/fehlend = automatisch. */
  transition?: number | null;
  /** Nur bei scope "local": Ausblendbereich nach dem letzten lokalen Punkt, in Abschnittslängen. */
  exit?: number | null;
}

/** Ein mit "Merken" gespeicherter Punkt: Abschnitt + relative Scrollposition. */
export interface Keyframe {
  id: string;
  sectionId: string;
  /** Relative Position im Abschnitt, 0 bis 1. */
  t: number;
  /** Eigenschaftsname (z. B. "camera.position") -> gespeicherter Wert. */
  values: Record<string, KeyValue>;
}

// ---------- Komponenten ----------

/** Desktop ist die Grundlage. Tablet überschreibt Desktop, Mobile überschreibt Tablet. */
export type Breakpoint = 'desktop' | 'tablet' | 'mobile';

/** Gestaltung einer Komponente. Fehlende Werte nutzen den Standard der Seite. */
export interface ComponentStyle {
  /** Nur frei platzierte Komponenten: Abstand von links und oben in Prozent des Fensters. */
  x?: number;
  y?: number;
  /** Breite in px */
  width?: number;
  /** Schriftgröße in px */
  fontSize?: number;
  visible?: boolean;
  color?: string;
  background?: string;
  /** Innenabstand in px */
  padding?: number;
  /** Eckenradius in px */
  radius?: number;
  /** Abstand zwischen den Kindern einer Karte in px */
  gap?: number;
  align?: 'left' | 'center' | 'right';
}

export type AnimationType = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'reveal';

/** Scrollgesteuerte Animation. Bereiche sind relative Positionen im Abschnitt (0 bis 1). */
export interface ComponentAnimation {
  type: AnimationType;
  /** Einblenden von/bis */
  in: [number, number];
  /** Ausblenden von/bis, oder null */
  out: [number, number] | null;
}

export type ComponentType = 'headline' | 'text' | 'image' | 'button' | 'card' | 'infobox' | 'instance';

export interface ComponentContent {
  text?: string;
  href?: string;
  /** Dateiname eines Bildes aus dem Projektordner assets/ */
  src?: string;
  alt?: string;
  /** Aktion bei Klick, Tap oder Tastendruck */
  action?: ComponentAction | null;
}

export interface Component extends ComponentContent {
  id: string;
  type: ComponentType;
  /**
   * flow = im Seitenlayout, free = frei über dem 3D-Canvas, hotspot = an einem Hotspot am Modell verankert.
   * Gilt für Komponenten direkt im Abschnitt.
   */
  placement: 'flow' | 'free' | 'hotspot';
  /** Nur placement "hotspot": der Hotspot und ob die Komponente immer oder nur bei geöffnetem Hotspot erscheint */
  hotspotId?: string;
  anchorMode?: 'always' | 'open';

  style: ComponentStyle;
  overrides: { tablet?: ComponentStyle; mobile?: ComponentStyle };
  animation: ComponentAnimation;
  /** Kinder einer Karte oder Infobox */
  children?: Component[];
  /** Nur type "instance": die Vorlage und die eigenen Inhalte je Vorlagen-Element */
  templateId?: string;
  content?: Record<string, ComponentContent>;
}

export type ComponentAction = { type: 'hotspot'; hotspotId: string } | { type: 'close' };

/** Eine Vorlage liefert Aufbau und Gestaltung. Instanzen bringen eigene Inhalte und ihre Position mit. */
export interface Template {
  id: string;
  name: string;
  root: Component;
}

/** Kameraausschnitt: Zoom und Verschiebung des Bildes in Prozent des Fensters. */
export interface Framing {
  zoom?: number;
  shiftX?: number;
  shiftY?: number;
}

// ---------- Hotspots, Look At, Follow ----------

/** Detailansicht eines Hotspots. Position und Blickziel der Kamera, gespeichert relativ zum Bauteil. */
export interface HotspotView {
  position: Vec3;
  target: Vec3;
}

export interface Hotspot {
  id: string;
  name: string;
  /** Sichtbarer Text neben dem Punkt. Leer = nur der Punkt. */
  label: string;
  /** Bauteil, an dem der Hotspot hängt (stabile ID) */
  nodeId: string;
  /** Position und Flächenrichtung im Koordinatensystem des Bauteils */
  position: Vec3;
  normal: Vec3 | null;
  /** Nur in diesem Abschnitt zeigen, oder null = überall */
  sectionId: string | null;
  /** "Kameraansicht merken": Desktop ist die Grundlage, Tablet und Mobile können eine eigene Ansicht haben. */
  views: Partial<Record<Breakpoint, HotspotView>>;
  /** Dauer der Kamerafahrt in Sekunden */
  duration: number;
  easing: string;
  /** return = Scrollen führt weich zur aktuellen Scroll-Kamera zurück, stay = bleibt bis zum Schließen */
  onScroll: 'return' | 'stay';
}

/** Verhalten auf Touch-Geräten: aus, oder dem Finger folgen, solange er den Bildschirm berührt. */
export type TouchMode = 'off' | 'drag';

/**
 * Look At: dreht ein Bauteil, das Modell oder die Kamera zu einem Ziel, zusätzlich zur Drehung aus der Timeline.
 * Ziel und Stärke stehen als "lookAt:<ID>.target" und "lookAt:<ID>.strength" in base und lassen sich merken.
 */
export interface LookAt {
  id: string;
  /** "camera" oder "node:<ID>" */
  subject: string;
  /** Achse des Bauteils, die zum Ziel zeigt */
  forward: '+z' | '-z' | '+x' | '-x';
  /** Erlaubte Drehachsen: seitlich (um die Hochachse) und auf/ab */
  yaw: boolean;
  pitch: boolean;
  /** Winkelgrenzen in Grad */
  maxYaw: number;
  maxPitch: number;
  /** 0 = folgt sofort, bis 0.98 = sehr träge */
  damping: number;
  touch: TouchMode;
}

/** Follow: verschiebt ein Bauteil, das Modell oder die Kamera mit dem Mauszeiger, zusätzlich zur Timeline-Position. */
export interface Follow {
  id: string;
  subject: string;
  /** Achsen im Bild: horizontal und vertikal */
  x: boolean;
  y: boolean;
  /** Größte Verschiebung in Szeneneinheiten */
  distance: number;
  damping: number;
  /** Kehrt zur Grundposition zurück, wenn der Zeiger das Fenster verlässt */
  returns: boolean;
  touch: TouchMode;
}

export interface Section {
  id: string;
  name: string;
  /** Mindesthöhe in vh. */
  height: number;
  align: 'left' | 'center' | 'right';
  components: Component[];
}

export interface ModelStats {
  fileSize: number;
  triangles: number;
  meshes: number;
  materials: number;
  textures: { name: string; width: number; height: number }[];
}

export interface Budget {
  fileSizeMB: number;
  triangles: number;
  textureSize: number;
  drawCalls: number;
}

export interface Project {
  formatVersion: 3;
  name: string;
  model: { file: string | null; stats: ModelStats | null };
  /** Ausgangswerte aller animierbaren Eigenschaften. */
  base: Record<string, Value>;
  sections: Section[];
  keyframes: Keyframe[];
  templates: Template[];
  hotspots: Hotspot[];
  lookAts: LookAt[];
  follows: Follow[];
  framing: Record<Breakpoint, Framing>;
  budgets: { desktop: Budget; mobile: Budget };
  settings: {
    background: string;
    /** 0 = Szene folgt der Scrollposition direkt. 0..1 = leichte Dämpfung. */
    scrollSmoothing: number;
  };
}
