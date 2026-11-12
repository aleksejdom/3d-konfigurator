import type { Project, Scope } from '../core/types';
import { SCENE_PROPS } from '../core/stage.js';
import { nodeProps, type StateMap } from './stage';

const TARGETS: Record<string, string> = { camera: 'Kamera', keyLight: 'Hauptlicht', ambient: 'Umgebungslicht' };
const FIELDS: Record<string, string> = {
  position: 'Position',
  target: 'Blickziel',
  fov: 'Brennweite (FOV)',
  rotation: 'Drehung',
  scale: 'Skalierung',
  color: 'Farbe',
  intensity: 'Stärke',
  strength: 'Stärke',
};

export const SCOPE_LABELS: Record<Scope, string> = {
  local: 'Nur in diesem Abschnitt',
  inherit: 'In Folgeabschnitte übernehmen',
};

export const EASING_LABELS: Record<string, string> = {
  easeInOut: 'Weich (Standard)',
  linear: 'Linear',
  easeIn: 'Langsam starten',
  easeOut: 'Langsam enden',
  sineInOut: 'Sanft',
};

export function nodeName(id: string): string {
  return id === 'model' ? 'Modell' : id.split('/').pop()!;
}

/** "camera" oder "node:<ID>" als lesbarer Name */
export function subjectName(subject: string): string {
  return subject === 'camera' ? 'Kamera' : nodeName(subject.slice(5));
}

export const lookProps = (id: string) => [`lookAt:${id}.target`, `lookAt:${id}.strength`];

export function propLabel(prop: string): string {
  const dot = prop.lastIndexOf('.');
  const target = prop.slice(0, dot);
  if (target.startsWith('lookAt:')) return `Look At · ${prop.endsWith('.target') ? 'Ziel' : 'Stärke'}`;
  if (target.startsWith('option:')) return 'Variante · Wahl';
  if (target.startsWith('clip:')) return `Animation ${target.slice(5)} · Position`;
  const field = FIELDS[prop.slice(dot + 1)] ?? prop.slice(dot + 1);
  const name = target.startsWith('node:') ? nodeName(target.slice(5)) : (TARGETS[target] ?? target);
  return `${name} · ${field}`;
}

export function posLabel(project: Project, pos: number): string {
  const count = project.sections.length;
  if (count === 0) return '';
  const index = Math.min(count - 1, Math.floor(Math.min(count, Math.max(0, pos))));
  return `${project.sections[index].name} · ${Math.round((pos - index) * 100)} %`;
}

export interface PropGroup {
  key: string;
  label: string;
  props: string[];
  dirty: boolean;
}

const NODE_PROP = /^node:(.+)\.[a-z]+$/;

/** Gruppen für den "Merken"-Dialog: Kamera, Licht, Modell und alle bewegten Bauteile. */
export function propGroups(project: Project, draft: StateMap): PropGroup[] {
  const nodes = new Set<string>();
  const clips = new Set<string>();
  const collect = (prop: string) => {
    const match = NODE_PROP.exec(prop);
    if (match && match[1] !== 'model') nodes.add(match[1]);
    const clip = /^clip:(.+)\.time$/.exec(prop);
    if (clip) clips.add(clip[1]);
  };
  Object.keys(draft).forEach(collect);
  Object.keys(project.base).forEach(collect);
  project.keyframes.forEach((k) => Object.keys(k.values).forEach(collect));

  const groups = [
    { key: 'camera', label: 'Kamera', props: SCENE_PROPS.filter((p: string) => p.startsWith('camera.')) },
    { key: 'light', label: 'Licht', props: SCENE_PROPS.filter((p: string) => /^(keyLight|ambient)\./.test(p)) },
    { key: 'model', label: 'Modell (Position, Drehung, Skalierung)', props: nodeProps('model') },
    ...[...nodes].map((id) => ({ key: 'node:' + id, label: 'Bauteil ' + nodeName(id), props: nodeProps(id) })),
    ...project.lookAts.map((look) => ({
      key: 'look:' + look.id,
      label: `Look At ${subjectName(look.subject)} (Ziel, Stärke)`,
      props: lookProps(look.id),
    })),
    // Animationsclips, die an die Timeline gebunden sind
    ...[...clips].map((name) => ({ key: 'clip:' + name, label: `Animation ${name}`, props: [`clip:${name}.time`] })),
    ...project.variantGroups.map((group) => ({ key: 'option:' + group.id, label: `Variante ${group.name}`, props: [`option:${group.id}.value`] })),
  ];
  return groups.map((group) => ({ ...group, dirty: group.props.some((prop: string) => prop in draft) }));
}

/** Zuletzt verwendeter Geltungsbereich einer Gruppe, sonst "übernehmen". */
export function lastScope(project: Project, props: string[]): Scope {
  for (let i = project.keyframes.length - 1; i >= 0; i--) {
    for (const prop of props) {
      const value = project.keyframes[i].values[prop];
      if (value) return value.scope;
    }
  }
  return 'inherit';
}
