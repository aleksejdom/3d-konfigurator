// Variantengruppen und Bauteil-Aktionen im Projekt anlegen und ändern.

import { actionToString, optionProp } from '../core/actions.js';
import type { Component, ComponentAction, Project, VariantGroup, VariantOption } from '../core/types';
import { locate } from './components';
import { uid } from './project';
import { setDraft, update, useEditor } from './store';

function forEachComponent(list: Component[], visit: (component: Component) => void) {
  for (const component of list) {
    visit(component);
    if (component.children) forEachComponent(component.children, visit);
  }
}

function everyComponent(project: Project, visit: (component: Component) => void) {
  project.sections.forEach((section) => forEachComponent(section.components, visit));
  project.templates.forEach((template) => forEachComponent([template.root], visit));
}

/** Entfernt Aktionen, die auf etwas Gelöschtes zeigen. */
function dropActions(project: Project, isGone: (action: ComponentAction) => boolean) {
  everyComponent(project, (component) => {
    if (component.action && isGone(component.action)) component.action = null;
    for (const content of Object.values(component.content ?? {})) {
      if (content.action && isGone(content.action)) content.action = null;
    }
  });
  project.meshActions = project.meshActions.filter((item) => !isGone(item.action));
}

export function addGroup(kind: VariantGroup['kind']) {
  const { project, selectedNode } = useEditor.getState();
  const node = selectedNode && selectedNode !== 'model' ? selectedNode : null;
  const count = project.variantGroups.filter((group) => group.kind === kind).length + 1;
  const options: VariantOption[] =
    kind === 'mesh'
      ? [
          { id: uid('opt'), name: 'Variante A', nodeIds: node ? [node] : [] },
          { id: uid('opt'), name: 'Variante B', nodeIds: [] },
        ]
      : [
          { id: uid('opt'), name: 'Original', color: null, material: null },
          { id: uid('opt'), name: 'Farbe 2', color: '#2f6fed', material: null },
        ];
  const group: VariantGroup = {
    id: uid('vg'),
    name: kind === 'mesh' ? `Variante ${count}` : `Material ${count}`,
    kind,
    options,
    fade: 0.35,
    resetSections: [],
    ...(kind === 'material' ? { targets: node ? [node] : [] } : {}),
  };
  update((p) => {
    p.variantGroups.push(group);
    p.base[optionProp(group.id)] = options[0].id;
  });
  useEditor.setState({ selectedGroup: group.id, selectedComponent: null, selectedHotspot: null });
}

export function updateGroup(id: string, recipe: (group: VariantGroup) => void, key?: string) {
  update((project) => {
    const group = project.variantGroups.find((g) => g.id === id);
    if (group) recipe(group);
  }, key);
}

export function updateOption(groupId: string, optionId: string, recipe: (option: VariantOption) => void, key?: string) {
  updateGroup(
    groupId,
    (group) => {
      const option = group.options.find((o) => o.id === optionId);
      if (option) recipe(option);
    },
    key,
  );
}

export function removeGroup(id: string) {
  update((project) => {
    project.variantGroups = project.variantGroups.filter((group) => group.id !== id);
    const prop = optionProp(id);
    delete project.base[prop];
    project.keyframes.forEach((keyframe) => delete keyframe.values[prop]);
    dropActions(project, (action) => 'groupId' in action && action.groupId === id);
    everyComponent(project, (component) => {
      if (component.groupId === id) delete component.groupId;
    });
    for (const group of project.variantGroups) {
      for (const option of group.options) option.requires = (option.requires ?? []).filter((rule) => rule.groupId !== id);
    }
  });
  useEditor.setState({ selectedGroup: null });
}

export function addOption(groupId: string) {
  updateGroup(groupId, (group) => {
    const name = group.kind === 'mesh' ? `Variante ${String.fromCharCode(65 + group.options.length)}` : `Farbe ${group.options.length + 1}`;
    group.options.push(group.kind === 'mesh' ? { id: uid('opt'), name, nodeIds: [] } : { id: uid('opt'), name, color: '#c0392b', material: null });
  });
}

export function removeOption(groupId: string, optionId: string) {
  update((project) => {
    const group = project.variantGroups.find((g) => g.id === groupId);
    if (!group || group.options.length <= 1) return;
    group.options = group.options.filter((option) => option.id !== optionId);
    const prop = optionProp(groupId);
    if (project.base[prop] === optionId) project.base[prop] = group.options[0].id;
    for (const keyframe of project.keyframes) if (keyframe.values[prop]?.value === optionId) delete keyframe.values[prop];
    dropActions(project, (action) => action.type === 'select' && action.groupId === groupId && action.optionId === optionId);
    for (const other of project.variantGroups) {
      for (const option of other.options) {
        option.requires = (option.requires ?? []).filter((rule) => !(rule.groupId === groupId && rule.optionId === optionId));
      }
    }
  });
}

/**
 * Wahl einer Gruppe im Editor anzeigen. Solange dafür noch kein Punkt gemerkt ist, gilt sie für die ganze
 * Seite. Danach ist es eine Änderung an dieser Stelle, die mit "Merken" gespeichert wird.
 */
export function showOption(groupId: string, optionId: string) {
  const prop = optionProp(groupId);
  const { project } = useEditor.getState();
  if (project.keyframes.some((keyframe) => prop in keyframe.values)) setDraft({ [prop]: optionId });
  else update((p) => void (p.base[prop] = optionId));
}

/** Aktion bei Klick auf ein Bauteil setzen oder entfernen. */
export function setMeshAction(nodeId: string, action: ComponentAction | null) {
  update((project) => {
    project.meshActions = project.meshActions.filter((item) => item.nodeId !== nodeId);
    if (action && actionToString(action)) project.meshActions.push({ nodeId, action });
  });
}

/** Variantengruppe einer Auswahlliste oder eines Sliders setzen. */
export function setComponentGroup(id: string, groupId: string) {
  update((project) => {
    const located = locate(project, id);
    if (!located) return;
    if (groupId) located.node.groupId = groupId;
    else delete located.node.groupId;
  });
}
