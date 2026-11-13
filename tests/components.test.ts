import { describe, expect, it } from 'vitest';
import { TEXT_EDGE, animationProgress, breakpointFor, cascade, resolveFraming, textPresence } from '../src/core/components.js';
import { placementLines, renderCss, renderFontFaces, renderFreeLayer, renderSections, resolveComponent, usedImages } from '../src/export/page.js';
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
    expect(css).toContain('.c.c-c_inst {\n  left: calc(var(--wrap) + 60px + var(--dx, 0px));');
    expect(css).toMatch(/@container \(max-width: 640px\) \{[^@]*\.c-c_inst \{\s+left: calc\(var\(--wrap\) \+ 5px/);
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
    expect(project.formatVersion).toBe(8);
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

describe('Feste Texte', () => {
  it('steht im Abschnitt still und wechselt an der Abschnittsgrenze', () => {
    expect(textPresence(0.3, false, false)).toEqual({ opacity: 1, shift: 0 });
    // Ende des Abschnitts: hinaus nach oben
    const leaving = textPresence(1 - TEXT_EDGE * 1.5, false, false);
    expect(leaving.opacity).toBeGreaterThan(0);
    expect(leaving.opacity).toBeLessThan(1);
    expect(leaving.shift).toBeLessThan(0);
    expect(textPresence(1 - TEXT_EDGE, false, false).opacity).toBe(0);
    // Der nächste Text kommt erst danach von unten herein.
    const entering = textPresence(-TEXT_EDGE / 2, false, false);
    expect(entering.opacity).toBeGreaterThan(0);
    expect(entering.opacity).toBeLessThan(1);
    expect(entering.shift).toBeGreaterThan(0);
    expect(textPresence(-TEXT_EDGE, false, false).opacity).toBe(0);
  });

  it('bleibt am Seitenanfang und am Seitenende stehen', () => {
    expect(textPresence(-0.1, true, false).opacity).toBe(1);
    expect(textPresence(0.99, false, true).opacity).toBe(1);
  });

  it('ist für neue und ältere Projekte eingeschaltet', () => {
    expect(createProject().settings.textMode).toBe('pinned');
    const old = { ...createProject(), formatVersion: 6 } as Record<string, any>;
    delete old.settings.textMode;
    expect(migrateProject(old).settings.textMode).toBe('pinned');
    expect(renderCss(createProject())).toContain('Feste Texte');
    const flow = createProject();
    flow.settings.textMode = 'flow';
    expect(renderCss(flow)).not.toContain('Feste Texte');
  });
});

describe('Frei platzierte Komponenten', () => {
  it('hängen mit festen px an einem Anker des Inhaltsbereichs', () => {
    expect(placementLines({ x: 20, y: -10 })).toEqual([
      'left: calc(var(--wrap) + 20px + var(--dx, 0px));',
      'right: auto;',
      'top: calc(50% + -10px + var(--dy, 0px));',
      'bottom: auto;',
      'translate: 0 -50%;',
    ]);
    expect(placementLines({ anchorX: 'right', anchorY: 'bottom', x: -8, y: -24 })).toEqual([
      'left: auto;',
      'right: calc(var(--wrap) - -8px - var(--dx, 0px));',
      'top: auto;',
      'bottom: calc(24px - var(--dy, 0px));',
      'translate: 0 0;',
    ]);
    expect(placementLines({ anchorX: 'center', anchorY: 'top' })[0]).toBe('left: calc(50% + 0px + var(--dx, 0px));');
  });

  it('übernimmt am Breakpoint den geerbten Anker, wenn dort nur der Abstand überschrieben ist', () => {
    const project = createProject();
    const free = createComponent('headline');
    Object.assign(free, { placement: 'free', style: { anchorX: 'right', x: 0, y: 0 }, overrides: { mobile: { x: -12 } } });
    project.sections[0].components.push(free);
    const css = renderCss(project);
    const mobile = css.slice(css.lastIndexOf('@container (max-width: 640px)'));
    expect(mobile).toContain(`.c-${free.id} {\n    left: auto;\n    right: calc(var(--wrap) - -12px - var(--dx, 0px));`);
  });

  it('rechnet Positionen in Prozent aus älteren Projekten in px um', () => {
    const old = createProject() as Record<string, any>;
    old.formatVersion = 7;
    const free = createComponent('text') as Record<string, any>;
    Object.assign(free, { placement: 'free', style: { x: 50, y: 40 }, overrides: { mobile: { x: 10 } } });
    old.sections[0].components.push(free);
    const migrated = migrateProject(old).sections[0].components.at(-1)!;
    expect(migrated.style).toMatchObject({ anchorX: 'left', anchorY: 'top', x: 600, y: 324 });
    expect(migrated.overrides.mobile).toEqual({ x: 15 });
  });
});

describe('Text-Werkzeug und Layout', () => {
  it('schreibt Schrift, Zeilenabstand, Padding und Margin als CSS', () => {
    const project = createProject();
    project.fonts = [{ id: 'f1', name: 'Meine Schrift', file: 'meine.woff2' }];
    const headline = project.sections[0].components[0];
    headline.style = { fontFamily: 'font:f1', fontWeight: 700, lineHeight: 1.3, padding: [4, 8, 4, 8], margin: 12 };
    const css = renderCss(project);
    expect(css).toContain(`.c.c-${headline.id} {\n  font-family: 'Meine Schrift', system-ui`);
    expect(css).toContain('font-weight: 700;\n  line-height: 1.3;\n  padding: 4px 8px 4px 8px;\n  margin: 12px;');
    expect(renderFontFaces(project)).toContain("font-family: 'Meine Schrift';\n  src: url('fonts/meine.woff2');");
    expect(usedImages(project)).toContain('meine.woff2');
  });

  it('setzt Seitenbreite und Inhaltsbereich als Variablen', () => {
    const project = createProject();
    expect(renderCss(project)).toContain('--page-width: 100%;');
    project.settings.layout = { pageWidth: 1600, innerWidth: 1000, padding: 32 };
    const css = renderCss(project);
    expect(css).toContain('--page-width: 1600px;');
    expect(css).toContain('--inner-width: 1000px;\n  --inner-pad: 32px;\n  --wrap: max(var(--inner-pad), (100cqw - var(--inner-width)) / 2);');
  });
});
