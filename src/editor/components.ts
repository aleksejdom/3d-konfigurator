// Komponenten im Projekt finden und ändern: Inhalte, Gestaltung pro Breakpoint,
// Verschachtelung, Vorlagen und Instanzen.

import { cascade } from '../core/components.js';
import type {
  Breakpoint,
  Component,
  ComponentAnimation,
  ComponentContent,
  ComponentStyle,
  ComponentType,
  Project,
  Section,
  Template,
} from '../core/types';
import { CONTAINER_TYPES, resolveSection } from '../export/page.js';
import { NO_ANIMATION, createComponent, uid } from './project';
import { notify, update, useEditor } from './store';

export interface ResolvedNode extends Component {
  classes: string[];
  children: ResolvedNode[];
}

export const resolvedTree = (project: Project, section: Section) => resolveSection(project, section) as ResolvedNode[];

export const isContainer = (type: ComponentType) => (CONTAINER_TYPES as string[]).includes(type);

/** Diese Werte gehören bei einer Instanz zur Instanz selbst, alles andere zur Vorlage. */
export const INSTANCE_KEYS: (keyof ComponentStyle)[] = ['x', 'y', 'visible'];

export interface Located {
  /** Die Komponente im Projekt. Bei Kindern einer Instanz: das Element der Vorlage. */
  node: Component;
  list: Component[];
  index: number;
  section: Section;
  /** Tiefe im Abschnitt, 0 = direkt im Abschnitt */
  depth: number;
  /** Gesetzt, wenn die Komponente ein Kind einer Instanz ist */
  instance: Component | null;
  slotId: string | null;
  /** Vorlage der Instanz (für Instanzen und ihre Kinder) */
  template: Template | null;
}

function walk(list: Component[], id: string, depth: number): { node: Component; list: Component[]; index: number; depth: number } | null {
  for (let index = 0; index < list.length; index++) {
    const node = list[index];
    if (node.id === id) return { node, list, index, depth };
    if (node.children && node.type !== 'instance') {
      const found = walk(node.children, id, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Findet eine Komponente über ihre ID. Kinder einer Instanz haben die ID "<Instanz>--<Vorlagen-Element>". */
export function locate(project: Project, id: string): Located | null {
  const [rootId, slotId] = id.split('--');
  for (const section of project.sections) {
    const found = walk(section.components, rootId, 0);
    if (!found) continue;
    const template =
      found.node.type === 'instance' ? (project.templates.find((t) => t.id === found.node.templateId) ?? null) : null;
    if (!slotId) return { ...found, section, instance: null, slotId: null, template };
    if (!template) return null;
    const inner = walk(template.root.children ?? [], slotId, found.depth + 1);
    return inner ? { ...inner, section, instance: found.node, slotId, template } : null;
  }
  return null;
}

// ---------- Lesen ----------

const CONTENT_KEYS: (keyof ComponentContent)[] = ['text', 'href', 'src', 'alt', 'action'];

export function contentOf(located: Located): ComponentContent {
  const content: ComponentContent = {};
  for (const key of CONTENT_KEYS) (content as Record<string, unknown>)[key] = located.node[key];
  if (located.instance && located.slotId) Object.assign(content, located.instance.content?.[located.slotId]);
  return content;
}

/** Die Komponente, in der ein Gestaltungswert gespeichert wird. */
function styleOwner(located: Located, key: keyof ComponentStyle): Component {
  if (located.node.type === 'instance' && located.template) {
    return INSTANCE_KEYS.includes(key) ? located.node : located.template.root;
  }
  return located.node;
}

export interface StyleInfo<K extends keyof ComponentStyle> {
  /** Wert, der am Breakpoint gilt */
  value: ComponentStyle[K] | undefined;
  /** 'own' = hier gesetzt, sonst der Breakpoint, von dem der Wert geerbt ist, oder null = Standard der Seite */
  source: 'own' | Breakpoint | null;
}

const ORDER: Breakpoint[] = ['desktop', 'tablet', 'mobile'];

/** Wert einer Gestaltungseigenschaft am Breakpoint, mit Herkunft (hier gesetzt oder geerbt). */
export function styleInfo<K extends keyof ComponentStyle>(located: Located, key: K, breakpoint: Breakpoint): StyleInfo<K> {
  const owner = styleOwner(located, key);
  const layers: Record<Breakpoint, ComponentStyle | undefined> = {
    desktop: owner.style,
    tablet: owner.overrides.tablet,
    mobile: owner.overrides.mobile,
  };
  for (let i = ORDER.indexOf(breakpoint); i >= 0; i--) {
    const value = layers[ORDER[i]]?.[key];
    if (value !== undefined) return { value, source: ORDER[i] === breakpoint ? 'own' : ORDER[i] };
  }
  return { value: undefined, source: null };
}

export function effectiveStyle(component: Component, breakpoint: Breakpoint): ComponentStyle {
  return cascade(component.style, component.overrides, breakpoint) as ComponentStyle;
}

// ---------- Ändern ----------

const select = (id: string | null) => useEditor.setState({ selectedComponent: id });

export function setContent(id: string, patch: ComponentContent, key?: string) {
  update((project) => {
    const located = locate(project, id);
    if (!located) return;
    if (located.instance && located.slotId) {
      const content = (located.instance.content ??= {});
      content[located.slotId] = { ...content[located.slotId], ...patch };
    } else {
      Object.assign(located.node, patch);
    }
  }, key);
}

/** Setzt einen Gestaltungswert am Breakpoint. value undefined entfernt ihn (zurück zum geerbten Wert). */
export function setStyle(id: string, patch: ComponentStyle, breakpoint: Breakpoint, key?: string) {
  update((project) => {
    const located = locate(project, id);
    if (!located) return;
    for (const [name, value] of Object.entries(patch) as [keyof ComponentStyle, never][]) {
      const owner = styleOwner(located, name);
      const target = breakpoint === 'desktop' ? owner.style : (owner.overrides[breakpoint] ??= {});
      if (value === undefined) delete target[name];
      else target[name] = value;
    }
  }, key);
}

export function setAnimation(id: string, patch: Partial<ComponentAnimation>, key?: string) {
  update((project) => {
    const located = locate(project, id);
    if (located) located.node.animation = { ...located.node.animation, ...patch };
  }, key);
}

export interface AddTarget {
  sectionId: string;
  /** In diese Karte/Infobox legen */
  containerId?: string;
  /** Frei über dem Canvas an dieser Stelle (Prozent) */
  free?: { x: number; y: number };
}

/** Fügt eine Komponente oder die Instanz einer Vorlage ein und wählt sie aus. */
export function addComponent(spec: { type: Exclude<ComponentType, 'instance'> } | { templateId: string }, target: AddTarget) {
  let created: Component;
  if ('templateId' in spec) {
    created = {
      id: uid('c'),
      type: 'instance',
      templateId: spec.templateId,
      placement: 'flow',
      style: {},
      overrides: {},
      animation: structuredClone(NO_ANIMATION),
      content: {},
    };
  } else {
    created = createComponent(spec.type);
  }
  let selectedId = created.id;

  update((project) => {
    const section = project.sections.find((s) => s.id === target.sectionId);
    if (!section) return;
    const container = target.containerId ? locate(project, target.containerId) : null;
    if (container) {
      const inTemplate = container.node.type === 'instance' || container.instance !== null;
      if (inTemplate && created.type === 'instance') {
        notify('Eine Vorlage kann keine weitere Vorlage enthalten. Die Instanz liegt jetzt im Abschnitt.');
        section.components.push(created);
        return;
      }
      const owner = container.node.type === 'instance' ? container.template!.root : container.node;
      (owner.children ??= []).push(created);
      if (inTemplate) {
        const instance = container.instance ?? container.node;
        selectedId = `${instance.id}--${created.id}`;
      }
      return;
    }
    if (target.free) {
      const first = project.sections.indexOf(section) === 0;
      created.placement = 'free';
      created.style.x = Math.round(target.free.x);
      created.style.y = Math.round(target.free.y);
      created.animation = { type: 'fade', in: first ? [0, 0] : [0, 0.15], out: [0.85, 1] };
    }
    section.components.push(created);
  });
  select(selectedId);
}

export function removeComponent(id: string) {
  update((project) => {
    const located = locate(project, id);
    if (located) located.list.splice(located.index, 1);
  });
  select(null);
}

/** Verschiebt eine Komponente in ihrer Liste um eine Stelle nach oben (-1) oder unten (1). */
export function shiftComponent(id: string, by: -1 | 1) {
  update((project) => {
    const located = locate(project, id);
    if (!located) return;
    const target = located.index + by;
    if (target < 0 || target >= located.list.length) return;
    located.list.splice(target, 0, ...located.list.splice(located.index, 1));
  });
}

function contains(component: Component, id: string): boolean {
  return component.id === id || (component.children ?? []).some((child) => contains(child, id));
}

/** Ebenenbaum: legt eine Komponente vor eine andere oder in eine Karte. */
export function moveComponent(id: string, targetId: string, mode: 'before' | 'inside') {
  if (id === targetId) return;
  if (id.includes('--') || targetId.includes('--')) {
    notify('Elemente einer Vorlage lassen sich nur innerhalb der Vorlage umsortieren (Pfeile im Eigenschaftenpanel).');
    return;
  }
  update((project) => {
    const source = locate(project, id);
    const target = locate(project, targetId);
    if (!source || !target || contains(source.node, targetId)) return;
    if (mode === 'inside' && !isContainer(target.node.type)) return;
    source.list.splice(source.index, 1);
    if (mode === 'inside') {
      (target.node.children ??= []).push(source.node);
    } else {
      // Der Index kann sich durch das Herausnehmen verschoben haben.
      target.list.splice(target.list.indexOf(target.node), 0, source.node);
      if (target.depth === 0) source.node.placement = target.node.placement;
    }
  });
}

export function setPlacement(id: string, placement: Component['placement']) {
  update((project) => {
    const located = locate(project, id);
    if (!located || located.depth !== 0) return;
    located.node.placement = placement;
    if (placement === 'hotspot') {
      // Am Hotspot verankert: Die Position kommt vom Bauteil.
      located.node.hotspotId ??= project.hotspots[0]?.id;
      located.node.anchorMode ??= 'always';
    }
    if (placement === 'free') {
      located.node.style.x ??= 50;
      located.node.style.y ??= 40;
    }
  });
}

/** Hotspot und Anzeigeart einer verankerten Komponente. */
export function setAnchor(id: string, patch: Pick<Component, 'hotspotId' | 'anchorMode'>) {
  update((project) => {
    const located = locate(project, id);
    if (located && located.depth === 0) Object.assign(located.node, patch);
  });
}

// ---------- Vorlagen ----------

function pick(style: ComponentStyle | undefined, keys: (keyof ComponentStyle)[], keep: boolean): ComponentStyle {
  const result: ComponentStyle = {};
  for (const [key, value] of Object.entries(style ?? {}) as [keyof ComponentStyle, never][]) {
    if (keys.includes(key) === keep) result[key] = value;
  }
  return result;
}

function hasInstance(component: Component): boolean {
  return component.type === 'instance' || (component.children ?? []).some(hasInstance);
}

/** Macht aus einer Karte eine Vorlage. Die Karte selbst wird zur ersten Instanz. */
export function saveAsTemplate(id: string, name: string) {
  const located = locate(useEditor.getState().project, id);
  if (!located || located.instance || !isContainer(located.node.type)) return;
  if (hasInstance(located.node)) {
    notify('Die Karte enthält eine Instanz einer anderen Vorlage. Löse sie zuerst von ihrer Vorlage.');
    return;
  }
  update((project) => {
    const target = locate(project, id)!;
    const card = target.node;
    const root: Component = {
      ...structuredClone(card),
      id: uid('t'),
      placement: 'flow',
      style: pick(card.style, INSTANCE_KEYS, false),
      overrides: {
        tablet: pick(card.overrides.tablet, INSTANCE_KEYS, false),
        mobile: pick(card.overrides.mobile, INSTANCE_KEYS, false),
      },
      animation: structuredClone(NO_ANIMATION),
    };
    const template: Template = { id: uid('tpl'), name, root };
    project.templates.push(template);
    target.list[target.index] = {
      id: card.id,
      type: 'instance',
      templateId: template.id,
      placement: card.placement,
      style: pick(card.style, INSTANCE_KEYS, true),
      overrides: {
        tablet: pick(card.overrides.tablet, INSTANCE_KEYS, true),
        mobile: pick(card.overrides.mobile, INSTANCE_KEYS, true),
      },
      animation: card.animation,
      content: {},
    };
  });
}

/** Löst eine Instanz von ihrer Vorlage: Sie wird zur eigenständigen Karte mit eigenem Layout. */
export function detachInstance(id: string) {
  update((project) => {
    const located = locate(project, id);
    if (!located || located.node.type !== 'instance' || !located.template) return;
    const instance = located.node;
    const copy = (node: Component, isRoot: boolean): Component => ({
      ...structuredClone({ ...node, children: undefined }),
      ...(isRoot ? {} : instance.content?.[node.id]),
      id: isRoot ? instance.id : uid('c'),
      ...(node.children ? { children: node.children.map((child) => copy(child, false)) } : {}),
    });
    const card = copy(located.template.root, true);
    card.placement = instance.placement;
    card.animation = instance.animation;
    card.style = { ...card.style, ...instance.style };
    card.overrides = {
      tablet: { ...card.overrides.tablet, ...instance.overrides.tablet },
      mobile: { ...card.overrides.mobile, ...instance.overrides.mobile },
    };
    located.list[located.index] = card;
  });
}

export function renameTemplate(templateId: string, name: string) {
  update((project) => {
    const template = project.templates.find((t) => t.id === templateId);
    if (template) template.name = name;
  }, 'tpl-name-' + templateId);
}

function usesTemplate(component: Component, templateId: string): boolean {
  return component.templateId === templateId || (component.children ?? []).some((child) => usesTemplate(child, templateId));
}

export function deleteTemplate(templateId: string) {
  const project = useEditor.getState().project;
  if (project.sections.some((section) => section.components.some((c) => usesTemplate(c, templateId)))) {
    notify('Die Vorlage wird noch verwendet. Löse oder lösche zuerst ihre Instanzen.');
    return;
  }
  update((p) => void (p.templates = p.templates.filter((t) => t.id !== templateId)));
}

export const COMPONENT_LABELS: Record<ComponentType, string> = {
  headline: 'Headline',
  text: 'Text',
  image: 'Bild',
  button: 'Button',
  card: 'Karte',
  infobox: 'Infobox',
  instance: 'Instanz',
};
