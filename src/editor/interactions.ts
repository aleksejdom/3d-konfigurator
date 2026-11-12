// Hotspots, Look At und Follow im Projekt anlegen und ändern.

import * as THREE from 'three';
import { resolveView, viewInWorld } from '../core/interaction.js';
import type { Breakpoint, Component, Follow, Hotspot, LookAt, Value, Vec3 } from '../core/types';
import { lookProps } from './labels';
import { uid } from './project';
import { editor, tidy } from './stage';
import { notify, setDraft, update, useEditor } from './store';

const vec = (v: THREE.Vector3) => tidy(v.toArray()) as Vec3;

// ---------- Hotspots ----------

/** Setzt einen Hotspot an die angeklickte Stelle eines Bauteils. Punkt und Flächenrichtung liegen im System des Bauteils. */
export function addHotspot(nodeId: string, position: THREE.Vector3, normal: THREE.Vector3 | null) {
  const count = useEditor.getState().project.hotspots.length + 1;
  const hotspot: Hotspot = {
    id: uid('hs'),
    name: `Hotspot ${count}`,
    label: '',
    nodeId,
    position: vec(position),
    normal: normal ? vec(normal) : null,
    sectionId: null,
    views: {},
    duration: 1.2,
    easing: 'easeInOut',
    onScroll: 'return',
  };
  update((project) => void project.hotspots.push(hotspot));
  useEditor.setState({ selectedHotspot: hotspot.id, selectedComponent: null, placingHotspot: false });
}

export function updateHotspot(id: string, patch: Partial<Hotspot>, key?: string) {
  update((project) => {
    const hotspot = project.hotspots.find((h) => h.id === id);
    if (hotspot) Object.assign(hotspot, patch);
  }, key);
}

function forEachComponent(list: Component[], visit: (component: Component) => void) {
  for (const component of list) {
    visit(component);
    if (component.children) forEachComponent(component.children, visit);
  }
}

/** Löscht einen Hotspot und löst alles, was auf ihn verweist. */
export function removeHotspot(id: string) {
  update((project) => {
    project.hotspots = project.hotspots.filter((h) => h.id !== id);
    const release = (component: Component) => {
      if (component.hotspotId === id) {
        component.placement = 'free';
        delete component.hotspotId;
      }
      if (component.action?.type === 'hotspot' && component.action.hotspotId === id) component.action = null;
    };
    project.sections.forEach((section) => forEachComponent(section.components, release));
    project.templates.forEach((template) => forEachComponent([template.root], release));
    // Look-At-Ziele, die auf den Hotspot zeigen, fallen auf den Mauszeiger zurück.
    const key = 'hotspot:' + id;
    for (const [prop, value] of Object.entries(project.base)) if (value === key) project.base[prop] = 'pointer';
    for (const keyframe of project.keyframes) {
      for (const [prop, kv] of Object.entries(keyframe.values)) if (kv.value === key) delete keyframe.values[prop];
    }
  });
  useEditor.setState({ selectedHotspot: null });
}

/** "Kameraansicht merken": speichert die aktuelle Kamera des Viewports als Detailansicht, relativ zum Bauteil. */
export function saveHotspotView(id: string, breakpoint: Breakpoint) {
  const stage = editor.stage;
  const hotspot = useEditor.getState().project.hotspots.find((h) => h.id === id);
  const node = stage && hotspot ? stage.nodes.get(hotspot.nodeId) : undefined;
  if (!stage || !node) {
    notify('Das Bauteil dieses Hotspots gibt es im Modell nicht mehr.');
    return;
  }
  node.updateWorldMatrix(true, false);
  const view = {
    position: vec(node.worldToLocal(stage.camera.position.clone())),
    target: vec(node.worldToLocal(stage.target.clone())),
  };
  update((project) => {
    const target = project.hotspots.find((h) => h.id === id);
    if (target) target.views[breakpoint] = view;
  });
  // Die Kamera war nur für die Detailansicht verstellt; die Timeline behält ihren Stand.
  useEditor.setState({ draft: {} });
}

export function clearHotspotView(id: string, breakpoint: Breakpoint) {
  update((project) => {
    const hotspot = project.hotspots.find((h) => h.id === id);
    if (hotspot) delete hotspot.views[breakpoint];
  });
}

/** Stellt die Kamera des Viewports auf die gespeicherte Detailansicht, ohne die Timeline zu ändern. */
export function showHotspotView(id: string, breakpoint: Breakpoint) {
  const { stage, orbit } = editor;
  const hotspot = useEditor.getState().project.hotspots.find((h) => h.id === id);
  if (!stage || !orbit || !hotspot) return;
  stage.scene.updateMatrixWorld();
  const view = viewInWorld(stage, hotspot, breakpoint);
  if (!view) return;
  stage.camera.position.copy(view.position);
  stage.target.copy(view.target);
  orbit.target.copy(view.target);
  orbit.update();
}

/** Abstand der Kamera zum Blickziel in der Detailansicht ändern. */
export function setViewDistance(id: string, breakpoint: Breakpoint, distance: number) {
  update((project) => {
    const hotspot = project.hotspots.find((h) => h.id === id);
    const inherited = hotspot && resolveView(hotspot, breakpoint);
    if (!hotspot || !inherited) return;
    const target = new THREE.Vector3().fromArray(inherited.target);
    const direction = new THREE.Vector3().fromArray(inherited.position).sub(target);
    if (direction.lengthSq() === 0) return;
    direction.setLength(Math.max(0.001, distance));
    hotspot.views[breakpoint] = { position: vec(target.clone().add(direction)), target: inherited.target };
  }, `view-distance-${id}`);
}

// ---------- Look At ----------

export function addLookAt(subject: string) {
  const look: LookAt = {
    id: uid('la'),
    subject,
    forward: '+z',
    yaw: true,
    pitch: true,
    maxYaw: subject === 'camera' ? 12 : 45,
    maxPitch: subject === 'camera' ? 8 : 30,
    damping: 0.85,
    touch: 'drag',
  };
  update((project) => {
    project.lookAts.push(look);
    const [target, strength] = lookProps(look.id);
    project.base[target] = 'pointer';
    project.base[strength] = 1;
  });
}

export function updateLookAt(id: string, patch: Partial<LookAt>, key?: string) {
  update((project) => {
    const look = project.lookAts.find((l) => l.id === id);
    if (look) Object.assign(look, patch);
  }, key);
}

export function removeLookAt(id: string) {
  update((project) => {
    project.lookAts = project.lookAts.filter((l) => l.id !== id);
    for (const prop of lookProps(id)) {
      delete project.base[prop];
      project.keyframes.forEach((keyframe) => delete keyframe.values[prop]);
    }
  });
}

/**
 * Ziel oder Stärke eines Look At ändern. Solange dafür noch kein Punkt gemerkt ist, gilt der Wert
 * für die ganze Seite. Danach ist es eine Änderung an dieser Stelle, die mit "Merken" gespeichert wird.
 */
export function setLookParam(prop: string, value: Value) {
  const { project } = useEditor.getState();
  const hasKeyframes = project.keyframes.some((keyframe) => prop in keyframe.values);
  if (hasKeyframes) setDraft({ [prop]: value });
  else update((p) => void (p.base[prop] = value), 'param-' + prop);
}

// ---------- Follow ----------

export function addFollow(subject: string) {
  const radius = editor.stage?.bounds.radius ?? 1;
  const follow: Follow = {
    id: uid('fo'),
    subject,
    x: true,
    y: true,
    distance: Math.round(radius * 0.15 * 1000) / 1000,
    damping: 0.9,
    returns: true,
    touch: 'off',
  };
  update((project) => void project.follows.push(follow));
}

export function updateFollow(id: string, patch: Partial<Follow>, key?: string) {
  update((project) => {
    const follow = project.follows.find((f) => f.id === id);
    if (follow) Object.assign(follow, patch);
  }, key);
}

export function removeFollow(id: string) {
  update((project) => void (project.follows = project.follows.filter((f) => f.id !== id)));
}
