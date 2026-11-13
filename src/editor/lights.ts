// Zusätzliche Lichter der Szene: Spot-, Flächen- und Punktlichter.
// Ihre Werte stehen wie Kamera und Hauptlicht in base und lassen sich pro Abschnitt merken.

import { LIGHT_FIELDS, lightDefaults } from '../core/stage.js';
import type { SceneLight, Value } from '../core/types';
import { uid } from './project';
import { editor } from './stage';
import { update, useEditor } from './store';

export const LIGHT_LABELS: Record<SceneLight['type'], string> = { spot: 'Spotlicht', area: 'Flächenlicht', point: 'Punktlicht' };

export function addLight(type: SceneLight['type']) {
  const stage = editor.stage;
  if (!stage) return;
  const id = uid('light');
  const defaults = lightDefaults(stage, type) as Record<string, Value>;
  update((project) => {
    const count = project.lights.filter((light) => light.type === type).length;
    project.lights.push({ id, type, name: `${LIGHT_LABELS[type]} ${count + 1}` });
    for (const field of LIGHT_FIELDS[type] as string[]) project.base[`light:${id}.${field}`] = defaults[field];
  });
  useEditor.setState({ selectedLight: id, lightHandle: 'position', selectedNode: null });
}

export function removeLight(id: string) {
  const prefix = `light:${id}.`;
  update((project) => {
    project.lights = project.lights.filter((light) => light.id !== id);
    for (const prop of Object.keys(project.base)) if (prop.startsWith(prefix)) delete project.base[prop];
    for (const keyframe of project.keyframes) {
      for (const prop of Object.keys(keyframe.values)) if (prop.startsWith(prefix)) delete keyframe.values[prop];
    }
    project.keyframes = project.keyframes.filter((keyframe) => Object.keys(keyframe.values).length > 0);
  });
  if (useEditor.getState().selectedLight === id) useEditor.setState({ selectedLight: null });
}

export function renameLight(id: string, name: string) {
  update((project) => {
    const light = project.lights.find((l) => l.id === id);
    if (light) light.name = name;
  }, 'light-name-' + id);
}
