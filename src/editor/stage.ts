// Die Bühne des Editor-Viewports. Sie nutzt dieselben Kernfunktionen wie Vorschau und Export.

import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { evaluate } from '../core/timeline.js';
import { NODE_FIELDS, createStage, loadModel, readProp } from '../core/stage.js';
import type { ModelStats, Project, Value } from '../core/types';

export type Stage = ReturnType<typeof createStage>;
export type StateMap = Record<string, Value>;

export const editor = {
  stage: null as Stage | null,
  orbit: null as OrbitControls | null,
  gizmo: null as TransformControls | null,
  /** Werte aller Bauteile direkt nach dem Laden des Modells. */
  defaults: {} as StateMap,
  /** Ausgangswerte der Bauteile, die in dieser Sitzung bewegt wurden. */
  reset: {} as StateMap,
};

export const nodeProps = (id: string) => NODE_FIELDS.map((field: string) => `node:${id}.${field}`);

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

/** Adressen für Dateien aus dem Arbeitsspeicher (Begleitdateien eines .gltf, HDRI). */
export function blobUrls(files: Record<string, ArrayBuffer>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([name, data]) => {
      const type = MIME[name.split('.').pop()!.toLowerCase()] ?? '';
      return [name, URL.createObjectURL(new Blob([data], { type }))];
    }),
  );
}

/** @param resources Begleitdateien eines .gltf: Name -> Inhalt */
export async function loadIntoStage(buffer: ArrayBuffer, resources: Record<string, ArrayBuffer> = {}): Promise<ModelStats> {
  const stage = editor.stage!;
  const urls = blobUrls(resources);
  let stats: ModelStats;
  try {
    stats = await loadModel(stage, buffer, { resourceUrl: (name: string) => urls[name], dracoPath: './draco/' });
  } finally {
    Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }
  editor.defaults = {};
  editor.reset = {};
  for (const id of stage.nodes.keys()) {
    for (const prop of nodeProps(id)) editor.defaults[prop] = readProp(stage, prop) as Value;
  }
  return stats;
}

export function clearStageModel() {
  const stage = editor.stage;
  if (!stage) return;
  stage.model.clear();
  stage.nodes = new Map([['model', stage.model]]);
  editor.defaults = {};
  editor.reset = {};
}

/** Was der Viewport zeigt: Timeline-Zustand an der Position plus noch nicht gemerkte Änderungen. */
export function currentState(project: Project, pos: number, draft: StateMap): StateMap {
  return { ...editor.reset, ...evaluate(project, pos), ...draft };
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

export function tidy(value: Value): Value {
  if (typeof value === 'number') return round(value);
  if (typeof value === 'string' || !Array.isArray(value)) return value;
  return value.map(round) as Value;
}

export function sameValue(a: Value | undefined, b: Value | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-4;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (!Array.isArray(a) || !Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return (a as number[]).every((n, i) => Math.abs(n - (b as number[])[i]) < 1e-4);
}

// Für automatische Tests des Editors erreichbar.
if (typeof window !== 'undefined') (window as unknown as { __editor: typeof editor }).__editor = editor;
