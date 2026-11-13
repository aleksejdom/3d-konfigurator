// Prüft beide Exporte: schreibt sie mit einem Beispielprojekt nach .verify/ und baut sie.
// Aufruf: npm run verify:exports

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExport, buildOfflineAssets } from '../src/export/exporter.js';

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
  formatVersion: 7,
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
    // Animationsclip an die Timeline gebunden
    'clip:Knopf drehen.time': 0,
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
  // Digitaler Zwilling: Status färbt das Display, Drehzahl und Temperatur als Messwerte mit Grenzwerten.
  data: {
    source: { mode: 'test', url: '', interval: 2, staleAfter: 5 },
    levelColors: { ok: '#3ecf8e', warn: '#f5a623', alarm: '#e5484d', off: '#8b9099' },
    fields: [
      {
        id: 'fStatus',
        label: 'Betriebsstatus',
        key: 'motor.status',
        type: 'status',
        states: [
          { value: 'running', label: 'In Betrieb', level: 'ok' },
          { value: 'warning', label: 'Warnung', level: 'warn' },
          { value: 'error', label: 'Störung', level: 'alarm' },
        ],
        test: 'running',
      },
      { id: 'fRpm', label: 'Drehzahl', key: 'motor.rpm', type: 'number', unit: 'U/min', decimals: 0, limits: {}, test: 1480 },
      { id: 'fTemp', label: 'Temperatur', key: 'motor.temperature', type: 'number', unit: '°C', decimals: 1, limits: { warnAbove: 70, alarmAbove: 85 }, test: 62.5 },
    ],
    bindings: [
      { id: 'b1', fieldId: 'fStatus', kind: 'color', nodeIds: ['Geraet/Display'] },
    ],
  },
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
    section('a', 'Start', [
      component('a_card', 'card', {
        fieldId: 'fStatus',
        children: [
          component('a_status', 'status', { fieldId: 'fStatus' }),
          component('a_rpm', 'value', { fieldId: 'fRpm' }),
          component('a_temp', 'value', { fieldId: 'fTemp' }),
          component('a_conn', 'connection', {}),
        ],
      }),
    ]),
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
    { id: 'k5', sectionId: 'b', t: 1, values: { 'clip:Knopf drehen.time': { value: 0.5, scope: 'inherit' } } },
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
  settings: {
    background: '#14161a',
    scrollSmoothing: 0,
    textMode: 'pinned',
    environment: { file: 'himmel.hdr', showBackground: true, rotation: 40, backgroundIntensity: 1, backgroundBlur: 0.3 },
    poster: 'poster.png',
    reducedMotion: 'respect',
  },
};

/** Ein kleines HDRI (Radiance .hdr, unkomprimiert): heller Himmel oben, dunkler Boden unten. */
function makeHdr(width = 64, height = 32) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sky = y < height / 2;
      const color = sky ? [0.6, 0.9, 1.8] : [0.25, 0.2, 0.15];
      const exponent = Math.ceil(Math.log2(Math.max(...color)));
      const scale = 256 / 2 ** exponent;
      pixels.set([...color.map((c) => Math.min(255, Math.floor(c * scale))), exponent + 128], (y * width + x) * 4);
    }
  }
  return Buffer.concat([Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`), pixels]);
}

/** 1 × 1 Pixel als PNG, Platzhalter für das Posterbild. */
const POSTER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function binary(kind, name) {
  if (kind === 'model' || kind === 'resource') return readFileSync(join(root, 'public', name));
  if (kind === 'env') return makeHdr();
  if (kind === 'draco') return readFileSync(join(root, 'public/draco', name));
  if (kind === 'runtime') return readFileSync(join(root, 'public/runtime', name));
  return POSTER;
}

for (const target of ['vanilla', 'astro']) {
  const out = join(root, '.verify', target);
  rmSync(out, { recursive: true, force: true });
  const { files, binaries } = buildExport(project, target, coreSources);
  const offline = {};
  for (const entry of binaries) {
    const data = binary(entry.kind, entry.name);
    files[entry.path] = data;
    if (entry.offline) offline[entry.path] = new Uint8Array(data);
  }
  // Der HTML-Export bettet Modell und Umgebung zusätzlich ein, damit er per Doppelklick läuft.
  if (target === 'vanilla') files['offline-assets.js'] = buildOfflineAssets(offline);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), content);
  }
  if (target === 'vanilla') {
    // Läuft ohne Installation. Geprüft wird zusätzlich, dass sich die Laufzeit aus dem Quellcode neu bauen lässt.
    console.log('\n== vanilla: Laufzeit aus source/ neu bauen ==');
    rmSync(join(out, 'runtime/player.js'));
    execSync('npm install --no-audit --no-fund && npm run build', { cwd: join(out, 'source'), stdio: 'inherit' });
    readFileSync(join(out, 'runtime/player.js'));
  } else {
    console.log('\n== astro: npm install && npm run build ==');
    execSync('npm install --no-audit --no-fund && npm run build', { cwd: out, stdio: 'inherit' });
  }
}
console.log('\nBeide Exporte wurden gebaut.');
