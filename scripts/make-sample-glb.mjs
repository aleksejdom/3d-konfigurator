// Erzeugt das Beispielmodell public/sample.glb: ein einfaches Gerät aus mehreren benannten
// Bauteilen (Quader). Aufruf: node scripts/make-sample-glb.mjs

import { writeFileSync } from 'node:fs';

// Ein Einheitswürfel mit Normalen; jedes Bauteil skaliert und verschiebt ihn.
const faces = [
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
];
const positions = [];
const normals = [];
const indices = [];
faces.forEach(([normal, corners], f) => {
  for (const corner of corners) {
    positions.push(...corner.map((c) => c * 0.5));
    normals.push(...normal);
  }
  indices.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
});

const posBytes = Buffer.from(new Float32Array(positions).buffer);
const normBytes = Buffer.from(new Float32Array(normals).buffer);
const idxBytes = Buffer.from(new Uint16Array(indices).buffer);
const bin = Buffer.concat([posBytes, normBytes, idxBytes]);

const material = (name, color, metallic, roughness) => ({
  name,
  pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: metallic, roughnessFactor: roughness },
});

const parts = [
  { name: 'Gehaeuse', material: 0, translation: [0, 0, 0], scale: [1.6, 0.9, 1] },
  { name: 'Deckel', material: 1, translation: [0, 0.52, 0], scale: [1.7, 0.14, 1.1] },
  { name: 'Display', material: 2, translation: [-0.3, 0.1, 0.51], scale: [0.7, 0.4, 0.04] },
  { name: 'Drehknopf', material: 3, translation: [0.5, 0.1, 0.56], scale: [0.22, 0.22, 0.12] },
  { name: 'Fuss_links', material: 1, translation: [-0.6, -0.52, 0], scale: [0.25, 0.14, 0.8] },
  { name: 'Fuss_rechts', material: 1, translation: [0.6, -0.52, 0], scale: [0.25, 0.14, 0.8] },
];

const gltf = {
  asset: { version: '2.0', generator: '3d-konfigurator sample' },
  scene: 0,
  scenes: [{ name: 'Szene', nodes: [0] }],
  nodes: [
    { name: 'Geraet', children: parts.map((_, i) => i + 1) },
    ...parts.map((part, i) => ({ name: part.name, mesh: i, translation: part.translation, scale: part.scale })),
  ],
  meshes: parts.map((part) => ({
    name: part.name,
    primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: part.material }],
  })),
  materials: [
    material('Lack', [0.86, 0.33, 0.16], 0.1, 0.45),
    material('Metall', [0.75, 0.76, 0.78], 1, 0.3),
    material('Glas', [0.05, 0.07, 0.1], 0.2, 0.1),
    material('Gummi', [0.1, 0.1, 0.11], 0, 0.85),
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
    { buffer: 0, byteOffset: posBytes.length, byteLength: normBytes.length, target: 34962 },
    { buffer: 0, byteOffset: posBytes.length + normBytes.length, byteLength: idxBytes.length, target: 34963 },
  ],
  buffers: [{ byteLength: bin.length }],
};

const pad = (buffer, fill) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4, fill)]);
const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20);
const binary = pad(bin, 0);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binary.length, 8);
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(data.length, 0);
  head.writeUInt32LE(type, 4);
  return Buffer.concat([head, data]);
};

const out = new URL('../public/sample.glb', import.meta.url);
writeFileSync(out, Buffer.concat([header, chunk(0x4e4f534a, json), chunk(0x004e4942, binary)]));
console.log('public/sample.glb geschrieben');
