import type { Budget, Component, ComponentAnimation, ComponentType, Project, Section, ProjectData } from '../core/types';

export const FORMAT_VERSION = 8;

export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

export const DEFAULT_BUDGETS: { desktop: Budget; mobile: Budget } = {
  desktop: { fileSizeMB: 15, triangles: 500_000, textureSize: 4096, drawCalls: 150 },
  mobile: { fileSizeMB: 5, triangles: 150_000, textureSize: 2048, drawCalls: 60 },
};

export const NO_ANIMATION: ComponentAnimation = { type: 'none', in: [0, 0.3], out: null };

const DEFAULT_TEXT: Partial<Record<ComponentType, string>> = {
  headline: 'Neue Headline',
  text: 'Neuer Text',
  button: 'Mehr erfahren',
};

export function createComponent(type: Exclude<ComponentType, 'instance'>, text?: string): Component {
  const component: Component = {
    id: uid('c'),
    type,
    placement: 'flow',
    style: {},
    overrides: {},
    animation: structuredClone(NO_ANIMATION),
  };
  if (type in DEFAULT_TEXT) component.text = text ?? DEFAULT_TEXT[type];
  if (type === 'button') component.href = '#';
  if (type === 'image') component.alt = '';
  if (type === 'card') {
    component.children = [
      createComponent('headline', 'Kartentitel'),
      createComponent('text', 'Kurzer Text zur Karte.'),
      createComponent('button'),
    ];
  }
  if (type === 'infobox') {
    component.children = [createComponent('headline', 'Hinweis'), createComponent('text', 'Kurze Information.')];
  }
  return component;
}

export function createSection(name: string, withContent = true): Section {
  return {
    id: uid('sec'),
    name,
    height: 100,
    align: 'left',
    components: withContent
      ? [createComponent('headline', name), createComponent('text', 'Beschreibe hier, was an dieser Stelle zu sehen ist.')]
      : [],
  };
}

export function createData(): ProjectData {
  return {
    source: { mode: 'test', url: '', interval: 5, staleAfter: 15 },
    fields: [],
    bindings: [],
    levelColors: { ok: '#3ecf8e', warn: '#f5a623', alarm: '#e5484d', off: '#8b9099' },
  };
}

export function createProject(): Project {
  return {
    formatVersion: FORMAT_VERSION,
    name: 'Neues Projekt',
    model: { file: null, stats: null },
    base: {},
    sections: [createSection('Start'), createSection('Details'), createSection('Abschluss')],
    keyframes: [],
    templates: [],
    fonts: [],
    lights: [],
    hotspots: [],
    lookAts: [],
    follows: [],
    variantGroups: [],
    meshActions: [],
    data: createData(),
    framing: { desktop: {}, tablet: {}, mobile: {} },
    budgets: structuredClone(DEFAULT_BUDGETS),
    settings: { background: '#14161a', scrollSmoothing: 0, textMode: 'pinned', layout: { pageWidth: 0, innerWidth: 1200, padding: 24 }, font: 'system', loader: 'ring', environment: { file: null, showBackground: false, rotation: 0, backgroundIntensity: 1, backgroundBlur: 0 }, poster: null, reducedMotion: 'respect' },
  };
}

/** Version 1 kannte pro Abschnitt eine flache Liste "elements" aus Headline, Text und Button. */
function migrateV1Section(section: any): Section {
  const components = (section.elements ?? []).map((element: any) => {
    const component = createComponent(element.type, element.text);
    component.id = element.id;
    if (element.type === 'button') component.href = element.href ?? '#';
    return component;
  });
  const { elements: _elements, ...rest } = section;
  return { ...rest, components };
}

/** Fenstergrößen, mit denen Positionen in Prozent (bis Version 7) in px umgerechnet werden. */
const REFERENCE = { desktop: [1440, 810], tablet: [820, 1100], mobile: [390, 780] } as const;

/** Bis Version 7 standen frei platzierte Komponenten in Prozent des Fensters. Seit Version 8: px ab einem Anker. */
function migrateFreePosition(component: any) {
  if (component.placement !== 'free') return;
  const convert = (style: any, [width, height]: readonly [number, number]) => {
    if (!style) return;
    const wrap = Math.max(24, (width - 1200) / 2);
    if (typeof style.x === 'number') style.x = Math.round((style.x / 100) * width - wrap);
    if (typeof style.y === 'number') style.y = Math.round((style.y / 100) * height);
  };
  component.style ??= {};
  convert(component.style, REFERENCE.desktop);
  convert(component.overrides?.tablet, REFERENCE.tablet);
  convert(component.overrides?.mobile, REFERENCE.mobile);
  component.style.anchorX = 'left';
  component.style.anchorY = 'top';
}

/**
 * Prüft eine geladene Projektdatei und hebt sie auf die aktuelle Formatversion.
 * Neue Formatversionen bekommen hier ihren Migrationsschritt.
 */
export function migrateProject(data: unknown): Project {
  const raw = structuredClone(data) as any;
  if (!raw || typeof raw !== 'object' || typeof raw.formatVersion !== 'number') {
    throw new Error('Die Datei ist kein Projekt des 3D-Web-Editors.');
  }
  if (raw.formatVersion > FORMAT_VERSION) {
    throw new Error(
      `Das Projekt hat Formatversion ${raw.formatVersion}. Dieser Editor liest bis Version ${FORMAT_VERSION}.`,
    );
  }
  if (raw.formatVersion < 2) {
    raw.sections = (raw.sections ?? []).map(migrateV1Section);
  }
  if (raw.formatVersion < 8) {
    for (const section of raw.sections ?? []) (section.components ?? []).forEach(migrateFreePosition);
  }

  const fresh = createProject();
  return {
    ...fresh,
    ...raw,
    formatVersion: FORMAT_VERSION,
    model: { ...fresh.model, ...raw.model },
    budgets: {
      desktop: { ...fresh.budgets.desktop, ...raw.budgets?.desktop },
      mobile: { ...fresh.budgets.mobile, ...raw.budgets?.mobile },
    },
    // environment, poster, reducedMotion seit Version 6
    settings: {
      ...fresh.settings,
      ...raw.settings,
      environment: { ...fresh.settings.environment, ...raw.settings?.environment },
      layout: { ...fresh.settings.layout, ...raw.settings?.layout },
    },
    framing: { ...fresh.framing, ...raw.framing },
    sections: raw.sections ?? fresh.sections,
    keyframes: raw.keyframes ?? [],
    templates: raw.templates ?? [],
    // Seit Version 8
    fonts: raw.fonts ?? [],
    lights: raw.lights ?? [],
    // Seit Version 3
    hotspots: raw.hotspots ?? [],
    lookAts: raw.lookAts ?? [],
    follows: raw.follows ?? [],
    // Seit Version 4
    variantGroups: raw.variantGroups ?? [],
    meshActions: raw.meshActions ?? [],
    // Seit Version 5
    data: { ...fresh.data, ...raw.data, source: { ...fresh.data.source, ...raw.data?.source }, levelColors: { ...fresh.data.levelColors, ...raw.data?.levelColors } },
    base: raw.base ?? {},
  };
}
