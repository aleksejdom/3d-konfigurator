import type { Budget, Project, Section } from '../core/types';

export const FORMAT_VERSION = 1;

export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

export const DEFAULT_BUDGETS: { desktop: Budget; mobile: Budget } = {
  desktop: { fileSizeMB: 15, triangles: 500_000, textureSize: 4096, drawCalls: 150 },
  mobile: { fileSizeMB: 5, triangles: 150_000, textureSize: 2048, drawCalls: 60 },
};

export function createSection(name: string, withContent = true): Section {
  return {
    id: uid('sec'),
    name,
    height: 100,
    align: 'left',
    elements: withContent
      ? [
          { id: uid('el'), type: 'headline', text: name },
          { id: uid('el'), type: 'text', text: 'Beschreibe hier, was an dieser Stelle zu sehen ist.' },
        ]
      : [],
  };
}

export function createProject(): Project {
  return {
    formatVersion: FORMAT_VERSION,
    name: 'Neues Projekt',
    model: { file: null, stats: null },
    base: {},
    sections: [createSection('Start'), createSection('Details'), createSection('Abschluss')],
    keyframes: [],
    budgets: structuredClone(DEFAULT_BUDGETS),
    settings: { background: '#14161a', scrollSmoothing: 0 },
  };
}

/**
 * Prüft eine geladene Projektdatei und hebt sie auf die aktuelle Formatversion.
 * Neue Formatversionen bekommen hier ihren Migrationsschritt.
 */
export function migrateProject(data: unknown): Project {
  const raw = data as Partial<Project> & { formatVersion?: number };
  if (!raw || typeof raw !== 'object' || typeof raw.formatVersion !== 'number') {
    throw new Error('Die Datei ist kein Projekt des 3D-Web-Editors.');
  }
  if (raw.formatVersion > FORMAT_VERSION) {
    throw new Error(
      `Das Projekt hat Formatversion ${raw.formatVersion}. Dieser Editor liest bis Version ${FORMAT_VERSION}.`,
    );
  }
  const fresh = createProject();
  return {
    ...fresh,
    ...raw,
    formatVersion: FORMAT_VERSION,
    model: { ...fresh.model, ...raw.model },
    budgets: { desktop: { ...fresh.budgets.desktop, ...raw.budgets?.desktop }, mobile: { ...fresh.budgets.mobile, ...raw.budgets?.mobile } },
    settings: { ...fresh.settings, ...raw.settings },
    sections: raw.sections ?? fresh.sections,
    keyframes: raw.keyframes ?? [],
    base: raw.base ?? {},
  };
}
