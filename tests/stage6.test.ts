import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { updateClips } from '../src/core/stage.js';
import { bindComponents } from '../src/core/components.js';
import { evaluate } from '../src/core/timeline.js';
import { buildExport, buildOfflineAssets } from '../src/export/exporter.js';
import { createProject, migrateProject } from '../src/editor/project';
import { propGroups } from '../src/editor/labels';

describe('Projektformat', () => {
  it('öffnet Projekte der Version 5 mit Standardwerten für Umgebung, Poster und reduzierte Bewegung', () => {
    const old = { ...createProject(), formatVersion: 5, settings: { background: '#101010', scrollSmoothing: 0.2 } } as Record<string, unknown>;
    const project = migrateProject(old);
    expect(project.formatVersion).toBe(7);
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
        'model/maschine.gltf',
        'model/maschine.bin',
        'model/textures/lack.png',
        'env/studio.hdr',
        'images/poster.jpg',
        'draco/draco_decoder.wasm',
        'draco/draco_wasm_wrapper.js',
        'runtime/player.js',
      ]),
    );
  });

  it('verweist in der Seite auf Umgebung und Posterbild', () => {
    expect(files['index.html']).toContain('data-env="env/studio.hdr"');
    expect(files['index.html']).toContain('<img class="poster" src="images/poster.jpg" alt="">');
  });

  it('läuft ohne Installation und ohne Module: klassische Skripte, Projekt als Skript, Quellcode liegt bei', () => {
    expect(files['index.html']).not.toContain('type="module"');
    expect(files['index.html']).toContain('<script src="runtime/player.js"></script>');
    expect(files['project.js']).toContain('window.SCENE_PROJECT = {');
    expect(files['source/package.json']).toBeDefined();
    expect(files['source/vite.config.js']).toContain("formats: ['iife']");
    expect(binaries.filter((entry) => entry.offline).map((entry) => entry.kind)).toEqual(expect.arrayContaining(['model', 'resource', 'env']));
    expect(binaries.find((entry) => entry.kind === 'runtime')?.offline).toBeFalsy();
  });

  it('bettet Modell und Umgebung für den Start per Doppelklick ein', () => {
    const script = buildOfflineAssets({ 'model/a.glb': new Uint8Array([1, 2, 3]) });
    expect(script).toContain('window.SCENE_FILES');
    expect(script).toContain('"model/a.glb": "AQID"');
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

describe('Animationen je Abschnitt', () => {
  const clip = new THREE.AnimationClip('Tür', 2, [new THREE.NumberKeyframeTrack('.position[x]', [0, 2], [0, 2])]);
  const make = () => {
    const root = new THREE.Object3D();
    return { root, mixer: new THREE.AnimationMixer(root), clips: [clip], params: {} } as never as Parameters<typeof updateClips>[0] & { root: THREE.Object3D };
  };
  const project = createProject();
  project.sections[0].clips = [{ clip: '*', mode: 'loop' }];
  project.sections[1].clips = [{ clip: 'Tür', mode: 'scroll' }];

  it('spielt im Abschnitt in Schleife und meldet, dass weiter gerendert werden muss', () => {
    const stage = make();
    expect(updateClips(stage, project, 0.2, 0)).toBe(true);
    updateClips(stage, project, 0.2, 0.5);
    expect(stage.root.position.x).toBeCloseTo(0.5);
    updateClips(stage, project, 0.3, 2);
    expect(stage.root.position.x).toBeCloseTo(0.5);
  });

  it('folgt mit „Mit dem Scrollen“ der Position im Abschnitt, vor und zurück', () => {
    const stage = make();
    expect(updateClips(stage, project, 1.25, 0.3)).toBe(false);
    expect(stage.root.position.x).toBeCloseTo(0.5);
    updateClips(stage, project, 1.75, 0.3);
    expect(stage.root.position.x).toBeCloseTo(1.5);
    updateClips(stage, project, 1.25, 0.3);
    expect(stage.root.position.x).toBeCloseTo(0.5);
  });

  it('stellt das Modell zurück, wenn der Abschnitt keine Animation hat', () => {
    const stage = make();
    updateClips(stage, project, 1.5, 0);
    updateClips(stage, project, 2.5, 0);
    expect(stage.root.position.x).toBe(0);
  });
});
