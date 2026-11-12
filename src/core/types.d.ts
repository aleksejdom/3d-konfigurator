// Projektformat des 3D-Web-Editors (Version 6).
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

export type ComponentType = 'headline' | 'text' | 'image' | 'button' | 'card' | 'infobox' | 'select' | 'slider' | 'value' | 'status' | 'connection' | 'instance';

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
  /** Nur type "select" (Auswahlliste) und "slider" (Varianten-Slider): die Variantengruppe, die sie bedienen */
  groupId?: string;
  /**
   * Datenfeld des Digitalen Zwillings. "value" zeigt den Messwert, "status" den Zustand als Text.
   * Karten, Infoboxen und andere Komponenten bekommen die Stufe des Felds als data-level (Farbe).
   */
  fieldId?: string;
  /** Kinder einer Karte oder Infobox */
  children?: Component[];
  /** Nur type "instance": die Vorlage und die eigenen Inhalte je Vorlagen-Element */
  templateId?: string;
  content?: Record<string, ComponentContent>;
}

export type ComponentAction =
  /** Kamera zur Detailansicht eines Hotspots fahren */
  | { type: 'hotspot'; hotspotId: string }
  /** Detailansicht schließen */
  | { type: 'close' }
  /** Variante, Material oder Sichtbarkeit wählen */
  | { type: 'select'; groupId: string; optionId: string }
  /** Zur nächsten oder vorherigen Variante einer Gruppe wechseln */
  | { type: 'next'; groupId: string }
  | { type: 'prev'; groupId: string }
  /** Auswahl des Besuchers verwerfen und an die Timeline zurückgeben. groupId null = alle Gruppen */
  | { type: 'reset'; groupId: string | null }
  /** Animationsclip des Modells starten, stoppen oder umschalten */
  | { type: 'clip'; clip: string; mode: 'play' | 'stop' | 'toggle' };

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
  /** Datenfeld, dessen Stufe der Punkt als Farbe zeigt */
  fieldId?: string;
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

// ---------- Konfigurator ----------

/**
 * Eine Wahlmöglichkeit einer Variantengruppe.
 * Gruppe "mesh": nodeIds sind die Bauteile, die bei dieser Wahl zu sehen sind (leer = nichts, also "ausgeblendet").
 * Gruppe "material": color und/oder material (Name eines Materials aus dem Modell) für die Zielbauteile.
 */
export interface VariantOption {
  id: string;
  name: string;
  nodeIds?: string[];
  color?: string | null;
  material?: string | null;
  /** Variantenregel: nur wählbar, wenn in den genannten Gruppen die genannte Wahl aktiv ist */
  requires?: { groupId: string; optionId: string }[];
}

/**
 * Variantengruppe: genau eine ihrer Wahlmöglichkeiten ist aktiv.
 * Die Wahl der Timeline steht als "option:<ID>.value" in base und lässt sich merken.
 * Wählt der Besucher selbst, hat seine Wahl Vorrang, bis sie zurückgesetzt wird.
 */
export interface VariantGroup {
  id: string;
  name: string;
  kind: 'mesh' | 'material';
  /** Nur kind "material": Bauteile, deren Material gewechselt wird */
  targets?: string[];
  options: VariantOption[];
  /** Dauer des Überblendens bei einer Wahl des Besuchers, in Sekunden */
  fade: number;
  /** Übergabe an die Timeline: Erreicht die Seite einen dieser Abschnitte, gilt wieder die Wahl der Timeline. */
  resetSections: string[];
}

/** Aktion, die ein Klick oder Tap auf ein Bauteil des Modells auslöst. */
export interface MeshAction {
  nodeId: string;
  action: ComponentAction;
}

// ---------- Digitaler Zwilling ----------

/** Bewertung eines Werts: in Ordnung, Warnung, Alarm, aus. */
export type DataLevel = 'ok' | 'warn' | 'alarm' | 'off';

/** Ein Wert der Datenquelle mit Typ, Einheit, Grenzwerten und Testwert. */
export interface DataField {
  id: string;
  /** Anzeigename, z. B. "Drehzahl" */
  label: string;
  /** Pfad des Werts in den Daten der Quelle, z. B. "motor.rpm" */
  key: string;
  type: 'number' | 'text' | 'boolean' | 'status';
  unit?: string;
  /** Nachkommastellen bei Zahlen */
  decimals?: number;
  /** Grenzwerte für Zahlen. Fehlende Grenzen gelten nicht. */
  limits?: { warnAbove?: number | null; alarmAbove?: number | null; warnBelow?: number | null; alarmBelow?: number | null };
  /** Für "status" und "boolean": Bedeutung der einzelnen Werte ("true"/"false" bei boolean). */
  states?: { value: string; label: string; level: DataLevel }[];
  /** Testwert für die Arbeit im Editor und die Vorschau mit Testdaten */
  test: number | string | boolean;
}

/** Reaktion des Modells auf ein Datenfeld. */
export type DataBinding =
  /** Bauteile in der Farbe der Stufe einfärben (Betriebsstatus -> Farbe) */
  | { id: string; fieldId: string; kind: 'color'; nodeIds: string[] }
  /** Bauteil dauerhaft drehen; der Wert gibt die Umdrehungen pro Minute an (mal factor) */
  | { id: string; fieldId: string; kind: 'rotate'; nodeId: string; axis: 'x' | 'y' | 'z'; factor: number }
  /** Tempo eines Animationsclips: Bei reference läuft er in Originalgeschwindigkeit, bei 0 steht er. */
  | { id: string; fieldId: string; kind: 'clip'; clip: string; reference: number };

/**
 * Datenquelle. Live-Quellen werden nur gelesen. Braucht die Quelle Zugangsdaten, zeigt url auf einen
 * eigenen Backend-Endpunkt oder Proxy; Zugangsdaten stehen nie im Projekt oder im Export.
 */
export interface DataSource {
  mode: 'test' | 'rest' | 'sse' | 'websocket';
  url: string;
  /** REST: Abstand der Abfragen in Sekunden */
  interval: number;
  /** Ohne neue Daten nach so vielen Sekunden gelten die Werte als veraltet. 0 = nie. */
  staleAfter: number;
}

export interface ProjectData {
  source: DataSource;
  fields: DataField[];
  bindings: DataBinding[];
  /** Farben der Stufen für Bauteile und Oberfläche */
  levelColors: Record<DataLevel, string>;
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
  /** Das Modell nutzt Draco-Kompression und braucht den Decoder */
  draco?: boolean;
  /** Namen der Animationsclips im Modell */
  clips?: string[];
  /** Namen der Materialien im Modell */
  materialNames?: string[];
}

export interface Budget {
  fileSizeMB: number;
  triangles: number;
  textureSize: number;
  drawCalls: number;
}

/**
 * Umgebung (HDRI oder Skybox). Sie beleuchtet das Modell und erzeugt Reflexionen.
 * Die Stärke der Beleuchtung ist die animierbare Eigenschaft "ambient.intensity".
 */
export interface EnvironmentSettings {
  /** .hdr oder ein Panoramabild (jpg, png, webp). null = neutrale Studio-Umgebung */
  file: string | null;
  /** Umgebung auch als Hintergrund zeigen. Sonst gilt die Hintergrundfarbe. */
  showBackground: boolean;
  /** Ausrichtung in Grad um die Hochachse */
  rotation: number;
  /** Helligkeit des Hintergrunds, unabhängig von der Beleuchtung */
  backgroundIntensity: number;
  /** Unschärfe des Hintergrunds, 0 bis 1 */
  backgroundBlur: number;
}

export interface Project {
  formatVersion: 6;
  name: string;
  /** resources: Begleitdateien eines .gltf (Puffer und Texturen), relativ zur Modelldatei */
  model: { file: string | null; stats: ModelStats | null; resources?: string[] };
  /** Ausgangswerte aller animierbaren Eigenschaften. */
  base: Record<string, Value>;
  sections: Section[];
  keyframes: Keyframe[];
  templates: Template[];
  hotspots: Hotspot[];
  lookAts: LookAt[];
  follows: Follow[];
  variantGroups: VariantGroup[];
  meshActions: MeshAction[];
  data: ProjectData;
  framing: Record<Breakpoint, Framing>;
  budgets: { desktop: Budget; mobile: Budget };
  settings: {
    background: string;
    /** 0 = Szene folgt der Scrollposition direkt. 0..1 = leichte Dämpfung. */
    scrollSmoothing: number;
    environment: EnvironmentSettings;
    /** Bild, das während des Ladens statt der 3D-Szene zu sehen ist (Dateiname) */
    poster: string | null;
    /**
     * respect = Wünscht das Gerät des Besuchers reduzierte Bewegung, entfallen Dämpfung, Einblendungen,
     * Look At, Follow und Kamerafahrten (die Kamera springt direkt). ignore = immer volle Bewegung.
     */
    reducedMotion: 'respect' | 'ignore';
  };
}
