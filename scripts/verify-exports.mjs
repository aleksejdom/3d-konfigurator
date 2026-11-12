// Prüft beide Exporte: schreibt sie mit einem Beispielprojekt nach .verify/ und baut sie.
// Aufruf: npm run verify:exports

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExport } from '../src/export/exporter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const coreDir = join(root, 'src/core');
const coreSources = Object.fromEntries(readdirSync(coreDir).map((name) => [name, readFileSync(join(coreDir, name), 'utf8')]));

const none = { type: 'none', in: [0, 0.3], out: null };
const component = (id, type, extra = {}) => ({ id, type, placement: 'flow', style: {}, overrides: {}, animation: none, ...extra });

const section = (id, name, extra = []) => ({
  id,
  name,
  height: 100,
  align: 'left',
  components: [
    component(id + '_h', 'headline', { text: name, animation: { type: 'reveal', in: [0, 0.4], out: null } }),
    component(id + '_t', 'text', { text: 'Text mit {Klammern} & <Zeichen>.', animation: { type: 'slide-up', in: [0.1, 0.4], out: [0.8, 1] } }),
    component(id + '_b', 'button', { text: 'Mehr erfahren', href: '#' }),
    ...extra,
  ],
});

const project = {
  formatVersion: 4,
  name: 'Export-Test',
  model: { file: 'sample.glb', stats: null },
  base: {
    'camera.position': [1.97, 1.15, 3.32],
    'camera.target': [0, 0, 0.035],
    'camera.fov': 40,
    'keyLight.position': [3.5, 5.9, 4.7],
    'keyLight.color': '#ffffff',
    'keyLight.intensity': 1.5,
    'ambient.intensity': 0.6,
    'node:model.position': [0, 0, 0],
    'node:model.rotation': [0, 0, 0],
    'node:model.scale': [1, 1, 1],
    'lookAt:la1.target': 'pointer',
    'lookAt:la1.strength': 1,
    'option:vgA.value': 'oGriff',
    'option:vgL.value': 'oOrange',
  },
  // Konfigurator: Aufsatz als Mesh-Varianten, Lack als Material. "Signal" gibt es nur mit der Leuchte.
  variantGroups: [
    {
      id: 'vgA',
      name: 'Aufsatz',
      kind: 'mesh',
      fade: 0.2,
      resetSections: ['c'],
      options: [
        { id: 'oGriff', name: 'Griff', nodeIds: ['Geraet/Aufsatz_Griff'] },
        { id: 'oLeuchte', name: 'Leuchte', nodeIds: ['Geraet/Aufsatz_Leuchte'] },
        { id: 'oOhne', name: 'Ohne Aufsatz', nodeIds: [] },
      ],
    },
    {
      id: 'vgL',
      name: 'Lack',
      kind: 'material',
      targets: ['Geraet/Gehaeuse'],
      fade: 0.2,
      resetSections: [],
      options: [
        { id: 'oOrange', name: 'Orange' },
        { id: 'oBlau', name: 'Blau', color: '#2f6fed' },
        { id: 'oSignal', name: 'Signalgelb', material: 'Signal', requires: [{ groupId: 'vgA', optionId: 'oLeuchte' }] },
      ],
    },
  ],
  meshActions: [{ nodeId: 'Geraet/Drehknopf', action: { type: 'clip', clip: 'Knopf drehen', mode: 'toggle' } }],
  hotspots: [
    {
      id: 'hs1',
      name: 'Drehknopf',
      label: 'Drehknopf',
      nodeId: 'Geraet/Drehknopf',
      position: [0, 0, 0.5],
      normal: [0, 0, 1],
      sectionId: null,
      views: { desktop: { position: [1.5, 1, 9], target: [0, 0, 0] } },
      duration: 0.3,
      easing: 'easeInOut',
      onScroll: 'return',
    },
  ],
  lookAts: [
    { id: 'la1', subject: 'node:Geraet/Deckel', forward: '+z', yaw: true, pitch: true, maxYaw: 30, maxPitch: 20, damping: 0.5, touch: 'drag' },
  ],
  follows: [{ id: 'fo1', subject: 'node:Geraet/Display', x: true, y: true, distance: 0.1, damping: 0.5, returns: true, touch: 'off' }],
  sections: [
    section('a', 'Start'),
    section('b', 'Details', [
      {
        id: 'inst1',
        type: 'instance',
        templateId: 'tpl1',
        placement: 'free',
        style: { x: 62, y: 28 },
        overrides: { mobile: { x: 6, y: 58 } },
        animation: { type: 'fade', in: [0, 0.15], out: [0.85, 1] },
        content: { slot_h: { text: 'Karte im Abschnitt Details' } },
      },
      component('b_slider', 'slider', { groupId: 'vgA' }),
      component('b_select', 'select', { groupId: 'vgL' }),
      component('b_blau', 'button', { text: 'Blau', action: { type: 'select', groupId: 'vgL', optionId: 'oBlau' } }),
      component('b_signal', 'button', { text: 'Signalgelb', action: { type: 'select', groupId: 'vgL', optionId: 'oSignal' } }),
      component('b_reset', 'button', { text: 'Zurücksetzen', action: { type: 'reset', groupId: null } }),
    ]),
    section('c', 'Abschluss', [
      component('c_go', 'button', { text: 'Zum Drehknopf', action: { type: 'hotspot', hotspotId: 'hs1' } }),
      component('c_info', 'infobox', {
        placement: 'hotspot',
        hotspotId: 'hs1',
        anchorMode: 'open',
        children: [component('c_info_h', 'headline', { text: 'Drehknopf' }), component('c_info_x', 'button', { text: 'Schließen', action: { type: 'close' } })],
      }),
    ]),
  ],
  keyframes: [
    {
      id: 'k1',
      sectionId: 'b',
      t: 0.5,
      values: {
        'camera.position': { value: [-1.2, 0.4, 1.6], scope: 'local' },
        'keyLight.color': { value: '#ff9a3c', scope: 'inherit' },
      },
    },
    { id: 'k4', sectionId: 'c', t: 0.3, values: { 'option:vgA.value': { value: 'oOhne', scope: 'inherit', transition: 0.2 } } },
    { id: 'k3', sectionId: 'c', t: 0.5, values: { 'lookAt:la1.target': { value: 'camera', scope: 'inherit' } } },
    { id: 'k2', sectionId: 'c', t: 1, values: { 'node:model.rotation': { value: [0, 6.2832, 0], scope: 'inherit' } } },
  ],
  templates: [
    {
      id: 'tpl1',
      name: 'Produktkarte',
      root: component('tpl1_root', 'card', {
        style: { width: 300 },
        overrides: { mobile: { width: 220 } },
        children: [
          component('slot_h', 'headline', { text: 'Kartentitel' }),
          component('slot_t', 'text', { text: 'Kurzer Text.', overrides: { mobile: { visible: false } } }),
          component('slot_b', 'button', { text: 'Ansehen', href: '#' }),
        ],
      }),
    },
  ],
  framing: { desktop: { shiftX: 12 }, tablet: {}, mobile: { shiftX: 0, shiftY: -12, zoom: 0.8 } },
  budgets: {},
  settings: { background: '#14161a', scrollSmoothing: 0 },
};

for (const target of ['vanilla', 'astro']) {
  const out = join(root, '.verify', target);
  rmSync(out, { recursive: true, force: true });
  const { files, modelPath } = buildExport(project, target, coreSources);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), content);
  }
  mkdirSync(dirname(join(out, modelPath)), { recursive: true });
  writeFileSync(join(out, modelPath), readFileSync(join(root, 'public/sample.glb')));
  console.log(`\n== ${target}: npm install && npm run build ==`);
  execSync('npm install --no-audit --no-fund && npm run build', { cwd: out, stdio: 'inherit' });
}
console.log('\nBeide Exporte wurden gebaut.');
