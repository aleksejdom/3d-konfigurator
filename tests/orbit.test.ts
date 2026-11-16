import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ORBIT_RELEASE, createOrbit, orbitPosition, orbitWeight } from '../src/core/orbit.js';
import { createProject } from '../src/editor/project';

/** Kleine Nachbildung eines Dokuments: merkt sich die angemeldeten Ereignisse. */
function fakeRoot() {
  const handlers: Record<string, (event: Record<string, unknown>) => void> = {};
  const classes = new Set<string>();
  const root = {
    documentElement: { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) } },
    addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) => (handlers[type] = handler),
    removeEventListener: () => {},
  };
  const fire = (type: string, x: number, y: number, extra = {}) => handlers[type]?.({ pointerId: 1, button: 0, clientX: x, clientY: y, pointerType: 'mouse', target: {}, stopPropagation() {}, preventDefault() {}, ...extra });
  return { root: root as never, fire, classes };
}

function setup(orbit: 'horizontal' | 'free' | undefined) {
  const project = createProject();
  if (orbit) project.sections[0].orbit = orbit;
  const stage = { camera: new THREE.PerspectiveCamera(), target: new THREE.Vector3(0, 0, 0) };
  const env = fakeRoot();
  const control = createOrbit({ stage, project, root: env.root, reduced: true });
  const frame = (pos: number) => {
    stage.camera.position.set(0, 0, 5); // die Timeline setzt die Kamera in jedem Bild neu
    control.update(pos);
    return stage.camera.position.toArray().map((n) => Math.round(n * 1000) / 1000);
  };
  return { ...env, control, frame, stage };
}

describe('Freies Drehen durch den Besucher', () => {
  it('dreht den Kamerastandpunkt um das Blickziel und hält den Abstand', () => {
    const position = orbitPosition(new THREE.Vector3(0, 0, 5), new THREE.Vector3(), Math.PI / 2, 0);
    expect(position.length()).toBeCloseTo(5);
    expect(Math.abs(position.x)).toBeCloseTo(5);
    expect(position.z).toBeCloseTo(0);
  });

  it('gibt die Ansicht zum Ende des Abschnitts mit dem Scrollen zurück', () => {
    expect(orbitWeight(0)).toBe(1);
    expect(orbitWeight(ORBIT_RELEASE)).toBe(1);
    expect(orbitWeight((1 + ORBIT_RELEASE) / 2)).toBeCloseTo(0.5);
    expect(orbitWeight(1)).toBe(0);
  });

  it('folgt dem Ziehen im Abschnitt und kommt im nächsten Abschnitt bei der vorgegebenen Ansicht an', () => {
    const { fire, frame, classes } = setup('horizontal');
    expect(frame(0.2)).toEqual([0, 0, 5]);
    expect(classes.has('can-orbit')).toBe(true);
    fire('pointerdown', 100, 100);
    fire('pointermove', 300, 160);
    const turned = frame(0.2);
    expect(turned).not.toEqual([0, 0, 5]);
    expect(turned[1]).toBe(0); // "horizontal" neigt nicht
    fire('pointerup', 300, 160);
    // Weiter unten im Abschnitt ist die Drehung schon kleiner, am Ende ganz weg.
    const leaving = frame(0.85);
    expect(Math.abs(leaving[0])).toBeLessThan(Math.abs(turned[0]));
    expect(frame(0.999)[0]).toBeCloseTo(0, 1);
    expect(frame(1.2)).toEqual([0, 0, 5]);
    // Zurückgescrollt beginnt der Abschnitt wieder bei der vorgegebenen Ansicht.
    expect(frame(0.2)).toEqual([0, 0, 5]);
  });

  it('neigt mit „frei“ und reagiert nicht in Abschnitten ohne Drehen oder auf Schaltflächen', () => {
    const free = setup('free');
    free.frame(0.1);
    free.fire('pointerdown', 100, 100);
    free.fire('pointermove', 100, 200);
    expect(free.frame(0.1)[1]).not.toBe(0);

    const button = setup('free');
    button.frame(0.1);
    button.fire('pointerdown', 100, 100, { target: { closest: () => ({}) } });
    button.fire('pointermove', 300, 100);
    expect(button.frame(0.1)).toEqual([0, 0, 5]);

    const off = setup(undefined);
    off.frame(0.1);
    off.fire('pointerdown', 100, 100);
    off.fire('pointermove', 300, 100);
    expect(off.frame(0.1)).toEqual([0, 0, 5]);
  });

  it('überlässt senkrechtes Wischen auf Touch-Geräten dem Scrollen', () => {
    const { fire, frame } = setup('free');
    frame(0.1);
    fire('pointerdown', 100, 100, { pointerType: 'touch' });
    fire('pointermove', 105, 200, { pointerType: 'touch' });
    expect(frame(0.1)).toEqual([0, 0, 5]);
    fire('pointerdown', 100, 100, { pointerType: 'touch' });
    fire('pointermove', 220, 110, { pointerType: 'touch' });
    expect(frame(0.1)[0]).not.toBe(0);
  });
});
