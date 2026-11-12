import { describe, expect, it } from 'vitest';
import { bindComponents } from '../src/core/components.js';
import { evaluate } from '../src/core/timeline.js';
import { buildExport } from '../src/export/exporter.js';
import { createProject, migrateProject } from '../src/editor/project';
import { propGroups } from '../src/editor/labels';

describe('Projektformat', () => {
  it('öffnet Projekte der Version 5 mit Standardwerten für Umgebung, Poster und reduzierte Bewegung', () => {
    const old = { ...createProject(), formatVersion: 5, settings: { background: '#101010', scrollSmoothing: 0.2 } } as Record<string, unknown>;
    const project = migrateProject(old);
    expect(project.formatVersion).toBe(6);
    expect(project.settings.background).toBe('#101010');
    expect(project.settings.environment).toEqual({ file: null, showBackground: false, rotation: 0, backgroundIntensity: 1, backgroundBlur: 0 });
    expect(project.settings.poster).toBeNull();
    expect(project.settings.reducedMotion).toBe('respect');
  });
});

describe('Export', () => {
  const project = createProject();
  project.model = { file: 'maschine.gltf', resources: ['maschine.bin', 'textures/lack.png'], stats: { fileSize: 1, triangles: 1, meshes: 1, materials: 1, textures: [], draco: true } };
  project.settings.environment.file = 'studio.hdr';
  project.settings.poster = 'poster.jpg';
  const { files, binaries } = buildExport(project, 'vanilla', {});
  const paths = binaries.map((entry) => entry.path);

  it('legt Modell, Begleitdateien, Umgebung, Poster und Draco-Decoder an ihren Platz', () => {
    expect(paths).toEqual(
      expect.arrayContaining([
        'public/model/maschine.gltf',
        'public/model/maschine.bin',
        'public/model/textures/lack.png',
        'public/env/studio.hdr',
        'public/images/poster.jpg',
        'public/draco/draco_decoder.wasm',
        'public/draco/draco_wasm_wrapper.js',
      ]),
    );
  });

  it('verweist in der Seite auf Umgebung und Posterbild', () => {
    expect(files['index.html']).toContain('data-env="env/studio.hdr"');
    expect(files['index.html']).toContain('<img class="poster" src="images/poster.jpg" alt="">');
    expect(files['src/main.js']).toContain('envUrl: canvas.dataset.env');
  });

  it('gibt den Draco-Decoder nur mit, wenn das Modell ihn braucht', () => {
    project.model.stats!.draco = false;
    expect(buildExport(project, 'astro', {}).binaries.some((entry) => entry.kind === 'draco')).toBe(false);
  });
});

describe('Animationsclip in der Timeline', () => {
  const project = createProject();
  const [first, second] = project.sections;
  project.base['clip:Tür öffnen.time'] = 0;
  project.keyframes = [{ id: 'k', sectionId: second.id, t: 0, values: { 'clip:Tür öffnen.time': { value: 1, scope: 'inherit' } } }];

  it('läuft mit der Scrollposition vor und zurück', () => {
    const at = (pos: number) => evaluate(project, pos)['clip:Tür öffnen.time'] as number;
    expect(at(0)).toBe(0);
    expect(at(0.5)).toBeGreaterThan(0);
    expect(at(0.5)).toBeLessThan(1);
    expect(at(1)).toBe(1);
    expect(at(0.5)).toBe(evaluate(project, 0.5)['clip:Tür öffnen.time']);
    expect(first.id).not.toBe(second.id);
  });

  it('erscheint als eigene Gruppe im Merken-Dialog', () => {
    expect(propGroups(project, {}).map((group) => group.label)).toContain('Animation Tür öffnen');
  });
});

describe('Reduzierte Bewegung', () => {
  it('zeigt Komponenten ohne Einblendung', () => {
    const styles: Record<string, string> = {};
    const element = {
      dataset: { anim: 'fade', in: '0.2,0.6', for: 'a' },
      closest: () => null,
      style: { setProperty: (name: string, value: string) => (styles[name] = value), visibility: '' },
    };
    const root = { querySelectorAll: () => [element] } as unknown as Document;
    bindComponents(root, ['a'])(0.1);
    expect(styles['--u']).toBe('0');
    bindComponents(root, ['a'], { reduced: true })(0.1);
    expect(styles['--u']).toBe('1');
  });
});
