// Projektformat des 3D-Web-Editors (Version 2).
// Diese Typen beschreiben project.json. Editor, Vorschau und Export lesen dasselbe Format.

export type Vec3 = [number, number, number];

/** Zahl, Vektor (Position, Drehung in Radiant, Skalierung) oder Farbe als "#rrggbb". */
export type Value = number | Vec3 | string;

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
}

export interface Component extends ComponentContent {
  id: string;
  type: ComponentType;
  /** flow = im Seitenlayout, free = frei über dem 3D-Canvas. Gilt für Komponenten direkt im Abschnitt. */
  placement: 'flow' | 'free';
  style: ComponentStyle;
  overrides: { tablet?: ComponentStyle; mobile?: ComponentStyle };
  animation: ComponentAnimation;
  /** Kinder einer Karte oder Infobox */
  children?: Component[];
  /** Nur type "instance": die Vorlage und die eigenen Inhalte je Vorlagen-Element */
  templateId?: string;
  content?: Record<string, ComponentContent>;
}

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
  formatVersion: 2;
  name: string;
  model: { file: string | null; stats: ModelStats | null };
  /** Ausgangswerte aller animierbaren Eigenschaften. */
  base: Record<string, Value>;
  sections: Section[];
  keyframes: Keyframe[];
  templates: Template[];
  framing: Record<Breakpoint, Framing>;
  budgets: { desktop: Budget; mobile: Budget };
  settings: {
    background: string;
    /** 0 = Szene folgt der Scrollposition direkt. 0..1 = leichte Dämpfung. */
    scrollSmoothing: number;
  };
}
