// Hotspots, Kamerafahrten zu Detailansichten, Look At und Follow.
//
// Alles hier wirkt zusätzlich zum Zustand der Timeline: In jedem Bild werden zuerst die Werte
// der Timeline gesetzt, danach kommen Kamerafahrt, Follow und Look At obendrauf. Die Timeline
// selbst bleibt unberührt, deshalb springt die Scrollbewegung nicht.

import * as THREE from 'three';
import { ease } from './easing.js';

const ORDER = ['desktop', 'tablet', 'mobile'];

/** Detailansicht eines Hotspots für einen Breakpoint: Mobile erbt von Tablet, Tablet von Desktop. */
export function resolveView(hotspot, breakpoint) {
  for (let i = ORDER.indexOf(breakpoint); i >= 0; i--) {
    const view = hotspot.views[ORDER[i]];
    if (view) return view;
  }
  return null;
}

/** Weltposition eines Hotspots. Er hängt am Bauteil und folgt dessen Bewegung. */
export function hotspotPosition(stage, hotspot, out = new THREE.Vector3()) {
  const node = stage.nodes.get(hotspot.nodeId);
  return node ? node.localToWorld(out.fromArray(hotspot.position)) : null;
}

/** Detailansicht in Weltkoordinaten. Sie ist relativ zum Bauteil gespeichert und folgt ihm ebenfalls. */
export function viewInWorld(stage, hotspot, breakpoint) {
  const node = stage.nodes.get(hotspot.nodeId);
  const view = resolveView(hotspot, breakpoint);
  if (!node || !view) return null;
  return {
    position: node.localToWorld(new THREE.Vector3().fromArray(view.position)),
    target: node.localToWorld(new THREE.Vector3().fromArray(view.target)),
  };
}

const world = new THREE.Vector3();
const normal = new THREE.Vector3();
const toCamera = new THREE.Vector3();

/**
 * Setzt Hotspot-Punkte und daran verankerte Komponenten an ihre Stelle im Bild.
 * Elemente tragen data-hotspot="<ID>"; ihre Position wird in Prozent der Ebene gesetzt.
 * @param {ReturnType<import('./stage.js').createStage>} stage
 * @param {import('./types').Project} project
 * @param {Iterable<HTMLElement>} elements
 * @param {{ pos: number, activeId?: string | null, editor?: boolean }} options
 *   pos: Timeline-Position (für "nur in diesem Abschnitt"), activeId: geöffneter Hotspot,
 *   editor: im Editor bleiben verankerte Komponenten immer sichtbar
 */
export function positionHotspots(stage, project, elements, { pos, activeId = null, editor = false }) {
  const camera = stage.camera;
  for (const element of elements) {
    const hotspot = project.hotspots.find((h) => h.id === element.dataset.hotspot);
    const node = hotspot && stage.nodes.get(hotspot.nodeId);
    let visible = false;
    if (hotspot && node && hotspotPosition(stage, hotspot, world)) {
      // Hängt der Hotspot an einer ausgeblendeten Variante, ist auch er nicht zu sehen.
      visible = true;
      for (let o = node; o && visible; o = o.parent) visible = o.visible;
      if (hotspot.normal) {
        // Punkte auf der abgewandten Seite des Bauteils ausblenden.
        normal.fromArray(hotspot.normal).transformDirection(node.matrixWorld);
        visible = normal.dot(toCamera.copy(camera.position).sub(world)) > 0;
      }
      const sectionId = element.dataset.for || hotspot.sectionId;
      if (sectionId) {
        const index = project.sections.findIndex((section) => section.id === sectionId);
        if (index < 0 || pos < index || pos > index + 1) visible = false;
      }
      if (element.dataset.anchorMode === 'open' && !editor && activeId !== hotspot.id) visible = false;

      world.project(camera);
      if (world.z < -1 || world.z > 1) visible = false;
      element.style.left = ((world.x * 0.5 + 0.5) * 100).toFixed(2) + '%';
      element.style.top = ((-world.y * 0.5 + 0.5) * 100).toFixed(2) + '%';
    }
    element.style.visibility = visible ? 'visible' : 'hidden';
    if (hotspot) element.classList.toggle('active', activeId === hotspot.id);
  }
}

// ---------- Look At ----------

const FORWARD = {
  '+z': new THREE.Quaternion(),
  '-z': new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI),
  '+x': new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
  '-x': new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2),
};

const clamp = (value, limit) => Math.min(limit, Math.max(-limit, value));
const RAD = Math.PI / 180;

/** Anteil, um den sich ein gedämpfter Wert in diesem Bild seinem Ziel nähert. */
const approach = (damping, dt) => (damping <= 0 ? 1 : 1 - Math.pow(Math.min(damping, 0.999), dt * 60));

/**
 * @param {object} options
 * @param {ReturnType<import('./stage.js').createStage>} options.stage
 * @param {import('./types').Project} options.project
 * @param {ParentNode} options.root Dokument oder Element, in dem Hotspots und Aktionen liegen
 * @param {HTMLElement} options.canvas
 * @param {() => string} options.getBreakpoint
 */
export function createInteraction({ stage, project, root, canvas, getBreakpoint, reduced = false }) {
  const camera = stage.camera;
  const elements = [...root.querySelectorAll('[data-hotspot]')];
  const subjectOf = (item) => (item.subject === 'camera' ? camera : stage.nodes.get(item.subject.slice(5)));

  /** Bauteile, die Look At oder Follow bewegen, mit ihren Werten direkt nach dem Laden. */
  let defaults = new Map();
  const lookState = new Map(project.lookAts.map((look) => [look.id, { yaw: 0, pitch: 0 }]));
  const followState = new Map(project.follows.map((follow) => [follow.id, { x: 0, y: 0 }]));

  /** Zeiger im Bild von -1 bis 1. present = die Maus ist im Fenster bzw. ein Finger liegt auf. */
  const pointer = { x: 0, y: 0, present: false, touch: false };

  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, 1);
    pointer.y = clamp(-(((event.clientY - rect.top) / rect.height) * 2 - 1), 1);
    pointer.touch = event.pointerType === 'touch';
    pointer.present = true;
  };
  const onPointerGone = (event) => {
    if (event.type === 'pointerleave' || event.pointerType === 'touch') pointer.present = false;
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerMove);
  window.addEventListener('pointerup', onPointerGone);
  window.addEventListener('pointercancel', onPointerGone);
  document.documentElement.addEventListener('pointerleave', onPointerGone);

  /** Zeigerposition, die für eine Einstellung gilt. null = gerade kein Zeiger. */
  const pointerFor = (touchMode) => {
    if (!pointer.present) return null;
    if (pointer.touch && touchMode === 'off') return null;
    return pointer;
  };

  // ---------- Detailansicht eines Hotspots ----------

  /** Kamera, wie sie im letzten Bild zu sehen war. Von hier startet jede Fahrt. */
  const shown = { position: camera.position.clone(), target: stage.target.clone() };
  const detail = {
    /** geöffneter Hotspot */
    id: null,
    /** Start der laufenden Fahrt, oder null wenn keine Fahrt und keine Detailansicht aktiv ist */
    from: null,
    progress: 1,
    closing: false,
    duration: 1,
    easing: 'easeInOut',
    posAtOpen: 0,
  };
  let lastPos = 0;
  let previousPos = 0;

  const startFlight = (hotspot, closing) => {
    detail.from = { position: shown.position.clone(), target: shown.target.clone() };
    detail.progress = 0;
    detail.closing = closing;
    // Reduzierte Bewegung: Die Kamera springt direkt zur Ansicht.
    detail.duration = reduced ? 0.01 : Math.max(0.01, hotspot ? hotspot.duration : 1);
    detail.easing = hotspot ? hotspot.easing : 'easeInOut';
  };

  function openHotspot(id) {
    const hotspot = project.hotspots.find((h) => h.id === id);
    if (!hotspot) return;
    detail.id = id;
    // Die Scrollposition beim Öffnen wird festgehalten, sobald die Seite zur Ruhe gekommen ist.
    detail.posAtOpen = null;
    startFlight(hotspot, false);
  }

  function closeDetail() {
    if (!detail.id) return;
    startFlight(project.hotspots.find((h) => h.id === detail.id), true);
    detail.id = null;
  }

  /** Anteil der Detailansicht am Kamerabild, 0 bis 1. Look At und Follow der Kamera pausieren entsprechend. */
  let detailWeight = 0;

  function updateCamera(dt, pos) {
    detailWeight = 0;
    if (!detail.from) return;
    const hotspot = project.hotspots.find((h) => h.id === detail.id);
    if (hotspot && hotspot.onScroll === 'return') {
      // Läuft beim Öffnen noch eine Scrollbewegung aus (Dämpfung, Nachlauf), zählt sie nicht als erneutes Scrollen.
      if (detail.posAtOpen === null) {
        if (Math.abs(pos - previousPos) < 0.0005) detail.posAtOpen = pos;
      } else if (Math.abs(pos - detail.posAtOpen) > 0.02) {
        closeDetail();
      }
    }

    const view = !detail.closing && hotspot ? viewInWorld(stage, hotspot, getBreakpoint()) : null;
    // Ziel der Fahrt: die Detailansicht, sonst die aktuelle Kamera der Timeline.
    const goalPosition = view ? view.position : camera.position.clone();
    const goalTarget = view ? view.target : stage.target.clone();

    detail.progress = Math.min(1, detail.progress + dt / detail.duration);
    const e = ease(detail.easing, detail.progress);
    camera.position.lerpVectors(detail.from.position, goalPosition, e);
    shown.target.lerpVectors(detail.from.target, goalTarget, e);
    camera.lookAt(shown.target);
    detailWeight = view ? e : detail.closing ? 1 - e : 0;

    if (detail.closing && detail.progress >= 1) {
      detail.from = null;
      detail.closing = false;
    }
  }

  // ---------- Follow und Look At ----------

  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const subjectPosition = new THREE.Vector3();
  const point = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  function updateFollow(dt) {
    for (const follow of reduced ? [] : project.follows) {
      const object = subjectOf(follow);
      const state = followState.get(follow.id);
      if (!object || !state) continue;
      const active = pointerFor(follow.touch);
      const k = approach(follow.damping, dt);
      if (active || follow.returns) {
        state.x += ((active ? active.x : 0) - state.x) * k;
        state.y += ((active ? active.y : 0) - state.y) * k;
      }
      const weight = object === camera ? 1 - detailWeight : 1;
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      offset
        .set(0, 0, 0)
        .addScaledVector(right, follow.x ? state.x * follow.distance * weight : 0)
        .addScaledVector(up, follow.y ? state.y * follow.distance * weight : 0);
      if (object === camera) {
        camera.position.add(offset);
      } else {
        object.getWorldPosition(subjectPosition).add(offset);
        object.parent.worldToLocal(subjectPosition);
        object.position.copy(subjectPosition);
      }
    }
  }

  /** Weltpunkt eines Look-At-Ziels, oder null wenn es das Ziel nicht (mehr) gibt. */
  function targetPoint(key, look, object, out) {
    if (key === 'pointer') {
      const active = pointerFor(look.touch);
      const x = active ? active.x : 0;
      const y = active ? active.y : 0;
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      if (object === camera) {
        const reach = camera.position.distanceTo(shown.target) * Math.tan((camera.fov * RAD) / 2);
        return out.copy(shown.target).addScaledVector(right, x * reach * camera.aspect).addScaledVector(up, y * reach);
      }
      // Ein Punkt zwischen Bauteil und Kamera: Das Bauteil wendet sich dem Betrachter zu und folgt dem Zeiger.
      const reach = subjectPosition.distanceTo(camera.position) * 0.5;
      return out
        .copy(subjectPosition)
        .addScaledVector(direction.copy(camera.position).sub(subjectPosition).normalize(), reach)
        .addScaledVector(right, x * reach)
        .addScaledVector(up, y * reach);
    }
    if (key === 'camera') return object === camera ? null : out.copy(camera.position);
    if (key.startsWith('node:')) {
      const node = stage.nodes.get(key.slice(5));
      return node && node !== object ? node.getWorldPosition(out) : null;
    }
    if (key.startsWith('hotspot:')) {
      const hotspot = project.hotspots.find((h) => h.id === key.slice(8));
      return hotspot ? hotspotPosition(stage, hotspot, out) : null;
    }
    if (key.startsWith('point:')) return out.fromArray(key.slice(6).split(',').map(Number));
    return null;
  }

  function updateLookAt(dt) {
    for (const look of reduced ? [] : project.lookAts) {
      const object = subjectOf(look);
      const state = lookState.get(look.id);
      if (!object || !state) continue;
      const strength = stage.params[`lookAt:${look.id}.strength`] ?? 1;
      const target = stage.params[`lookAt:${look.id}.target`] ?? 'pointer';
      const weights = typeof target === 'string' ? { [target]: 1 } : target;

      object.updateWorldMatrix(true, false);
      object.getWorldPosition(subjectPosition);

      // Beim Wechsel zwischen zwei Zielen liegt der Blickpunkt anteilig dazwischen.
      goal.set(0, 0, 0);
      let total = 0;
      for (const [key, share] of Object.entries(weights)) {
        if (targetPoint(key, look, object, point)) {
          goal.addScaledVector(point, share);
          total += share;
        }
      }

      let yaw = 0;
      let pitch = 0;
      if (total > 0) {
        const forward = object === camera ? FORWARD['-z'] : FORWARD[look.forward] || FORWARD['+z'];
        // Richtung zum Ziel im eigenen Koordinatensystem des Bauteils, bezogen auf seine Vorderseite.
        direction.copy(goal.multiplyScalar(1 / total)).sub(subjectPosition);
        object.getWorldQuaternion(quaternion).invert();
        direction.applyQuaternion(quaternion).applyQuaternion(delta.copy(forward).invert()).normalize();
        if (look.yaw) yaw = clamp(Math.atan2(direction.x, direction.z), look.maxYaw * RAD);
        if (look.pitch) pitch = clamp(-Math.atan2(direction.y, Math.hypot(direction.x, direction.z)), look.maxPitch * RAD);
        const weight = strength * (object === camera ? 1 - detailWeight : 1);
        yaw *= weight;
        pitch *= weight;
      }

      const k = approach(look.damping, dt);
      state.yaw += (yaw - state.yaw) * k;
      state.pitch += (pitch - state.pitch) * k;

      const forward = object === camera ? FORWARD['-z'] : FORWARD[look.forward] || FORWARD['+z'];
      delta.setFromEuler(euler.set(state.pitch, state.yaw, 0));
      object.quaternion.multiply(quaternion.copy(forward)).multiply(delta).multiply(quaternion.invert());
    }
  }

  // ---------- Bedienung ----------

  const onClick = (event) => {
    const marker = event.target.closest('.hotspot[data-hotspot]');
    if (marker) {
      if (detail.id === marker.dataset.hotspot) closeDetail();
      else openHotspot(marker.dataset.hotspot);
      return;
    }
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    event.preventDefault();
    const action = trigger.dataset.action;
    if (action === 'close') closeDetail();
    else if (action.startsWith('hotspot:')) openHotspot(action.slice(8));
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape') closeDetail();
    // Karten mit Aktion sind keine Buttons; Enter und Leertaste lösen sie trotzdem aus.
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-action]:not(button):not(a)')) {
      event.preventDefault();
      event.target.click();
    }
  };
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeyDown);

  return {
    /** true, wenn in jedem Bild neu gerechnet werden muss (Zeiger, Dämpfung, Kamerafahrt) */
    live: project.hotspots.length > 0 || project.lookAts.length > 0 || project.follows.length > 0,
    openHotspot,
    closeDetail,
    get activeId() {
      return detail.id;
    },

    /** Nach dem Laden des Modells: Ausgangswerte der bewegten Bauteile festhalten. */
    bind() {
      defaults = new Map();
      for (const item of [...project.lookAts, ...project.follows]) {
        const object = subjectOf(item);
        if (object && object !== camera && !defaults.has(object)) {
          defaults.set(object, { position: object.position.clone(), quaternion: object.quaternion.clone() });
        }
      }
    },

    /** Vor dem Setzen des Timeline-Zustands: Verschiebungen und Drehungen des letzten Bildes zurücknehmen. */
    reset() {
      for (const [object, value] of defaults) {
        object.position.copy(value.position);
        object.quaternion.copy(value.quaternion);
      }
    },

    /** Nach dem Setzen des Timeline-Zustands: Kamerafahrt, Follow, Look At, Hotspot-Positionen. */
    update(dt, pos) {
      previousPos = lastPos;
      lastPos = pos;
      shown.target.copy(stage.target);
      updateCamera(dt, pos);
      // Die nächste Kamerafahrt startet von hier, ohne die Zugaben von Follow und Look At.
      shown.position.copy(camera.position);
      stage.scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      updateFollow(dt);
      updateLookAt(dt);
      stage.scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      positionHotspots(stage, project, elements, { pos, activeId: detail.id });
    },

    dispose() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerMove);
      window.removeEventListener('pointerup', onPointerGone);
      window.removeEventListener('pointercancel', onPointerGone);
      document.documentElement.removeEventListener('pointerleave', onPointerGone);
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
    },
  };
}
