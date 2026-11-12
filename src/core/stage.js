// Die 3D-Bühne: Renderer, Kamera, Licht und Modell.
// applyState() überträgt einen von der Timeline berechneten Zustand auf die Szene.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  camera.position.set(0, 0, 5);

  // Umgebungslicht: eine neutrale Studio-Umgebung, die auch Metall und Glas Reflexionen gibt.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(3, 5, 4);
  scene.environmentIntensity = 0.6;
  scene.add(keyLight);

  // Alle importierten Bauteile hängen unter dieser Gruppe. Sie hat die ID "model".
  const model = new THREE.Group();
  model.name = 'model';
  scene.add(model);

  return {
    renderer,
    scene,
    camera,
    /** Blickziel der Kamera */
    target: new THREE.Vector3(),
    keyLight,
    model,
    /** Stabile ID -> Object3D */
    nodes: new Map([['model', model]]),
    /** Kugel um das geladene Modell, für Kameraabstand und Hilfslinien */
    bounds: new THREE.Sphere(new THREE.Vector3(), 1),
    /** Werte ohne eigenes 3D-Objekt, etwa Ziel und Stärke von Look At ("lookAt:<ID>.target") */
    params: {},
    /** Kameraausschnitt des aktuellen Breakpoints */
    framing: { zoom: 1, shiftX: 0, shiftY: 0 },
  };
}

export function resizeStage(stage, width, height) {
  stage.renderer.setSize(width, height, false);
  stage.camera.aspect = width / Math.max(1, height);
  applyFraming(stage, stage.framing);
}

/**
 * Kameraausschnitt setzen: Zoom und Verschiebung des Bildes in Prozent des Fensters.
 * Position und Blickziel der Kamera bleiben unverändert, die Timeline rechnet also für
 * alle Breakpoints mit denselben Werten.
 */
export function applyFraming(stage, framing) {
  stage.framing = framing;
  const size = stage.renderer.getSize(new THREE.Vector2());
  stage.camera.zoom = framing.zoom;
  if (framing.shiftX || framing.shiftY) {
    stage.camera.setViewOffset(
      size.x,
      size.y,
      (-framing.shiftX / 100) * size.x,
      (-framing.shiftY / 100) * size.y,
      size.x,
      size.y,
    );
  } else {
    stage.camera.clearViewOffset();
  }
  stage.camera.updateProjectionMatrix();
}

export function renderStage(stage) {
  stage.renderer.render(stage.scene, stage.camera);
}

export function setBackground(stage, color) {
  stage.scene.background = new THREE.Color(color);
}

// ---------- Modell laden ----------

/**
 * Vergibt stabile IDs aus den Bauteilnamen, z. B. "Gehaeuse/Deckel".
 * Gleiche Namen auf einer Ebene bekommen ein Suffix (~2, ~3 ...).
 */
function indexNodes(stage, root) {
  stage.nodes = new Map([['model', stage.model]]);
  const visit = (object, parentId) => {
    const used = new Map();
    object.children.forEach((child, i) => {
      const name = (child.name || `${child.type}_${i}`).replace(/\//g, '_');
      const count = (used.get(name) || 0) + 1;
      used.set(name, count);
      const id = (parentId ? parentId + '/' : '') + (count > 1 ? `${name}~${count}` : name);
      child.userData.nodeId = id;
      stage.nodes.set(id, child);
      visit(child, id);
    });
  };
  visit(root, '');
}

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'];

function collectStats(root, fileSize) {
  let triangles = 0;
  let meshes = 0;
  const materials = new Set();
  const textures = new Map();

  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry;
    const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    triangles += Math.floor(count / 3);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const slot of TEXTURE_SLOTS) {
        const texture = material[slot];
        if (texture && texture.image && !textures.has(texture)) {
          textures.set(texture, {
            name: texture.name || `${material.name || 'Material'} · ${slot}`,
            width: texture.image.width || 0,
            height: texture.image.height || 0,
          });
        }
      }
    }
  });

  return { fileSize, triangles, meshes, materials: materials.size, textures: [...textures.values()] };
}

/**
 * Lädt ein GLB (oder ein glTF mit eingebetteten Daten) aus einem ArrayBuffer.
 * @returns {Promise<import('./types').ModelStats>}
 */
export function loadModel(stage, buffer) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      '',
      (gltf) => {
        stage.model.clear();
        stage.model.add(gltf.scene);
        indexNodes(stage, gltf.scene);

        const box = new THREE.Box3().setFromObject(gltf.scene);
        if (!box.isEmpty()) box.getBoundingSphere(stage.bounds);
        const radius = Math.max(stage.bounds.radius, 0.001);
        stage.camera.near = radius / 100;
        stage.camera.far = radius * 200;
        stage.camera.updateProjectionMatrix();

        resolve(collectStats(gltf.scene, buffer.byteLength));
      },
      reject,
    );
  });
}

// ---------- Zustand lesen und schreiben ----------

function splitProp(prop) {
  const dot = prop.lastIndexOf('.');
  return [prop.slice(0, dot), prop.slice(dot + 1)];
}

function resolveTarget(stage, target) {
  if (target === 'camera') return stage.camera;
  if (target === 'keyLight') return stage.keyLight;
  if (target.startsWith('node:')) return stage.nodes.get(target.slice(5));
  return undefined;
}

/** Überträgt einen Zustand (Eigenschaftsname -> Wert) auf die Szene. */
export function applyState(stage, state) {
  for (const prop in state) {
    const value = state[prop];
    const [target, field] = splitProp(prop);
    if (target === 'ambient') {
      stage.scene.environmentIntensity = value;
      continue;
    }
    if (target.startsWith('lookAt:')) {
      stage.params[prop] = value;
      continue;
    }
    const object = resolveTarget(stage, target);
    if (!object) continue;

    if (target === 'camera' && field === 'target') stage.target.fromArray(value);
    else if (field === 'position' || field === 'scale') object[field].fromArray(value);
    else if (field === 'rotation') object.rotation.set(value[0], value[1], value[2]);
    else if (field === 'color') object.color.set(value);
    else object[field] = value; // fov, intensity
  }
  stage.camera.lookAt(stage.target);
  stage.camera.updateProjectionMatrix();
}

/** Liest den aktuellen Wert einer Eigenschaft aus der Szene. */
export function readProp(stage, prop) {
  const [target, field] = splitProp(prop);
  if (target === 'ambient') return stage.scene.environmentIntensity;
  if (target.startsWith('lookAt:')) {
    const value = stage.params[prop];
    // Mitten in einem Übergang zwischen zwei Zielen gilt das mit dem größeren Gewicht.
    if (value && typeof value === 'object') return Object.keys(value).sort((a, b) => value[b] - value[a])[0];
    return value;
  }
  const object = resolveTarget(stage, target);
  if (!object) return undefined;

  if (target === 'camera' && field === 'target') return stage.target.toArray();
  if (field === 'position' || field === 'scale') return object[field].toArray();
  if (field === 'rotation') return [object.rotation.x, object.rotation.y, object.rotation.z];
  if (field === 'color') return '#' + object.color.getHexString();
  return object[field];
}

/** Die Eigenschaften, die jede Szene hat. Bauteile kommen als "node:<ID>.position" usw. dazu. */
export const SCENE_PROPS = [
  'camera.position',
  'camera.target',
  'camera.fov',
  'keyLight.position',
  'keyLight.color',
  'keyLight.intensity',
  'ambient.intensity',
  'node:model.position',
  'node:model.rotation',
  'node:model.scale',
];

export const NODE_FIELDS = ['position', 'rotation', 'scale'];

/**
 * Ausgangszustand nach dem Import: Kamera so, dass das Modell ganz zu sehen ist.
 * @returns {Record<string, import('./types').Value>}
 */
export function defaultBase(stage) {
  const { center, radius } = stage.bounds;
  const distance = radius / Math.sin((40 * Math.PI) / 360) * 1.15;
  const direction = new THREE.Vector3(0.6, 0.35, 1).normalize();
  return {
    'camera.position': center.clone().addScaledVector(direction, distance).toArray(),
    'camera.target': center.toArray(),
    'camera.fov': 40,
    'keyLight.position': [radius * 3, radius * 5, radius * 4],
    'keyLight.color': '#ffffff',
    'keyLight.intensity': 1.5,
    'ambient.intensity': 0.6,
    'node:model.position': [0, 0, 0],
    'node:model.rotation': [0, 0, 0],
    'node:model.scale': [1, 1, 1],
  };
}
