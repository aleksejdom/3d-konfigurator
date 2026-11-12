// 3D-Konfigurator: Varianten, Materialien, Sichtbarkeit, Animationsclips und Klicks auf Bauteile.
//
// Jede Variantengruppe hat eine Wahl aus der Timeline ("option:<ID>.value"). Wählt der Besucher
// selbst, hat seine Wahl Vorrang und bleibt beim Scrollen erhalten, bis sie zurückgesetzt wird:
// durch eine Reset-Aktion oder beim Erreichen eines Abschnitts, der die Gruppe an die Timeline übergibt.

import * as THREE from 'three';
import { applyClipTimes } from './stage.js';
import { approachWeights, dominant, isAvailable, optionProp, parseAction, resolveSelection, stepOption, toWeights } from './actions.js';

// ---------- Szene ----------

/** Eigene Materialkopien pro Mesh, damit Farbe und Deckkraft einzeln gesetzt werden können. */
const meshStates = new WeakMap();

function ownMaterials(mesh) {
  let state = meshStates.get(mesh);
  if (!state) {
    const isArray = Array.isArray(mesh.material);
    const originals = isArray ? mesh.material : [mesh.material];
    state = { isArray, originals, own: originals.map((material) => material.clone()), applied: [...originals], colored: [] };
    mesh.material = isArray ? state.own : state.own[0];
    meshStates.set(mesh, state);
  }
  return state;
}

function restoreMesh(mesh) {
  const state = meshStates.get(mesh);
  if (!state) return;
  mesh.material = state.isArray ? state.originals : state.originals[0];
  state.own.forEach((material) => material.dispose());
  meshStates.delete(mesh);
}

/** Materialien des Modells nach Namen, für "Material wechseln". */
function materialsByName(stage) {
  const root = stage.model.children[0];
  if (stage.materialIndex && stage.materialIndex.root === root) return stage.materialIndex.map;
  const map = new Map();
  stage.model.traverse((object) => {
    if (!object.isMesh) return;
    const state = meshStates.get(object);
    const list = state ? state.originals : Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material.name && !map.has(material.name)) map.set(material.name, material);
  });
  stage.materialIndex = { root, map };
  return map;
}

const mixed = new THREE.Color();
const part = new THREE.Color();

/**
 * Überträgt die Wahl aller Variantengruppen auf das Modell.
 * @param {ReturnType<import('./stage.js').createStage>} stage
 * @param {import('./types').Project} project
 * @param {Record<string, Record<string, number>>} weights Gruppe -> (Wahl -> Gewicht 0..1).
 *   Während eines Übergangs sind zwei Wahlen anteilig aktiv und werden überblendet.
 * @param {Record<string, string>} [tints] Bauteil -> Farbe aus einer Datenbindung; hat Vorrang vor der Farbe einer Materialgruppe
 */
export function applyOptions(stage, project, weights, tints = {}) {
  /** Mesh -> { opacity, source, color } */
  const plan = new Map();
  const planFor = (mesh) => {
    if (!plan.has(mesh)) plan.set(mesh, { opacity: 1, source: null, color: null });
    return plan.get(mesh);
  };
  const nodeWeights = new Map();
  const named = materialsByName(stage);

  for (const group of project.variantGroups) {
    const groupWeights = weights[group.id] || {};

    if (group.kind === 'mesh') {
      // Bauteile der Gruppe: sichtbar mit dem Gewicht ihrer Wahl. Ein Bauteil in mehreren Wahlen zählt zusammen.
      for (const option of group.options) {
        for (const id of option.nodeIds || []) {
          const node = stage.nodes.get(id);
          if (node) nodeWeights.set(node, Math.min(1, (nodeWeights.get(node) || 0) + (groupWeights[option.id] || 0)));
        }
      }
      continue;
    }

    // Material: Farben werden gemischt, ein anderes Material wechselt in der Mitte des Übergangs.
    const active = group.options.find((option) => option.id === dominant(groupWeights));
    if (!active) continue;
    let color = null;
    const involved = group.options.filter((option) => (groupWeights[option.id] || 0) > 0.001);
    if (involved.length > 0 && involved.every((option) => option.color)) {
      let total = 0;
      mixed.setRGB(0, 0, 0);
      for (const option of involved) {
        const weight = groupWeights[option.id];
        part.set(option.color);
        mixed.r += part.r * weight;
        mixed.g += part.g * weight;
        mixed.b += part.b * weight;
        total += weight;
      }
      color = mixed.clone().multiplyScalar(1 / total);
    } else if (active.color) {
      color = new THREE.Color(active.color);
    }
    const source = active.material ? named.get(active.material) || null : null;
    for (const id of group.targets || []) {
      const node = stage.nodes.get(id);
      if (!node) continue;
      node.traverse((object) => {
        if (!object.isMesh) return;
        const entry = planFor(object);
        entry.source = source;
        entry.color = color;
      });
    }
  }

  for (const [id, color] of Object.entries(tints)) {
    const node = stage.nodes.get(id);
    if (!node) continue;
    const tint = new THREE.Color(color);
    node.traverse((object) => object.isMesh && (planFor(object).color = tint));
  }

  for (const [node, weight] of nodeWeights) {
    node.visible = weight > 0.002;
    if (weight < 0.999) node.traverse((object) => object.isMesh && (planFor(object).opacity *= weight));
  }

  for (const [mesh, entry] of plan) {
    const state = ownMaterials(mesh);
    state.own.forEach((material, i) => {
      const source = entry.source || state.originals[i];
      if (state.applied[i] !== source) {
        material.copy(source);
        state.applied[i] = source;
        state.colored[i] = false;
      }
      if (entry.color) material.color.copy(entry.color);
      else if (state.colored[i]) material.color.copy(source.color);
      state.colored[i] = Boolean(entry.color);

      const transparent = source.transparent || entry.opacity < 0.999;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = source.opacity * entry.opacity;
    });
  }

  // Bauteile, die keine Gruppe mehr steuert, bekommen ihren Ausgangszustand zurück.
  for (const mesh of stage.optionMeshes || []) if (!plan.has(mesh)) restoreMesh(mesh);
  for (const node of stage.optionNodes || []) if (!nodeWeights.has(node)) node.visible = true;
  stage.optionMeshes = new Set(plan.keys());
  stage.optionNodes = new Set(nodeWeights.keys());
}

/** Wahl der Timeline für alle Gruppen, als Gewichte. */
export function timelineWeights(stage, project) {
  const weights = {};
  for (const group of project.variantGroups) {
    const value = stage.params[optionProp(group.id)];
    weights[group.id] = value ? toWeights(value) : group.options[0] ? { [group.options[0].id]: 1 } : {};
  }
  return weights;
}

// ---------- HTML ----------

/**
 * Zeigt den aktiven Zustand in der Oberfläche: gewählte Variante, nicht verfügbare Varianten, laufende Clips.
 * @param {ParentNode} root
 * @param {import('./types').Project} project
 * @param {Record<string, string>} selection Gruppe -> aktive Wahl
 * @param {Set<string>} [playing] Namen der laufenden Animationsclips
 */
export function syncOptionElements(root, project, selection, playing = new Set()) {
  const optionOf = (groupId, optionId) => {
    const group = project.variantGroups.find((g) => g.id === groupId);
    return group ? group.options.find((option) => option.id === optionId) : undefined;
  };

  for (const element of root.querySelectorAll('[data-action]')) {
    const action = parseAction(element.dataset.action);
    if (!action) continue;
    if (action.type === 'select') {
      const option = optionOf(action.groupId, action.optionId);
      const active = selection[action.groupId] === action.optionId;
      const available = Boolean(option) && isAvailable(project, option, selection);
      element.classList.toggle('is-active', active);
      element.classList.toggle('is-unavailable', !available);
      element.setAttribute('aria-pressed', String(active));
      element.setAttribute('aria-disabled', String(!available));
    } else if (action.type === 'clip') {
      const active = playing.has(action.clip);
      element.classList.toggle('is-active', active);
      if (action.mode === 'toggle') element.setAttribute('aria-pressed', String(active));
    }
  }

  for (const element of root.querySelectorAll('[data-group]')) {
    const groupId = element.dataset.group;
    if (element.tagName === 'SELECT') {
      for (const item of element.options) {
        const option = optionOf(groupId, item.value);
        item.disabled = !option || !isAvailable(project, option, selection);
      }
      if (selection[groupId] !== undefined) element.value = selection[groupId];
      continue;
    }
    for (const item of element.querySelectorAll('[data-option]')) {
      item.classList.toggle('is-active', item.dataset.option === selection[groupId]);
    }
  }
}

// ---------- Steuerung in Vorschau und Export ----------

const INTERACTIVE = 'a, button, select, input, textarea, label, [data-action], .hotspot';

/**
 * @param {object} options
 * @param {ReturnType<import('./stage.js').createStage>} options.stage
 * @param {import('./types').Project} options.project
 * @param {Document} options.root
 * @param {HTMLElement} options.canvas
 * @param {(id: string) => void} [options.openHotspot] Kamerafahrt zu einem Hotspot (für Klicks auf Bauteile)
 * @param {() => void} [options.closeDetail]
 */
export function createConfigurator({ stage, project, root, canvas, openHotspot, closeDetail, reduced = false }) {
  const groups = project.variantGroups;
  /** Wahl des Besuchers: Gruppe -> Wahl. Fehlt eine Gruppe, gilt die Timeline. */
  const chosen = {};
  /** Gruppen, die gerade von der Besucherwahl zur Timeline zurückblenden */
  const returning = new Set();
  /** Aktuell dargestellte Gewichte */
  let shown = {};
  const playing = new Set();
  /** Clips, deren Tempo ein Messwert bestimmt: Name -> Tempo (1 = Originalgeschwindigkeit) */
  const driven = new Map();
  let tints = {};
  let lastSection = -1;
  let signature = null;
  let dirty = true;
  let fading = false;

  const groupById = (id) => groups.find((group) => group.id === id);

  /** Aktive Wahl jeder Gruppe: die des Besuchers, sonst die der Timeline. */
  function selection() {
    const timeline = timelineWeights(stage, project);
    const result = {};
    for (const group of groups) result[group.id] = chosen[group.id] ?? dominant(timeline[group.id]);
    return result;
  }

  function select(groupId, optionId) {
    const group = groupById(groupId);
    const option = group && group.options.find((o) => o.id === optionId);
    const current = selection();
    if (!option || !isAvailable(project, option, current)) return false;
    chosen[groupId] = optionId;
    returning.delete(groupId);
    // Wird durch diese Wahl eine andere unzulässig, rückt dort die erste verfügbare Wahl nach.
    const resolved = resolveSelection(project, { ...current, [groupId]: optionId });
    for (const other of groups) {
      if (resolved[other.id] !== undefined && resolved[other.id] !== (other.id === groupId ? optionId : current[other.id])) {
        chosen[other.id] = resolved[other.id];
        returning.delete(other.id);
      }
    }
    dirty = true;
    return true;
  }

  /** Gibt eine Gruppe (oder alle) an die Timeline zurück. */
  function reset(groupId) {
    for (const group of groups) {
      if (groupId && group.id !== groupId) continue;
      if (group.id in chosen) {
        delete chosen[group.id];
        returning.add(group.id);
      }
    }
    dirty = true;
  }

  function playClip(name, mode) {
    const clip = stage.clips.find((c) => c.name === name);
    if (!clip || !stage.mixer) return;
    const action = stage.mixer.clipAction(clip);
    const start = mode === 'play' || (mode === 'toggle' && !playing.has(name));
    if (start) {
      action.reset().play();
      playing.add(name);
    } else {
      action.stop();
      playing.delete(name);
    }
    dirty = true;
  }

  /** @param {import('./types').ComponentAction | null} action */
  function run(action) {
    if (!action) return;
    if (action.type === 'select') select(action.groupId, action.optionId);
    else if (action.type === 'next' || action.type === 'prev') {
      const group = groupById(action.groupId);
      if (group) select(group.id, stepOption(project, group, selection(), action.type === 'next' ? 1 : -1));
    } else if (action.type === 'reset') reset(action.groupId);
    else if (action.type === 'clip') playClip(action.clip, action.mode);
    else if (action.type === 'hotspot' && openHotspot) openHotspot(action.hotspotId);
    else if (action.type === 'close' && closeDetail) closeDetail();
  }

  // ---------- Klick auf ein Bauteil ----------

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0, moved: false, overHtml: false };

  const isShown = (object) => {
    for (let o = object; o && o !== stage.scene; o = o.parent) if (!o.visible) return false;
    return true;
  };

  /** Aktion des vordersten sichtbaren Bauteils unter dem Zeiger, oder null. */
  function meshActionAt(clientX, clientY) {
    if (project.meshActions.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, stage.camera);
    const hit = raycaster.intersectObject(stage.model, true).find((entry) => isShown(entry.object));
    for (let object = hit && hit.object; object && object !== stage.model; object = object.parent) {
      const found = project.meshActions.find((item) => item.nodeId === object.userData.nodeId);
      if (found) return found.action;
    }
    return null;
  }

  const onClick = (event) => {
    const trigger = event.target.closest('[data-action]');
    if (trigger) {
      const action = parseAction(trigger.dataset.action);
      // Hotspot-Aktionen und "Schließen" an HTML-Elementen übernimmt interaction.js.
      if (action && action.type !== 'hotspot' && action.type !== 'close') {
        event.preventDefault();
        run(action);
      }
      return;
    }
    if (event.target.closest(INTERACTIVE)) return;
    run(meshActionAt(event.clientX, event.clientY));
  };

  const onChange = (event) => {
    const list = event.target.closest('select[data-group]');
    if (!list) return;
    if (!select(list.dataset.group, list.value)) signature = null; // abgelehnte Wahl: Anzeige zurückstellen
    dirty = true;
  };

  const onKeyDown = (event) => {
    const slider = event.target.closest('.variant-slider[data-group]');
    if (!slider) return;
    const group = groupById(slider.dataset.group);
    if (!group) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      run({ type: event.key === 'ArrowRight' ? 'next' : 'prev', groupId: group.id });
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const options = event.key === 'Home' ? group.options : [...group.options].reverse();
      const first = options.find((option) => isAvailable(project, option, selection()));
      if (first) select(group.id, first.id);
    }
  };

  // Wischen über einen Varianten-Slider
  let swipe = null;
  const onPointerDown = (event) => {
    const slider = event.target.closest('.variant-slider[data-group]');
    swipe = slider ? { groupId: slider.dataset.group, x: event.clientX, y: event.clientY } : null;
  };
  const onPointerUp = (event) => {
    if (!swipe) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) run({ type: dx < 0 ? 'next' : 'prev', groupId: swipe.groupId });
    swipe = null;
  };
  const onPointerMove = (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved = true;
    pointer.overHtml = Boolean(event.target.closest && event.target.closest(INTERACTIVE));
  };

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointerup', onPointerUp);
  if (project.meshActions.length > 0) root.addEventListener('pointermove', onPointerMove);

  return {
    /** true, solange überblendet wird, ein Clip läuft oder sich etwas geändert hat */
    get live() {
      return dirty || fading || playing.size > 0 || pointer.moved || [...driven.values()].some((scale) => scale !== 0);
    },
    selection,
    select,
    reset,
    run,

    /** Farben aus Datenbindungen (Bauteil -> Farbe). */
    setTints(next) {
      tints = next;
      dirty = true;
    },

    /** Lässt einen Clip mit dem Tempo eines Messwerts laufen. scale 0 hält ihn an. */
    driveClip(name, scale) {
      const clip = stage.clips.find((c) => c.name === name);
      if (!clip || !stage.mixer) return;
      const action = stage.mixer.clipAction(clip);
      if (!driven.has(name)) action.play();
      action.timeScale = scale;
      driven.set(name, scale);
      dirty = true;
    },

    /** Nach dem Setzen des Timeline-Zustands: Auswahl anwenden, Clips weiterspielen, Oberfläche abgleichen. */
    update(dt, pos) {
      dirty = false;

      // Übergabe an die Timeline, sobald ein dafür bestimmter Abschnitt erreicht wird.
      const index = Math.min(project.sections.length - 1, Math.max(0, Math.floor(pos)));
      if (index !== lastSection) {
        const section = project.sections[index];
        if (lastSection >= 0 && section) {
          for (const group of groups) if (group.resetSections.includes(section.id)) reset(group.id);
        }
        lastSection = index;
      }

      const timeline = timelineWeights(stage, project);
      const next = {};
      fading = false;
      for (const group of groups) {
        const byVisitor = group.id in chosen;
        const target = byVisitor ? { [chosen[group.id]]: 1 } : timeline[group.id];
        if (!byVisitor && !returning.has(group.id)) {
          // Reiner Timeline-Betrieb: Der Zustand hängt nur von der Scrollposition ab.
          next[group.id] = target;
          continue;
        }
        const step = group.fade > 0 && !reduced ? dt / group.fade : 1;
        const { weights, done } = approachWeights(shown[group.id] || target, target, step);
        next[group.id] = weights;
        if (!done) fading = true;
        else if (!byVisitor) returning.delete(group.id);
      }
      shown = next;
      applyOptions(stage, project, shown, tints);

      if (stage.mixer && (playing.size > 0 || driven.size > 0)) stage.mixer.update(dt);
      // Clips, die an die Scroll-Timeline gebunden sind, folgen der Scrollposition.
      applyClipTimes(stage, new Set([...playing, ...driven.keys()]));

      if (pointer.moved) {
        pointer.moved = false;
        const hit = !pointer.overHtml && meshActionAt(pointer.x, pointer.y);
        root.documentElement.style.cursor = hit ? 'pointer' : '';
      }

      const current = selection();
      const nextSignature = JSON.stringify(current) + [...playing].join('|');
      if (nextSignature !== signature) {
        signature = nextSignature;
        syncOptionElements(root, project, current, playing);
      }
    },

    dispose() {
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointermove', onPointerMove);
    },
  };
}
