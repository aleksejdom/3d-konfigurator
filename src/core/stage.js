// Die 3D-Bühne: Renderer, Kamera, Licht und Modell.
// applyState() überträgt einen von der Timeline berechneten Zustand auf die Szene.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  camera.position.set(0, 0, 5);

  // Umgebungslicht: eine neutrale Studio-Umgebung, die auch Metall und Glas Reflexionen gibt.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studioEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = studioEnvironment;
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
    /** Ausgangslage der Bauteile im geladenen Modell und die angelegten Gruppen, siehe applyHierarchy() */
    /** @type {Map<string, any> | null} */
    originals: null,
    /** @type {Map<string, any>} */
    groups: new Map(),
    /** Zusätzliche Lichter des Projekts: ID -> THREE.Light, siehe syncLights() */
    /** @type {Map<string, any>} */
    lights: new Map(),
    model,
    /** Stabile ID -> Object3D */
    nodes: new Map([['model', model]]),
    /** Kugel um das geladene Modell, für Kameraabstand und Hilfslinien */
    bounds: new THREE.Sphere(new THREE.Vector3(), 1),
    /** Werte ohne eigenes 3D-Objekt: Ziel und Stärke von Look At ("lookAt:<ID>.target"), Wahl einer Variantengruppe ("option:<ID>.value") */
    /** @type {Record<string, any>} */
    params: {},
    studioEnvironment,
    /** Geladenes HDRI oder Panorama, sonst null */
    /** @type {THREE.Texture | null} */
    environmentTexture: null,
    /** Animationsclips des geladenen Modells und ihr Abspieler */
    /** @type {THREE.AnimationClip[]} */
    clips: [],
    /** @type {THREE.AnimationMixer | null} */
    mixer: null,
    /** Kameraausschnitt des aktuellen Breakpoints */
    framing: { zoom: 1, shiftX: 0, shiftY: 0 },
  };
}

// ---------- Gruppen und Eltern-Kind-Beziehungen ----------

/** ID des Bauteils, unter dem ein Objekt hängt ("model" für die oberste Ebene). */
export function parentId(object) {
  for (let parent = object.parent; parent; parent = parent.parent) {
    if (parent.userData.nodeId) return parent.userData.nodeId;
    if (parent.name === 'model') return 'model';
  }
  return 'model';
}

/**
 * Baut die Hierarchie des Projekts auf dem geladenen Modell auf: legt Gruppen an und hängt Bauteile um.
 * Kinder folgen danach jeder Bewegung, Drehung und Skalierung ihres Elternteils.
 * Der Aufbau beginnt immer bei der Ausgangslage des Modells, damit Editor, Vorschau und Export
 * dieselben Werte erhalten. Bauteile behalten beim Umhängen ihren Platz in der Szene.
 * @param {import('./types').Hierarchy | undefined} hierarchy
 */
export function applyHierarchy(stage, hierarchy) {
  const { groups = [], parents = {} } = hierarchy || {};
  if (!stage.originals) {
    stage.originals = new Map();
    for (const [id, object] of stage.nodes) {
      if (id === 'model') continue;
      stage.originals.set(id, { parent: object.parent, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() });
    }
  }
  // 1. Zurück zur Ausgangslage
  for (const [id, original] of stage.originals) {
    const object = stage.nodes.get(id);
    if (!object) continue;
    original.parent.add(object);
    object.position.copy(original.position);
    object.quaternion.copy(original.quaternion);
    object.scale.copy(original.scale);
  }
  for (const [id, group] of stage.groups) {
    group.removeFromParent();
    stage.nodes.delete(id);
  }
  stage.groups = new Map();

  // 2. Gruppen anlegen. Ihre Position ist der Drehpunkt der Gruppe.
  for (const entry of groups) {
    const group = new THREE.Group();
    group.name = entry.name;
    group.userData = { nodeId: entry.id, isGroup: true };
    stage.groups.set(entry.id, group);
    stage.nodes.set(entry.id, group);
  }
  for (const entry of groups) {
    const group = stage.groups.get(entry.id);
    (stage.nodes.get(entry.parent) || stage.model).add(group);
    group.position.fromArray(entry.position);
  }

  // 3. Bauteile umhängen, ohne dass sie ihren Platz in der Szene verlassen.
  const inside = (object, ancestor) => {
    for (let o = object; o; o = o.parent) if (o === ancestor) return true;
    return false;
  };
  for (const [childId, targetId] of Object.entries(parents)) {
    const child = stage.nodes.get(childId);
    const target = stage.nodes.get(targetId);
    if (!child || !target || child === stage.model || inside(target, child)) continue;
    target.attach(child);
  }
  stage.model.updateMatrixWorld(true);
}

// ---------- Zusätzliche Lichter ----------

export const LIGHT_FIELDS = {
  spot: ['position', 'target', 'color', 'intensity', 'angle', 'penumbra', 'distance'],
  area: ['position', 'target', 'color', 'intensity', 'width', 'height'],
  point: ['position', 'color', 'intensity', 'distance'],
};

export const lightProps = (light) => LIGHT_FIELDS[light.type].map((field) => `light:${light.id}.${field}`);

/**
 * Ausgangswerte eines neuen Lichts, passend zur Größe des Modells.
 * @param {'spot' | 'area' | 'point'} type
 * @returns {Record<string, any>} Feld -> Wert
 */
export function lightDefaults(stage, type) {
  const { center, radius } = stage.bounds;
  // Jede Art beginnt an einer anderen Stelle, damit neue Lichter nicht aufeinander liegen.
  const offset = { spot: [0.9, 0.9, 0.9], area: [-1, 0.5, 0.8], point: [0, 0.9, 1.1] }[type];
  const position = center.toArray().map((n, i) => Math.round((n + offset[i] * radius) * 100) / 100);
  const common = { position, color: '#ffffff' };
  if (type === 'spot') return { ...common, target: center.toArray(), intensity: Math.round(20 * radius * radius * 10) / 10, angle: 45, penumbra: 0.4, distance: 0 };
  if (type === 'area') return { ...common, target: center.toArray(), intensity: 12, width: Math.round(radius * 100) / 100, height: Math.round(radius * 100) / 100 };
  return { ...common, intensity: Math.round(12 * radius * radius * 10) / 10, distance: 0 };
}

let areaLightsReady = false;

/**
 * Legt die Lichter des Projekts in der Szene an und entfernt gelöschte.
 * Ihre Werte kommen danach über applyState() aus der Timeline.
 * @param {import('./types').Project} project
 */
export function syncLights(stage, project) {
  const wanted = new Map((project.lights || []).map((light) => [light.id, light]));
  for (const [id, object] of stage.lights) {
    if (wanted.has(id) && object.userData.type === wanted.get(id).type) continue;
    stage.scene.remove(object);
    if (object.target && object.target.parent) stage.scene.remove(object.target);
    object.dispose?.();
    stage.lights.delete(id);
  }
  for (const [id, light] of wanted) {
    if (stage.lights.has(id)) continue;
    let object;
    if (light.type === 'spot') {
      object = new THREE.SpotLight(0xffffff, 1);
      stage.scene.add(object.target);
    } else if (light.type === 'area') {
      if (!areaLightsReady) {
        RectAreaLightUniformsLib.init();
        areaLightsReady = true;
      }
      object = new THREE.RectAreaLight(0xffffff, 1, 1, 1);
    } else {
      object = new THREE.PointLight(0xffffff, 1);
    }
    object.userData = { type: light.type, lightId: id, target: new THREE.Vector3() };
    stage.scene.add(object);
    stage.lights.set(id, object);
  }
}

function applyLightField(light, field, value) {
  if (field === 'position') light.position.fromArray(value);
  else if (field === 'target') {
    light.userData.target.fromArray(value);
    if (light.target) light.target.position.fromArray(value);
  } else if (field === 'color') light.color.set(value);
  else if (field === 'angle') light.angle = (value * Math.PI) / 360;
  else light[field] = value; // intensity, penumbra, distance, width, height
}

function readLightField(light, field) {
  if (field === 'position') return light.position.toArray();
  if (field === 'target') return light.userData.target.toArray();
  if (field === 'color') return '#' + light.color.getHexString();
  if (field === 'angle') return (light.angle * 360) / Math.PI;
  return light[field];
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

/**
 * Lädt ein HDRI (.hdr) oder ein Panoramabild als Umgebung. Ohne Adresse gilt wieder die Studio-Umgebung.
 * @param {string | null} url
 * @param {string} [name] Dateiname, falls die Adresse keine Endung hat (Blob-Adresse)
 */
export async function loadEnvironment(stage, url, name = url || '') {
  if (stage.environmentTexture) stage.environmentTexture.dispose();
  stage.environmentTexture = null;
  if (!url) return;
  let texture;
  if (/\.hdr$/i.test(name)) {
    texture = await new HDRLoader().loadAsync(url);
  } else {
    // Über fetch statt über ein <img>, damit das Panorama auch beim Öffnen per Doppelklick nutzbar ist.
    const bitmap = await new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' }).loadAsync(url);
    texture = new THREE.CanvasTexture(bitmap);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.mapping = THREE.EquirectangularReflectionMapping;
  stage.environmentTexture = texture;
}

/**
 * Überträgt Hintergrund und Umgebung aus den Projekteinstellungen auf die Szene.
 * Beleuchtung, Hintergrund und Ausrichtung sind getrennt einstellbar.
 * @param {import('./types').Project['settings']} settings
 */
export function applyEnvironment(stage, settings) {
  const environment = settings.environment;
  const texture = stage.environmentTexture;
  stage.scene.environment = texture || stage.studioEnvironment;
  const rotation = texture ? (environment.rotation * Math.PI) / 180 : 0;
  stage.scene.environmentRotation.set(0, rotation, 0);
  stage.scene.backgroundRotation.set(0, rotation, 0);
  if (texture && environment.showBackground) {
    stage.scene.background = texture;
    stage.scene.backgroundIntensity = environment.backgroundIntensity;
    stage.scene.backgroundBlurriness = environment.backgroundBlur;
  } else {
    setBackground(stage, settings.background);
  }
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

  const materialNames = [...new Set([...materials].map((material) => material.name).filter(Boolean))];
  return { fileSize, triangles, meshes, materials: materials.size, materialNames, textures: [...textures.values()] };
}

/**
 * Lädt ein GLB oder glTF aus einem ArrayBuffer.
 * @param {object} [options]
 * @param {string} [options.path] Ordner der Modelldatei; dort liegen die Begleitdateien eines .gltf
 * @param {(name: string) => string | undefined} [options.resourceUrl] Adresse einer Begleitdatei (Editor: aus dem Speicher)
 * @param {string} [options.dracoPath] Ordner mit dem Draco-Decoder, Standard "draco/"
 * @returns {Promise<import('./types').ModelStats>}
 */
export function loadModel(stage, buffer, options = {}) {
  const manager = new THREE.LoadingManager();
  if (options.resourceUrl) {
    manager.setURLModifier((url) => {
      if (/^(data|blob):/.test(url)) return url;
      const name = decodeURIComponent(url.replace(/^\.\//, ''));
      return options.resourceUrl(name) || options.resourceUrl(name.split('/').pop()) || url;
    });
  }
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  // Der Draco-Decoder wird erst geladen, wenn ein Modell ihn braucht.
  const draco = new DRACOLoader(manager);
  draco.setDecoderPath(options.dracoPath || 'draco/');
  loader.setDRACOLoader(draco);
  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      options.path || '',
      (gltf) => {
        stage.model.clear();
        stage.model.add(gltf.scene);
        indexNodes(stage, gltf.scene);
        stage.clips = gltf.animations || [];
        // Die Wurzel des Abspielers ist das ganze Modell, damit Clips auch umgehängte Bauteile finden.
        stage.mixer = stage.clips.length > 0 ? new THREE.AnimationMixer(stage.model) : null;
        stage.originals = null;
        stage.groups = new Map();

        const box = new THREE.Box3().setFromObject(gltf.scene);
        if (!box.isEmpty()) box.getBoundingSphere(stage.bounds);
        const radius = Math.max(stage.bounds.radius, 0.001);
        stage.camera.near = radius / 100;
        stage.camera.far = radius * 200;
        stage.camera.updateProjectionMatrix();

        const extensions = gltf.parser.json.extensionsUsed || [];
        draco.dispose();
        resolve({
          ...collectStats(gltf.scene, buffer.byteLength),
          clips: stage.clips.map((clip) => clip.name),
          draco: extensions.includes('KHR_draco_mesh_compression'),
        });
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
    if (target.startsWith('lookAt:') || target.startsWith('option:') || target.startsWith('clip:')) {
      stage.params[prop] = value;
      continue;
    }
    if (target.startsWith('light:')) {
      const light = stage.lights.get(target.slice(6));
      if (light) applyLightField(light, field, value);
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
  // Flächenlichter zeigen auf ihr Blickziel.
  for (const light of stage.lights.values()) {
    if (light.userData.type === 'area') light.lookAt(light.userData.target);
  }
  stage.camera.lookAt(stage.target);
  stage.camera.updateProjectionMatrix();
}

/** Liest den aktuellen Wert einer Eigenschaft aus der Szene. */
export function readProp(stage, prop) {
  const [target, field] = splitProp(prop);
  if (target === 'ambient') return stage.scene.environmentIntensity;
  if (target.startsWith('clip:')) return stage.params[prop];
  if (target.startsWith('light:')) {
    const light = stage.lights.get(target.slice(6));
    return light ? readLightField(light, field) : undefined;
  }
  if (target.startsWith('lookAt:') || target.startsWith('option:')) {
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

/** Name der Timeline-Eigenschaft für die Position eines Animationsclips (0 = Anfang, 1 = Ende). */
export const clipProp = (name) => `clip:${name}.time`;

/**
 * Animationsclips des Modells für dieses Bild einstellen und weiterspielen. Drei Quellen, in dieser Rangfolge:
 * 1. Clips, die gerade frei laufen (per Aktion oder Messwert gestartet) - stehen in skip und bleiben unberührt.
 * 2. Clips des aktuellen Abschnitts (section.clips): in Schleife, einmal oder mit dem Scrollen.
 * 3. Clips mit gemerkter Position in der Timeline ("clip:<Name>.time").
 *
 * @param {import('./types').Project} project
 * @param {number} pos Timeline-Position
 * @param {number} dt Sekunden seit dem letzten Bild
 * @param {Set<string>} [skip]
 * @returns {boolean} true, solange ein Clip in Echtzeit läuft und weitere Bilder braucht
 */
export function updateClips(stage, project, pos, dt, skip = new Set()) {
  const mixer = stage.mixer;
  if (!mixer) return false;
  const state = stage.clipState || (stage.clipState = { section: -1, modes: new Map() });
  const count = project.sections.length;
  const index = Math.min(count - 1, Math.max(0, Math.floor(pos)));
  const local = Math.min(1, Math.max(0, pos - index));
  const section = project.sections[index];

  // Welche Clips verlangt der aktuelle Abschnitt?
  const wanted = new Map();
  // Einstellungen für einzelne Clips gehen vor "alle Animationen" ("*").
  const entries = [...((section && section.clips) || [])].sort((a, b) => (a.clip === '*') - (b.clip === '*'));
  for (const entry of entries) {
    for (const clip of stage.clips) {
      if ((entry.clip === '*' || entry.clip === clip.name) && !wanted.has(clip.name) && !skip.has(clip.name)) wanted.set(clip.name, entry.mode);
    }
  }

  let live = skip.size > 0;
  let active = skip.size > 0;
  for (const clip of stage.clips) {
    if (skip.has(clip.name)) continue;
    const action = mixer.clipAction(clip);
    const mode = wanted.get(clip.name);
    const before = state.modes.get(clip.name);

    if (mode === 'loop' || mode === 'once') {
      // Beim Erreichen des Abschnitts von vorn starten.
      if (before !== mode || (mode === 'once' && state.section !== index)) {
        action.reset();
        action.setLoop(mode === 'once' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = true;
        action.play();
      }
      if (action.isRunning()) live = true;
      state.modes.set(clip.name, mode);
      active = true;
      continue;
    }

    // Position aus dem Scrollen: durch den Abschnitt oder aus der Timeline
    const time = mode === 'scroll' ? local : stage.params[clipProp(clip.name)];
    if (time !== undefined) {
      if (before === 'loop' || before === 'once') action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      action.paused = true;
      action.time = Math.min(1, Math.max(0, time)) * clip.duration;
      state.modes.set(clip.name, 'scrub');
      active = true;
    } else if (before) {
      // Der Clip gehört zu keinem Abschnitt mehr: zurück in die Ausgangsstellung.
      action.stop();
      state.modes.delete(clip.name);
      active = true;
    }
  }
  state.section = index;
  if (active) mixer.update(dt);
  return live;
}
