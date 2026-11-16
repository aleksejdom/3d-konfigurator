// Freies Drehen durch den Besucher: In Abschnitten mit "orbit" lässt sich die Kamera mit Maus oder Finger
// um das Modell ziehen. Die Drehung liegt als Versatz über der Kamera der Timeline. Zum Ende des Abschnitts
// nimmt sie mit dem Scrollen ab, sodass der nächste Abschnitt genau bei seiner vorgegebenen Ansicht ankommt.

import * as THREE from 'three';

import { splitPos } from './timeline.js';

/** Elemente, auf denen ein Ziehen nicht drehen soll. */
const INTERACTIVE = 'a, button, select, input, textarea, label, [data-action], .hotspot, .slider';

/** Ab diesem Anteil des Abschnitts kehrt die Kamera mit dem Scrollen zur Timeline zurück. */
export const ORBIT_RELEASE = 0.55;
/** Drehung pro px Zeigerweg, in Bogenmaß */
const SPEED = 0.006;
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
 */
export function orbitPosition(position, target, yaw, pitch) {
  const spherical = new THREE.Spherical().setFromVector3(position.clone().sub(target));
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
  const state = { yaw: 0, pitch: 0, index: -1, mode: /** @type {string | undefined} */ (undefined), velocity: 0 };
  let drag = /** @type {{ id: number, x: number, y: number, time: number, turning: boolean, touch: boolean } | null} */ (null);
  let swallowClick = false;
  let dirty = false;
  const doc = /** @type {Document} */ (root.ownerDocument || root);

  const onDown = (event) => {
    if (!state.mode || event.button > 0 || (event.target.closest && event.target.closest(INTERACTIVE))) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), turning: false, touch: event.pointerType === 'touch' };
    state.velocity = 0;
  };
  const onMove = (event) => {
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
  }

  return {
    /** true, solange weiter gerendert werden muss */
    get live() {
      return dirty || (!drag && Math.abs(state.velocity) > 0.01);
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
      }
      state.mode = section && section.orbit ? section.orbit : undefined;
      doc.documentElement.classList.toggle('can-orbit', Boolean(state.mode));
      if (!state.mode) return;
      // Nach dem Loslassen läuft die Drehung kurz aus.
      if (!drag && state.velocity !== 0) {
        state.velocity = reduced || Math.abs(state.velocity) <= 0.01 ? 0 : state.velocity * Math.exp(-6 * dt);
        state.yaw += state.velocity * dt;
      }
      const weight = orbitWeight(t);
      if (state.yaw === 0 && state.pitch === 0) return;
      orbitPosition(stage.camera.position, stage.target, state.yaw * weight, state.pitch * weight);
      stage.camera.lookAt(stage.target);
    },
    dispose() {
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('click', onClick, true);
    },
  };
}
