// Freies Drehen durch den Besucher: In Abschnitten mit "orbit" lässt sich die Kamera mit Maus oder Finger
// um das Modell ziehen und in festen Grenzen zoomen (zwei Finger, Strg + Mausrad, Schaltflächen). Die Drehung liegt als Versatz über der Kamera der Timeline. Zum Ende des Abschnitts
// nimmt sie mit dem Scrollen ab, sodass der nächste Abschnitt genau bei seiner vorgegebenen Ansicht ankommt.

import * as THREE from 'three';

import { splitPos } from './timeline.js';

/** Elemente, auf denen ein Ziehen nicht drehen soll. */
const INTERACTIVE = 'a, button, select, input, textarea, label, [data-action], .hotspot, .slider';

/** Ab diesem Anteil des Abschnitts kehrt die Kamera mit dem Scrollen zur Timeline zurück. */
export const ORBIT_RELEASE = 0.55;
/** Drehung pro px Zeigerweg, in Bogenmaß */
const SPEED = 0.006;
/**
 * Grenzen für das Zoomen in einem Abschnitt, als Faktor gegenüber der gemerkten Ansicht.
 * Ohne Angabe: nicht weiter weg als gemerkt, bis zur doppelten Größe heran.
 * @param {import('./types').Section | undefined} section
 */
export function zoomLimits(section) {
  const limits = (section && section.orbitZoom) || {};
  const min = Math.min(1, Math.max(0.1, limits.min ?? 1));
  const max = Math.max(1, Math.min(20, limits.max ?? 2));
  return { min, max };
}

/** Schritt einer Zoom-Schaltfläche */
const ZOOM_STEP = 1.35;

/** Größte Neigung nach oben und unten gegenüber der vorgegebenen Ansicht */
const MAX_PITCH = 1.1;

const smooth = (x) => x * x * (3 - 2 * x);

/**
 * Anteil der Drehung des Besuchers an einer Stelle im Abschnitt: 1 im vorderen Teil, zum Ende hin 0.
 * @param {number} t Position im Abschnitt, 0 bis 1
 */
export function orbitWeight(t) {
  if (t <= ORBIT_RELEASE) return 1;
  return 1 - smooth(Math.min(1, (t - ORBIT_RELEASE) / (1 - ORBIT_RELEASE)));
}

/**
 * Dreht einen Kamerastandpunkt um das Blickziel.
 * @param {THREE.Vector3} position Standpunkt der Kamera (wird verändert)
 * @param {THREE.Vector3} target Blickziel
 * @param {number} yaw Drehung um die Hochachse
 * @param {number} pitch Neigung; positiv hebt die Kamera
 * @param {number} [zoom] Zoomfaktor; 2 halbiert den Abstand zum Blickziel
 */
export function orbitPosition(position, target, yaw, pitch, zoom = 1) {
  const spherical = new THREE.Spherical().setFromVector3(position.clone().sub(target));
  spherical.radius /= zoom;
  spherical.theta -= yaw;
  spherical.phi = Math.min(Math.PI - 0.08, Math.max(0.08, spherical.phi - pitch));
  return position.setFromSpherical(spherical).add(target);
}

/**
 * @param {object} options
 * @param {any} options.stage
 * @param {import('./types').Project} options.project
 * @param {Document | HTMLElement} options.root
 * @param {boolean} [options.reduced] reduzierte Bewegung: kein Nachlaufen
 */
export function createOrbit({ stage, project, root, reduced = false }) {
  const enabled = project.sections.some((section) => section.orbit);
  const state = { yaw: 0, pitch: 0, zoom: 1, zoomTarget: 1, index: -1, mode: /** @type {string | undefined} */ (undefined), velocity: 0 };
  let limits = { min: 1, max: 2 };
  /** Zeiger auf dem Bildschirm, für das Zoomen mit zwei Fingern: ID -> Position */
  const touches = new Map();
  let pinch = 0;
  const setZoom = (value) => {
    state.zoomTarget = Math.min(limits.max, Math.max(limits.min, value));
    dirty = true;
  };
  let drag = /** @type {{ id: number, x: number, y: number, time: number, turning: boolean, touch: boolean } | null} */ (null);
  let swallowClick = false;
  let dirty = false;
  const doc = /** @type {Document} */ (root.ownerDocument || root);

  const spread = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onDown = (event) => {
    if (!state.mode || event.button > 0 || (event.target.closest && event.target.closest(INTERACTIVE))) return;
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      // Zwei Finger zoomen; das Drehen ruht so lange.
      if (touches.size === 2) {
        pinch = spread();
        drag = null;
        doc.documentElement.classList.remove('is-orbiting');
        return;
      }
    }
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), turning: false, touch: event.pointerType === 'touch' };
    state.velocity = 0;
  };
  const onMove = (event) => {
    if (touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2 && pinch > 0) {
        const next = spread();
        setZoom(state.zoomTarget * (next / pinch));
        state.zoom = state.zoomTarget; // die Finger führen direkt
        pinch = next;
        return;
      }
    }
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.turning) {
      if (Math.hypot(dx, dy) < 5) return;
      // Auf Touch-Geräten gehört die senkrechte Bewegung dem Scrollen.
      if (drag.touch && Math.abs(dy) > Math.abs(dx)) {
        drag = null;
        return;
      }
      drag.turning = true;
      doc.documentElement.classList.add('is-orbiting');
    }
    // Geschwindigkeit in Bogenmaß pro Sekunde, geglättet; damit läuft die Drehung nach dem Loslassen kurz aus.
    const now = performance.now();
    const seconds = Math.max(0.008, (now - drag.time) / 1000);
    state.velocity = state.velocity * 0.6 + ((dx * SPEED) / seconds) * 0.4;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.time = now;
    state.yaw += dx * SPEED;
    if (state.mode === 'free' && !drag.touch) state.pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, state.pitch + dy * SPEED));
    dirty = true;
  };
  const onUp = (event) => {
    touches.delete(event.pointerId);
    if (touches.size < 2) pinch = 0;
    if (!drag || event.pointerId !== drag.id) return;
    // Nach dem Drehen folgt kein Klick auf das Bauteil unter dem Zeiger.
    swallowClick = drag.turning;
    // Wer vor dem Loslassen anhält, bekommt kein Nachlaufen.
    if (!drag.turning || performance.now() - drag.time > 80) state.velocity = 0;
    state.velocity = Math.min(4, Math.max(-4, state.velocity));
    drag = null;
    doc.documentElement.classList.remove('is-orbiting');
    dirty = true;
  };
  /** Strg + Mausrad und die Spreizgeste auf dem Trackpad zoomen. Das Mausrad allein scrollt die Seite. */
  const onWheel = (event) => {
    if (!state.mode || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(state.zoomTarget * Math.exp(-event.deltaY * 0.01));
  };
  /** Schaltflächen mit der Aktion "zoom:in", "zoom:out" oder "zoom:reset" */
  const onAction = (event) => {
    const trigger = event.target.closest && event.target.closest('[data-action^="zoom:"]');
    if (!trigger) return;
    event.preventDefault();
    if (!state.mode) return;
    const kind = trigger.dataset.action.slice(5);
    if (kind === 'reset') {
      state.yaw = 0;
      state.pitch = 0;
      state.velocity = 0;
      setZoom(1);
    } else setZoom(state.zoomTarget * (kind === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP));
  };
  const onClick = (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  };

  if (enabled) {
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('click', onClick, true);
    root.addEventListener('click', onAction);
    root.addEventListener('wheel', onWheel, { passive: false });
  }

  return {
    /** true, solange weiter gerendert werden muss */
    get live() {
      return dirty || (!drag && Math.abs(state.velocity) > 0.01) || state.zoom !== state.zoomTarget;
    },
    /** Aktuelle Drehung, für Tests und Fehlersuche */
    state,
    /**
     * Legt die Drehung des Besuchers über die Kamera der Timeline. Nach applyState() aufrufen.
     * @param {number} pos Position der Timeline
     * @param {number} [dt] Zeit seit dem letzten Bild in Sekunden
     */
    update(pos, dt = 0.016) {
      if (!enabled) return;
      dirty = false;
      const { index, t } = splitPos(project, pos);
      const section = project.sections[index];
      // In einem anderen Abschnitt beginnt die Drehung wieder bei der vorgegebenen Ansicht.
      if (index !== state.index) {
        state.index = index;
        state.yaw = 0;
        state.pitch = 0;
        state.velocity = 0;
        state.zoom = 1;
        state.zoomTarget = 1;
        limits = zoomLimits(section);
      }
      state.mode = section && section.orbit ? section.orbit : undefined;
      doc.documentElement.classList.toggle('can-orbit', Boolean(state.mode));
      if (!state.mode) return;
      // Nach dem Loslassen läuft die Drehung kurz aus.
      if (!drag && state.velocity !== 0) {
        state.velocity = reduced || Math.abs(state.velocity) <= 0.01 ? 0 : state.velocity * Math.exp(-6 * dt);
        state.yaw += state.velocity * dt;
      }
      // Der Zoom nähert sich weich seinem Ziel.
      if (state.zoom !== state.zoomTarget) {
        const step = reduced ? 1 : 1 - Math.exp(-10 * dt);
        state.zoom += (state.zoomTarget - state.zoom) * step;
        if (Math.abs(state.zoom - state.zoomTarget) < 0.002) state.zoom = state.zoomTarget;
      }
      const weight = orbitWeight(t);
      if (state.yaw === 0 && state.pitch === 0 && state.zoom === 1) return;
      orbitPosition(stage.camera.position, stage.target, state.yaw * weight, state.pitch * weight, 1 + (state.zoom - 1) * weight);
      stage.camera.lookAt(stage.target);
    },
    dispose() {
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('click', onClick, true);
      root.removeEventListener('click', onAction);
      root.removeEventListener('wheel', onWheel);
    },
  };
}
