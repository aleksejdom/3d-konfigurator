import { create } from 'zustand';
import { splitPos } from '../core/timeline.js';
import { defaultBase, readProp } from '../core/stage.js';
import { buildExport } from '../export/exporter.js';
import { usedImages } from '../export/page.js';
import type { Breakpoint, Keyframe, Project, Scope, Value } from '../core/types';
import { createProject, migrateProject, uid } from './project';
import {
  canPickDirectory,
  dirLabel,
  downloadZip,
  pickDirectory,
  pickFile,
  readBinary,
  readText,
  writeFiles,
  type DirRef,
  type FileMap,
} from './platform';
import { clearStageModel, editor, loadIntoStage, tidy, type StateMap } from './stage';

export interface Snapshot {
  name: string;
  date: string;
  project: Project;
}

export interface Measurement {
  ms: number;
  profile: string;
  simulated: boolean;
}

interface EditorState {
  project: Project;
  past: Project[];
  future: Project[];
  lastKey: string | null;
  lastTime: number;
  /** Timeline-Position: Abschnittsindex + relative Position */
  pos: number;
  /** Änderungen im Viewport, die noch nicht mit "Merken" gespeichert sind */
  draft: StateMap;
  selectedNode: string | null;
  selectedKeyframe: string | null;
  selectedSection: string | null;
  /** Ausgewählte HTML-Komponente. Kinder einer Instanz: "<Instanz>--<Vorlagen-Element>" */
  selectedComponent: string | null;
  selectedHotspot: string | null;
  selectedGroup: string | null;
  selectedField: string | null;
  /** Der nächste Klick auf das Modell setzt einen Hotspot */
  placingHotspot: boolean;
  /** Breakpoint, für den der Viewport anzeigt und Gestaltungswerte gespeichert werden */
  breakpoint: Breakpoint;
  /** Bilder des Projekts: Dateiname -> Daten und Adresse für die Anzeige */
  assets: Record<string, { data: ArrayBuffer; url: string }>;
  /** Wird gerade eine Komponente aus der Bibliothek gezogen? */
  dragging: boolean;
  modelBuffer: ArrayBuffer | null;
  /** Zählt hoch, sobald ein Modell geladen wurde */
  modelVersion: number;
  dir: DirRef | null;
  unsaved: boolean;
  snapshots: Snapshot[];
  drawCalls: number;
  measurement: Measurement | null;
  message: string | null;
}

const initialProject = createProject();

export const useEditor = create<EditorState>(() => ({
  project: initialProject,
  past: [],
  future: [],
  lastKey: null,
  lastTime: 0,
  pos: 0,
  draft: {},
  selectedNode: null,
  selectedKeyframe: null,
  selectedSection: initialProject.sections[0].id,
  selectedComponent: null,
  selectedHotspot: null,
  selectedGroup: null,
  selectedField: null,
  placingHotspot: false,
  breakpoint: 'desktop',
  assets: {},
  dragging: false,
  modelBuffer: null,
  modelVersion: 0,
  dir: null,
  unsaved: false,
  snapshots: [],
  drawCalls: 0,
  measurement: null,
  message: null,
}));

const get = useEditor.getState;
const set = useEditor.setState;

export function notify(message: string) {
  set({ message });
  setTimeout(() => get().message === message && set({ message: null }), 5000);
}

// ---------- Projekt ändern, Undo/Redo ----------

/**
 * Ändert das Projekt und legt den vorherigen Stand auf den Undo-Stapel.
 * Aufeinanderfolgende Änderungen mit demselben key (z. B. Tippen in einem Feld)
 * werden zu einem Undo-Schritt zusammengefasst.
 */
export function update(recipe: (project: Project) => void, key?: string) {
  const state = get();
  const next = structuredClone(state.project);
  recipe(next);
  const now = Date.now();
  const merge = key !== undefined && state.lastKey === key && now - state.lastTime < 1000;
  set({
    project: next,
    past: merge ? state.past : [...state.past.slice(-99), state.project],
    future: [],
    lastKey: key ?? null,
    lastTime: now,
    unsaved: true,
  });
}

function fixSelection(project: Project) {
  const state = get();
  const componentRoot = state.selectedComponent?.split('--')[0];
  set({
    selectedComponent:
      componentRoot && JSON.stringify(project.sections).includes(`"id":"${componentRoot}"`) ? state.selectedComponent : null,
    selectedKeyframe: project.keyframes.some((k) => k.id === state.selectedKeyframe) ? state.selectedKeyframe : null,
    selectedHotspot: project.hotspots.some((h) => h.id === state.selectedHotspot) ? state.selectedHotspot : null,
    selectedGroup: project.variantGroups.some((g) => g.id === state.selectedGroup) ? state.selectedGroup : null,
    selectedField: project.data.fields.some((f) => f.id === state.selectedField) ? state.selectedField : null,
    selectedSection: project.sections.some((s) => s.id === state.selectedSection)
      ? state.selectedSection
      : (project.sections[0]?.id ?? null),
    pos: Math.min(state.pos, project.sections.length),
  });
}

export function undo() {
  const { past, future, project } = get();
  if (past.length === 0) return;
  const previous = past[past.length - 1];
  set({ project: previous, past: past.slice(0, -1), future: [project, ...future], lastKey: null, unsaved: true, draft: {} });
  fixSelection(previous);
}

export function redo() {
  const { past, future, project } = get();
  if (future.length === 0) return;
  const next = future[0];
  set({ project: next, past: [...past, project], future: future.slice(1), lastKey: null, unsaved: true, draft: {} });
  fixSelection(next);
}

// ---------- Position und Entwurf ----------

export function setPos(pos: number) {
  const count = get().project.sections.length;
  const clamped = Math.min(count, Math.max(0, pos));
  const { index } = splitPos(get().project, clamped);
  const sectionId = get().project.sections[index]?.id ?? null;
  set({
    pos: clamped,
    draft: {},
    selectedSection: sectionId,
    // Die Auswahl gehört zum sichtbaren Abschnitt.
    selectedComponent: sectionId === get().selectedSection ? get().selectedComponent : null,
  });
}

export function setDraft(patch: StateMap) {
  for (const prop of Object.keys(patch)) {
    if (prop.startsWith('node:') && !(prop in editor.reset) && prop in editor.defaults) {
      editor.reset[prop] = editor.defaults[prop];
    }
  }
  const draft = { ...get().draft };
  for (const [prop, value] of Object.entries(patch)) draft[prop] = tidy(value);
  set({ draft });
}

export function discardDraft() {
  set({ draft: {} });
}

// ---------- Merken ----------

/** Speichert die gewählten Eigenschaften am aktuellen Abschnitt und seiner relativen Position. */
export function merken(selection: { prop: string; scope: Scope }[]) {
  const stage = editor.stage;
  const state = get();
  if (!stage || selection.length === 0 || state.project.sections.length === 0) return;

  const { index, t } = splitPos(state.project, state.pos);
  const sectionId = state.project.sections[index].id;
  const roundedT = Math.round(t * 1000) / 1000;
  let keyframeId = '';

  update((project) => {
    let keyframe = project.keyframes.find((k) => k.sectionId === sectionId && Math.abs(k.t - roundedT) < 0.005);
    if (!keyframe) {
      keyframe = { id: uid('kf'), sectionId, t: roundedT, values: {} };
      project.keyframes.push(keyframe);
    }
    keyframeId = keyframe.id;
    for (const { prop, scope } of selection) {
      const value = readProp(stage, prop) as Value | undefined;
      if (value === undefined) continue;
      // Varianten wechseln hart an der gemerkten Stelle. Ein Überblendbereich lässt sich am Punkt einstellen.
      const hardSwitch = prop.startsWith('option:') && keyframe.values[prop]?.transition === undefined ? { transition: 0 } : {};
      keyframe.values[prop] = { ...hardSwitch, ...keyframe.values[prop], value: tidy(value), scope };
      // Bauteile bekommen beim ersten Merken ihren Ausgangswert aus dem Modell.
      if (project.base[prop] === undefined && editor.defaults[prop] !== undefined) {
        project.base[prop] = editor.defaults[prop];
      }
    }
  });
  set({ draft: {}, selectedKeyframe: keyframeId });
}

export function moveKeyframe(id: string, sectionId: string, t: number) {
  update((project) => {
    const keyframe = project.keyframes.find((k) => k.id === id);
    if (!keyframe) return;
    keyframe.sectionId = sectionId;
    keyframe.t = Math.round(Math.min(1, Math.max(0, t)) * 1000) / 1000;
  }, 'move-' + id);
}

export function keyframePos(project: Project, keyframe: Keyframe): number {
  return Math.max(0, project.sections.findIndex((s) => s.id === keyframe.sectionId)) + keyframe.t;
}

// ---------- Modell ----------

async function applyModel(name: string, data: ArrayBuffer) {
  const stats = await loadIntoStage(data);
  const hadModel = get().project.model.file !== null;
  update((project) => {
    project.model = { file: name, stats };
    // Beim ersten Import wird die Kamera auf das Modell ausgerichtet. Beim Austausch bleibt alles erhalten.
    if (!hadModel) project.base = { ...defaultBase(editor.stage!), ...project.base };
  });
  set({ modelBuffer: data, modelVersion: get().modelVersion + 1, draft: {}, selectedNode: null, measurement: null });
}

export async function importModel() {
  const file = await pickFile(['glb', 'gltf'], '3D-Modell');
  if (!file) return;
  try {
    await applyModel(file.name, file.data);
  } catch (error) {
    notify('Das Modell konnte nicht gelesen werden: ' + (error as Error).message);
  }
}

export async function loadSampleModel() {
  const response = await fetch('./sample.glb');
  await applyModel('sample.glb', await response.arrayBuffer());
}

// ---------- Bilder ----------

function addAsset(name: string, data: ArrayBuffer) {
  const old = get().assets[name];
  if (old) URL.revokeObjectURL(old.url);
  const type = name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '';
  set({ assets: { ...get().assets, [name]: { data, url: URL.createObjectURL(new Blob([data], { type })) } } });
}

/** Bild auswählen und ins Projekt aufnehmen. Liefert den Dateinamen. */
export async function importImage(): Promise<string | null> {
  const file = await pickFile(['png', 'jpg', 'jpeg', 'webp', 'avif', 'svg', 'gif'], 'Bild');
  if (!file) return null;
  addAsset(file.name, file.data);
  return file.name;
}

function clearAssets() {
  Object.values(get().assets).forEach((asset) => URL.revokeObjectURL(asset.url));
  set({ assets: {} });
}

// ---------- Speichern, Öffnen, Projektstände ----------

function projectFiles(): FileMap {
  const { project, snapshots, modelBuffer, assets } = get();
  const files: FileMap = {
    'project.json': JSON.stringify(project, null, 2) + '\n',
    'snapshots.json': JSON.stringify(snapshots, null, 2) + '\n',
  };
  if (project.model.file && modelBuffer) files['assets/' + project.model.file] = new Uint8Array(modelBuffer);
  for (const name of usedImages(project)) {
    if (assets[name]) files['assets/' + name] = new Uint8Array(assets[name].data);
  }
  return files;
}

export async function saveProject(saveAs = false) {
  let dir = saveAs ? null : get().dir;
  if (!dir) {
    if (!canPickDirectory) {
      downloadZip(get().project.name, projectFiles());
      notify('Dieser Browser erlaubt keinen Ordnerzugriff. Das Projekt wurde als ZIP heruntergeladen.');
      return;
    }
    dir = await pickDirectory('Projektordner wählen');
    if (!dir) return;
  }
  try {
    await writeFiles(dir, projectFiles());
    set({ dir, unsaved: false });
    notify('Gespeichert in ' + dirLabel(dir));
  } catch (error) {
    notify('Speichern fehlgeschlagen: ' + (error as Error).message);
  }
}

export async function openProject() {
  if (!canPickDirectory) {
    notify('Öffnen braucht die Desktop-App oder einen Browser mit Ordnerzugriff (Chrome, Edge).');
    return;
  }
  const dir = await pickDirectory('Projektordner öffnen');
  if (!dir) return;
  try {
    const text = await readText(dir, 'project.json');
    if (!text) throw new Error('Im Ordner liegt keine project.json.');
    const project = migrateProject(JSON.parse(text));
    const snapshotText = await readText(dir, 'snapshots.json');
    const model = project.model.file ? await readBinary(dir, 'assets/' + project.model.file) : null;
    if (project.model.file && !model) notify(`Die Modelldatei assets/${project.model.file} fehlt.`);
    if (model) await loadIntoStage(model);
    else clearStageModel();
    clearAssets();
    for (const name of usedImages(project)) {
      const image = await readBinary(dir, 'assets/' + name);
      if (image) addAsset(name, image);
    }
    const snapshots: Snapshot[] = snapshotText ? JSON.parse(snapshotText) : [];
    set({
      project,
      past: [],
      future: [],
      pos: 0,
      draft: {},
      selectedNode: null,
      selectedKeyframe: null,
      selectedSection: project.sections[0]?.id ?? null,
      modelBuffer: model,
      modelVersion: get().modelVersion + 1,
      dir,
      unsaved: false,
      snapshots: snapshots.map((snapshot) => ({ ...snapshot, project: migrateProject(snapshot.project) })),
      selectedComponent: null,
      selectedHotspot: null,
      selectedGroup: null,
      selectedField: null,
      measurement: null,
    });
  } catch (error) {
    notify('Öffnen fehlgeschlagen: ' + (error as Error).message);
  }
}

export function newProject() {
  const project = createProject();
  clearStageModel();
  clearAssets();
  set({
    selectedComponent: null,
    selectedHotspot: null,
    selectedGroup: null,
    selectedField: null,
    project,
    past: [],
    future: [],
    pos: 0,
    draft: {},
    selectedNode: null,
    selectedKeyframe: null,
    selectedSection: project.sections[0].id,
    modelBuffer: null,
    modelVersion: get().modelVersion + 1,
    dir: null,
    unsaved: false,
    snapshots: [],
    measurement: null,
  });
}

export function saveSnapshot(name: string) {
  const snapshot = { name, date: new Date().toISOString(), project: structuredClone(get().project) };
  set({ snapshots: [snapshot, ...get().snapshots], unsaved: true });
}

export function restoreSnapshot(snapshot: Snapshot) {
  // Das Modell gehört zum Projektordner; ein Stand stellt Szene, Abschnitte und Punkte wieder her.
  const model = get().project.model;
  update((project) => Object.assign(project, structuredClone(snapshot.project), { model }));
  set({ draft: {} });
  fixSelection(get().project);
}

export function deleteSnapshot(snapshot: Snapshot) {
  set({ snapshots: get().snapshots.filter((s) => s !== snapshot), unsaved: true });
}

// ---------- Export ----------

const coreModules = import.meta.glob('../core/*', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const coreSources = Object.fromEntries(Object.entries(coreModules).map(([path, source]) => [path.split('/').pop()!, source]));

export async function exportProject(target: 'vanilla' | 'astro') {
  const { project, modelBuffer, assets } = get();
  const { files, modelPath, imagePaths } = buildExport(project, target, coreSources);
  const all: FileMap = { ...files };
  if (modelPath && modelBuffer) all[modelPath] = new Uint8Array(modelBuffer);
  for (const [name, path] of Object.entries(imagePaths)) {
    if (assets[name]) all[path] = new Uint8Array(assets[name].data);
  }

  if (!canPickDirectory) {
    downloadZip(`${project.name}-${target}`, all);
    return;
  }
  const dir = await pickDirectory('Leeren Ordner für den Export wählen');
  if (!dir) return;
  try {
    await writeFiles(dir, all);
    notify(`Export geschrieben nach ${dirLabel(dir)}. Start: npm install, dann npm run dev.`);
  } catch (error) {
    notify('Export fehlgeschlagen: ' + (error as Error).message);
  }
}

// Eine ausgewählte Komponente und ein ausgewählter Hotspot schließen sich aus.
useEditor.subscribe((state, previous) => {
  // Rechts wird immer nur eines bearbeitet: Komponente, Hotspot, Variantengruppe oder Datenfeld.
  const keys = ['selectedComponent', 'selectedHotspot', 'selectedGroup', 'selectedField'] as const;
  const changed = keys.find((key) => state[key] && state[key] !== previous[key]);
  if (!changed) return;
  const others = keys.filter((key) => key !== changed && state[key]);
  if (others.length > 0) set(Object.fromEntries(others.map((key) => [key, null])));
});
