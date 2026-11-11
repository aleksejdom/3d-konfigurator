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

const section = (id, name) => ({
  id,
  name,
  height: 100,
  align: 'left',
  elements: [
    { id: id + '_h', type: 'headline', text: name },
    { id: id + '_t', type: 'text', text: 'Text mit {Klammern} & <Zeichen>.' },
    { id: id + '_b', type: 'button', text: 'Mehr erfahren', href: '#' },
  ],
});

const project = {
  formatVersion: 1,
  name: 'Export-Test',
  model: { file: 'sample.glb', stats: null },
  base: {
    'camera.position': [1.97, 1.15, 3.32],
    'camera.target': [0, 0, 0.035],
    'camera.fov': 40,
    'keyLight.position': [3.5, 5.9, 4.7],
    'keyLight.color': '#ffffff',
    'keyLight.intensity': 2,
    'ambient.intensity': 1,
    'node:model.position': [0, 0, 0],
    'node:model.rotation': [0, 0, 0],
    'node:model.scale': [1, 1, 1],
  },
  sections: [section('a', 'Start'), section('b', 'Details'), section('c', 'Abschluss')],
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
    { id: 'k2', sectionId: 'c', t: 1, values: { 'node:model.rotation': { value: [0, 6.2832, 0], scope: 'inherit' } } },
  ],
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
