// Gruppen und Eltern-Kind-Beziehungen der Bauteile.
// Die Szene wird immer aus der Ausgangslage des Modells aufgebaut (applyHierarchy), damit Editor,
// Vorschau und Export dieselben Werte erhalten.

import * as THREE from 'three';
import { applyHierarchy, parentId, readProp } from '../core/stage.js';
import type { Hierarchy, Project, Value } from '../core/types';
import { groupNames } from './labels';
import { uid } from './project';
import { editor, nodeProps, sameValue, tidy } from './stage';
import { notify, update, useEditor } from './store';

/** Kennung der zuletzt aufgebauten Hierarchie, um unnötige Umbauten zu vermeiden. */
let applied = '';

const signature = (hierarchy: Hierarchy, modelVersion: number) => modelVersion + JSON.stringify(hierarchy);

/** Ausgangswerte aller Bauteile nach dem Aufbau der Hierarchie neu lesen. */
function refreshDefaults() {
  const stage = editor.stage!;
  editor.defaults = {};
  for (const id of stage.nodes.keys()) {
    for (const prop of nodeProps(id)) editor.defaults[prop] = tidy(readProp(stage, prop) as Value);
  }
  for (const prop of Object.keys(editor.reset)) {
    if (editor.defaults[prop] === undefined) delete editor.reset[prop];
    else editor.reset[prop] = editor.defaults[prop];
  }
}

/**
 * Bringt die Szene auf den Stand der Hierarchie im Projekt (nach Laden, Undo, Redo, Modellwechsel).
 * Liefert true, wenn umgebaut wurde.
 */
export function syncHierarchy(project: Project, modelVersion: number): boolean {
  groupNames.clear();
  project.hierarchy.groups.forEach((group) => groupNames.set(group.id, group.name));
  const stage = editor.stage;
  const key = signature(project.hierarchy, modelVersion);
  if (!stage || key === applied) return false;
  applyHierarchy(stage, project.hierarchy);
  refreshDefaults();
  applied = key;
  return true;
}

/** Ändert die Hierarchie in einem Undo-Schritt und rechnet unveränderte Ausgangswerte in den neuen Bezug um. */
function commit(recipe: (hierarchy: Hierarchy) => void, extra?: (project: Project) => void) {
  const stage = editor.stage;
  if (!stage) return;
  const state = useEditor.getState();
  const before = { ...editor.defaults };
  const next = structuredClone(state.project.hierarchy);
  recipe(next);
  applyHierarchy(stage, next);
  refreshDefaults();
  applied = signature(next, state.modelVersion);
  let stale = false;
  update((project) => {
    project.hierarchy = next;
    extra?.(project);
    // Ein umgehängtes Bauteil zählt seine Position ab dem neuen Elternteil. Werte, die noch der Ausgangslage
    // entsprachen, wandern mit; eigens gemerkte Werte bleiben stehen.
    for (const prop of Object.keys(project.base)) {
      if (!prop.startsWith('node:') || before[prop] === undefined || editor.defaults[prop] === undefined) continue;
      if (sameValue(before[prop], editor.defaults[prop])) continue;
      if (sameValue(project.base[prop], before[prop])) project.base[prop] = editor.defaults[prop];
      else stale = true;
      if (project.keyframes.some((keyframe) => prop in keyframe.values)) stale = true;
    }
  });
  groupNames.clear();
  next.groups.forEach((group) => groupNames.set(group.id, group.name));
  useEditor.setState({ draft: {}, treeVersion: useEditor.getState().treeVersion + 1 });
  if (stale) notify('Für ein umgehängtes Bauteil sind Positionen gemerkt. Sie zählen jetzt ab dem neuen Elternteil; prüfe sie und merke sie bei Bedarf neu.');
}

/** Aktuelles Elternteil eines Bauteils oder einer Gruppe. */
export function currentParent(id: string): string {
  const object = editor.stage?.nodes.get(id);
  return object ? (parentId(object) as string) : 'model';
}

function originalParent(id: string): string | null {
  const original = editor.stage?.originals?.get(id);
  if (!original) return null;
  return (original.parent.userData.nodeId as string | undefined) ?? 'model';
}

/** Liegt target in oder unter node? Dann darf node nicht dorthin gehängt werden. */
export function isInside(target: string, node: string): boolean {
  const stage = editor.stage;
  const ancestor = stage?.nodes.get(node);
  for (let object: THREE.Object3D | null | undefined = stage?.nodes.get(target); object; object = object.parent) if (object === ancestor) return true;
  return false;
}

function assign(hierarchy: Hierarchy, child: string, parent: string) {
  const group = hierarchy.groups.find((g) => g.id === child);
  if (group) {
    // Die Gruppe behält ihren Platz in der Szene: Drehpunkt in den Bezug des neuen Elternteils umrechnen.
    const stage = editor.stage!;
    const object = stage.nodes.get(child)!;
    const target = stage.nodes.get(parent) ?? stage.model;
    const world = object.getWorldPosition(new THREE.Vector3());
    group.position = tidy(target.worldToLocal(world).toArray()) as Hierarchy['groups'][number]['position'];
    group.parent = parent;
  } else if (originalParent(child) === parent) {
    delete hierarchy.parents[child];
  } else {
    hierarchy.parents[child] = parent;
  }
}

/** Hängt ein Bauteil oder eine Gruppe unter ein anderes Bauteil, eine Gruppe oder die oberste Ebene. */
export function setParent(child: string, parent: string) {
  if (child === 'model' || child === parent || currentParent(child) === parent) return;
  if (isInside(parent, child)) {
    notify('Ein Bauteil kann nicht in sich selbst oder in eines seiner Kinder gelegt werden.');
    return;
  }
  commit((hierarchy) => assign(hierarchy, child, parent));
}

/** Fasst Bauteile zu einer neuen Gruppe zusammen. Ihr Drehpunkt liegt in der Mitte der Bauteile. */
export function createGroup(ids: string[]) {
  const stage = editor.stage;
  const members = ids.filter((id, i) => id !== 'model' && stage?.nodes.has(id) && ids.indexOf(id) === i);
  // Kinder, deren Elternteil ebenfalls gewählt ist, bleiben bei ihrem Elternteil.
  const top = members.filter((id) => !members.some((other) => other !== id && isInside(id, other)));
  if (!stage || top.length === 0) return;
  const parent = currentParent(top[0]);
  const box = new THREE.Box3();
  top.forEach((id) => box.expandByObject(stage.nodes.get(id)!));
  const center = box.isEmpty() ? stage.nodes.get(top[0])!.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
  const position = tidy((stage.nodes.get(parent) ?? stage.model).worldToLocal(center).toArray()) as Hierarchy['groups'][number]['position'];
  const id = uid('grp');
  commit((hierarchy) => {
    hierarchy.groups.push({ id, name: `Gruppe ${hierarchy.groups.length + 1}`, parent, position });
    top.forEach((member) => assign(hierarchy, member, id));
  });
  useEditor.setState({ selectedNode: id });
}

/** Löst eine Gruppe auf. Ihre Bauteile rücken eine Ebene nach oben und behalten ihren Platz. */
export function ungroup(id: string) {
  const state = useEditor.getState();
  const group = state.project.hierarchy.groups.find((g) => g.id === id);
  const stage = editor.stage;
  if (!group || !stage) return;
  const children = [...stage.nodes.entries()].filter(([childId, object]) => childId !== id && parentId(object) === id).map(([childId]) => childId);
  // Die Kinder stehen in der Szene dort, wo die Gruppe sie gerade hinbewegt hat. Aufgebaut wird aus der
  // Ausgangslage, deshalb rücken sie an ihren Platz bei unbewegter Gruppe.
  const prefix = `node:${id}.`;
  commit(
    (hierarchy) => {
      children.forEach((child) => assign(hierarchy, child, group.parent));
      hierarchy.groups = hierarchy.groups.filter((g) => g.id !== id);
    },
    (project) => {
      for (const prop of Object.keys(project.base)) if (prop.startsWith(prefix)) delete project.base[prop];
      for (const keyframe of project.keyframes) {
        for (const prop of Object.keys(keyframe.values)) if (prop.startsWith(prefix)) delete keyframe.values[prop];
      }
      project.keyframes = project.keyframes.filter((keyframe) => Object.keys(keyframe.values).length > 0);
    },
  );
  if (useEditor.getState().selectedNode === id) useEditor.setState({ selectedNode: null });
}

export function renameGroup(id: string, name: string) {
  const next = name.trim();
  if (!next) return;
  update((project) => {
    const group = project.hierarchy.groups.find((g) => g.id === id);
    if (group) group.name = next;
  });
  groupNames.set(id, next);
  useEditor.setState({ treeVersion: useEditor.getState().treeVersion + 1 });
}
