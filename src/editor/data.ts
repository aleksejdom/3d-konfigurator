// Datenfelder, Bindungen und Datenquelle des Digitalen Zwillings im Projekt ändern.

import type { Component, DataBinding, DataField, DataSource } from '../core/types';
import { locate } from './components';
import { uid } from './project';
import { update, useEditor } from './store';

const FIELD_DEFAULTS: Record<DataField['type'], Omit<DataField, 'id'>> = {
  number: { label: 'Messwert', key: 'wert', type: 'number', unit: '', decimals: 0, limits: {}, test: 0 },
  status: {
    label: 'Betriebsstatus',
    key: 'status',
    type: 'status',
    states: [
      { value: 'running', label: 'In Betrieb', level: 'ok' },
      { value: 'warning', label: 'Warnung', level: 'warn' },
      { value: 'error', label: 'Störung', level: 'alarm' },
      { value: 'stopped', label: 'Aus', level: 'off' },
    ],
    test: 'running',
  },
  boolean: {
    label: 'Schalter',
    key: 'aktiv',
    type: 'boolean',
    states: [
      { value: 'true', label: 'Ein', level: 'ok' },
      { value: 'false', label: 'Aus', level: 'off' },
    ],
    test: true,
  },
  text: { label: 'Text', key: 'text', type: 'text', test: '' },
};

export function addField(type: DataField['type']) {
  const { project } = useEditor.getState();
  const template = structuredClone(FIELD_DEFAULTS[type]);
  // Der Pfad muss eindeutig sein, damit zwei Felder nicht denselben Testwert überschreiben.
  let key = template.key;
  for (let n = 2; project.data.fields.some((field) => field.key === key); n++) key = `${template.key}${n}`;
  const field: DataField = { ...template, key, id: uid('df') };
  update((p) => void p.data.fields.push(field));
  useEditor.setState({ selectedField: field.id });
}

export function updateField(id: string, recipe: (field: DataField) => void, key?: string) {
  update((project) => {
    const field = project.data.fields.find((f) => f.id === id);
    if (field) recipe(field);
  }, key);
}

function forEachComponent(list: Component[], visit: (component: Component) => void) {
  for (const component of list) {
    visit(component);
    if (component.children) forEachComponent(component.children, visit);
  }
}

export function removeField(id: string) {
  update((project) => {
    project.data.fields = project.data.fields.filter((field) => field.id !== id);
    project.data.bindings = project.data.bindings.filter((binding) => binding.fieldId !== id);
    const clear = (component: Component) => {
      if (component.fieldId === id) delete component.fieldId;
    };
    project.sections.forEach((section) => forEachComponent(section.components, clear));
    project.templates.forEach((template) => forEachComponent([template.root], clear));
    for (const hotspot of project.hotspots) if (hotspot.fieldId === id) delete hotspot.fieldId;
  });
  useEditor.setState({ selectedField: null });
}

export function addBinding(fieldId: string, kind: DataBinding['kind']) {
  const { selectedNode, project } = useEditor.getState();
  const node = selectedNode && selectedNode !== 'model' ? selectedNode : null;
  const id = uid('bind');
  const binding: DataBinding =
    kind === 'color'
      ? { id, fieldId, kind, nodeIds: node ? [node] : [] }
      : kind === 'rotate'
        ? { id, fieldId, kind, nodeId: node ?? '', axis: 'z', factor: 1 }
        : { id, fieldId, kind, clip: project.model.stats?.clips?.[0] ?? '', reference: 1000 };
  update((p) => void p.data.bindings.push(binding));
}

export function updateBinding<B extends DataBinding>(id: string, recipe: (binding: B) => void, key?: string) {
  update((project) => {
    const binding = project.data.bindings.find((b) => b.id === id);
    if (binding) recipe(binding as B);
  }, key);
}

export function removeBinding(id: string) {
  update((project) => void (project.data.bindings = project.data.bindings.filter((binding) => binding.id !== id)));
}

export function setSource(patch: Partial<DataSource>, key?: string) {
  update((project) => void Object.assign(project.data.source, patch), key);
}

/** Datenfeld einer Komponente setzen (Messwert, Statusanzeige, Karte, Infobox). */
export function setComponentField(id: string, fieldId: string) {
  update((project) => {
    const located = locate(project, id);
    if (!located) return;
    if (fieldId) located.node.fieldId = fieldId;
    else delete located.node.fieldId;
  });
}
