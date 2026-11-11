import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/core/timeline.js';
import { posToScroll, scrollToPos } from '../src/core/scroll.js';

const section = (id, height = 100) => ({ id, name: id, height, align: 'left', elements: [] });

function makeProject(keyframes) {
  return {
    formatVersion: 1,
    name: 'Test',
    model: { file: null, stats: null },
    base: { 'camera.position': [0, 0, 10], 'keyLight.color': '#ffffff', 'keyLight.intensity': 1 },
    sections: [section('a'), section('b'), section('c')],
    keyframes,
    budgets: {},
    settings: { background: '#000000', scrollSmoothing: 0 },
  };
}

// Abnahmekriterium 2: Kamera nur im mittleren Abschnitt, Licht wird weitergegeben.
const project = makeProject([
  {
    id: 'k1',
    sectionId: 'b',
    t: 0.5,
    values: {
      'camera.position': { value: [0, 0, 4], scope: 'local' },
      'keyLight.color': { value: '#ff8800', scope: 'inherit' },
    },
  },
]);

const camZ = (pos) => evaluate(project, pos)['camera.position'][2];

describe('lokaler Geltungsbereich', () => {
  it('gilt im Abschnitt und kehrt danach zum vererbten Wert zurück', () => {
    expect(camZ(0.5)).toBe(10);
    expect(camZ(1)).toBe(10);
    expect(camZ(1.5)).toBe(4);
    expect(camZ(1.7)).toBe(4);
    expect(camZ(2)).toBe(10);
    expect(camZ(2.8)).toBe(10);
  });

  it('blendet weich ein und aus', () => {
    const entering = camZ(1.25);
    expect(entering).toBeGreaterThan(4);
    expect(entering).toBeLessThan(10);
    const leaving = camZ(1.9);
    expect(leaving).toBeGreaterThan(4);
    expect(leaving).toBeLessThan(10);
  });

  it('verläuft ohne Sprünge', () => {
    let previous = camZ(0);
    for (let pos = 0.002; pos <= 3; pos += 0.002) {
      const current = camZ(pos);
      expect(Math.abs(current - previous)).toBeLessThan(0.15);
      previous = current;
    }
  });
});

describe('vererbbarer Geltungsbereich', () => {
  it('bleibt in den Folgeabschnitten erhalten', () => {
    expect(evaluate(project, 0)['keyLight.color']).toBe('#ffffff');
    expect(evaluate(project, 1.5)['keyLight.color']).toBe('#ff8800');
    expect(evaluate(project, 2.9)['keyLight.color']).toBe('#ff8800');
  });

  it('wird von einem neuen vererbbaren Wert ersetzt und lokal vorübergehend überschrieben', () => {
    const p = makeProject([
      { id: '1', sectionId: 'a', t: 0, values: { 'keyLight.intensity': { value: 2, scope: 'inherit' } } },
      { id: '2', sectionId: 'b', t: 0.5, values: { 'keyLight.intensity': { value: 9, scope: 'local' } } },
      { id: '3', sectionId: 'c', t: 0.5, values: { 'keyLight.intensity': { value: 5, scope: 'inherit', transition: 0.2 } } },
    ]);
    const at = (pos) => evaluate(p, pos)['keyLight.intensity'];
    expect(at(0.5)).toBe(2);
    expect(at(1.5)).toBe(9);
    expect(at(2.1)).toBe(2);
    expect(at(2.5)).toBe(5);
    expect(at(3)).toBe(5);
  });
});

describe('Zustand hängt nur von der Position ab', () => {
  it('liefert vorwärts, rückwärts und nach Sprüngen dasselbe', () => {
    const forward = [];
    for (let i = 0; i <= 300; i++) forward.push(JSON.stringify(evaluate(project, i / 100)));
    for (let i = 300; i >= 0; i--) expect(JSON.stringify(evaluate(project, i / 100))).toBe(forward[i]);
    for (const i of [250, 3, 199, 100, 0, 300]) {
      expect(JSON.stringify(evaluate(project, i / 100))).toBe(forward[i]);
    }
  });
});

describe('Scrollzuordnung', () => {
  const layout = (heights) => {
    let top = 0;
    return heights.map((height) => {
      const s = { top, height };
      top += height;
      return s;
    });
  };

  it('durchläuft jeden Abschnitt von 0 bis 100 %', () => {
    const sections = layout([800, 800, 800]);
    expect(scrollToPos(sections, 0, 800)).toBe(0);
    expect(scrollToPos(sections, 1600, 800)).toBe(3);
  });

  it('ist umkehrbar, auch bei unterschiedlichen Abschnittshöhen', () => {
    const sections = layout([800, 2400, 1000]);
    for (const pos of [0, 0.3, 1, 1.6, 2.25, 2.9]) {
      const y = posToScroll(sections, pos, 700);
      expect(scrollToPos(sections, y, 700)).toBeCloseTo(pos, 6);
    }
  });

  it('hält einen Punkt an seiner relativen Position, wenn die Abschnittshöhe wächst', () => {
    const before = layout([800, 800, 800]);
    const after = layout([800, 2000, 800]);
    const yBefore = posToScroll(before, 1.6, 800);
    const yAfter = posToScroll(after, 1.6, 800);
    expect(yAfter).toBeGreaterThan(yBefore);
    expect(scrollToPos(after, yAfter, 800)).toBeCloseTo(1.6, 6);
    expect(camZ(scrollToPos(after, yAfter, 800))).toBeCloseTo(camZ(1.6), 6);
  });
});
