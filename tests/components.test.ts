import { describe, expect, it } from 'vitest';
import { animationProgress, breakpointFor, cascade, resolveFraming } from '../src/core/components.js';
import { renderCss, renderFreeLayer, renderSections, resolveComponent } from '../src/export/page.js';
import { createComponent, createProject, migrateProject } from '../src/editor/project';
import type { Component, Project } from '../src/core/types';

describe('Breakpoints', () => {
  it('ordnet Breiten zu', () => {
    expect(breakpointFor(1440)).toBe('desktop');
    expect(breakpointFor(820)).toBe('tablet');
    expect(breakpointFor(390)).toBe('mobile');
  });

  it('vererbt Desktop -> Tablet -> Mobile', () => {
    const overrides = { tablet: { fontSize: 20 }, mobile: { visible: false } };
    expect(cascade({ fontSize: 32, width: 300 }, overrides, 'desktop')).toEqual({ fontSize: 32, width: 300 });
    expect(cascade({ fontSize: 32, width: 300 }, overrides, 'tablet')).toEqual({ fontSize: 20, width: 300 });
    expect(cascade({ fontSize: 32, width: 300 }, overrides, 'mobile')).toEqual({ fontSize: 20, width: 300, visible: false });
  });

  it('löst den Kameraausschnitt pro Breakpoint auf', () => {
    const project = createProject();
    project.framing = { desktop: { shiftX: 15 }, tablet: {}, mobile: { zoom: 0.7, shiftX: 0 } };
    expect(resolveFraming(project, 'tablet')).toEqual({ zoom: 1, shiftX: 15, shiftY: 0 });
    expect(resolveFraming(project, 'mobile')).toEqual({ zoom: 0.7, shiftX: 0, shiftY: 0 });
  });
});

describe('Scroll-Animation', () => {
  it('blendet im Bereich ein und wieder aus', () => {
    expect(animationProgress(0.05, [0.1, 0.3], [0.8, 1], false)).toBe(0);
    expect(animationProgress(0.2, [0.1, 0.3], [0.8, 1], false)).toBeCloseTo(0.5);
    expect(animationProgress(0.5, [0.1, 0.3], [0.8, 1], false)).toBe(1);
    expect(animationProgress(0.9, [0.1, 0.3], [0.8, 1], false)).toBeCloseTo(0.5);
    expect(animationProgress(1, [0.1, 0.3], [0.8, 1], false)).toBe(0);
  });

  it('zeigt freie Komponenten nur in ihrem Abschnitt', () => {
    expect(animationProgress(-0.2, null, null, true)).toBe(0);
    expect(animationProgress(0.5, null, null, true)).toBe(1);
    expect(animationProgress(1.3, null, null, true)).toBe(0);
    expect(animationProgress(1.3, null, null, false)).toBe(1);
  });
});

function projectWithTemplate(): { project: Project; instance: Component } {
  const project = createProject();
  const root = createComponent('card');
  root.id = 't_root';
  root.style = { width: 320 };
  root.overrides = { mobile: { width: 240 } };
  root.children![0].id = 'slot_title';
  root.children![1].id = 'slot_text';
  root.children![2].id = 'slot_button';
  project.templates.push({ id: 'tpl_1', name: 'Produktkarte', root });
  const instance: Component = {
    id: 'c_inst',
    type: 'instance',
    templateId: 'tpl_1',
    placement: 'free',
    style: { x: 60, y: 30 },
    overrides: { mobile: { x: 5, y: 60 } },
    animation: { type: 'fade', in: [0, 0.2], out: null },
    content: { slot_title: { text: 'Eigener Titel' }, slot_button: { href: '#kaufen' } },
  };
  project.sections[1].components.push(instance);
  return { project, instance };
}

describe('Vorlagen und Instanzen', () => {
  it('übernimmt den Aufbau der Vorlage und setzt eigene Inhalte ein', () => {
    const { project, instance } = projectWithTemplate();
    const node = resolveComponent(project, instance);
    expect(node.type).toBe('card');
    expect(node.classes).toEqual(['t_root', 'c_inst']);
    expect(node.children.map((c: Component) => c.id)).toEqual(['c_inst--slot_title', 'c_inst--slot_text', 'c_inst--slot_button']);
    expect(node.children[0].text).toBe('Eigener Titel');
    expect(node.children[1].text).toBe('Kurzer Text zur Karte.');
    expect(node.children[2].href).toBe('#kaufen');
  });

  it('gibt Layoutänderungen der Vorlage an alle Instanzen weiter', () => {
    const { project } = projectWithTemplate();
    const css = renderCss(project);
    expect(css).toContain('.c.c-t_root {\n  width: 320px;');
    expect(css).toMatch(/@container \(max-width: 640px\) \{[^@]*\.c-t_root \{\s+width: 240px;/);
    // Position gehört zur Instanz
    expect(css).toContain('.c.c-c_inst {\n  left: 60%;\n  top: 30%;');
    expect(css).toMatch(/@container \(max-width: 640px\) \{[^@]*\.c-c_inst \{\s+left: 5%;/);
  });

  it('gibt freie Komponenten in einer eigenen Ebene aus, verschachtelt als echtes HTML', () => {
    const { project } = projectWithTemplate();
    const free = renderFreeLayer(project);
    expect(free).toContain('<div class="free-layer">');
    expect(free).toContain('data-anim="fade" data-in="0 0.2" data-free data-for="' + project.sections[1].id + '"');
    expect(free).toContain('<h3 class="c headline c-slot_title">Eigener Titel</h3>');
    expect(free).toContain('<a class="c button c-slot_button" href="#kaufen">Mehr erfahren</a>');
    expect(renderSections(project)).not.toContain('Eigener Titel');
  });
});

describe('Projektformat', () => {
  it('hebt Version 1 auf die aktuelle Version', () => {
    const v1 = {
      formatVersion: 1,
      name: 'Alt',
      model: { file: null, stats: null },
      base: {},
      sections: [
        {
          id: 's1',
          name: 'Start',
          height: 100,
          align: 'left',
          elements: [
            { id: 'e1', type: 'headline', text: 'Hallo' },
            { id: 'e2', type: 'button', text: 'Los', href: '#x' },
          ],
        },
      ],
      keyframes: [],
      budgets: {},
      settings: { background: '#000000', scrollSmoothing: 0 },
    };
    const project = migrateProject(v1);
    expect(project.formatVersion).toBe(5);
    expect(project.templates).toEqual([]);
    expect([project.hotspots, project.lookAts, project.follows]).toEqual([[], [], []]);
    expect(project.sections[0].components.map((c) => [c.id, c.type, c.text, c.href])).toEqual([
      ['e1', 'headline', 'Hallo', undefined],
      ['e2', 'button', 'Los', '#x'],
    ]);
    expect((project.sections[0] as any).elements).toBeUndefined();
  });

  it('gibt Text-Reveal Wort für Wort aus', () => {
    const project = createProject();
    const headline = project.sections[0].components[0];
    headline.text = 'Eins zwei drei';
    headline.animation = { type: 'reveal', in: [0, 0.5], out: null };
    const html = renderSections(project);
    expect(html).toContain('style="--n: 3"');
    expect(html).toContain('<span class="w" style="--i: 2">drei</span>');
  });
});
