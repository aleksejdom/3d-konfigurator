import type { Budget, Component, ComponentAnimation, ComponentType, Project, Section } from '../core/types';

export const FORMAT_VERSION = 4;

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

export function createProject(): Project {
  return {
    formatVersion: FORMAT_VERSION,
    name: 'Neues Projekt',
    model: { file: null, stats: null },
    base: {},
    sections: [createSection('Start'), createSection('Details'), createSection('Abschluss')],
    keyframes: [],
    templates: [],
    hotspots: [],
    lookAts: [],
    follows: [],
    variantGroups: [],
    meshActions: [],
    framing: { desktop: {}, tablet: {}, mobile: {} },
    budgets: structuredClone(DEFAULT_BUDGETS),
    settings: { background: '#14161a', scrollSmoothing: 0 },
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
    settings: { ...fresh.settings, ...raw.settings },
    framing: { ...fresh.framing, ...raw.framing },
    sections: raw.sections ?? fresh.sections,
    keyframes: raw.keyframes ?? [],
    templates: raw.templates ?? [],
    // Seit Version 3
    hotspots: raw.hotspots ?? [],
    lookAts: raw.lookAts ?? [],
    follows: raw.follows ?? [],
    // Seit Version 4
    variantGroups: raw.variantGroups ?? [],
    meshActions: raw.meshActions ?? [],
    base: raw.base ?? {},
  };
}
