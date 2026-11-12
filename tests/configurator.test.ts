import { describe, expect, it } from 'vitest';
import { actionToString, approachWeights, dominant, isAvailable, optionProp, parseAction, resolveSelection, stepOption } from '../src/core/actions.js';
import { evaluate } from '../src/core/timeline.js';
import type { ComponentAction, Project, VariantGroup } from '../src/core/types';
import { renderSections } from '../src/export/page.js';
import { createComponent, createProject, migrateProject } from '../src/editor/project';

// Beispiel aus den Anforderungen: "Anbaugerät B ist nur mit Halterung X verfügbar".
const halterung: VariantGroup = {
  id: 'halterung',
  name: 'Halterung',
  kind: 'mesh',
  fade: 0.3,
  resetSections: [],
  options: [
    { id: 'ohne', name: 'Ohne', nodeIds: [] },
    { id: 'x', name: 'Halterung X', nodeIds: ['HalterungX'] },
  ],
};
const anbau: VariantGroup = {
  id: 'anbau',
  name: 'Anbaugerät',
  kind: 'mesh',
  fade: 0.3,
  resetSections: [],
  options: [
    { id: 'a', name: 'Anbaugerät A', nodeIds: ['AnbauA'] },
    { id: 'b', name: 'Anbaugerät B', nodeIds: ['AnbauB'], requires: [{ groupId: 'halterung', optionId: 'x' }] },
  ],
};

function makeProject(): Project {
  const project = createProject();
  project.variantGroups = [halterung, anbau];
  project.base[optionProp('halterung')] = 'ohne';
  project.base[optionProp('anbau')] = 'a';
  return project;
}

describe('Aktionen', () => {
  it('lassen sich als Text speichern und wieder lesen', () => {
    const actions: ComponentAction[] = [
      { type: 'hotspot', hotspotId: 'hs_1' },
      { type: 'close' },
      { type: 'select', groupId: 'vg_1', optionId: 'opt_2' },
      { type: 'next', groupId: 'vg_1' },
      { type: 'prev', groupId: 'vg_1' },
      { type: 'reset', groupId: 'vg_1' },
      { type: 'reset', groupId: null },
      { type: 'clip', clip: 'Tür: öffnen', mode: 'toggle' },
    ];
    for (const action of actions) expect(parseAction(actionToString(action))).toEqual(action);
  });
});

describe('Variantenregeln', () => {
  const project = makeProject();

  it('sperren eine Wahl, solange ihre Voraussetzung fehlt', () => {
    const b = anbau.options[1];
    expect(isAvailable(project, b, { halterung: 'ohne', anbau: 'a' })).toBe(false);
    expect(isAvailable(project, b, { halterung: 'x', anbau: 'a' })).toBe(true);
  });

  it('lassen die erste verfügbare Wahl nachrücken, wenn die Voraussetzung wegfällt', () => {
    expect(resolveSelection(project, { halterung: 'ohne', anbau: 'b' })).toEqual({ halterung: 'ohne', anbau: 'a' });
    expect(resolveSelection(project, { halterung: 'x', anbau: 'b' })).toEqual({ halterung: 'x', anbau: 'b' });
  });

  it('überspringen gesperrte Varianten beim Weiterschalten', () => {
    expect(stepOption(project, anbau, { halterung: 'ohne', anbau: 'a' }, 1)).toBe('a');
    expect(stepOption(project, anbau, { halterung: 'x', anbau: 'a' }, 1)).toBe('b');
    expect(stepOption(project, anbau, { halterung: 'x', anbau: 'a' }, -1)).toBe('b');
  });
});

describe('Überblenden', () => {
  it('nähert die Gewichte schrittweise der neuen Wahl an', () => {
    let weights: Record<string, number> = { a: 1 };
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      weights = approachWeights(weights, { b: 1 }, 0.25).weights;
      seen.push(weights.b);
    }
    expect(seen).toEqual([0.25, 0.5, 0.75, 1]);
    expect(weights.a).toBeUndefined();
    expect(approachWeights({ b: 1 }, { b: 1 }, 0.25).done).toBe(true);
  });

  it('liefert in der Timeline zwischen zwei gemerkten Varianten Gewichte', () => {
    const project = makeProject();
    const [first, second] = project.sections;
    project.keyframes = [
      { id: 'k1', sectionId: first.id, t: 0.5, values: { [optionProp('anbau')]: { value: 'a', scope: 'inherit' } } },
      { id: 'k2', sectionId: second.id, t: 0.5, values: { [optionProp('anbau')]: { value: 'b', scope: 'inherit', transition: 0.2 } } },
    ];
    const at = (pos: number) => evaluate(project, pos)[optionProp('anbau')];
    expect(at(1)).toBe('a');
    expect(dominant(at(1.38) as Record<string, number>)).toBe('a');
    expect(dominant(at(1.45) as Record<string, number>)).toBe('b');
    expect(at(1.5)).toBe('b');
    expect(at(2.5)).toBe('b');
    // rückwärts derselbe Zustand
    expect(at(1.38)).toEqual(evaluate(project, 1.38)[optionProp('anbau')]);
  });
});

describe('HTML des Konfigurators', () => {
  const project = makeProject();
  const slider = createComponent('slider');
  slider.groupId = 'anbau';
  const list = createComponent('select');
  list.groupId = 'halterung';
  const button = createComponent('button', 'Halterung X');
  button.action = { type: 'select', groupId: 'halterung', optionId: 'x' };
  project.sections[0].components = [slider, list, button];
  const html = renderSections(project);

  it('gibt Auswahlliste und Slider als bedienbare Elemente aus', () => {
    expect(html).toContain('<select class="c select');
    expect(html).toContain('<option value="x">Halterung X</option>');
    expect(html).toContain('data-action="next:anbau"');
    expect(html).toContain('data-action="select:anbau:b"');
    expect(html).toMatch(/variant-slider[^>]*role="group"[^>]*tabindex="0"/);
  });

  it('macht aus einem Button mit Aktion ein button-Element', () => {
    expect(html).toMatch(/<button type="button" class="c button[^>]*data-action="select:halterung:x"/);
  });
});

describe('Projektformat', () => {
  it('öffnet Projekte der Version 3 mit leerem Konfigurator', () => {
    const old = { ...createProject(), formatVersion: 3 } as Record<string, unknown>;
    delete old.variantGroups;
    delete old.meshActions;
    const project = migrateProject(old);
    expect(project.formatVersion).toBe(4);
    expect(project.variantGroups).toEqual([]);
    expect(project.meshActions).toEqual([]);
  });
});
