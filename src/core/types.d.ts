// Projektformat des 3D-Web-Editors (Version 1).
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

export interface PageElement {
  id: string;
  type: 'headline' | 'text' | 'button';
  text: string;
  href?: string;
}

export interface Section {
  id: string;
  name: string;
  /** Mindesthöhe in vh. */
  height: number;
  align: 'left' | 'center' | 'right';
  elements: PageElement[];
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
  formatVersion: 1;
  name: string;
  model: { file: string | null; stats: ModelStats | null };
  /** Ausgangswerte aller animierbaren Eigenschaften. */
  base: Record<string, Value>;
  sections: Section[];
  keyframes: Keyframe[];
  budgets: { desktop: Budget; mobile: Budget };
  settings: {
    background: string;
    /** 0 = Szene folgt der Scrollposition direkt. 0..1 = leichte Dämpfung. */
    scrollSmoothing: number;
  };
}
