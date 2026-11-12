import { describe, expect, it } from 'vitest';
import { resolveView } from '../src/core/interaction.js';
import { evaluate, mix } from '../src/core/timeline.js';
import type { Component, Hotspot } from '../src/core/types';
import { renderFreeLayer, renderHotspotLayer, renderSections } from '../src/export/page.js';
import { createComponent, createProject, migrateProject } from '../src/editor/project';

const hotspot = (extra: Partial<Hotspot> = {}): Hotspot => ({
  id: 'hs1',
  name: 'Motor',
  label: 'Motor',
  nodeId: 'Motor',
  position: [0, 0, 0],
  normal: null,
  sectionId: null,
  views: {},
  duration: 1,
  easing: 'easeInOut',
  onScroll: 'return',
  ...extra,
});

describe('Look-At-Ziel in der Timeline', () => {
  it('mischt zwei Ziele zu Gewichten', () => {
    expect(mix('pointer', 'camera', 0)).toBe('pointer');
    expect(mix('pointer', 'camera', 1)).toBe('camera');
    expect(mix('pointer', 'camera', 0.25)).toEqual({ pointer: 0.75, camera: 0.25 });
    expect(mix({ pointer: 0.5, camera: 0.5 }, 'camera', 0.5)).toEqual({ pointer: 0.25, camera: 0.75 });
  });

  it('wechselt weich und beim Zurückscrollen umkehrbar zwischen zwei Blickzielen', () => {
    const project = createProject();
    project.base['lookAt:la.target'] = 'pointer';
    project.base['lookAt:la.strength'] = 1;
    project.keyframes.push({
      id: 'k',
      sectionId: project.sections[1].id,
      t: 1,
      values: {
        'lookAt:la.target': { value: 'hotspot:hs1', scope: 'inherit', transition: 0.5 },
        'lookAt:la.strength': { value: 0.4, scope: 'inherit', transition: 0.5 },
      },
    });
    const at = (pos: number) => evaluate(project, pos);
    expect(at(1)['lookAt:la.target']).toBe('pointer');
    expect(at(2.5)['lookAt:la.target']).toBe('hotspot:hs1');
    const middle = at(1.75)['lookAt:la.target'] as Record<string, number>;
    expect(middle.pointer + middle['hotspot:hs1']).toBeCloseTo(1);
    expect(middle.pointer).toBeCloseTo(0.5);
    expect(at(1.75)['lookAt:la.strength']).toBeCloseTo(0.7);
    // vorwärts und rückwärts dieselben Werte
    expect(at(1.6)).toEqual(evaluate(project, 1.6));
    expect((at(1.6)['lookAt:la.target'] as Record<string, number>).pointer).toBeGreaterThan(0.5);
  });
});

describe('Hotspots', () => {
  it('vererbt die Detailansicht Desktop -> Tablet -> Mobile', () => {
    const desktop = { position: [0, 0, 5] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
    const mobile = { position: [0, 2, 8] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
    expect(resolveView(hotspot(), 'mobile')).toBeNull();
    expect(resolveView(hotspot({ views: { desktop } }), 'tablet')).toBe(desktop);
    expect(resolveView(hotspot({ views: { desktop, mobile } }), 'mobile')).toBe(mobile);
    expect(resolveView(hotspot({ views: { mobile } }), 'desktop')).toBeNull();
  });

  it('gibt Hotspots als Buttons mit Namen aus', () => {
    const project = createProject();
    expect(renderHotspotLayer(project)).toBe('');
    project.hotspots.push(hotspot({ sectionId: project.sections[1].id }));
    const html = renderHotspotLayer(project);
    expect(html).toContain('<button type="button" class="hotspot" data-hotspot="hs1"');
    expect(html).toContain(`data-for="${project.sections[1].id}"`);
    expect(html).toContain('aria-label="Motor"');
    expect(html).toContain('<span class="hotspot-label">Motor</span>');
  });

  it('verankert Komponenten am Hotspot und gibt Aktionen aus', () => {
    const project = createProject();
    project.hotspots.push(hotspot());
    const button = createComponent('button', 'Zum Motor');
    button.action = { type: 'hotspot', hotspotId: 'hs1' };
    const card: Component = { ...createComponent('infobox'), placement: 'hotspot', hotspotId: 'hs1', anchorMode: 'open' };
    card.children![1] = { ...createComponent('button', 'Schließen'), action: { type: 'close' } };
    project.sections[0].components.push(button, card);

    const flow = renderSections(project);
    expect(flow).toMatch(/<button type="button" class="c button [^"]*" data-action="hotspot:hs1">Zum Motor<\/button>/);
    expect(flow).not.toContain('infobox');

    const layer = renderFreeLayer(project);
    expect(layer).toMatch(/class="c infobox [^"]*anchored" data-hotspot="hs1" data-for="[^"]+" data-anchor-mode="open"/);
    expect(layer).toContain('data-action="close"');
  });

  it('öffnet Projekte der Version 2 mit leeren Listen', () => {
    const v2 = { ...createProject(), formatVersion: 2 } as Record<string, unknown>;
    delete v2.hotspots;
    delete v2.lookAts;
    delete v2.follows;
    const project = migrateProject(v2);
    expect(project.formatVersion).toBe(3);
    expect([project.hotspots, project.lookAts, project.follows]).toEqual([[], [], []]);
  });
});
